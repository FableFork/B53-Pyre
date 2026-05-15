import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { v4 as uuid } from 'uuid'
import chokidar from 'chokidar'
import {
  getSettings, setSettings, getSavedJobs, saveJobs, getParallelJobs, setParallelJobs
} from '../store'
import { detectBlender, detectHoudini, testBinary } from '../binary-detection'
import * as Blender from '../renderers/blender'
import * as Houdini from '../renderers/houdini'
import type {
  RenderJob, BlenderJobConfig, HoudiniJobConfig, BlenderProbeResult,
  HoudiniProbeResult, LogLine, AppSettings
} from '@shared/types'

// ─── Output path token resolver ───────────────────────────────────────────────

function resolvePathTokens(
  template: string,
  job: RenderJob,
  extra: Record<string, string> = {}
): string {
  const now = new Date()
  const base = path.basename(job.fileName, path.extname(job.fileName))
  const map: Record<string, string> = {
    filename: base,
    hip: base,                                          // Houdini alias
    date: now.toISOString().slice(0, 10).replace(/-/g, ''),
    time: now.toTimeString().slice(0, 5).replace(':', ''),
    frame: '####',                                      // Blender native
    ...extra
  }
  // Replace known tokens; leave unknown ones untouched so Blender/$HIP etc. pass through
  return template.replace(/\{(\w+)\}/g, (_, key) => map[key] ?? `{${key}}`)
}

// ─── In-memory job queue ──────────────────────────────────────────────────────

let jobs: RenderJob[] = []
let mainWindow: BrowserWindow | null = null
const outputWatchers = new Map<string, ReturnType<typeof chokidar.watch>>()

export function initHandlers(win: BrowserWindow): void {
  mainWindow = win
  jobs = getSavedJobs()

  // Restore jobs that were rendering to 'queued'
  jobs = jobs.map((j) =>
    j.status === 'rendering' || j.status === 'paused'
      ? { ...j, status: 'queued' as const }
      : j
  )

  registerHandlers()
}

function emit(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function emitJobUpdate(job: RenderJob): void {
  emit('job:update', job)
  persist()
}

function persist(): void {
  saveJobs(jobs)
}

function getJob(id: string): RenderJob | undefined {
  return jobs.find((j) => j.id === id)
}

function updateJob(id: string, patch: Partial<RenderJob>): RenderJob | null {
  const idx = jobs.findIndex((j) => j.id === id)
  if (idx === -1) return null
  jobs[idx] = { ...jobs[idx], ...patch }
  emitJobUpdate(jobs[idx])
  return jobs[idx]
}

// ─── Script path resolution ───────────────────────────────────────────────────

function getProbeScriptsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'probe-scripts')
  }
  return path.join(app.getAppPath(), 'src', 'main', 'probe-scripts')
}

function ensureUserScripts(): void {
  const userScriptsDir = path.join(app.getPath('userData'), 'scripts')
  fs.mkdirSync(userScriptsDir, { recursive: true })
  const bundledDir = getProbeScriptsDir()
  for (const file of ['blender_probe.py', 'houdini_probe.py', 'houdini_render.py']) {
    const dest = path.join(userScriptsDir, file)
    if (!fs.existsSync(dest)) {
      const src = path.join(bundledDir, file)
      if (fs.existsSync(src)) fs.copyFileSync(src, dest)
    }
  }
}

function getUserScriptPath(name: string): string {
  ensureUserScripts()
  return path.join(app.getPath('userData'), 'scripts', name)
}

// ─── Probe orchestration ─────────────────────────────────────────────────────

