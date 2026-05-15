import Store from 'electron-store'
import type { AppSettings, RenderJob } from '@shared/types'

interface StoreSchema {
  settings: AppSettings
  jobs: RenderJob[]
  parallelJobs: number
}

const defaults: StoreSchema = {
  settings: {
    binaryPaths: { blender: '', houdini: '' },
    detectedVersions: { blender: null, houdini: null },
    defaultOutputFolder: '',
    parallelJobs: 1,
    defaultBlenderFormat: 'PNG',
    defaultHoudiniFormat: 'exr_multilayer',
    autoProbOnAdd: true,
    autoStartOnQueue: false,
    clearCompleted: 'never',
    notifyOnComplete: true,
    playSoundOnComplete: false,
    soundPath: '',
    theme: 'dark',
    accentColor: '#C45C1A',
    fontSize: 'medium',
    logFontSize: 'small'
  },
  jobs: [],
  parallelJobs: 1
}

export const store = new Store<StoreSchema>({ defaults })

export function getSettings(): AppSettings {
  return store.get('settings')
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const current = store.get('settings')
  const updated = { ...current, ...patch }
  store.set('settings', updated)
  return updated
}

export function getSavedJobs(): RenderJob[] {
  return store.get('jobs', [])
}

export function saveJobs(jobs: RenderJob[]): void {
  // Strip log lines from persisted jobs to keep file small; logs are ephemeral
  const stripped = jobs.map((j) => ({ ...j, logLines: [] }))
  store.set('jobs', stripped)
}

export function getParallelJobs(): number {
  return store.get('parallelJobs', 1)
}

export function setParallelJobs(n: number): void {
  store.set('parallelJobs', Math.max(1, Math.min(4, n)))
}
