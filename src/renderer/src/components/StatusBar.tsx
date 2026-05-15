import React from 'react'
import type { RenderJob, SystemStats } from '@shared/types'

interface Props {
  jobs: RenderJob[]
  stats: SystemStats
}

export function StatusBar({ jobs, stats }: Props) {
  const activeCount = jobs.filter((j) => j.status === 'rendering').length
  const totalQueued = jobs.filter((j) => j.status === 'queued' || j.status === 'rendering').length

  const ramUsedGB = (stats.ramUsedMB / 1024).toFixed(1)
  const ramTotalGB = (stats.ramTotalMB / 1024).toFixed(1)

  return (
    <div
      className="flex items-center justify-between px-3 border-t border-[var(--border-subtle)] flex-shrink-0"
      style={{ height: 24, background: '#0d0d0d', fontSize: 10, color: 'var(--text-muted)' }}
    >
      {/* Left: binary versions */}
      <div className="flex items-center gap-3">
        <BinaryTag label="Blender" />
        <BinaryTag label="Houdini" />
      </div>

      {/* Centre: job counts */}
      <div className="flex items-center gap-2">
        {activeCount > 0 && (
          <span style={{ color: '#3dc47e' }}>
            ● {activeCount} rendering
          </span>
        )}
        <span>{totalQueued} queued</span>
      </div>

      {/* Right: system stats */}
      <div className="flex items-center gap-3">
        <span>CPU {stats.cpuPercent}%</span>
        <span>RAM {ramUsedGB}/{ramTotalGB} GB</span>
        {stats.gpuName && <span>GPU: {stats.gpuName}</span>}
      </div>
    </div>
  )
}

function BinaryTag({ label }: { label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: 'var(--text-muted)',
        display: 'inline-block'
      }} />
      {label}
    </span>
  )
}
