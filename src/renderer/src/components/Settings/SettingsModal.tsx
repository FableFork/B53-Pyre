import React, { useState, useEffect, useCallback } from 'react'
import type { AppSettings, BinaryStatus } from '@shared/types'

interface Props { onClose: () => void }

export function SettingsModal({ onClose }: Props) {
  const [settings, setSettingsLocal] = useState<AppSettings | null>(null)
  const [binaryStatus, setBinaryStatus] = useState<BinaryStatus | null>(null)
  const [testing, setTesting] = useState<{ blender?: string; houdini?: string }>({})
  const [detecting, setDetecting] = useState(false)
  const [tab, setTab] = useState<'binaries' | 'defaults' | 'behaviour' | 'appearance'>('binaries')

  useEffect(() => {
    window.pyre.getSettings().then(setSettingsLocal)
  }, [])

  const save = useCallback((patch: Partial<AppSettings>) => {
    if (!settings) return
    const updated = { ...settings, ...patch }
    setSettingsLocal(updated)
    window.pyre.setSettings(patch)
  }, [settings])

  const autoDetect = useCallback(async () => {
    setDetecting(true)
    try {
      const status = await window.pyre.detectBinaries()
      setBinaryStatus(status)
      if (settings) {
        save({
          binaryPaths: {
            blender: status.blenderPath ?? settings.binaryPaths.blender,
            houdini: status.houdiniPath ?? settings.binaryPaths.houdini,
          }
        })
      }
    } finally {
      setDetecting(false)
    }
  }, [settings, save])

  const testBinary = useCallback(async (type: 'blender' | 'houdini') => {
    if (!settings) return
    const path = type === 'blender' ? settings.binaryPaths.blender : settings.binaryPaths.houdini
    if (!path) return
    setTesting((t) => ({ ...t, [type]: 'testing…' }))
    try {
      const { version } = await window.pyre.testBinary(type, path)
      setTesting((t) => ({ ...t, [type]: `OK — ${version}` }))
    } catch (e) {
      setTesting((t) => ({ ...t, [type]: `Error: ${(e as Error).message}` }))
    }
  }, [settings])

  if (!settings) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          width: 640, maxHeight: '80vh', background: 'var(--bg-elevated)',
          border: '1px solid var(--border)', borderRadius: 6,
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <span className="font-semibold" style={{ fontSize: 13 }}>Preferences</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div className="tab-bar flex-shrink-0">
          {(['binaries', 'defaults', 'behaviour', 'appearance'] as const).map((t) => (
            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
          {tab === 'binaries' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="flex justify-between items-center mb-2">
                <p className="section-label">Binary Paths</p>
                <button className="btn btn-secondary" style={{ height: 24, fontSize: 11 }}
                  onClick={autoDetect} disabled={detecting}>
                  {detecting ? 'Detecting…' : '⟳ Auto-detect'}
                </button>
              </div>

              {/* Blender */}
              <BinaryRow
                label="Blender"
                value={settings.binaryPaths.blender}
                testResult={testing.blender}
                detectedVersion={binaryStatus?.blenderVersion}
                onChange={(v) => save({ binaryPaths: { ...settings.binaryPaths, blender: v } })}
                onTest={() => testBinary('blender')}
                onBrowse={async () => {
                  const p = await window.pyre.openFile({
                    filters: [{ name: 'Blender', extensions: ['exe', ''] }]
                  })
                  if (p) save({ binaryPaths: { ...settings.binaryPaths, blender: p } })
                }}
              />

              {/* Houdini / hython */}
              <BinaryRow
                label="Houdini (hython)"
                value={settings.binaryPaths.houdini}
                testResult={testing.houdini}
                detectedVersion={binaryStatus?.houdiniVersion}
                onChange={(v) => save({ binaryPaths: { ...settings.binaryPaths, houdini: v } })}
                onTest={() => testBinary('houdini')}
                onBrowse={async () => {
                  const p = await window.pyre.openFile({
                    filters: [{ name: 'hython', extensions: ['exe', ''] }]
                  })
                  if (p) save({ binaryPaths: { ...settings.binaryPaths, houdini: p } })
                }}
              />
            </div>
          )}

          {tab === 'defaults' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="section-label mb-2">Render Defaults</p>

              <div className="form-row">
                <label className="form-label">Default Output Folder</label>
                <div className="flex gap-1 form-control">
                  <input type="text" style={{ flex: 1 }} value={settings.defaultOutputFolder}
                    onChange={(e) => save({ defaultOutputFolder: e.target.value })} />
                  <button className="btn btn-secondary" style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                    onClick={async () => {
                      const f = await window.pyre.openFolder()
                      if (f) save({ defaultOutputFolder: f })
                    }}>Browse</button>
                </div>
              </div>

              <div className="form-row">
                <label className="form-label">Default Parallel Jobs</label>
                <div className="segmented" style={{ flex: 1 }}>
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n}
                      className={`segmented-btn ${settings.parallelJobs === n ? 'active' : ''}`}
                      onClick={() => save({ parallelJobs: n })}>{n}</button>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <label className="form-label">Default Blender Format</label>
                <select className="form-control" value={settings.defaultBlenderFormat}
                  onChange={(e) => save({ defaultBlenderFormat: e.target.value })}>
                  <option>PNG</option><option>OPEN_EXR</option><option>OPEN_EXR_MULTILAYER</option><option>JPEG</option>
                </select>
              </div>

              <div className="form-row">
                <label className="form-label">Default Houdini Format</label>
                <select className="form-control" value={settings.defaultHoudiniFormat}
                  onChange={(e) => save({ defaultHoudiniFormat: e.target.value })}>
                  <option value="exr_multilayer">EXR Multilayer</option>
                  <option value="exr_single">EXR Single</option>
                  <option value="png">PNG</option>
                </select>
              </div>
            </div>
          )}

          {tab === 'behaviour' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="section-label mb-2">Behaviour</p>

              <ToggleRow label="Auto-probe on file add"
                checked={settings.autoProbOnAdd}
                onChange={(v) => save({ autoProbOnAdd: v })} />

              <ToggleRow label="Auto-start on queue"
                checked={settings.autoStartOnQueue}
                onChange={(v) => save({ autoStartOnQueue: v })} />

              <div className="form-row">
                <label className="form-label">Clear completed jobs</label>
                <select className="form-control" value={settings.clearCompleted}
                  onChange={(e) => save({ clearCompleted: e.target.value as AppSettings['clearCompleted'] })}>
                  <option value="never">Never</option>
                  <option value="1h">After 1 hour</option>
                  <option value="on_close">On app close</option>
                </select>
              </div>

              <ToggleRow label="OS notification on complete"
                checked={settings.notifyOnComplete}
                onChange={(v) => save({ notifyOnComplete: v })} />

              <ToggleRow label="Play sound on complete"
                checked={settings.playSoundOnComplete}
                onChange={(v) => save({ playSoundOnComplete: v })} />
            </div>
          )}

          {tab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="section-label mb-2">Appearance</p>

              <div className="form-row">
                <label className="form-label">Theme</label>
                <div className="segmented" style={{ flex: 1 }}>
                  <button className={`segmented-btn ${settings.theme === 'dark' ? 'active' : ''}`}
                    onClick={() => save({ theme: 'dark' })}>Dark</button>
                  <button className={`segmented-btn ${settings.theme === 'darker' ? 'active' : ''}`}
                    onClick={() => save({ theme: 'darker' })}>Darker</button>
                </div>
              </div>

              <div className="form-row">
                <label className="form-label">Accent Colour</label>
                <div className="flex items-center gap-2 form-control">
                  <input type="color" value={settings.accentColor}
                    onChange={(e) => save({ accentColor: e.target.value })}
                    style={{ width: 28, height: 24, padding: 2, background: 'none', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer' }} />
                  <input type="text" value={settings.accentColor}
                    onChange={(e) => save({ accentColor: e.target.value })}
                    style={{ flex: 1, fontFamily: 'monospace' }} />
                  <button className="btn btn-secondary" style={{ fontSize: 10, height: 24 }}
                    onClick={() => save({ accentColor: '#C45C1A' })}>Reset</button>
                </div>
              </div>

              <div className="form-row">
                <label className="form-label">UI Font Size</label>
                <div className="segmented" style={{ flex: 1 }}>
                  {(['small', 'medium', 'large'] as const).map((s) => (
                    <button key={s} className={`segmented-btn ${settings.fontSize === s ? 'active' : ''}`}
                      onClick={() => save({ fontSize: s })}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <label className="form-label">Log Font Size</label>
                <div className="segmented" style={{ flex: 1 }}>
                  {(['small', 'medium', 'large'] as const).map((s) => (
                    <button key={s} className={`segmented-btn ${settings.logFontSize === s ? 'active' : ''}`}
                      onClick={() => save({ logFontSize: s })}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3 border-t border-[var(--border-subtle)]">
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function BinaryRow({
  label, value, testResult, detectedVersion,
  onChange, onTest, onBrowse
}: {
  label: string
  value: string
  testResult?: string
  detectedVersion?: string | null
  onChange: (v: string) => void
  onTest: () => void
  onBrowse: () => void
}) {
  const isOk = testResult?.startsWith('OK')
  const isErr = testResult?.startsWith('Error')

  return (
    <div>
      <p className="section-label mb-1">{label}</p>
      <div className="flex gap-1 mb-1">
        <input type="text" style={{ flex: 1 }} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={`Path to ${label} executable…`} />
        <button className="btn btn-secondary" style={{ fontSize: 11, height: 24 }} onClick={onBrowse}>Browse</button>
        <button className="btn btn-secondary" style={{ fontSize: 11, height: 24 }} onClick={onTest}>Test</button>
      </div>
      {testResult && (
        <p style={{ fontSize: 10, color: isOk ? '#3dc47e' : isErr ? '#e04040' : 'var(--text-muted)' }}>
          {testResult}
        </p>
      )}
      {detectedVersion && !testResult && (
        <p style={{ fontSize: 10, color: '#3dc47e' }}>Auto-detected: {detectedVersion}</p>
      )}
    </div>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="form-row">
      <label className="form-label" style={{ cursor: 'pointer' }}>{label}</label>
      <label className="toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-slider" />
      </label>
    </div>
  )
}
