// Data-driven gunshot synth. Every gun sound is a preset (src/sfx/gunPresets.json):
// a list of layers (noise or oscillator -> filter -> envelope) mixed through a
// master chain (drive -> compressor -> out -> limiter, plus a room send).
// The Sound Designer (/?sfx) edits the same presets live; off production its local
// edits override the shipped ones in game (localStorage, see getGunPreset).
//
// No imports from sounds.js: this file must also run on an OfflineAudioContext
// (designer waveform/metrics, headless measurements).
import SHIPPED from './gunPresets.json'

export const GUN_SOUND_WEAPONS = ['pistol', 'shotgun', 'ak47', 'deagle']

// ─── parameter specs (UI ranges + help; tests validate presets against these) ─

export const MASTER_SPECS = {
  drive:     { label: 'Drive',      min: 0,    max: 6,     step: 0.1,  help: 'Saturation on layers marked "drive". 0 = clean. Higher = thicker, crunchier.' },
  threshold: { label: 'Comp thresh', min: -40, max: 0,     step: 1,    unit: 'dB', help: 'Compressor on drive layers. Lower = more squashed and fat.' },
  ratio:     { label: 'Comp ratio', min: 1,    max: 20,    step: 0.5,  help: 'How hard the compressor squashes above the threshold.' },
  makeup:    { label: 'Makeup',     min: 0,    max: 4,     step: 0.05, help: 'Level after the compressor (drive layers only).' },
  out:       { label: 'Out level',  min: 0,    max: 2,     step: 0.01, help: 'Final level of the whole shot. Use this to balance guns against each other.' },
  limiter:   { label: 'Limiter',    type: 'bool', help: 'Brick-wall limiter at the end. Stops clipping on loud guns.' },
  room:      { label: 'Room send',  min: 0,    max: 1,     step: 0.01, help: 'Reverb amount (shared cabin room). 0 = dry.' },
  roomSize:  { label: 'Room size',  min: 0.1,  max: 2.5,   step: 0.01, unit: 's', log: true, help: 'Reverb tail length.' },
  roomTone:  { label: 'Room tone',  min: 400,  max: 12000, step: 1,    unit: 'Hz', log: true, help: 'Reverb brightness. Low = dark wooden room.' },
}

export const VARY_SPECS = {
  pitch: { label: 'Pitch vary', min: 0, max: 0.15, step: 0.005, help: 'Random pitch per shot (+-). Stops rapid fire sounding like a machine.' },
  level: { label: 'Level vary', min: 0, max: 0.4,  step: 0.01,  help: 'Random loudness per shot (+-).' },
}

export const SOURCES = ['noise', 'pink', 'brown', 'sine', 'triangle', 'saw', 'square']
export const FILTERS = ['none', 'lowpass', 'highpass', 'bandpass', 'peaking']
export const isOsc = (src) => src === 'sine' || src === 'triangle' || src === 'saw' || src === 'square'

export const LAYER_SPECS = {
  src:      { label: 'Source',     type: 'enum', options: SOURCES, help: 'noise = white hiss, pink/brown = darker noise, others = tones (good for sub punch / growl).' },
  f0:       { label: 'Pitch start', min: 15,  max: 8000,  step: 1,     unit: 'Hz', log: true, osc: true, help: 'Tone frequency at the start.' },
  f1:       { label: 'Pitch end',  min: 15,   max: 8000,  step: 1,     unit: 'Hz', log: true, osc: true, help: 'Tone frequency after the sweep (lower = falling "boom").' },
  sweep:    { label: 'Sweep time', min: 0.003, max: 0.6,  step: 0.001, unit: 's', log: true, osc: true, help: 'How long the pitch takes to fall.' },
  filter:   { label: 'Filter',     type: 'enum', options: FILTERS, help: 'bandpass = only around Freq, lowpass = below, highpass = above.' },
  ff:       { label: 'Freq',       min: 20,   max: 16000, step: 1,     unit: 'Hz', log: true, help: 'Filter frequency. ~60-150 boom, 200-500 body/bark, 1-3k crack, 3k+ clicks.' },
  ffEnd:    { label: 'Freq end',   min: 20,   max: 16000, step: 1,     unit: 'Hz', log: true, help: 'Filter frequency at the end of the layer (same as Freq = no sweep).' },
  q:        { label: 'Q',          min: 0.1,  max: 20,    step: 0.05,  log: true, help: 'Filter width. Low = wide band, high = narrow, ringing.' },
  gain:     { label: 'Level',      min: 0,    max: 6,     step: 0.05,  help: 'Peak level of this layer.' },
  delay:    { label: 'Delay',      min: 0,    max: 0.4,   step: 0.001, unit: 's', help: 'Start time after the trigger (mechanics: slide, bolt, pump).' },
  attack:   { label: 'Attack',     min: 0,    max: 0.1,   step: 0.001, unit: 's', help: 'Fade-in. 0 = instant hit. A few ms on a room layer = room "fills".' },
  decay:    { label: 'Decay',      min: 0.003, max: 1.5,  step: 0.001, unit: 's', log: true, help: 'Time from peak to silence.' },
  snap:     { label: 'Snap to',    min: 0.01, max: 1,     step: 0.01,  help: 'Two-stage decay: drop quickly to this fraction of the peak first (1 = off).' },
  snapTime: { label: 'Snap time',  min: 0,    max: 1,     step: 0.001, unit: 's', help: 'How long the quick first drop takes (must be shorter than Decay).' },
  drive:    { label: 'Through drive', type: 'bool', help: 'Route through master Drive + compressor (on) or straight to Out (off).' },
}

