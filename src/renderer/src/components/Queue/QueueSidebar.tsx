import React, { useState, useCallback, useRef } from 'react'
import { JobCard } from './JobCard'
import type { RenderJob } from '@shared/types'

interface Props {
  jobs: RenderJob[]
  selectedJobId: string | null
  onSelect: (id: string) => void
  onAddJob: () => void
  onSettings: () => void
  parallelJobs: number
  onParallelChange: (n: number) => void
}

export function QueueSidebar({
  jobs, selectedJobId, onSelect, onAddJob, onSettings, parallelJobs, onParallelChange
}: Props) {
  const renderingCount = jobs.filter((j) => j.status === 'rendering').length
  const queuedCount = jobs.filter((j) => j.status === 'queued').length

  return (
    <div
      className="flex flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-panel)]"
      style={{ width: 280, flexShrink: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <FlameIcon />
          <span className="font-semibold tracking-wide text-[var(--accent)]" style={{ fontSize: 13 }}>
            PYRE
          </span>
          {renderingCount > 0 && (
            <span className="text-2xs font-medium text-[var(--text-muted)] ml-1">
              {renderingCount} rendering
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost p-0 w-7 h-7 flex items-center justify-center" onClick={onSettings}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </button>
          <button className="btn btn-primary" style={{ height: 24, fontSize: 11 }} onClick={onAddJob}>
            + Add
          </button>
        </div>
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--text-muted)]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M12 5v14M5 12l7-7 7 7"/>
            </svg>
            <p style={{ fontSize: 11 }}>Drop files here</p>
          </div>
        ) : (
          <div>
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                selected={job.id === selectedJobId}
                onSelect={() => onSelect(job.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div className="border-t border-[var(--border-subtle)] px-3 py-2 flex-shrink-0">
        {/* Parallel jobs selector */}
        <div className="flex items-center justify-between mb-2">
          <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Parallel
          </span>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => onParallelChange(n)}
                style={{
                  width: 22, height: 22, fontSize: 11, borderRadius: 3,
                  background: parallelJobs === n ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: parallelJobs === n ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid',
                  borderColor: parallelJobs === n ? 'var(--accent)' : 'var(--border)',
                  cursor: 'pointer', fontWeight: 500
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1">
          <button
            className="btn btn-primary flex-1"
            style={{ fontSize: 11, height: 26 }}
            disabled={queuedCount === 0}
            onClick={() => window.pyre.startAll()}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Render All
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 11, height: 26, padding: '0 8px' }}
            onClick={() => window.pyre.pauseAll()}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
            </svg>
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 11, height: 26, padding: '0 8px' }}
            onClick={() => window.pyre.cancelAll()}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function FlameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)">
      <path d="M12 2c0 0-6 5.5-6 11a6 6 0 0012 0c0-1.8-.7-3.5-2-5-.5 1.5-1.5 2.5-2.5 3 0-3-1.5-6-1.5-9z"/>
    </svg>
  )
}
