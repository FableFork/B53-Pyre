import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { BlenderProbeResult, BlenderJobConfig, LogLine } from '@shared/types'
import { suspendProcess, resumeProcess } from '../process-control'

export interface RenderCallbacks {
  onLog: (line: LogLine) => void
  onProgress: (frame: number, total: number, percent: number) => void
  onComplete: () => void
  onError: (msg: string) => void
}

const activeProbes = new Map<string, ChildProcess>()
const activeRenders = new Map<string, ChildProcess>()

// ─── Probe Script Path ────────────────────────────────────────────────────────

function getProbeScriptPath(userData: string): string {
  const dest = path.join(userData, 'scripts', 'blender_probe.py')
  return dest
}

// ─── Probe ────────────────────────────────────────────────────────────────────

export async function probeBlenderFile(
  blenderPath: string,
  filePath: string,
  probeScriptPath: string,
  jobId: string
): Promise<BlenderProbeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '--background',
      filePath,
      '--python',
      probeScriptPath,
      '--'
    ]

    const proc = spawn(blenderPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    activeProbes.set(jobId, proc)

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('close', (code) => {
      activeProbes.delete(jobId)

      const startMarker = 'PYRE_PROBE_START'
      const endMarker = 'PYRE_PROBE_END'
      const startIdx = stdout.indexOf(startMarker)
      const endIdx = stdout.indexOf(endMarker)

      if (startIdx === -1 || endIdx === -1) {
        const errDetail = stderr.slice(-500) || stdout.slice(-500)
        reject(new Error(`Probe failed (exit ${code}): ${errDetail}`))
        return
      }

      const jsonStr = stdout.slice(startIdx + startMarker.length, endIdx).trim()
      try {
        const data = JSON.parse(jsonStr) as BlenderProbeResult
        resolve(data)
      } catch (e) {
        reject(new Error(`Probe JSON parse error: ${(e as Error).message}`))
      }
    })

    proc.on('error', (err) => {
      activeProbes.delete(jobId)
      reject(new Error(`Failed to spawn Blender: ${err.message}`))
    })
  })
}

export function killProbe(jobId: string): void {
  const proc = activeProbes.get(jobId)
  if (proc) {
    proc.kill('SIGTERM')
    activeProbes.delete(jobId)
  }
}

// ─── Render Script Generation ─────────────────────────────────────────────────

function buildBlenderRenderScript(config: BlenderJobConfig, configJsonPath: string): string {
  return `import bpy, json, sys, os

with open(${JSON.stringify(configJsonPath)}, 'r') as f:
    cfg = json.load(f)

scene = bpy.data.scenes.get(cfg['selectedScene'])
if not scene:
    print(f"ERROR: Scene '{cfg['selectedScene']}' not found")
    sys.exit(1)

bpy.context.window.scene = scene

cam_obj = scene.objects.get(cfg['selectedCamera'])
if cam_obj:
    scene.camera = cam_obj

for vl in scene.view_layers:
    vl.use = vl.name in cfg['selectedViewLayers']
    passes = cfg.get('enabledPasses', {}).get(vl.name, {})
    for pass_key, enabled in passes.items():
        attr = f'use_pass_{pass_key}'
        if hasattr(vl, attr):
            setattr(vl, attr, enabled)

scene.frame_start = cfg['frameStart']
scene.frame_end = cfg['frameEnd']
scene.frame_step = cfg['frameStep']
scene.render.resolution_x = cfg['resolutionX']
scene.render.resolution_y = cfg['resolutionY']
scene.render.resolution_percentage = cfg['resolutionScale']

if not cfg.get('useSourceSettings', True):
    scene.render.engine = cfg['engine']
    if cfg['engine'] == 'CYCLES' and cfg.get('samplesCycles'):
        scene.cycles.samples = cfg['samplesCycles']
    elif cfg['engine'] == 'BLENDER_EEVEE' and cfg.get('samplesEevee'):
        scene.eevee.taa_render_samples = cfg['samplesEevee']

scene.render.filepath = cfg['outputPath']
fmt_map = {
    'PNG': 'PNG', 'JPEG': 'JPEG', 'OPEN_EXR': 'OPEN_EXR',
    'OPEN_EXR_MULTILAYER': 'OPEN_EXR_MULTILAYER', 'TIFF': 'TIFF',
    'DPX': 'DPX', 'CINEON': 'CINEON', 'WEBP': 'WEBP'
}
scene.render.image_settings.file_format = fmt_map.get(cfg['fileFormat'], 'PNG')
depth_map = {'8': '8', '16': '16', '32': '32'}
scene.render.image_settings.color_depth = depth_map.get(str(cfg.get('colorDepth', '8')), '8')
scene.use_nodes = cfg.get('useCompositor', True)

bpy.ops.render.render(animation=True)
print('PYRE_RENDER_COMPLETE')
`
}

// ─── Render Execution ─────────────────────────────────────────────────────────

