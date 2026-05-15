export type RenderEngine = 'blender' | 'houdini'

export type JobStatus =
  | 'idle'
  | 'probing'
  | 'queued'
  | 'rendering'
  | 'paused'
  | 'done'
  | 'error'

// ─── Blender Types ────────────────────────────────────────────────────────────

export interface BlenderViewLayer {
  name: string
  enabled: boolean
  passes: Record<string, boolean>
}

export interface BlenderScene {
  name: string
  cameras: string[]
  view_layers: BlenderViewLayer[]
  frame_start: number
  frame_end: number
  frame_step: number
  fps: number
  resolution_x: number
  resolution_y: number
  resolution_percentage: number
  engine: 'CYCLES' | 'BLENDER_EEVEE' | 'BLENDER_WORKBENCH'
  output_path: string
  file_format: string
  color_depth: string
  collections: string[]
  compositor_enabled: boolean
  samples_cycles: number | null
  samples_eevee: number | null
}

export type BlenderProbeResult = Record<string, BlenderScene>

export interface BlenderJobConfig {
  selectedScene: string
  selectedCamera: string
  cameraBatch: string[]
  selectedViewLayers: string[]
  enabledPasses: Record<string, Record<string, boolean>>
  frameStart: number
  frameEnd: number
  frameStep: number
  resolutionX: number
  resolutionY: number
  resolutionScale: number
  engine: string
  samplesCycles?: number
  samplesEevee?: number
  outputPath: string
  fileFormat: string
  colorDepth: string
  useCompositor: boolean
  useSourceSettings: boolean
}

// ─── Houdini Types ────────────────────────────────────────────────────────────

export interface HoudiniAOV {
  variable: string
  vex_variable: string
  enabled: boolean
  channel: string
  output_path_override?: string
}

export interface HoudiniROPParms {
  frame_start: number | null
  frame_end: number | null
  frame_step: number | null
  renderer: string | null
  samples: number | null
  output_path: string | null
  res_x: number | null
  res_y: number | null
  motion_blur: boolean | null
  denoise: boolean | null
  camera: string | null
  aovs: HoudiniAOV[]
}

export interface HoudiniROP {
  name: string
  type: string
  path: string
  context: string
  parms: HoudiniROPParms
}

export interface HoudiniFileRef {
  parm: string
  path: string
  exists?: boolean
}

export interface HoudiniProbeResult {
  rops: Record<string, HoudiniROP>
  cameras: string[]
  file_refs: HoudiniFileRef[]
  hip_vars: {
    HIP: string
    JOB: string
    HFS: string
  }
}

export interface HoudiniJobConfig {
  selectedROP: string
  renderer: 'BRAY_HdKarmaXPU' | 'BRAY_HdKarma'
  xpuDeviceMode: 'gpu_and_cpu' | 'gpu_only' | 'cpu_only'
  selectedCamera?: string
  cameraBatch: string[]
  frameStart: number
  frameEnd: number
  frameStep: number
  resolutionX: number
  resolutionY: number
  resolutionScale: number
  samples: number
  maxPathDepth: number
  denoise: boolean
  denoiser: 'optix' | 'oidn'
  noiseThreshold: number
  outputPath: string
  fileFormat: 'exr_multilayer' | 'exr_single' | 'png' | 'tiff'
  exrCompression: 'zip' | 'zips' | 'piz' | 'dwaa' | 'dwab'
  colourSpace: 'linear' | 'acescg' | 'srgb'
  enabledAOVs: HoudiniAOV[]
  useSourceSettings: boolean
}

// ─── Log & Job ────────────────────────────────────────────────────────────────

export interface LogLine {
  timestamp: number
  text: string
  type: 'info' | 'progress' | 'warning' | 'error'
}

export interface RenderJob {
  id: string
  engine: RenderEngine
  filePath: string
  fileName: string
  status: JobStatus
  progress: number
  currentFrame: number
  totalFrames: number
  fps: number
  speed: string
  eta: string
  elapsedSeconds: number
  errorMessage?: string
  logLines: LogLine[]
  addedAt: number
  startedAt?: number
  completedAt?: number
  config: BlenderJobConfig | HoudiniJobConfig
  probeData?: BlenderProbeResult | HoudiniProbeResult
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface BinaryPaths {
  blender: string
  houdini: string
}

export interface DetectedVersions {
  blender: string | null
  houdini: string | null
}

export interface AppSettings {
  binaryPaths: BinaryPaths
  detectedVersions: DetectedVersions
  defaultOutputFolder: string
  parallelJobs: number
  defaultBlenderFormat: string
  defaultHoudiniFormat: string
  autoProbOnAdd: boolean
  autoStartOnQueue: boolean
  clearCompleted: 'never' | '1h' | 'on_close'
  notifyOnComplete: boolean
  playSoundOnComplete: boolean
  soundPath: string
  theme: 'dark' | 'darker'
  accentColor: string
  fontSize: 'small' | 'medium' | 'large'
  logFontSize: 'small' | 'medium' | 'large'
}

export interface BinaryStatus {
  blenderPath: string | null
  blenderVersion: string | null
  houdiniPath: string | null
  houdiniVersion: string | null
}

export interface SystemStats {
  cpuPercent: number
  ramUsedMB: number
  ramTotalMB: number
  gpuName: string | null
}

// ─── IPC Channel Types ────────────────────────────────────────────────────────

export interface PyreAPI {
  addJob: (filePath: string) => Promise<RenderJob>
  removeJob: (jobId: string) => Promise<void>
  moveJob: (jobId: string, direction: 'top' | 'up' | 'down' | 'bottom') => Promise<void>
  duplicateJob: (jobId: string) => Promise<RenderJob>
  updateJobConfig: (jobId: string, config: Partial<BlenderJobConfig | HoudiniJobConfig>) => Promise<void>
  startJob: (jobId: string) => Promise<void>
  pauseJob: (jobId: string) => Promise<void>
  resumeJob: (jobId: string) => Promise<void>
  cancelJob: (jobId: string) => Promise<void>
  startAll: () => Promise<void>
  pauseAll: () => Promise<void>
  cancelAll: () => Promise<void>
  getJobs: () => Promise<RenderJob[]>
  setParallelJobs: (count: number) => Promise<void>
  runProbe: (jobId: string) => Promise<void>
  getSettings: () => Promise<AppSettings>
  setSettings: (settings: Partial<AppSettings>) => Promise<void>
  detectBinaries: () => Promise<BinaryStatus>
  testBinary: (type: 'blender' | 'houdini', path: string) => Promise<{ version: string }>
  openFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>
  openFolder: () => Promise<string | null>
  openPath: (path: string) => Promise<void>
  clearJobLog: (jobId: string) => Promise<void>
  on: (channel: string, handler: (...args: unknown[]) => void) => () => void
  off: (channel: string, handler: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    pyre: PyreAPI
  }
}