export const DEFAULT_LAYER = {
  name: 'New layer', on: true, src: 'noise', f0: 120, f1: 40, sweep: 0.05,
  filter: 'bandpass', ff: 400, ffEnd: 400, q: 1, gain: 1, delay: 0, attack: 0,
  decay: 0.1, snap: 1, snapTime: 0, drive: true,
}

// ─── preset access (shipped + local designer edits) ─────────────────────────

export const OVERRIDE_KEY = 'sfx.gunOverrides.v1'
const OVERRIDES_ALLOWED = import.meta.env?.VITE_VERCEL_ENV !== 'production'

export function shippedPreset(weapon) { return SHIPPED.weapons[weapon] ?? null }
export function shippedPresets() { return SHIPPED.weapons }

// Short stable hash so an edit can say which shipped version it started from.
export function presetHash(p) {
  const s = JSON.stringify(p)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0').slice(0, 6)
}

let _overrides = null
export function readOverrides() {
  if (_overrides) return _overrides
  _overrides = {}
  try { _overrides = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}') || {} } catch { /* no storage */ }
  return _overrides
}
export function writeOverrides(next) {
  _overrides = next
  try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(next)) } catch { /* no storage */ }
}
if (typeof window !== 'undefined') {
  // Designer open in another tab: pick up its edits without a reload.
  window.addEventListener('storage', (e) => { if (e.key === OVERRIDE_KEY) _overrides = null })
}

// The preset the game plays: the designer's local edit if there is one (dev/preview only).
export function getGunPreset(weapon) {
  if (OVERRIDES_ALLOWED && typeof window !== 'undefined') {
    const o = readOverrides()[weapon]
    if (o?.preset) return o.preset
  }
  return shippedPreset(weapon)
}

// ─── shared buffers / nodes (cached per AudioContext) ───────────────────────

const NOISE_SECONDS = 2
const _perCtx = new WeakMap()
function cache(ac) {
  let c = _perCtx.get(ac)
  if (!c) { c = { noise: {}, rooms: new Map(), shaper: new Map() }; _perCtx.set(ac, c) }
  return c
}

// White / pink / brown noise, 2 s, made once; each layer starts at a random offset.
function noiseBuf(ac, color) {
  const c = cache(ac)
  if (c.noise[color]) return c.noise[color]
  const len = Math.floor(ac.sampleRate * NOISE_SECONDS)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const d = buf.getChannelData(0)
  if (color === 'pink') {
    // Paul Kellet's economy pink filter
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.0990460
      b1 = 0.96300 * b1 + w * 0.2965164
      b2 = 0.57000 * b2 + w * 1.0526913
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2
    }
  } else if (color === 'brown') {
    let last = 0
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
      d[i] = last * 3.5
    }
  } else {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }
  c.noise[color] = buf
  return buf
}

function tanhCurve(drive) {
  const n = 512
  const curve = new Float32Array(n)
  const norm = Math.tanh(drive)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = Math.tanh(x * drive) / norm
  }
  return curve
}
function shaperCurve(ac, drive) {
  const c = cache(ac)
  const k = Math.round(drive * 10) / 10
  if (!c.shaper.has(k)) c.shaper.set(k, tanhCurve(k))
  return c.shaper.get(k)
}

