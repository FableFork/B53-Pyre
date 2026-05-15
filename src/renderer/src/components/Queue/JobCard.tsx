import React, { useState, useCallback } from 'react'
import type { RenderJob } from '@shared/types'

interface Props {
  job: RenderJob
  selected: boolean
  onSelect: () => void
}

interface ContextMenuState {
  x: number
  y: number
}

export function JobCard({ job, selected, onSelect }: Props) {
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [hovered, setHovered] = useState(false)

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const closeMenu = useCallback(() => setCtxMenu(null), [])

  const selectedScene = (job.config as { selectedScene?: string })?.selectedScene ?? ''
  const selectedROP = (job.config as { selectedROP?: string })?.selectedROP ?? ''
  const subtitle = job.engine === 'blender' ? selectedScene : selectedROP.split('/').pop() ?? ''

  const isActive = job.status === 'rendering'
  const isPaused = job.status === 'paused'
  const isDone = job.status === 'done'
  const isError = job.status === 'error'

  return (
    <>
      <div
        className="px-3 py-2 border-b border-[var(--border-subtle)] cursor-pointer relative"
        style={{
          background: selected ? 'var(--bg-active)' : 'transparent',
          borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
        }}
        onClick={onSelect}
        onContextMenu={onContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Top row: engine badge + name + delete */}
        <div className="flex items-center gap-2 mb-1">
          <EngineBadge engine={job.engine} />
          <span
            className="flex-1 truncate font-medium"
            style={{ fontSize: 11, color: 'var(--text-primary)' }}
            title={job.filePath}
          >
            {job.fileName}
          </span>
          {hovered ? (
            <button
              onClick={(e) => { e.stopPropagation(); window.pyre.removeJob(job.id) }}
              title="Remove job"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 13, lineHeight: 1,
                padding: '0 2px', flexShrink: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#e04040')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              ✕
            </button>
          ) : (
            <StatusBadge status={job.status} />
          )}
        </div>

        {/* Scene / ROP name */}
        {subtitle && (
          <p className="text-xs truncate mb-1" style={{ color: 'var(--text-muted)', paddingLeft: 22 }}>
            {subtitle}
          </p>
        )}

        {/* Progress row */}
        {(isActive || isPaused) && (
          <div className="mt-1">
            <div className="progress-bar mb-1">
              <div
                className="progress-bar-fill"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <div className="flex justify-between items-center" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              <span>Fr {job.currentFrame}/{job.totalFrames}</span>
              <span>{job.speed}</span>
              <span>ETA {job.eta}</span>
            </div>
          </div>
        )}

        {isDone && (
          <div className="progress-bar mt-1">
            <div className="progress-bar-fill done" style={{ width: '100%' }} />
          </div>
        )}

        {isError && job.errorMessage && (
          <p className="text-xs mt-1 truncate" style={{ color: '#e04040' }}>
            {job.errorMessage}
          </p>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          job={job}
          onClose={closeMenu}
        />
      )}
    </>
  )
}

function EngineBadge({ engine }: { engine: 'blender' | 'houdini' }) {
  const isBlender = engine === 'blender'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        borderRadius: 2,
        fontSize: 9,
        fontWeight: 700,
        background: isBlender ? '#2176ae' : '#de7921',
        color: '#fff',
        flexShrink: 0,
        letterSpacing: '-0.5px',
      }}
    >
      {isBlender ? 'B' : 'H'}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    idle: 'Idle', probing: 'Probing', queued: 'Queued',
    rendering: 'Rendering', paused: 'Paused', done: 'Done', error: 'Error'
  }
  return (
    <span className={`status-badge status-${status}`}>
      {status === 'rendering' && <PulsingDot />}
      {labels[status] ?? status}
    </span>
  )
}

function PulsingDot() {
  return (
    <span style={{
      width: 5, height: 5, borderRadius: '50%', background: '#3dc47e',
      display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  )
}

interface CtxProps {
  x: number
  y: number
  job: RenderJob
  onClose: () => void
}

function ContextMenu({ x, y, job, onClose }: CtxProps) {
  const handleAction = useCallback((action: () => void) => {
    action()
    onClose()
  }, [onClose])

  React.useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('click', handler)
    window.addEventListener('contextmenu', handler)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('contextmenu', handler)
    }
  }, [onClose])

  // Adjust position to stay on screen
  const adjustedY = Math.min(y, window.innerHeight - 280)
  const adjustedX = Math.min(x, window.innerWidth - 180)

  return (
    <div
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
      onClick={(e) => e.stopPropagation()}
    >
      <CtxItem label="Move to Top" onClick={() => handleAction(() => window.pyre.moveJob(job.id, 'top'))} />
      <CtxItem label="Move Up" onClick={() => handleAction(() => window.pyre.moveJob(job.id, 'up'))} />
      <CtxItem label="Move Down" onClick={() => handleAction(() => window.pyre.moveJob(job.id, 'down'))} />
      <CtxItem label="Move to Bottom" onClick={() => handleAction(() => window.pyre.moveJob(job.id, 'bottom'))} />
      <div className="context-menu-separator" />
      <CtxItem label="Duplicate Job" onClick={() => handleAction(() => window.pyre.duplicateJob(job.id))} />
      <CtxItem label="Re-Probe" onClick={() => handleAction(() => window.pyre.runProbe(job.id))} />
      <div className="context-menu-separator" />
      <CtxItem label="Open File Location" onClick={() => handleAction(() => {
        const dir = job.filePath.replace(/[/\\][^/\\]+$/, '')
        window.pyre.openPath(dir)
      })} />
      <div className="context-menu-separator" />
      <CtxItem label="Remove Job" danger onClick={() => handleAction(() => window.pyre.removeJob(job.id))} />
    </div>
  )
}

function CtxItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={`context-menu-item w-full text-left ${danger ? 'danger' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
