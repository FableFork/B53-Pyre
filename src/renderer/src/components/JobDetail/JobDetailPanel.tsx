import React, { useState } from 'react'
import type { RenderJob } from '@shared/types'
import { BlenderSettings } from './BlenderSettings'
import { HoudiniSettings } from './HoudiniSettings'
import { LogTab } from './LogTab'

interface Props {
  job: RenderJob
}

export function JobDetailPanel({ job }: Props) {
  const [tab, setTab] = useState<'settings' | 'log'>('settings')

  const canStart = job.status === 'queued' || job.status === 'idle'
  const canPause = job.status === 'rendering'
  const canResume = job.status === 'paused'
  const canCancel = job.status === 'rendering' || job.status === 'paused'

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)]">
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] flex-shrink-0"
        style={{ background: 'var(--bg-panel)' }}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate" style={{ fontSize: 12 }}>{job.fileName}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)', maxWidth: 400 }}>
            {job.filePath}
          </p>
        </div>

        {/* Render controls */}
        <div className="flex items-center gap-1 ml-4 flex-shrink-0">
          {canStart && (
            <button className="btn btn-primary" style={{ height: 26, fontSize: 11 }}
              onClick={() => window.pyre.startJob(job.id)}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
              Render
            </button>
          )}
          {canPause && (
            <button className="btn btn-secondary" style={{ height: 26, fontSize: 11 }}
              onClick={() => window.pyre.pauseJob(job.id)}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              Pause
            </button>
          )}
          {canResume && (
            <button className="btn btn-primary" style={{ height: 26, fontSize: 11 }}
              onClick={() => window.pyre.resumeJob(job.id)}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
              Resume
            </button>
          )}
          {canCancel && (
            <button className="btn btn-secondary" style={{ height: 26, fontSize: 11 }}
              onClick={() => window.pyre.cancelJob(job.id)}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              Cancel
            </button>
          )}
          <button
            className="btn btn-ghost"
            style={{ height: 26, fontSize: 11 }}
            onClick={() => window.pyre.runProbe(job.id)}
            title="Re-probe file"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar when rendering/paused */}
      {(job.status === 'rendering' || job.status === 'paused') && (
        <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex-shrink-0" style={{ background: 'var(--bg-panel)' }}>
          <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            <span>Frame {job.currentFrame} / {job.totalFrames}</span>
            <span>{job.speed} · ETA {job.eta}</span>
            <span>{Math.round(job.progress)}%</span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-bar-fill ${job.status === 'paused' ? 'paused' : ''}`}
              style={{ width: `${job.progress}%`, background: job.status === 'paused' ? '#f0a030' : undefined }}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tab-bar flex-shrink-0" style={{ background: 'var(--bg-panel)' }}>
        <button className={`tab-btn ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
          Settings
        </button>
        <button className={`tab-btn ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>
          Log
          {job.logLines.some((l) => l.type === 'error') && (
            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[#e04040] inline-block" />
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'settings' ? (
          job.engine === 'blender' ? (
            <BlenderSettings job={job} />
          ) : (
            <HoudiniSettings job={job} />
          )
        ) : (
          <LogTab job={job} />
        )}
      </div>
    </div>
  )
}
