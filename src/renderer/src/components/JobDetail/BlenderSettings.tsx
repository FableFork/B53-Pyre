import React, { useState, useCallback } from 'react'
import type { RenderJob, BlenderJobConfig, BlenderProbeResult, BlenderViewLayer } from '@shared/types'

interface Props { job: RenderJob }

const PASS_LABELS: Record<string, string> = {
  combined: 'Combined', z: 'Z Depth', normal: 'Normal', vector: 'Motion Vector',
  uv: 'UV', object_index: 'Object Index', diffuse_direct: 'Diff Direct',
  diffuse_indirect: 'Diff Indirect', diffuse_color: 'Diff Color',
  glossy_direct: 'Glossy Direct', glossy_indirect: 'Glossy Indirect', glossy_color: 'Glossy Color',
  transmission_direct: 'Trans Direct', transmission_indirect: 'Trans Indirect',
  emit: 'Emission', environment: 'Environment', shadow: 'Shadow',
  ambient_occlusion: 'AO', cryptomatte_object: 'Crypto Object',
  cryptomatte_material: 'Crypto Material', cryptomatte_asset: 'Crypto Asset',
}

const TOKENS = ['{filename}', '{scene}', '{camera}', '{layer}', '{frame}', '{date}', '{time}']

const FORMATS = ['PNG', 'JPEG', 'OPEN_EXR', 'OPEN_EXR_MULTILAYER', 'TIFF', 'DPX', 'CINEON', 'WEBP']
const ENGINES = ['CYCLES', 'BLENDER_EEVEE', 'BLENDER_WORKBENCH']
const SCALES = [25, 50, 75, 100]

