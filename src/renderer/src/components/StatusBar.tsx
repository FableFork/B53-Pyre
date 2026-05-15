import React, { useEffect, useState } from 'react'
import type { RenderJob, SystemStats, AppSettings } from '@shared/types'

interface Props {
  jobs: RenderJob[]
  stats: SystemStats
}

export function StatusBar({ jobs, stats }: Props) {
  const activeCount = jobs.filter((j) => j.status === 'rendering').length
  const totalQueued = jobs.filter((j) => j.status === 'queued' || j.status === 'rendering').length
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    window.pyre.getSettings().then(setSettings)
    // Refresh settings when the user saves them
    const unsub = window.pyre.on('settings:changed', (s: AppSettings) => setSettings(s))
    return () => unsub()
  }, [])

  const ramUsedGB = (stats.ramUsedMB / 1024).toFixed(1)
  const ramTotalGB = (stats.ramTotalMB / 1024).toFixed(1)

  const blenderOk = Boolean(settings?.binaryPaths.blender)
  const houdiniOk = Boolean(settings?.binaryPaths.houdini)
  const blenderVer = settings?.detectedVersions.blender
  const houdiniVer = settings?.detectedVersions.houdini

  return (
    <div
      className="flex items-center justify-between px-3 border-t border-[var(--border-subtle)] flex-shrink-0"
      style={{ height: 24, background: '#0d0d0d', fontSize: 10, color: 'var(--text-muted)' }}
    >
      {/* Left: binary status */}
      <div className="flex items-center gap-3">
        <BinaryTag label="Blender" ok={blenderOk} version={blenderVer} />
        <BinaryTag label="Houdini" ok={houdiniOk} version={houdiniVer} />
      </div>

      {/* Centre: job counts */}
      <div className="flex items-center gap-2">
        {activeCount > 0 && (
          <span style={{ color: '#3dc47e' }}>● {activeCount} rendering</span>
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

function BinaryTag({ label, ok, version }: { label: string; ok: boolean; version?: string | null }) {
  return (
    <span
      style={{ display: 'flex', alignItems: 'center', gap: 3, color: ok ? 'var(--text-secondary)' : 'var(--text-muted)' }}
      title={ok ? (version ? `${label} ${version}` : `${label} configured`) : `${label} not configured — open Preferences`}
    >
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: ok ? '#3dc47e' : '#444',
        display: 'inline-block', flexShrink: 0
      }} />
      {label}{version ? ` ${version}` : ''}
    </span>
  )
}
