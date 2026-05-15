import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { RenderJob, LogLine } from '@shared/types'

interface Props { job: RenderJob }

export function LogTab({ job }: Props) {
  const [filter, setFilter] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [showTimestamps, setShowTimestamps] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottom = useRef(true)

  const filtered = filter
    ? job.logLines.filter((l) => l.text.toLowerCase().includes(filter.toLowerCase()))
    : job.logLines

  useEffect(() => {
    if (autoScroll && isAtBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [job.logLines, autoScroll])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 40
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    if (!isAtBottom.current) setAutoScroll(false)
  }, [])

  const copyAll = useCallback(() => {
    const text = job.logLines.map((l) => {
      const ts = showTimestamps ? `[${new Date(l.timestamp).toISOString()}] ` : ''
      return ts + l.text
    }).join('\n')
    navigator.clipboard.writeText(text)
  }, [job.logLines, showTimestamps])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-1 border-b border-[var(--border-subtle)] flex-shrink-0"
        style={{ background: 'var(--bg-panel)' }}
      >
        <input
          type="text"
          placeholder="Filter log…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, height: 22, fontSize: 11 }}
        />
        <label className="flex items-center gap-1 cursor-pointer" style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showTimestamps} onChange={(e) => setShowTimestamps(e.target.checked)} />
          Timestamps
        </label>
        <label className="flex items-center gap-1 cursor-pointer" style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={autoScroll} onChange={(e) => {
            setAutoScroll(e.target.checked)
            if (e.target.checked && scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight
              isAtBottom.current = true
            }
          }} />
          Auto-scroll
        </label>
        <button className="btn btn-ghost" style={{ height: 22, fontSize: 10, padding: '0 6px' }} onClick={copyAll}>
          Copy
        </button>
        <button className="btn btn-ghost" style={{ height: 22, fontSize: 10, padding: '0 6px' }}
          onClick={() => window.pyre.clearJobLog(job.id)}>
          Clear
        </button>
      </div>

      {/* Log lines */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-3 py-2"
        style={{ background: '#0d0d0d' }}
      >
        {filtered.length === 0 ? (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 20 }}>
            {filter ? 'No matching log lines.' : 'No log output yet.'}
          </p>
        ) : (
          filtered.map((line, i) => (
            <LogLineRow key={i} line={line} showTimestamp={showTimestamps} />
          ))
        )}
      </div>
    </div>
  )
}

function LogLineRow({ line, showTimestamp }: { line: LogLine; showTimestamp: boolean }) {
  return (
    <div className={`log-line log-${line.type}`}>
      {showTimestamp && (
        <span style={{ color: 'var(--text-muted)', marginRight: 8, fontSize: 10 }}>
          {new Date(line.timestamp).toISOString().slice(11, 23)}
        </span>
      )}
      {line.text}
    </div>
  )
}
