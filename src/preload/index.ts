import { contextBridge, ipcRenderer } from 'electron'
import type { PyreAPI } from '@shared/types'

const api: PyreAPI = {
  addJob: (filePath) => ipcRenderer.invoke('job:add', filePath),
  removeJob: (jobId) => ipcRenderer.invoke('job:remove', jobId),
  moveJob: (jobId, direction) => ipcRenderer.invoke('job:move', jobId, direction),
  duplicateJob: (jobId) => ipcRenderer.invoke('job:duplicate', jobId),
  updateJobConfig: (jobId, config) => ipcRenderer.invoke('job:update-config', jobId, config),

  startJob: (jobId) => ipcRenderer.invoke('job:start', jobId),
  pauseJob: (jobId) => ipcRenderer.invoke('job:pause', jobId),
  resumeJob: (jobId) => ipcRenderer.invoke('job:resume', jobId),
  cancelJob: (jobId) => ipcRenderer.invoke('job:cancel', jobId),
  startAll: () => ipcRenderer.invoke('job:start-all'),
  pauseAll: () => ipcRenderer.invoke('job:pause-all'),
  cancelAll: () => ipcRenderer.invoke('job:cancel-all'),

  getJobs: () => ipcRenderer.invoke('jobs:get'),
  setParallelJobs: (count) => ipcRenderer.invoke('queue:set-parallel', count),

  runProbe: (jobId) => ipcRenderer.invoke('probe:run', jobId),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),

  detectBinaries: () => ipcRenderer.invoke('binary:detect'),
  testBinary: (type, path) => ipcRenderer.invoke('binary:test', type, path),

  openFile: (options) => ipcRenderer.invoke('dialog:open-file', options),
  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  openPath: (path) => ipcRenderer.invoke('shell:open-path', path),

  clearJobLog: (jobId) => ipcRenderer.invoke('job:clear-log', jobId),

  on: (channel, handler) => {
    const wrapped = (_: Electron.IpcRendererEvent, ...args: unknown[]) => handler(...args)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },

  off: (channel, handler) => {
    ipcRenderer.removeAllListeners(channel)
  },
}

contextBridge.exposeInMainWorld('pyre', api)
