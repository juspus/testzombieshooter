// Sound Designer (/?sfx): live editor for the gunshot presets in src/sfx/gunPresets.json.
// Edits save to localStorage as you go; off production the game plays them instead of
// the shipped preset (another tab picks them up without a reload). "Copy for Claude"
// puts the diff + metrics + full preset on the clipboard to paste into chat.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAudioContext } from '../sounds'
import {
  GUN_SOUND_WEAPONS, MASTER_SPECS, VARY_SPECS, LAYER_SPECS, DEFAULT_LAYER, BANDS, isOsc,
  shippedPreset, presetHash, readOverrides, writeOverrides, playShotPreset, renderShot,
  analyze, formatMetrics, presetDiff, normalizePreset, validatePreset,
} from '../sfx/gunSynth'
import './SoundDesigner.css'

const IN_GAME = import.meta.env.VITE_VERCEL_ENV !== 'production'
const NAMES = { pistol: 'Pistol', shotgun: 'Shotgun', ak47: 'AK-47', deagle: 'Deagle' }
const RATE = { pistol: 5, shotgun: 2, ak47: 10, deagle: 3 }   // burst test, shots per second
const clone = (o) => JSON.parse(JSON.stringify(o))

function loadWorking() {
  const ov = readOverrides()
  const out = {}
  for (const w of GUN_SOUND_WEAPONS) out[w] = ov[w]?.preset ? clone(ov[w].preset) : clone(shippedPreset(w))
  return out
}

// ─── slider with optional log scale ─────────────────────────────────────────

const STEPS = 1000
function toPos(spec, v) {
  if (spec.log) return Math.round((Math.log(v / spec.min) / Math.log(spec.max / spec.min)) * STEPS)
  return Math.round(((v - spec.min) / (spec.max - spec.min)) * STEPS)
}
function fromPos(spec, p) {
  const f = p / STEPS
  let v = spec.log ? spec.min * Math.pow(spec.max / spec.min, f) : spec.min + f * (spec.max - spec.min)
  const st = spec.step || 0.001
  v = Math.round(v / st) * st
  return +Math.min(spec.max, Math.max(spec.min, v)).toFixed(4)
}