export function BlenderSettings({ job }: Props) {
  const config = job.config as BlenderJobConfig
  const probe = job.probeData as BlenderProbeResult | undefined
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set())

  const update = useCallback((patch: Partial<BlenderJobConfig>) => {
    window.pyre.updateJobConfig(job.id, patch)
  }, [job.id])

  const currentScene = probe?.[config.selectedScene]

  const toggleLayerExpand = (name: string) => {
    setExpandedLayers((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  if (!probe) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
        <p style={{ fontSize: 11 }}>
          {job.status === 'probing' ? 'Probing file…' : 'No probe data. Click the probe button to scan the file.'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* File info */}
      <Section title="File Info">
        <InfoRow label="Path" value={job.filePath} mono />
        <InfoRow label="Status" value={job.status === 'error' ? `Error: ${job.errorMessage}` : 'Probed OK'} />
        <InfoRow label="Scenes" value={String(Object.keys(probe).length)} />
      </Section>

      {/* Scene selection */}
      <Section title="Scene">
        <div className="form-row">
          <label className="form-label">Scene</label>
          <select
            className="form-control"
            value={config.selectedScene}
            onChange={(e) => update({ selectedScene: e.target.value })}
          >
            {Object.keys(probe).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </Section>

      {/* Camera */}
      <Section title="Camera">
        <div className="form-row mb-2">
          <label className="form-label">Active Camera</label>
          <select
            className="form-control"
            value={config.selectedCamera}
            onChange={(e) => update({ selectedCamera: e.target.value })}
          >
            {(currentScene?.cameras ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Camera batch list */}
        <div className="form-row items-start">
          <label className="form-label pt-0.5">Batch Cameras</label>
          <div className="form-control">
            <div className="flex gap-1 mb-1">
              <select
                style={{ flex: 1, fontSize: 11 }}
                defaultValue=""
                onChange={(e) => {
                  if (!e.target.value) return
                  const cam = e.target.value
                  if (!config.cameraBatch.includes(cam)) {
                    update({ cameraBatch: [...config.cameraBatch, cam] })
                  }
                  e.target.value = ''
                }}
              >
                <option value="">+ Add camera…</option>
                {(currentScene?.cameras ?? [])
                  .filter((c) => !config.cameraBatch.includes(c))
                  .map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {config.cameraBatch.map((cam, i) => (
              <div key={cam} className="flex items-center gap-1 mb-1">
                <span style={{ fontSize: 11, flex: 1, color: 'var(--text-primary)' }}>{cam}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>→ /{cam}/</span>
                <button className="btn-ghost" style={{ padding: '0 4px', height: 20, fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', color: 'var(--text-muted)' }}
                  onClick={() => update({ cameraBatch: config.cameraBatch.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* View Layers */}
      <Section title="View Layers">
        {(currentScene?.view_layers ?? []).map((vl) => (
          <ViewLayerRow
            key={vl.name}
            vl={vl}
            expanded={expandedLayers.has(vl.name)}
            enabled={config.selectedViewLayers.includes(vl.name)}
            passes={config.enabledPasses?.[vl.name] ?? vl.passes}
            onToggleExpand={() => toggleLayerExpand(vl.name)}
            onToggleEnabled={(on) => {
              const next = on
                ? [...config.selectedViewLayers, vl.name]
                : config.selectedViewLayers.filter((n) => n !== vl.name)
              update({ selectedViewLayers: next })
            }}
            onTogglePass={(passKey, on) => {
              const existing = config.enabledPasses?.[vl.name] ?? vl.passes
              update({ enabledPasses: { ...config.enabledPasses, [vl.name]: { ...existing, [passKey]: on } } })
            }}
          />
        ))}
      </Section>

      {/* Render settings */}
      <Section title="Render Settings">
        <div className="form-row mb-1">
          <label className="form-label">Use Source Settings</label>
          <Toggle
            checked={config.useSourceSettings}
            onChange={(v) => update({ useSourceSettings: v })}
          />
        </div>
        <div className="form-row">
          <label className="form-label">Engine</label>
          <select className="form-control" value={config.engine}
            disabled={config.useSourceSettings}
            onChange={(e) => update({ engine: e.target.value })}>
            {ENGINES.map((e) => <option key={e} value={e}>{e.replace('BLENDER_', '')}</option>)}
          </select>
        </div>
        {config.engine === 'CYCLES' && (
          <div className="form-row">
            <label className="form-label">Samples (Cycles)</label>
            <input type="number" className="form-control" value={config.samplesCycles ?? 128}
              disabled={config.useSourceSettings}
              onChange={(e) => update({ samplesCycles: parseInt(e.target.value) })} />
          </div>
        )}
        {config.engine === 'BLENDER_EEVEE' && (
          <div className="form-row">
            <label className="form-label">Samples (EEVEE)</label>
            <input type="number" className="form-control" value={config.samplesEevee ?? 64}
              disabled={config.useSourceSettings}
              onChange={(e) => update({ samplesEevee: parseInt(e.target.value) })} />
          </div>
        )}
        <div className="form-row">
          <label className="form-label">Use Compositor</label>
          <Toggle checked={config.useCompositor}
            onChange={(v) => update({ useCompositor: v })} />
        </div>
      </Section>

      {/* Frame range */}
      <Section title="Frame Range">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="section-label mb-1">Start</p>
            <input type="number" style={{ width: '100%' }} value={config.frameStart}
              disabled={config.useSourceSettings}
              onChange={(e) => update({ frameStart: parseInt(e.target.value) })} />
          </div>
          <div>
            <p className="section-label mb-1">End</p>
            <input type="number" style={{ width: '100%' }} value={config.frameEnd}
              disabled={config.useSourceSettings}
              onChange={(e) => update({ frameEnd: parseInt(e.target.value) })} />
          </div>
          <div>
            <p className="section-label mb-1">Step</p>
            <input type="number" style={{ width: '100%' }} value={config.frameStep}
              disabled={config.useSourceSettings}
              onChange={(e) => update({ frameStep: parseInt(e.target.value) })} />
          </div>
        </div>
        {currentScene && (
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            {currentScene.fps} fps · {Math.ceil((currentScene.frame_end - currentScene.frame_start) / currentScene.frame_step) + 1} frames from source
          </p>
        )}
      </Section>

      {/* Resolution */}
      <Section title="Resolution">
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div>
            <p className="section-label mb-1">Width</p>
            <input type="number" style={{ width: '100%' }} value={config.resolutionX}
              disabled={config.useSourceSettings}
              onChange={(e) => update({ resolutionX: parseInt(e.target.value) })} />
          </div>
          <div>
            <p className="section-label mb-1">Height</p>
            <input type="number" style={{ width: '100%' }} value={config.resolutionY}
              disabled={config.useSourceSettings}
              onChange={(e) => update({ resolutionY: parseInt(e.target.value) })} />
          </div>
          <div>
            <p className="section-label mb-1">Scale %</p>
            <select style={{ width: '100%' }} value={config.resolutionScale}
              disabled={config.useSourceSettings}
              onChange={(e) => update({ resolutionScale: parseInt(e.target.value) })}>
              {SCALES.map((s) => <option key={s} value={s}>{s}%</option>)}
            </select>
          </div>
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          Final: {Math.round(config.resolutionX * config.resolutionScale / 100)} × {Math.round(config.resolutionY * config.resolutionScale / 100)}px
        </p>
      </Section>

      {/* Output */}
      <Section title="Output">
        <div className="form-row mb-1">
          <label className="form-label">Output Path</label>
          <div className="flex gap-1 form-control">
            <input type="text" style={{ flex: 1, minWidth: 0 }} value={config.outputPath}
              onChange={(e) => update({ outputPath: e.target.value })} />
            <button className="btn btn-secondary" style={{ height: 24, padding: '0 8px', fontSize: 11 }}
              onClick={async () => {
                const folder = await window.pyre.openFolder()
                if (folder) update({ outputPath: folder + '/####' })
              }}>
              Browse
            </button>
          </div>
        </div>

        {/* Token chips */}
        <div className="flex flex-wrap gap-1 mb-2">
          {TOKENS.map((t) => (
            <button key={t} className="btn btn-secondary" style={{ height: 20, fontSize: 10, padding: '0 6px' }}
              onClick={() => update({ outputPath: config.outputPath + t })}>
              {t}
            </button>
          ))}
        </div>

        <div className="form-row mb-1">
          <label className="form-label">Format</label>
          <select className="form-control" value={config.fileFormat}
            onChange={(e) => update({ fileFormat: e.target.value })}>
            {FORMATS.map((f) => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}
          </select>
        </div>

        <div className="form-row">
          <label className="form-label">Colour Depth</label>
          <select className="form-control" value={config.colorDepth ?? '8'}
            onChange={(e) => update({ colorDepth: e.target.value })}>
            <option value="8">8 bit</option>
            <option value="16">16 bit</option>
            <option value="32">32 bit</option>
          </select>
        </div>
      </Section>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="section-label mb-2">{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="form-row">
      <span className="form-label">{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: mono ? 'monospace' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-slider" />
    </label>
  )
}

interface ViewLayerRowProps {
  vl: BlenderViewLayer
  expanded: boolean
  enabled: boolean
  passes: Record<string, boolean>
  onToggleExpand: () => void
  onToggleEnabled: (on: boolean) => void
  onTogglePass: (key: string, on: boolean) => void
}

function ViewLayerRow({ vl, expanded, enabled, passes, onToggleExpand, onToggleEnabled, onTogglePass }: ViewLayerRowProps) {
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 3, marginBottom: 4 }}>
      <div
        className="flex items-center gap-2 px-2 py-1 cursor-pointer"
        style={{ background: 'var(--bg-elevated)' }}
      >
        <input type="checkbox" checked={enabled} onChange={(e) => onToggleEnabled(e.target.checked)} />
        <span style={{ flex: 1, fontSize: 11, color: enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {vl.name}
        </span>
        <button
          onClick={onToggleExpand}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', fontSize: 10 }}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>
      {expanded && (
        <div style={{ padding: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {Object.entries(PASS_LABELS).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1 cursor-pointer" style={{ fontSize: 10 }}>
              <input
                type="checkbox"
                checked={passes[key] ?? false}
                onChange={(e) => onTogglePass(key, e.target.checked)}
                disabled={!enabled}
              />
              <span style={{ color: enabled ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
