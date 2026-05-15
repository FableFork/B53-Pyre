import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { HoudiniProbeResult, HoudiniJobConfig, LogLine } from '@shared/types'
import type { RenderCallbacks } from './blender'
import { suspendProcess, resumeProcess } from '../process-control'

const activeProbes = new Map<string, ChildProcess>()
const activeRenders = new Map<string, ChildProcess>()

// ─── Probe ────────────────────────────────────────────────────────────────────

export async function probeHoudiniFile(
  hythonPath: string,
  filePath: string,
  probeScriptPath: string,
  jobId: string
): Promise<HoudiniProbeResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(hythonPath, [probeScriptPath, filePath], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    activeProbes.set(jobId, proc)

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (c: Buffer) => { stdout += c.toString() })
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString() })

    proc.on('close', (code) => {
      activeProbes.delete(jobId)

      const startIdx = stdout.indexOf('PYRE_PROBE_START')
      const endIdx = stdout.indexOf('PYRE_PROBE_END')
      if (startIdx === -1 || endIdx === -1) {
        const detail = stderr.slice(-600) || stdout.slice(-600)
        reject(new Error(`Houdini probe failed (exit ${code}): ${detail}`))
        return
      }

      const jsonStr = stdout.slice(startIdx + 'PYRE_PROBE_START'.length, endIdx).trim()
      try {
        const raw = JSON.parse(jsonStr) as HoudiniProbeResult
        // Validate file refs on disk
        raw.file_refs = raw.file_refs.map((ref) => ({
          ...ref,
          exists: fs.existsSync(resolveHipVars(ref.path, raw.hip_vars))
        }))
        resolve(raw)
      } catch (e) {
        reject(new Error(`Houdini probe JSON parse error: ${(e as Error).message}`))
      }
    })

    proc.on('error', (err) => {
      activeProbes.delete(jobId)
      reject(new Error(`Failed to spawn hython: ${err.message}`))
    })
  })
}

export function killProbe(jobId: string): void {
  const proc = activeProbes.get(jobId)
  if (proc) { proc.kill('SIGTERM'); activeProbes.delete(jobId) }
}

// ─── Render Execution ─────────────────────────────────────────────────────────

export async function renderHoudiniJob(
  hythonPath: string,
  filePath: string,
  config: HoudiniJobConfig,
  renderScriptPath: string,
  jobId: string,
  callbacks: RenderCallbacks
): Promise<void> {
  const tmpDir = path.join(os.tmpdir(), `pyre_${jobId}`)
  fs.mkdirSync(tmpDir, { recursive: true })

  const totalFrames = Math.max(
    1,
    Math.ceil((config.frameEnd - config.frameStart) / config.frameStep) + 1
  )

  const cameraBatch = config.cameraBatch?.length > 0
    ? config.cameraBatch
    : [config.selectedCamera ?? '']

  for (const camera of cameraBatch) {
    const cameraSlug = camera.replace(/\//g, '_')
    const hadCameraToken = config.outputPath.includes('{camera}')
    const resolvedOutput = config.outputPath.replace(/\{camera\}/g, cameraSlug)
    const finalOutput = cameraBatch.length > 1 && camera && !hadCameraToken
      ? path.join(resolvedOutput, cameraSlug, '$F4')
      : resolvedOutput

    const batchConfig: HoudiniJobConfig = {
      ...config,
      selectedCamera: camera || config.selectedCamera,
      outputPath: finalOutput
    }

    const configPath = path.join(tmpDir, `config_${camera || 'default'}.json`)
    fs.writeFileSync(configPath, JSON.stringify(batchConfig, null, 2))

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(hythonPath, [renderScriptPath, filePath, configPath], {
        stdio: ['ignore', 'pipe', 'pipe']
      })
      activeRenders.set(jobId, proc)

      let lineBuffer = ''

      const processLine = (raw: string) => {
        const line = raw.trim()
        if (!line) return

        const logType = classifyHoudiniLine(line)
        callbacks.onLog({ timestamp: Date.now(), text: line, type: logType })

        // ALF_PROGRESS N%
        const alfMatch = line.match(/ALF_PROGRESS\s+(\d+)%/)
        if (alfMatch) {
          const pct = parseInt(alfMatch[1])
          const frame = config.frameStart + Math.round((pct / 100) * totalFrames)
          callbacks.onProgress(frame, totalFrames, pct)
          return
        }

        // Rendering frame N
        const frameMatch = line.match(/[Rr]endering\s+frame\s+(\d+)/i)
        if (frameMatch) {
          const frame = parseInt(frameMatch[1])
          const done = frame - config.frameStart + 1
          const pct = Math.min(100, (done / totalFrames) * 100)
          callbacks.onProgress(frame, totalFrames, pct)
        }
      }

      proc.stdout.on('data', (chunk: Buffer) => {
        lineBuffer += chunk.toString()
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''
        lines.forEach(processLine)
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim()
        if (text) callbacks.onLog({ timestamp: Date.now(), text, type: 'warning' })
      })

      proc.on('close', (code) => {
        activeRenders.delete(jobId)
        if (code === 0 || code === null) resolve()
        else reject(new Error(`hython exited with code ${code}`))
      })

      proc.on('error', (err) => {
        activeRenders.delete(jobId)
        reject(new Error(`Failed to spawn hython: ${err.message}`))
      })
    })
  }

  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  callbacks.onComplete()
}

export function killRender(jobId: string): void {
  const proc = activeRenders.get(jobId)
  if (!proc) return
  proc.kill('SIGTERM')
  setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL') }, 2000)
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function resolveHipVars(
  rawPath: string,
  hipVars: { HIP: string; JOB: string; HFS: string }
): string {
  return rawPath
    .replace(/\$HIP/g, hipVars.HIP)
    .replace(/\$JOB/g, hipVars.JOB)
    .replace(/\$HFS/g, hipVars.HFS)
    .replace(/\$OS/g, os.hostname())
}

function classifyHoudiniLine(line: string): LogLine['type'] {
  const l = line.toLowerCase()
  if (l.startsWith('alf_progress')) return 'progress'
  if (l.includes('rendering frame') || l.includes('rendering sample')) return 'progress'
  if (l.includes('error') || l.includes('traceback') || l.includes('exception')) return 'error'
  if (l.includes('warning') || l.includes('warn')) return 'warning'
  return 'info'
}