// One shared convolver per (size, tone), feeding the context's destination.
// Kept small: dragging the room sliders in the designer would otherwise pile them up.
const MAX_ROOMS = 4
function roomInput(ac, size, tone) {
  const c = cache(ac)
  const key = `${size.toFixed(2)}|${Math.round(tone)}`
  let r = c.rooms.get(key)
  if (r) { c.rooms.delete(key); c.rooms.set(key, r); return r.input }   // LRU touch
  const len = Math.max(1, Math.floor(ac.sampleRate * size))
  const ir = ac.createBuffer(2, len, ac.sampleRate)
  // Exponential-decay noise, one-pole lowpassed (tone), with a short pre-delay.
  const a = Math.exp(-2 * Math.PI * tone / ac.sampleRate)
  const pre = Math.floor(ac.sampleRate * 0.008)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const env = i < pre ? 0 : Math.pow(0.001, (i - pre) / (len - pre))
      lp = (1 - a) * (Math.random() * 2 - 1) + a * lp
      d[i] = lp * env
    }
  }
  const input = ac.createGain()
  const conv = ac.createConvolver()
  conv.buffer = ir
  input.connect(conv)
  conv.connect(ac.destination)
  r = { input, conv }
  c.rooms.set(key, r)
  if (c.rooms.size > MAX_ROOMS) {
    const [oldKey, old] = c.rooms.entries().next().value
    c.rooms.delete(oldKey)
    // Let a tail that is still ringing finish before cutting it off.
    setTimeout(() => { try { old.input.disconnect(); old.conv.disconnect() } catch { /* gone */ } }, 3000)
  }
  return input
}

// ─── playback ───────────────────────────────────────────────────────────────

const SILENT = 0.0001
const OSC_TYPE = { sine: 'sine', triangle: 'triangle', saw: 'sawtooth', square: 'square' }
const clampF = (f, ac) => Math.max(10, Math.min(ac.sampleRate / 2 - 100, f))

function playLayer(ac, L, t0, input, pitch) {
  const t = t0 + (L.delay || 0)
  const atk = Math.max(0, L.attack || 0)
  const decay = Math.max(0.003, L.decay)
  const tPeak = t + atk
  const tEnd = tPeak + decay

  let src
  if (isOsc(L.src)) {
    src = ac.createOscillator()
    src.type = OSC_TYPE[L.src]
    const f0 = clampF(L.f0 * pitch, ac)
    const f1 = clampF(L.f1 * pitch, ac)
    src.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) src.frequency.exponentialRampToValueAtTime(f1, t + Math.max(0.003, L.sweep))
    src.start(t)
  } else {
    src = ac.createBufferSource()
    src.buffer = noiseBuf(ac, L.src === 'pink' || L.src === 'brown' ? L.src : 'white')
    const room = NOISE_SECONDS - (tEnd - t) - 0.01
    src.start(t, room > 0 ? Math.random() * room : 0)
  }
  src.stop(tEnd + 0.01)

  let node = src
  if (L.filter && L.filter !== 'none') {
    const f = ac.createBiquadFilter()
    f.type = L.filter
    f.Q.value = L.q
    if (L.filter === 'peaking') f.gain.value = 12
    const ff = clampF(L.ff * pitch, ac)
    const ffEnd = clampF((L.ffEnd ?? L.ff) * pitch, ac)
    f.frequency.setValueAtTime(ff, t)
    if (ffEnd !== ff) f.frequency.exponentialRampToValueAtTime(ffEnd, tEnd)
    node.connect(f)
    node = f
  }

  const g = ac.createGain()
  const peak = Math.max(SILENT * 2, L.gain)
  if (atk > 0) {
    g.gain.setValueAtTime(SILENT, t)
    g.gain.linearRampToValueAtTime(peak, tPeak)
  } else {
    g.gain.setValueAtTime(peak, t)
  }
  const snap = L.snap ?? 1
  const snapT = L.snapTime || 0
  if (snap < 1 && snapT > 0 && snapT < decay) {
    g.gain.exponentialRampToValueAtTime(Math.max(SILENT * 2, peak * snap), tPeak + snapT)
  }
  g.gain.exponentialRampToValueAtTime(SILENT, tEnd)
  node.connect(g)
  g.connect(input)
  return tEnd
}

