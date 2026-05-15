import React, { useState, useEffect, useCallback, useRef } from 'react'
import { QueueSidebar } from './components/Queue/QueueSidebar'
import { JobDetailPanel } from './components/JobDetail/JobDetailPanel'
import { GlobalLogPanel } from './components/LogPanel/GlobalLogPanel'
import { StatusBar } from './components/StatusBar'
import { SettingsModal } from './components/Settings/SettingsModal'
import { useJobs } from './hooks/useJobs'
import type { SystemStats, RenderJob, LogLine } from '@shared/types'

export interface GlobalLogEntry {
  jobId: string
  jobName: string
  line: LogLine
}

export default function App() {
  const { jobs, selectedJob, selectedJobId, setSelectedJobId, addJob } = useJobs()
  const [showSettings, setShowSettings] = useState(false)
  const [logPanelOpen, setLogPanelOpen] = useState(true)
  const [logPanelHeight, setLogPanelHeight] = useState(140)
  const [parallelJobs, setParallelJobsLocal] = useState(1)
  const [globalLog, setGlobalLog] = useState<GlobalLogEntry[]>([])
  const [systemStats, setSystemStats] = useState<SystemStats>({
    cpuPercent: 0, ramUsedMB: 0, ramTotalMB: 0, gpuName: null
  })

  // Load initial settings
  useEffect(() => {
    window.pyre.getSettings().then((s) => setParallelJobsLocal(s.parallelJobs))

    const unsubStats = window.pyre.on('system:stats', (stats: SystemStats) => {
      setSystemStats(stats)
    })

    const unsubLog = window.pyre.on('job:log', ({ jobId, line }: { jobId: string; line: LogLine }) => {
      const job = jobs.find((j) => j.id === jobId)
      setGlobalLog((prev) => [
        ...prev.slice(-5000),
        { jobId, jobName: job?.fileName ?? jobId, line }
      ])
    })

    return () => { unsubStats(); unsubLog() }
  }, [jobs])

  // Keyboard shortcut for global log panel (Ctrl+`)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault()
        setLogPanelOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Drag-and-drop file handling
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    for (const file of Array.from(e.dataTransfer.files)) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'blend' || ext === 'hip' || ext === 'hiplc' || ext === 'hipnc') {
        addJob(file.path)
      }
    }
  }, [addJob])

  const setParallelJobs = useCallback((n: number) => {
    setParallelJobsLocal(n)
    window.pyre.setParallelJobs(n)
    window.pyre.setSettings({ parallelJobs: n })
  }, [])

  // Log panel resize drag
  const logDragRef = useRef<{ startY: number; startH: number } | null>(null)

  const onLogResizeStart = useCallback((e: React.MouseEvent) => {
    logDragRef.current = { startY: e.clientY, startH: logPanelHeight }
    const onMove = (ev: MouseEvent) => {
      if (!logDragRef.current) return
      const delta = logDragRef.current.startY - ev.clientY
      setLogPanelHeight(Math.max(60, Math.min(400, logDragRef.current.startH + delta)))
    }
    const onUp = () => {
      logDragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [logPanelHeight])

  return (
    <div
      className="flex flex-col h-full bg-[#111]"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Main content row */}
      <div className="flex flex-1 min-h-0">
        <QueueSidebar
          jobs={jobs}
          selectedJobId={selectedJobId}
          onSelect={setSelectedJobId}
          onAddJob={async () => {
            const file = await window.pyre.openFile({
              filters: [
                { name: 'Scene Files', extensions: ['blend', 'hip', 'hiplc', 'hipnc'] },
                { name: 'Blender', extensions: ['blend'] },
                { name: 'Houdini', extensions: ['hip', 'hiplc', 'hipnc'] },
              ]
            })
            if (file) addJob(file)
          }}
          onSettings={() => setShowSettings(true)}
          parallelJobs={parallelJobs}
          onParallelChange={setParallelJobs}
        />

        <div className="flex-1 min-w-0">
          {selectedJob ? (
            <JobDetailPanel job={selectedJob} />
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>

      {/* Global log panel */}
      <div
        className="border-t border-[var(--border-subtle)] flex flex-col"
        style={{ height: logPanelOpen ? logPanelHeight : 28 }}
      >
        {/* Resize handle */}
        <div
          className="h-1 cursor-row-resize hover:bg-[var(--accent)] transition-colors flex-shrink-0"
          onMouseDown={onLogResizeStart}
        />
        <GlobalLogPanel
          entries={globalLog}
          open={logPanelOpen}
          onToggle={() => setLogPanelOpen((v) => !v)}
          onSelectJob={setSelectedJobId}
          height={logPanelHeight - 4}
        />
      </div>

      {/* Status bar */}
      <StatusBar jobs={jobs} stats={systemStats} />

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}

function EmptyDetail() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-3">
      <div className="w-16 h-16 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M9 9h6M9 12h6M9 15h4"/>
        </svg>
      </div>
      <div>
        <p className="text-sm text-[var(--text-secondary)] font-medium">No job selected</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Add a .blend or .hip file to get started
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          Or drag files directly onto the window
        </p>
      </div>
    </div>
  )
}