async function runProbeForJob(jobId: string): Promise<void> {
  const job = getJob(jobId)
  if (!job) return

  const settings = getSettings()
  updateJob(jobId, { status: 'probing' })

  try {
    if (job.engine === 'blender') {
      const blenderPath = settings.binaryPaths.blender
      if (!blenderPath) throw new Error('Blender path not configured')
      const scriptPath = getUserScriptPath('blender_probe.py')
      const probeData = await Blender.probeBlenderFile(
        blenderPath, job.filePath, scriptPath, jobId
      )
      const scenes = Object.values(probeData as BlenderProbeResult)
      const firstScene = scenes[0]
      if (!firstScene) throw new Error('No scenes found in file')

      const defaultConfig: BlenderJobConfig = {
        selectedScene: firstScene.name,
        selectedCamera: firstScene.cameras[0] ?? '',
        cameraBatch: [],
        selectedViewLayers: firstScene.view_layers.filter((vl) => vl.enabled).map((vl) => vl.name),
        enabledPasses: Object.fromEntries(
          firstScene.view_layers.map((vl) => [vl.name, vl.passes])
        ),
        frameStart: firstScene.frame_start,
        frameEnd: firstScene.frame_end,
        frameStep: firstScene.frame_step,
        resolutionX: firstScene.resolution_x,
        resolutionY: firstScene.resolution_y,
        resolutionScale: firstScene.resolution_percentage,
        engine: firstScene.engine,
        samplesCycles: firstScene.samples_cycles ?? 128,
        samplesEevee: firstScene.samples_eevee ?? 64,
        outputPath: firstScene.output_path || path.join(os.homedir(), 'renders', job.fileName, '####'),
        fileFormat: firstScene.file_format || 'PNG',
        colorDepth: firstScene.color_depth || '8',
        useCompositor: firstScene.compositor_enabled,
        useSourceSettings: true,
      }

      updateJob(jobId, {
        status: 'queued',
        probeData: probeData as BlenderProbeResult,
        config: defaultConfig,
        totalFrames: Math.max(1, Math.ceil((firstScene.frame_end - firstScene.frame_start) / firstScene.frame_step) + 1),
      })
    } else {
      const hythonPath = settings.binaryPaths.houdini
      if (!hythonPath) throw new Error('hython path not configured')
      const scriptPath = getUserScriptPath('houdini_probe.py')
      const probeData = await Houdini.probeHoudiniFile(
        hythonPath, job.filePath, scriptPath, jobId
      )

      const rops = Object.values(probeData.rops)
      const firstROP = rops[0]

      const defaultConfig: HoudiniJobConfig = {
        selectedROP: firstROP?.path ?? '',
        renderer: 'BRAY_HdKarmaXPU',
        xpuDeviceMode: 'gpu_and_cpu',
        selectedCamera: firstROP?.parms.camera ?? probeData.cameras[0] ?? '',
        cameraBatch: [],
        frameStart: firstROP?.parms.frame_start ?? 1,
        frameEnd: firstROP?.parms.frame_end ?? 100,
        frameStep: firstROP?.parms.frame_step ?? 1,
        resolutionX: firstROP?.parms.res_x ?? 1920,
        resolutionY: firstROP?.parms.res_y ?? 1080,
        resolutionScale: 100,
        samples: firstROP?.parms.samples ?? 512,
        maxPathDepth: 10,
        denoise: firstROP?.parms.denoise ?? false,
        denoiser: 'optix',
        noiseThreshold: 0.01,
        outputPath: firstROP?.parms.output_path ?? '',
        fileFormat: 'exr_multilayer',
        exrCompression: 'zip',
        colourSpace: 'linear',
        enabledAOVs: firstROP?.parms.aovs ?? [],
        useSourceSettings: true,
      }

      const fr = firstROP?.parms
      const totalFrames = fr
        ? Math.max(1, Math.ceil(((fr.frame_end ?? 100) - (fr.frame_start ?? 1)) / (fr.frame_step ?? 1)) + 1)
        : 1

      updateJob(jobId, {
        status: 'queued',
        probeData: probeData as HoudiniProbeResult,
        config: defaultConfig,
        totalFrames,
      })
    }
  } catch (err) {
    updateJob(jobId, {
      status: 'error',
      errorMessage: (err as Error).message
    })
  }
}