function Param({ k, spec, value, base, onChange, help }) {
  const changed = base !== undefined && JSON.stringify(base) !== JSON.stringify(value)
  const reset = () => base !== undefined && onChange(base)
  let control
  if (spec.type === 'bool') {
    control = (
      <button className={`sd-toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)}>{value ? 'On' : 'Off'}</button>
    )
  } else if (spec.type === 'enum') {
    control = (
      <select className="sd-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {spec.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  } else {
    control = (
      <>
        <input type="range" className="sd-range" min={0} max={STEPS} value={toPos(spec, value)}
          onChange={(e) => onChange(fromPos(spec, +e.target.value))} />
        <input type="number" className="sd-num" value={value} step={spec.step} min={spec.min} max={spec.max}
          onChange={(e) => { const n = +e.target.value; if (Number.isFinite(n)) onChange(Math.min(spec.max, Math.max(spec.min, n))) }} />
        <span className="sd-unit">{spec.unit ?? ''}</span>
      </>
    )
  }
  return (
    <div className="sd-param" data-param={k}>
      <label title={`${spec.help}${changed ? `\nShipped: ${base}. Double-click to reset.` : ''}`} onDoubleClick={reset}>
        {changed && <span className="sd-dot" />}{spec.label}
      </label>
      <div className="sd-ctl">{control}</div>
      {help && <div className="sd-help">{spec.help}</div>}
    </div>
  )
}

// ─── waveform + spectrum ────────────────────────────────────────────────────

function Scope({ buffer, metrics }) {
  const waveRef = useRef(null)
  const specRef = useRef(null)
  useEffect(() => {
    const draw = (cv, fn) => {
      if (!cv) return
      const dpr = window.devicePixelRatio || 1
      const w = cv.clientWidth, h = cv.clientHeight
      cv.width = w * dpr; cv.height = h * dpr
      const g = cv.getContext('2d')
      if (!g) return
      g.scale(dpr, dpr)
      g.fillStyle = '#0c0a09'; g.fillRect(0, 0, w, h)
      if (buffer && metrics) fn(g, w, h)
    }
    draw(waveRef.current, (g, w, h) => {
      const d = buffer.getChannelData(0)
      const span = Math.max(0.3, Math.min(buffer.duration, metrics.length + 0.05))
      const n = Math.floor(span * buffer.sampleRate)
      g.strokeStyle = '#2a2420'; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke()
      for (let x = 0; x < w; x++) {
        const a = Math.floor((x / w) * n), b = Math.floor(((x + 1) / w) * n)
        let mn = 0, mx = 0
        for (let i = a; i < b; i++) { const v = d[i] || 0; if (v < mn) mn = v; if (v > mx) mx = v }
        const y0 = h / 2 - Math.min(1, mx) * (h / 2 - 2), y1 = h / 2 - Math.max(-1, mn) * (h / 2 - 2)
        g.fillStyle = mx > 0.99 || mn < -0.99 ? '#ff2a00' : '#ff8a3d'
        g.fillRect(x, y0, 1, Math.max(1, y1 - y0))
      }
      g.fillStyle = '#8a837c'; g.font = '11px Courier New'
      for (let s = 0.1; s < span; s += 0.1) {
        const x = (s / span) * w
        g.fillRect(x, h - 4, 1, 4)
        if (Math.round(s * 10) % 2 === 0) g.fillText(`${s.toFixed(1)}s`, x + 2, h - 6)
      }
    })
    draw(specRef.current, (g, w, h) => {
      const { spectrum, binHz } = metrics
      const fx = (f) => (Math.log(f / 20) / Math.log(20000 / 20)) * w
      let max = 0
      for (const v of spectrum) if (v > max) max = v
      const dbOf = (v) => 10 * Math.log10(v / max + 1e-12)   // 0 at the loudest bin
      g.fillStyle = '#1a1512'
      BANDS.forEach((b, i) => { if (i % 2) g.fillRect(fx(Math.max(20, b.lo)), 0, fx(Math.min(20000, b.hi)) - fx(Math.max(20, b.lo)), h) })
      g.strokeStyle = '#ffd166'; g.lineWidth = 1.5; g.beginPath()
      let started = false
      for (let k = 1; k < spectrum.length; k++) {
        const f = k * binHz
        if (f < 20) continue
        const y = Math.min(h, (-dbOf(spectrum[k]) / 60) * h)
        if (!started) { g.moveTo(fx(f), y); started = true } else g.lineTo(fx(f), y)
      }
      g.stroke()
      g.fillStyle = '#8a837c'; g.font = '11px Courier New'
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
        g.fillRect(fx(f), h - 4, 1, 4)
        g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, fx(f) + 2, h - 6)
      }
      BANDS.forEach((b) => g.fillText(`${b.label} ${Math.round(metrics.bands[b.id] * 100)}%`, fx(Math.max(22, b.lo)) + 3, 12))
    })
  }, [buffer, metrics])
  return (
    <div className="sd-scope">
      <div><div className="sd-cap">Waveform (red = clipping)</div><canvas ref={waveRef} /></div>
      <div><div className="sd-cap">Spectrum (energy by frequency)</div><canvas ref={specRef} /></div>
    </div>
  )
}

// ─── page ───────────────────────────────────────────────────────────────────

export default function SoundDesigner() {
  const [weapon, setWeapon] = useState(() => {
    const w = new URLSearchParams(window.location.search).get('sfx')
    return GUN_SOUND_WEAPONS.includes(w) ? w : 'pistol'
  })
  const [working, setWorking] = useState(loadWorking)
  const [help, setHelp] = useState(false)
  const [soloIdx, setSoloIdx] = useState(-1)
  const [render, setRender] = useState({ buffer: null, metrics: null })
  const [note, setNote] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [copyText, setCopyText] = useState('')
  const [bursting, setBursting] = useState(false)
  const burstRef = useRef(null)

  const preset = working[weapon]
  const shipped = shippedPreset(weapon)
  const shippedHash = presetHash(shipped)
  const ov = readOverrides()[weapon]
  const edited = useMemo(() => JSON.stringify(preset) !== JSON.stringify(shipped), [preset, shipped])
  const stale = !!ov?.preset && ov.base !== shippedHash
  const diff = useMemo(() => presetDiff(shipped, preset), [shipped, preset])

  const noteTimer = useRef(0)
  const flash = (msg) => { setNote(msg); clearTimeout(noteTimer.current); noteTimer.current = setTimeout(() => setNote(''), 2500) }

  // Persist: an edit is stored with the hash of the shipped preset it started from.
  const commit = useCallback((w, next) => {
    setWorking((prev) => ({ ...prev, [w]: next }))
    const all = { ...readOverrides() }
    if (JSON.stringify(next) === JSON.stringify(shippedPreset(w))) delete all[w]
    else all[w] = { preset: next, base: all[w]?.preset ? all[w].base : presetHash(shippedPreset(w)) }
    writeOverrides(all)
  }, [])

  const update = (fn) => { const next = clone(preset); fn(next); commit(weapon, next) }
  const setMaster = (k, v) => update((p) => { p.master[k] = v })
  const setVary = (k, v) => update((p) => { p.vary[k] = v })
  const setLayer = (i, k, v) => update((p) => {
    const L = p.layers[i]
    if (k === 'ff' && L.ffEnd === L.ff) L.ffEnd = v   // no sweep stays no sweep
    L[k] = v
  })

  // Offline render for graphs + metrics (debounced while dragging).
  useEffect(() => {
    let dead = false
    const id = setTimeout(async () => {
      try {
        const solo = soloIdx >= 0 ? preset.layers[soloIdx] : null
        const buffer = await renderShot(preset, { solo })
        if (!dead) setRender({ buffer, metrics: analyze(buffer) })
      } catch { /* no OfflineAudioContext */ }
    }, 120)
    return () => { dead = true; clearTimeout(id) }
  }, [preset, soloIdx])

  const fire = useCallback((which = 'mine') => {
    const ac = getAudioContext()
    const p = which === 'shipped' ? shipped : preset
    const solo = which === 'mine' && soloIdx >= 0 ? p.layers[soloIdx] : null
    playShotPreset(ac, p, ac.currentTime + 0.01, null, { solo })
  }, [preset, shipped, soloIdx])

  const compare = () => {
    const ac = getAudioContext()
    playShotPreset(ac, shipped, ac.currentTime + 0.01)
    playShotPreset(ac, preset, ac.currentTime + 0.01 + Math.max(0.7, render.metrics?.length ?? 0.7))
    flash('Shipped, then yours')
  }

  const fireRef = useRef(fire)
  fireRef.current = fire   // the burst keeps firing the latest edit while you drag
  const startBurst = () => {
    if (burstRef.current) return
    fire()
    burstRef.current = setInterval(() => fireRef.current(), 1000 / RATE[weapon])
    setBursting(true)
  }
  const stopBurst = () => { clearInterval(burstRef.current); burstRef.current = null; setBursting(false) }
  useEffect(() => stopBurst, [weapon])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea')) return
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) fire() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fire])

  const resetToShipped = () => { commit(weapon, clone(shipped)); setSoloIdx(-1); flash('Back to the shipped sound') }
  const keepMine = () => {
    const all = { ...readOverrides() }
    all[weapon] = { preset, base: shippedHash }
    writeOverrides(all)
    setWorking((w) => ({ ...w }))
  }

  const claudeText = () => {
    const lines = [
      `SFX ${weapon} (shipped ${shippedHash})`,
      diff.length ? 'changes:' : 'changes: none',
      ...diff.map((d) => `  ${d}`),
      render.metrics ? `metrics: ${formatMetrics(render.metrics)}` : null,
      `full: ${JSON.stringify(preset)}`,
    ]
    return lines.filter(Boolean).join('\n')
  }
  const copy = async () => {
    const text = claudeText()
    try { await navigator.clipboard.writeText(text); flash('Copied. Paste it into the chat.') } catch { setCopyText(text) }
  }

  const applyPaste = () => {
    let txt = pasteText.trim()
    const m = txt.match(/full:\s*(\{[\s\S]*\})\s*$/)
    if (m) txt = m[1]
    try {
      let obj = JSON.parse(txt)
      if (obj.weapons) obj = obj.weapons[weapon]
      else if (obj[weapon]?.layers) obj = obj[weapon]
      if (!obj?.layers) throw new Error('no layers')
      const next = normalizePreset(obj)
      const errs = validatePreset(next)
      if (errs.length) throw new Error(errs[0])
      commit(weapon, next); setSoloIdx(-1)
      setPasteOpen(false); setPasteText('')
      flash('Loaded')
    } catch (e) { flash(`Could not read that: ${e.message}`) }
  }

  const addLayer = () => update((p) => { p.layers.push({ ...DEFAULT_LAYER, name: `Layer ${p.layers.length + 1}` }) })
  const dupLayer = (i) => update((p) => { p.layers.splice(i + 1, 0, { ...clone(p.layers[i]), name: `${p.layers[i].name} copy` }) })
  const delLayer = (i) => { update((p) => { p.layers.splice(i, 1) }); setSoloIdx(-1) }

  const baseLayer = (L) => shipped.layers.find((B) => B.name === L.name)
  const m = render.metrics

  return (
    <div className="sd-root">
      <header className="sd-head">
        <span className="sd-title">Sound Designer</span>
        <nav className="sd-tabs">
          {GUN_SOUND_WEAPONS.map((w) => (
            <button key={w} className={`sd-tab ${w === weapon ? 'on' : ''}`} onClick={() => { setWeapon(w); setSoloIdx(-1) }}>
              {NAMES[w]}{JSON.stringify(working[w]) !== JSON.stringify(shippedPreset(w)) && <span className="sd-dot" />}
            </button>
          ))}
        </nav>
        <a className="sd-link" href="/?testlab">Soundboard</a>
        <a className="sd-link" href="/">Game</a>
      </header>

      <div className="sd-body">
        <section className="sd-transport">
          <button className="sd-fire" onClick={() => fire()}>Fire <small>Space</small></button>
          <button className={`sd-btn ${bursting ? 'on' : ''}`}
            onPointerDown={startBurst} onPointerUp={stopBurst} onPointerLeave={stopBurst} onPointerCancel={stopBurst}>
            Hold: burst {RATE[weapon]}/s
          </button>
          <button className="sd-btn" onClick={() => fire('shipped')}>Play shipped</button>
          <button className="sd-btn" onClick={compare} disabled={!edited}>Shipped then mine</button>
          <span className="sd-spacer" />
          <button className="sd-btn" onClick={() => setHelp((h) => !h)}>{help ? 'Hide help' : 'Help'}</button>
        </section>

        <div className="sd-status">
          {edited
            ? <span className="sd-mine">{IN_GAME ? 'Your edit plays in game' : 'Edited (in game on preview builds only)'} — {diff.length} change{diff.length === 1 ? '' : 's'}</span>
            : <span>Shipped sound</span>}
          {soloIdx >= 0 && <span className="sd-solo-note">Solo: {preset.layers[soloIdx]?.name}</span>}
          {note && <span className="sd-note">{note}</span>}
        </div>

        {stale && (
          <div className="sd-warn">
            The shipped {NAMES[weapon]} sound changed since you started editing (probably Claude's update).
            <button className="sd-btn" onClick={resetToShipped}>Load shipped</button>
            <button className="sd-btn" onClick={keepMine}>Keep mine</button>
          </div>
        )}

        <Scope buffer={render.buffer} metrics={m} />
        {m && (
          <div className="sd-metrics">
            <span title="Highest sample. Above about -1 dBFS it clips.">Peak <b>{m.peakDb.toFixed(1)}</b> dBFS</span>
            <span title="Loudness of the first 100 ms: how hard the bang hits. Compare guns with this.">Punch <b>{m.punchDb.toFixed(1)}</b> dB</span>
            <span title="Time until 60 dB below the peak.">Length <b>{m.length.toFixed(2)}</b> s</span>
          </div>
        )}

        <section className="sd-card">
          <h3>Master</h3>
          <div className="sd-grid">
            {Object.entries(MASTER_SPECS).map(([k, s]) => (
              <Param key={k} k={k} spec={s} value={preset.master[k]} base={shipped.master[k]} help={help} onChange={(v) => setMaster(k, v)} />
            ))}
            {Object.entries(VARY_SPECS).map(([k, s]) => (
              <Param key={k} k={k} spec={s} value={preset.vary[k]} base={shipped.vary[k]} help={help} onChange={(v) => setVary(k, v)} />
            ))}
          </div>
        </section>

        <h3 className="sd-h">Layers <small>all play at once on each shot; Delay staggers them</small></h3>
        <div className="sd-layers">
          {preset.layers.map((L, i) => {
            const B = baseLayer(L)
            const osc = isOsc(L.src)
            return (
              <section key={i} className={`sd-card sd-layer ${L.on ? '' : 'off'} ${soloIdx === i ? 'solo' : ''}`}>
                <div className="sd-lhead">
                  <input className="sd-name" value={L.name} onChange={(e) => setLayer(i, 'name', e.target.value)} />
                  <button className={`sd-mini ${L.on ? 'on' : ''}`} onClick={() => setLayer(i, 'on', !L.on)} title="Mute / unmute">{L.on ? 'On' : 'Muted'}</button>
                  <button className={`sd-mini ${soloIdx === i ? 'on' : ''}`} onClick={() => setSoloIdx(soloIdx === i ? -1 : i)} title="Hear only this layer">Solo</button>
                  <button className="sd-mini" onClick={() => dupLayer(i)} title="Duplicate">Dup</button>
                  <button className="sd-mini" onClick={() => delLayer(i)} title="Delete">Del</button>
                </div>
                {!B && <div className="sd-help">New layer (not in the shipped sound)</div>}
                <div className="sd-grid">
                  {Object.entries(LAYER_SPECS).map(([k, s]) => {
                    if (s.osc && !osc) return null
                    if ((k === 'ff' || k === 'ffEnd' || k === 'q') && L.filter === 'none') return null
                    if (k === 'snapTime' && L.snap >= 1) return null
                    return <Param key={k} k={k} spec={s} value={L[k]} base={B?.[k]} help={help} onChange={(v) => setLayer(i, k, v)} />
                  })}
                </div>
              </section>
            )
          })}
        </div>
        <button className="sd-btn sd-add" onClick={addLayer}>Add layer</button>

        <section className="sd-share">
          <button className="sd-fire" onClick={copy}>Copy for Claude</button>
          <button className="sd-btn" onClick={() => setPasteOpen((o) => !o)}>Paste preset</button>
          <button className="sd-btn" onClick={resetToShipped} disabled={!edited}>Reset to shipped</button>
          <span className="sd-help">Edits save in this browser as you go. Paste a preset Claude sends you to hear it here.</span>
        </section>
        {pasteOpen && (
          <div className="sd-paste">
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste a preset JSON or a whole 'Copy for Claude' block" />
            <button className="sd-btn" onClick={applyPaste}>Load</button>
          </div>
        )}
        {copyText && (
          <div className="sd-paste">
            <div className="sd-help">Clipboard blocked: copy this by hand.</div>
            <textarea readOnly value={copyText} onFocus={(e) => e.target.select()} />
            <button className="sd-btn" onClick={() => setCopyText('')}>Close</button>
          </div>
        )}
      </div>
    </div>
  )
}
