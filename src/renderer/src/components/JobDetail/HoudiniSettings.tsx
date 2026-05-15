import React, { useCallback } from 'react'
import type { RenderJob, HoudiniJobConfig, HoudiniProbeResult, HoudiniAOV } from '@shared/types'

interface Props { job: RenderJob }

const SCALES = [25, 50, 75, 100]
const H_TOKENS = ['{rop}', '{camera}', '{frame}', '{hip}', '{date}']

export function HoudiniSettings({ job }: Props) {
  const config = job.config as HoudiniJobConfig
  const probe = job.probeData as HoudiniProbeResult | undefined

  const update = useCallback((patch: Partial<HoudiniJobConfig>) => {
    window.pyre.updateJobConfig(job.id, patch)
  }, [job.id])

  const isKarma = config.renderer === 'BRAY_HdKarmaXPU' || config.renderer === 'BRAY_HdKarma'
  const selectedROP = probe?.rops[config.selectedROP]

  // Group ROPs by context
  const ropsByContext: Record<string, string[]> = {}
  if (probe) {
    for (const [path, rop] of Object.entries(probe.rops)) {
      const ctx = rop.context
      if (!ropsByContext[ctx]) ropsByContext[ctx] = []
      ropsByContext[ctx].push(path)
    }
  }

  // Missing file refs
  const missingRefs = probe?.file_refs.filter((r) => r.exists === false) ?? []

  const resolveVars = (p: string) => {
    if (!probe) return p
    return p
      .replace(/\$HIP/g, probe.hip_vars.HIP)
      .replace(/\$JOB/g, probe.hip_vars.JOB)
      .replace(/\$HFS/g, probe.hip_vars.HFS)
  }

  if (!probe) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
        {job.status === 'probing' ? 'Probing file…' : 'No probe data. Click probe button to scan.'}
      </div>
    )
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* File info */}
      <Section title="File Info">
        <InfoRow label="Path" value={job.filePath} mono />
        <InfoRow label="$HIP" value={probe.hip_vars.HIP} />
        <InfoRow label="$JOB" value={probe.hip_vars.JOB} />
        {missingRefs.length > 0 && (
          <div style={{ background: 'rgba(240,160,48,0.08)', border: '1px solid rgba(240,160,48,0.3)', borderRadius: 3, padding: 6 }}>
            <p style={{ fontSize: 10, color: '#f0a030', fontWeight: 600, marginBottom: 4 }}>
              ⚠ {missingRefs.length} missing file reference{missingRefs.length > 1 ? 's' : ''}
            </p>
            {missingRefs.slice(0, 5).map((r, i) => (
              <p key={i} style={{ fontSize: 10, color: '#e8b84b', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.path}
              </p>
            ))}
          </div>
        )}
      </Section>

      {/* ROP */}
      <Section title="ROP">
        <div className="form-row">
          <label className="form-label">ROP Node</label>
          <select className="form-control" value={config.selectedROP}
            onChange={(e) => update({ selectedROP: e.target.value })}>
            {Object.entries(ropsByContext).map(([ctx, paths]) => (
              <optgroup key={ctx} label={ctx}>
                {paths.map((p) => (
                  <option key={p} value={p}>
                    {probe.rops[p].name} ({probe.rops[p].type})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {selectedROP && (
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            Type: <strong style={{ color: 'var(--text-secondary)' }}>{selectedROP.type}</strong>
            {' '}· Path: {selectedROP.path}
          </p>
        )}
      </Section>

      {/* Renderer (Karma only) */}
      {isKarma && (
        <Section title="Renderer">
          <div className="form-row mb-2">
            <label className="form-label">Backend</label>
            <div className="segmented" style={{ flex: 1 }}>
              <button
                className={`segmented-btn ${config.renderer === 'BRAY_HdKarmaXPU' ? 'active' : ''}`}
                onClick={() => update({ renderer: 'BRAY_HdKarmaXPU' })}
              >
                Karma XPU
              </button>
              <button
                className={`segmented-btn ${config.renderer === 'BRAY_HdKarma' ? 'active' : ''}`}
                onClick={() => update({ renderer: 'BRAY_HdKarma' })}
              >
                Karma CPU
              </button>
            </div>
          </div>
          {config.renderer === 'BRAY_HdKarmaXPU' && (
            <div className="form-row">
              <label className="form-label">XPU Device</label>
              <div className="segmented" style={{ flex: 1 }}>
                {(['gpu_and_cpu', 'gpu_only', 'cpu_only'] as const).map((mode) => (
                  <button key={mode}
                    className={`segmented-btn ${config.xpuDeviceMode === mode ? 'active' : ''}`}
                    onClick={() => update({ xpuDeviceMode: mode })}>
                    {mode === 'gpu_and_cpu' ? 'GPU+CPU' : mode === 'gpu_only' ? 'GPU' : 'CPU'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Camera */}
      <Section title="Camera">
        <div className="form-row mb-2">
          <label className="form-label">Camera</label>
          <select className="form-control" value={config.selectedCamera ?? ''}
            onChange={(e) => update({ selectedCamera: e.target.value })}>
            <option value="">(Use ROP default)</option>
            {probe.cameras.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-row items-start">
          <label className="form-label pt-0.5">Batch Cameras</label>
          <div className="form-control">
            <select style={{ width: '100%', fontSize: 11, marginBottom: 4 }} defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return
                const cam = e.target.value
                if (!config.cameraBatch.includes(cam)) {
                  update({ cameraBatch: [...config.cameraBatch, cam] })
                }
                e.target.value = ''
              }}>
              <option value="">+ Add camera…</option>
              {probe.cameras.filter((c) => !config.cameraBatch.includes(c)).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {config.cameraBatch.map((cam, i) => (
              <div key={cam} className="flex items-center gap-1 mb-1">
                <span style={{ fontSize: 11, flex: 1 }}>{cam}</span>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}
                  onClick={() => update({ cameraBatch: config.cameraBatch.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Quality */}
      <Section title="Quality">
        <div className="form-row">
          <label className="form-label">Use Source Settings</label>
          <Toggle checked={config.useSourceSettings} onChange={(v) => update({ useSourceSettings: v })} />
        </div>
        <div className="form-row">
          <label className="form-label">Samples</label>
          <input type="number" className="form-control" value={config.samples}
            disabled={config.useSourceSettings}
            onChange={(e) => update({ samples: parseInt(e.target.value) })} />
        </div>
        <div className="form-row">
          <label className="form-label">Max Path Depth</label>
          <input type="number" className="form-control" value={config.maxPathDepth}
            disabled={config.useSourceSettings}
            onChange={(e) => update({ maxPathDepth: parseInt(e.target.value) })} />
        </div>
        <div className="form-row">
          <label className="form-label">Noise Threshold</label>
          <div className="flex items-center gap-2 form-control">
            <input type="range" min={0.001} max={0.1} step={0.001}
              value={config.noiseThreshold}
              disabled={config.useSourceSettings}
              onChange={(e) => update({ noiseThreshold: parseFloat(e.target.value) })}
              style={{ flex: 1, accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: 11, minWidth: 40, color: 'var(--text-secondary)' }}>
              {config.noiseThreshold.toFixed(3)}
            </span>
          </div>
        </div>
        <div className="form-row">
          <label className="form-label">Denoise</label>
          <Toggle checked={config.denoise}
            onChange={(v) => update({ denoise: v })} />
        </div>
        {config.denoise && (
          <div className="form-row">
            <label className="form-label">Denoiser</label>
            <div className="segmented" style={{ flex: 1 }}>
              <button className={`segmented-btn ${config.denoiser === 'optix' ? 'active' : ''}`}
                onClick={() => update({ denoiser: 'optix' })}>OptiX</button>
              <button className={`segmented-btn ${config.denoiser === 'oidn' ? 'active' : ''}`}
                onClick={() => update({ denoiser: 'oidn' })}>OIDN</button>
            </div>
          </div>
        )}
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

      {/* AOVs */}
      <Section title="AOVs">
        {config.enabledAOVs.map((aov, i) => (
          <div key={i} style={{ border: '1px solid var(--border-subtle)', borderRadius: 3, padding: 6, marginBottom: 4 }}>
            <div className="flex items-center gap-2 mb-2">
              <Toggle checked={aov.enabled} onChange={(v) => {
                const next = [...config.enabledAOVs]
                next[i] = { ...next[i], enabled: v }
                update({ enabledAOVs: next })
              }} />
              <span style={{ fontSize: 11, flex: 1 }}>{aov.variable}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{aov.vex_variable}</span>
            </div>
            <div className="form-row">
              <label className="form-label" style={{ minWidth: 70 }}>Channel</label>
              <input type="text" style={{ flex: 1 }} value={aov.channel ?? ''}
                onChange={(e) => {
                  const next = [...config.enabledAOVs]
                  next[i] = { ...next[i], channel: e.target.value }
                  update({ enabledAOVs: next })
                }} />
            </div>
          </div>
        ))}
        <button className="btn btn-secondary w-full" style={{ fontSize: 11, marginTop: 4 }}
          onClick={() => {
            const newAOV: HoudiniAOV = { variable: 'N', vex_variable: 'N', enabled: true, channel: 'N' }
            update({ enabledAOVs: [...config.enabledAOVs, newAOV] })
          }}>
          + Add Custom AOV
        </button>
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
                if (folder) update({ outputPath: folder + '/$F4' })
              }}>
              Browse
            </button>
          </div>
        </div>

        {config.outputPath && (
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            → {resolveVars(config.outputPath)}
          </p>
        )}

        <div className="flex flex-wrap gap-1 mb-2">
          {H_TOKENS.map((t) => (
            <button key={t} className="btn btn-secondary" style={{ height: 20, fontSize: 10, padding: '0 6px' }}
              onClick={() => update({ outputPath: config.outputPath + t })}>
              {t}
            </button>
          ))}
        </div>

        <div className="form-row mb-1">
          <label className="form-label">Format</label>
          <select className="form-control" value={config.fileFormat}
            onChange={(e) => update({ fileFormat: e.target.value as HoudiniJobConfig['fileFormat'] })}>
            <option value="exr_multilayer">EXR Multilayer</option>
            <option value="exr_single">EXR Single</option>
            <option value="png">PNG</option>
            <option value="tiff">TIFF</option>
          </select>
        </div>

        {(config.fileFormat === 'exr_multilayer' || config.fileFormat === 'exr_single') && (
          <div className="form-row mb-1">
            <label className="form-label">EXR Compression</label>
            <div className="flex items-center gap-2 form-control">
              <select style={{ flex: 1 }} value={config.exrCompression}
                onChange={(e) => update({ exrCompression: e.target.value as HoudiniJobConfig['exrCompression'] })}>
                <option value="zip">ZIP</option>
                <option value="zips">ZIPS</option>
                <option value="piz">PIZ</option>
                <option value="dwaa">DWAA (lossy)</option>
                <option value="dwab">DWAB (lossy)</option>
              </select>
              {(config.exrCompression === 'dwaa' || config.exrCompression === 'dwab') && (
                <span style={{ fontSize: 10, color: '#f0a030', fontWeight: 600 }}>LOSSY</span>
              )}
            </div>
          </div>
        )}

        <div className="form-row">
          <label className="form-label">Colour Space</label>
          <select className="form-control" value={config.colourSpace}
            onChange={(e) => update({ colourSpace: e.target.value as HoudiniJobConfig['colourSpace'] })}>
            <option value="linear">Linear</option>
            <option value="acescg">ACEScg</option>
            <option value="srgb">sRGB</option>
          </select>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="section-label mb-2">{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
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