// ─── Render orchestration ─────────────────────────────────────────────────────

let activeRenderCount = 0

async function startNextJobs(): Promise<void> {
  const parallel = getParallelJobs()
  const queued = jobs.filter((j) => j.status === 'queued')

  while (activeRenderCount < parallel && queued.length > 0) {
    const job = queued.shift()
    if (!job) break
    activeRenderCount++
    startRenderJob(job.id)
  }
}

async function startRenderJob(jobId: string): Promise<void> {
  const job = getJob(jobId)
  if (!job) { activeRenderCount--; return }

  const settings = getSettings()
  updateJob(jobId, { status: 'rendering', startedAt: Date.now(), progress: 0 })

  const callbacks: Blender.RenderCallbacks = {
    onLog: (line: LogLine) => {
      const j = getJob(jobId)
      if (!j) return
      const updated = { ...j, logLines: [...j.logLines.slice(-2000), line] }
      jobs[jobs.findIndex((x) => x.id === jobId)] = updated
      emit('job:log', { jobId, line })
      emit('job:update', updated)
    },
    onProgress: (frame: number, total: number, percent: number) => {
      const j = getJob(jobId)
      if (!j) return
      const elapsed = j.startedAt ? (Date.now() - j.startedAt) / 1000 : 0
      const fps = elapsed > 0 ? frame / elapsed : 0
      const remaining = fps > 0 ? (total - frame) / fps : 0
      updateJob(jobId, {
        currentFrame: frame,
        totalFrames: total,
        progress: percent,
        fps: Math.round(fps * 100) / 100,
        speed: `${fps.toFixed(2)}fps`,
        eta: formatETA(remaining),
        elapsedSeconds: elapsed,
      })
    },
    onComplete: () => {
      updateJob(jobId, { status: 'done', progress: 100, completedAt: Date.now() })
      activeRenderCount--
      startNextJobs()
      notifyComplete(job.fileName)
    },
    onError: (msg: string) => {
      updateJob(jobId, { status: 'error', errorMessage: msg })
      activeRenderCount--
      startNextJobs()
    }
  }

  try {
    if (job.engine === 'blender') {
      const blenderPath = settings.binaryPaths.blender
      if (!blenderPath) throw new Error('Blender not configured')
      const cfg = job.config as BlenderJobConfig
      const resolvedConfig: BlenderJobConfig = {
        ...cfg,
        outputPath: resolvePathTokens(cfg.outputPath, job, {
          scene: cfg.selectedScene,
          layer: cfg.selectedViewLayers[0] ?? '',
          // {camera} intentionally left unresolved — the batch loop in blender.ts
          // resolves it per-camera so each camera gets its own path
        })
      }
      await Blender.renderBlenderJob(blenderPath, job.filePath, resolvedConfig, jobId, callbacks)
    } else {
      const hythonPath = settings.binaryPaths.houdini
      if (!hythonPath) throw new Error('hython not configured')
      const cfg = job.config as HoudiniJobConfig
      const ropName = cfg.selectedROP.split('/').pop() ?? ''
      const resolvedConfig: HoudiniJobConfig = {
        ...cfg,
        outputPath: resolvePathTokens(cfg.outputPath, job, {
          rop: ropName,
          // {camera} left for per-camera resolution in houdini.ts batch loop
        })
      }
      const renderScript = getUserScriptPath('houdini_render.py')
      await Houdini.renderHoudiniJob(hythonPath, job.filePath, resolvedConfig, renderScript, jobId, callbacks)
    }
  } catch (err) {
    callbacks.onError((err as Error).message)
  }
}

function notifyComplete(fileName: string): void {
  const settings = getSettings()
  if (settings.notifyOnComplete) {
    new Notification({ title: 'Pyre — Render Complete', body: `${fileName} finished.` }).show()
  }
}