export async function renderBlenderJob(
  blenderPath: string,
  filePath: string,
  config: BlenderJobConfig,
  jobId: string,
  callbacks: RenderCallbacks
): Promise<void> {
  const tmpDir = path.join(os.tmpdir(), `pyre_${jobId}`)
  fs.mkdirSync(tmpDir, { recursive: true })

  const configPath = path.join(tmpDir, 'config.json')
  const scriptPath = path.join(tmpDir, 'render.py')

  const totalFrames = Math.max(
    1,
    Math.ceil((config.frameEnd - config.frameStart) / config.frameStep) + 1
  )
  let renderedFrames = 0

  const cameraBatch = config.cameraBatch?.length > 0
    ? config.cameraBatch
    : [config.selectedCamera]

  for (let camIdx = 0; camIdx < cameraBatch.length; camIdx++) {
    const camera = cameraBatch[camIdx]
    // Resolve any {camera} token the user put in the output path.
    // If they didn't include {camera} and it's a batch render, append
    // the camera name as a subfolder automatically.
    const hadCameraToken = config.outputPath.includes('{camera}')
    const resolvedOutput = config.outputPath.replace(/\{camera\}/g, camera)
    const finalOutput = cameraBatch.length > 1 && !hadCameraToken
      ? path.join(resolvedOutput, camera, '####')
      : resolvedOutput

    const batchConfig: BlenderJobConfig = {
      ...config,
      selectedCamera: camera,
      outputPath: finalOutput
    }

    fs.writeFileSync(configPath, JSON.stringify(batchConfig, null, 2))
    fs.writeFileSync(scriptPath, buildBlenderRenderScript(batchConfig, configPath))

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(blenderPath, [
        '--background', filePath,
        '--python', scriptPath,
        '--'
      ], { stdio: ['ignore', 'pipe', 'pipe'] })

      activeRenders.set(jobId, proc)

      let frameRenderStart = Date.now()
      let lineBuffer = ''
      let stderrBuffer = ''

      const processLine = (raw: string) => {
        const line = raw.trim()
        if (!line) return

        const logType = classifyLine(line)
        callbacks.onLog({ timestamp: Date.now(), text: line, type: logType })

        // Fra:N Mem:... (Blender may output this to stdout or stderr depending on platform)
        const fraMatch = line.match(/Fra:(\d+)\s+Mem:/)
        if (fraMatch) {
          const frame = parseInt(fraMatch[1])
          renderedFrames = frame - config.frameStart + 1
          const pct = Math.min(100, (renderedFrames / totalFrames) * 100)
          callbacks.onProgress(frame, totalFrames, pct)
          frameRenderStart = Date.now()
          return
        }

        // Rendered N / M Tiles / Samples
        const tilesMatch = line.match(/Rendered\s+(\d+)\s*\/\s*(\d+)/)
        if (tilesMatch) {
          const done = parseInt(tilesMatch[1])
          const total = parseInt(tilesMatch[2])
          const framePct = total > 0 ? done / total : 0
          const overallPct = ((renderedFrames - 1 + framePct) / totalFrames) * 100
          callbacks.onProgress(renderedFrames, totalFrames, Math.min(100, overallPct))
        }

        if (line === 'PYRE_RENDER_COMPLETE' || line.includes('Blender quit')) {
          resolve()
        }
      }

      proc.stdout.on('data', (chunk: Buffer) => {
        lineBuffer += chunk.toString()
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''
        lines.forEach(processLine)
      })

      // Blender writes Fra:/Rendered progress lines to stderr on Windows —
      // run it through the same parser so the progress bar actually updates.
      proc.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString()
        const lines = stderrBuffer.split('\n')
        stderrBuffer = lines.pop() ?? ''
        lines.forEach(processLine)
      })

      proc.on('close', (code) => {
        activeRenders.delete(jobId)
        if (code === 0 || code === null) {
          resolve()
        } else {
          reject(new Error(`Blender exited with code ${code}`))
        }
      })

      proc.on('error', (err) => {
        activeRenders.delete(jobId)
        reject(new Error(`Failed to spawn Blender: ${err.message}`))
      })
    })
  }

  // Cleanup temp files
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}

  callbacks.onComplete()
}

export function killRender(jobId: string): void {
  const proc = activeRenders.get(jobId)
  if (!proc) return
  proc.kill('SIGTERM')
  setTimeout(() => {
    if (!proc.killed) proc.kill('SIGKILL')
  }, 2000)
  activeRenders.delete(jobId)
}

export function suspendRender(jobId: string): boolean {
  const proc = activeRenders.get(jobId)
  if (!proc?.pid) return false
  return suspendProcess(proc.pid)
}

export function resumeRender(jobId: string): boolean {
  const proc = activeRenders.get(jobId)
  if (!proc?.pid) return false
  return resumeProcess(proc.pid)
}

export function cleanupJob(jobId: string): void {
  killProbe(jobId)
  killRender(jobId)
  const tmpDir = path.join(os.tmpdir(), `pyre_${jobId}`)
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
}

function classifyLine(line: string): LogLine['type'] {
  const l = line.toLowerCase()
  if (l.includes('error') || l.includes('exception') || l.includes('traceback')) return 'error'
  if (l.includes('warning') || l.includes('warn')) return 'warning'
  if (l.startsWith('fra:') || l.includes('rendered') || l.includes('rendering')) return 'progress'
  return 'info'
}