// Play a preset at time t into dest (default: the context's destination).
// Returns the time the last layer ends.
export function playShotPreset(ac, preset, t = ac.currentTime, dest = null, opts = {}) {
  if (!preset) return t
  const M = preset.master
  const V = preset.vary ?? { pitch: 0, level: 0 }
  const rnd = opts.noVary ? () => 0 : () => Math.random() * 2 - 1
  const pitch = 1 + rnd() * (V.pitch || 0)
  const level = 1 + rnd() * (V.level || 0)

  const out = ac.createGain()
  out.gain.value = M.out * level
  let tail = out
  if (M.limiter) {
    const lim = ac.createDynamicsCompressor()
    lim.threshold.value = -3
    lim.knee.value = 1
    lim.ratio.value = 20
    lim.attack.value = 0.002
    lim.release.value = 0.2
    out.connect(lim)
    tail = lim
  }
  tail.connect(dest ?? ac.destination)
  if (M.room > 0) {
    const send = ac.createGain()
    send.gain.value = M.room
    tail.connect(send)
    send.connect(roomInput(ac, M.roomSize, M.roomTone))
  }

  const layers = preset.layers.filter((L) => (opts.solo ? L === opts.solo : L.on !== false))
  let driveIn = null
  if (layers.some((L) => L.drive)) {
    driveIn = ac.createGain()
    let n = driveIn
    if (M.drive > 0) {
      const sh = ac.createWaveShaper()
      sh.curve = shaperCurve(ac, M.drive)
      sh.oversample = '4x'
      n.connect(sh); n = sh
    }
    const comp = ac.createDynamicsCompressor()
    comp.threshold.value = M.threshold
    comp.knee.value = 6
    comp.ratio.value = M.ratio
    comp.attack.value = 0.01
    comp.release.value = 0.08
    const mk = ac.createGain()
    mk.gain.value = M.makeup
    n.connect(comp); comp.connect(mk); mk.connect(out)
  }

  let end = t
  for (const L of layers) end = Math.max(end, playLayer(ac, L, t, L.drive ? driveIn : out, pitch))
  return end
}

// ─── offline render + metrics (designer graphs, headless checks) ────────────

export function presetLength(preset) {
  let end = 0
  for (const L of preset.layers) if (L.on !== false) end = Math.max(end, (L.delay || 0) + (L.attack || 0) + L.decay)
  return end + (preset.master.room > 0 ? preset.master.roomSize : 0) + 0.05
}

export async function renderShot(preset, { sampleRate = 44100, solo = null } = {}) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext
  const len = Math.ceil(presetLength(preset) * sampleRate)
  const oac = new OAC(1, len, sampleRate)
  playShotPreset(oac, preset, 0, null, { noVary: true, solo })
  return oac.startRendering()
}

// In-place radix-2 FFT (re, im: Float64Array, length power of two).
function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const xr = re[b] * cr - im[b] * ci
        const xi = re[b] * ci + im[b] * cr
        re[b] = re[a] - xr; im[b] = im[a] - xi
        re[a] += xr; im[a] += xi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr; cr = ncr
      }
    }
  }
}

export const BANDS = [
  { id: 'sub', label: 'Sub', lo: 0, hi: 100 },
  { id: 'low', label: 'Low', lo: 100, hi: 400 },
  { id: 'mid', label: 'Mid', lo: 400, hi: 2000 },
  { id: 'high', label: 'High', lo: 2000, hi: Infinity },
]

// Peak / RMS (dBFS), audible length, energy per band and an averaged spectrum.
export function analyze(buffer) {
  const d = buffer.getChannelData(0)
  const sr = buffer.sampleRate
  let peak = 0, sum = 0
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i] }
  let last = 0
  const floor = peak * 0.001   // -60 dB under the peak
  for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) > floor) { last = i; break }
  const audible = Math.max(1, last)
  // RMS over the first 100 ms: what the ear reads as "how loud is the bang".
  const n100 = Math.min(d.length, Math.floor(sr * 0.1))
  let s100 = 0
  for (let i = 0; i < n100; i++) s100 += d[i] * d[i]

  const N = 2048
  const spec = new Float64Array(N / 2)
  const re = new Float64Array(N), im = new Float64Array(N)
  let frames = 0
  for (let off = 0; off + N <= Math.max(N, audible); off += N / 2) {
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))
      re[i] = (d[off + i] ?? 0) * w; im[i] = 0
    }
    fft(re, im)
    for (let k = 0; k < N / 2; k++) spec[k] += re[k] * re[k] + im[k] * im[k]
    frames++
  }
  const bandE = BANDS.map(() => 0)
  let tot = 0
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N
    const bi = BANDS.findIndex((b) => f >= b.lo && f < b.hi)
    bandE[bi] += spec[k]; tot += spec[k]
  }
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity)
  return {
    peakDb: db(peak),
    rmsDb: db(Math.sqrt(sum / d.length)),
    punchDb: db(Math.sqrt(s100 / Math.max(1, n100))),
    length: last / sr,
    bands: Object.fromEntries(BANDS.map((b, i) => [b.id, tot > 0 ? bandE[i] / tot : 0])),
    spectrum: Array.from(spec, (v) => v / Math.max(1, frames)),
    binHz: sr / N,
  }
}