function formatETA(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ─── IPC Handler Registration ─────────────────────────────────────────────────

function registerHandlers(): void {
  // Job add
  ipcMain.handle('job:add', async (_, filePath: string) => {
    const ext = path.extname(filePath).toLowerCase()
    const engine = ext === '.blend' ? 'blender' : 'houdini'
    const job: RenderJob = {
      id: uuid(),
      engine,
      filePath,
      fileName: path.basename(filePath),
      status: 'idle',
      progress: 0,
      currentFrame: 0,
      totalFrames: 1,
      fps: 0,
      speed: '--',
      eta: '--',
      elapsedSeconds: 0,
      logLines: [],
      addedAt: Date.now(),
      config: {} as BlenderJobConfig,
    }
    jobs.push(job)
    emitJobUpdate(job)

    const settings = getSettings()
    if (settings.autoProbOnAdd) {
      runProbeForJob(job.id)
    }

    return job
  })

  ipcMain.handle('job:remove', async (_, jobId: string) => {
    Blender.cleanupJob(jobId)
    Houdini.cleanupJob(jobId)
    jobs = jobs.filter((j) => j.id !== jobId)
    emit('job:removed', jobId)
    persist()
  })

  ipcMain.handle('job:move', async (_, jobId: string, direction: string) => {
    const idx = jobs.findIndex((j) => j.id === jobId)
    if (idx === -1) return
    const newJobs = [...jobs]
    if (direction === 'top') {
      newJobs.splice(0, 0, newJobs.splice(idx, 1)[0])
    } else if (direction === 'up' && idx > 0) {
      ;[newJobs[idx - 1], newJobs[idx]] = [newJobs[idx], newJobs[idx - 1]]
    } else if (direction === 'down' && idx < newJobs.length - 1) {
      ;[newJobs[idx], newJobs[idx + 1]] = [newJobs[idx + 1], newJobs[idx]]
    } else if (direction === 'bottom') {
      newJobs.push(newJobs.splice(idx, 1)[0])
    }
    jobs = newJobs
    emit('jobs:reorder', jobs)
    persist()
  })

  ipcMain.handle('job:duplicate', async (_, jobId: string) => {
    const original = getJob(jobId)
    if (!original) return null
    const copy: RenderJob = {
      ...original,
      id: uuid(),
      status: 'queued',
      progress: 0,
      currentFrame: 0,
      logLines: [],
      addedAt: Date.now(),
      startedAt: undefined,
      completedAt: undefined,
      errorMessage: undefined,
    }
    jobs.push(copy)
    emitJobUpdate(copy)
    return copy
  })

  ipcMain.handle('job:update-config', async (_, jobId: string, config: Partial<BlenderJobConfig | HoudiniJobConfig>) => {
    const job = getJob(jobId)
    if (!job) return
    updateJob(jobId, { config: { ...job.config, ...config } as BlenderJobConfig | HoudiniJobConfig })
  })

  ipcMain.handle('job:start', async (_, jobId: string) => {
    const job = getJob(jobId)
    if (!job || job.status === 'rendering') return
    if (job.status !== 'queued' && job.status !== 'idle') {
      updateJob(jobId, { status: 'queued' })
    }
    await startNextJobs()
  })

  ipcMain.handle('job:pause', async (_, jobId: string) => {
    const job = getJob(jobId)
    if (!job || job.status !== 'rendering') return
    const ok = job.engine === 'blender'
      ? Blender.suspendRender(jobId)
      : Houdini.suspendRender(jobId)
    if (ok) updateJob(jobId, { status: 'paused' })
  })

  ipcMain.handle('job:resume', async (_, jobId: string) => {
    const job = getJob(jobId)
    if (!job || job.status !== 'paused') return
    const ok = job.engine === 'blender'
      ? Blender.resumeRender(jobId)
      : Houdini.resumeRender(jobId)
    if (ok) updateJob(jobId, { status: 'rendering' })
  })

  ipcMain.handle('job:cancel', async (_, jobId: string) => {
    const job = getJob(jobId)
    if (!job) return
    if (job.engine === 'blender') Blender.killRender(jobId)
    else Houdini.killRender(jobId)
    updateJob(jobId, { status: 'queued', progress: 0, currentFrame: 0 })
    if (job.status === 'rendering') {
      activeRenderCount = Math.max(0, activeRenderCount - 1)
      startNextJobs()
    }
  })

  ipcMain.handle('job:start-all', async () => {
    jobs.filter((j) => j.status === 'queued' || j.status === 'idle').forEach((j) => {
      if (j.status === 'idle') updateJob(j.id, { status: 'queued' })
    })
    await startNextJobs()
  })

  ipcMain.handle('job:pause-all', async () => {
    jobs.filter((j) => j.status === 'rendering').forEach((j) => {
      const ok = j.engine === 'blender' ? Blender.suspendRender(j.id) : Houdini.suspendRender(j.id)
      if (ok) updateJob(j.id, { status: 'paused' })
    })
  })

  ipcMain.handle('job:cancel-all', async () => {
    jobs.filter((j) => j.status === 'rendering' || j.status === 'paused').forEach((j) => {
      if (j.engine === 'blender') Blender.killRender(j.id)
      else Houdini.killRender(j.id)
      updateJob(j.id, { status: 'queued', progress: 0 })
    })
    activeRenderCount = 0
  })

  ipcMain.handle('jobs:get', async () => jobs)

  ipcMain.handle('queue:set-parallel', async (_, count: number) => {
    setParallelJobs(count)
  })

  ipcMain.handle('probe:run', async (_, jobId: string) => {
    await runProbeForJob(jobId)
  })

  ipcMain.handle('job:clear-log', async (_, jobId: string) => {
    updateJob(jobId, { logLines: [] })
  })

  // Settings
  ipcMain.handle('settings:get', async () => getSettings())

  ipcMain.handle('settings:set', async (_, patch: Partial<AppSettings>) => {
    setSettings(patch)
  })

  // Binary detection
  ipcMain.handle('binary:detect', async () => {
    const bl = detectBlender()
    const hou = detectHoudini()
    const settings = getSettings()
    setSettings({
      ...settings,
      binaryPaths: {
        blender: bl.path ?? settings.binaryPaths.blender,
        houdini: hou.path ?? settings.binaryPaths.houdini,
      },
      detectedVersions: {
        blender: bl.version,
        houdini: hou.version,
      }
    })
    return {
      blenderPath: bl.path,
      blenderVersion: bl.version,
      houdiniPath: hou.path,
      houdiniVersion: hou.version,
    }
  })

  ipcMain.handle('binary:test', async (_, type: 'blender' | 'houdini', binPath: string) => {
    return testBinary(type, binPath)
  })

  // Dialogs
  ipcMain.handle('dialog:open-file', async (_, options: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      ...options,
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('shell:open-path', async (_, p: string) => {
    shell.openPath(p)
  })

  // System stats polling
  let statsInterval: ReturnType<typeof setInterval>

  function startStatsPolling(): void {
    statsInterval = setInterval(() => {
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const cpus = os.cpus()
      const cpuUsage = cpus.reduce((sum, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
        return sum + (1 - cpu.times.idle / total)
      }, 0) / cpus.length * 100

      emit('system:stats', {
        cpuPercent: Math.round(cpuUsage),
        ramUsedMB: Math.round((totalMem - freeMem) / 1024 / 1024),
        ramTotalMB: Math.round(totalMem / 1024 / 1024),
        gpuName: null, // Requires native addon; skip for now
      })
    }, 2000)
  }

  startStatsPolling()
  mainWindow?.on('closed', () => clearInterval(statsInterval))
}

export function cleanupAllJobs(): void {
  for (const job of jobs) {
    Blender.cleanupJob(job.id)
    Houdini.cleanupJob(job.id)
  }
}
