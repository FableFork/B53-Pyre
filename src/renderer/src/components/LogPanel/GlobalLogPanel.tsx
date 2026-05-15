import React, { useRef, useEffect } from 'react'
import type { GlobalLogEntry } from '../../App'

interface Props {
  entries: GlobalLogEntry[]
  open: boolean
  onToggle: () => void
  onSelectJob: (id: string) => void
  height: number
}

const JOB_COLOURS = [
  '#7b7bff', '#3dc47e', '#f0a030', '#4a9eda', '#e04040',
  '#c77dff', '#4cc9f0', '#f72585',
]

const jobColourCache = new Map<string, string>()
let colourIdx = 0

function getJobColour(jobId: string): string {
  if (!jobColourCache.has(jobId)) {
    jobColourCache.set(jobId, JOB_COLOURS[colourIdx % JOB_COLOURS.length])
    colourIdx++
  }
  return jobColourCache.get(jobId)!
}

export function GlobalLogPanel({ entries, open, onToggle, onSelectJob, height }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, open])

  return (
    <div className="flex flex-col h-full" style={{ background: '#0d0d0d' }}>
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-3 flex-shrink-0"
        style={{ height: 24, borderBottom: open ? '1px solid var(--border-subtle)' : 'none', background: 'var(--bg-panel)' }}
      >
        <button
          onClick={onToggle}
          className="flex items-center gap-2"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11 }}
        >
          <span style={{ fontSize: 9, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block', transition: 'transform 0.15s' }}>▼</span>
          Output Log
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ctrl+`</span>
        </button>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {entries.length} lines
        </span>
      </div>

      {/* Log content */}
      {open && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-1"
          style={{ height: height - 24 }}
        >
          {entries.map((entry, i) => (
            <div key={i} className={`log-line log-${entry.line.type}`} style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => onSelectJob(entry.jobId)}
                style={{
                  flexShrink: 0,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: getJobColour(entry.jobId),
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  padding: 0,
                  maxWidth: 100,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={entry.jobName}
              >
                [{entry.jobName.slice(0, 12)}]
              </button>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.line.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