export function formatMetrics(m) {
  const pct = (x) => `${Math.round(x * 100)}%`
  return `peak ${m.peakDb.toFixed(1)} dBFS, punch(100ms rms) ${m.punchDb.toFixed(1)} dB, length ${m.length.toFixed(2)} s, ` +
    BANDS.map((b) => `${b.label.toLowerCase()} ${pct(m.bands[b.id])}`).join(' ')
}

// ─── diff / validation (designer "copy for Claude", tests) ──────────────────

const fmt = (v) => (typeof v === 'number' ? +v.toFixed(4) : JSON.stringify(v))

// Human-readable list of what changed from `base` to `next`.
export function presetDiff(base, next) {
  const out = []
  const cmp = (path, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path}: ${fmt(a)} -> ${fmt(b)}`) }
  for (const k of Object.keys({ ...base.master, ...next.master })) cmp(`master.${k}`, base.master[k], next.master[k])
  for (const k of Object.keys({ ...base.vary, ...next.vary })) cmp(`vary.${k}`, base.vary?.[k], next.vary?.[k])
  const used = new Set()
  next.layers.forEach((L) => {
    const bi = base.layers.findIndex((B, i) => !used.has(i) && B.name === L.name)
    if (bi < 0) { out.push(`+ layer "${L.name}": ${JSON.stringify(L)}`); return }
    used.add(bi)
    const B = base.layers[bi]
    for (const k of Object.keys({ ...B, ...L })) if (k !== 'name') cmp(`layer "${L.name}".${k}`, B[k], L[k])
  })
  base.layers.forEach((B, i) => { if (!used.has(i)) out.push(`- layer "${B.name}" removed`) })
  return out
}

const inRange = (spec, v) => {
  if (spec.type === 'bool') return typeof v === 'boolean'
  if (spec.type === 'enum') return spec.options.includes(v)
  return typeof v === 'number' && Number.isFinite(v) && v >= spec.min && v <= spec.max
}

// Returns a list of problems (empty = valid).
export function validatePreset(p) {
  const errs = []
  if (!p || typeof p !== 'object') return ['not an object']
  if (!p.master) errs.push('missing master')
  if (!Array.isArray(p.layers) || !p.layers.length) errs.push('missing layers')
  if (errs.length) return errs
  for (const [k, s] of Object.entries(MASTER_SPECS)) if (!inRange(s, p.master[k])) errs.push(`master.${k} = ${p.master[k]}`)
  for (const [k, s] of Object.entries(VARY_SPECS)) if (!inRange(s, p.vary?.[k])) errs.push(`vary.${k} = ${p.vary?.[k]}`)
  p.layers.forEach((L, i) => {
    if (typeof L.name !== 'string') errs.push(`layer ${i} name`)
    for (const [k, s] of Object.entries(LAYER_SPECS)) if (!inRange(s, L[k])) errs.push(`layer "${L.name}".${k} = ${L[k]}`)
  })
  return errs
}

// Fill missing fields from defaults and clamp numbers into range (pasted presets).
export function normalizePreset(p) {
  const clamp = (spec, v, d) => {
    if (spec.type === 'bool') return typeof v === 'boolean' ? v : d
    if (spec.type === 'enum') return spec.options.includes(v) ? v : d
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(spec.max, Math.max(spec.min, n)) : d
  }
  const base = shippedPreset('pistol')
  const master = {}
  for (const [k, s] of Object.entries(MASTER_SPECS)) master[k] = clamp(s, p.master?.[k], base.master[k])
  const vary = {}
  for (const [k, s] of Object.entries(VARY_SPECS)) vary[k] = clamp(s, p.vary?.[k], 0)
  const layers = (Array.isArray(p.layers) ? p.layers : []).map((L, i) => {
    const o = { name: typeof L?.name === 'string' ? L.name : `Layer ${i + 1}`, on: L?.on !== false }
    for (const [k, s] of Object.entries(LAYER_SPECS)) o[k] = clamp(s, L?.[k], DEFAULT_LAYER[k])
    return o
  })
  return { ...(p.label ? { label: p.label } : {}), master, vary, layers }
}
