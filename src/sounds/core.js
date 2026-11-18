// Audio context, the three volume buses (effects / music / master), the low-HP and slow-mo muffle,
// the unlock-on-gesture and the synthesis helpers every other sounds/ module builds on.
// The AudioContext, every bus node and the hold flag live HERE and nowhere else.
import { useSettings } from '../settings'

export let _ctx = null
let _audioHold = false   // true while the game is paused: don't auto-resume the context

export function ctx() {
  if (!_ctx) { _ctx = new (window.AudioContext || window.webkitAudioContext)(); _installMasterBus(_ctx) }
  // Resume if browser suspended it (autoplay policy), but not while paused
  if (_ctx.state === 'suspended' && !_audioHold) _ctx.resume()
  return _ctx
}

// Shared AudioContext (progressSounds uses this too). Created lazily.
export function getAudioContext() { return ctx() }

// Pause / unpause: suspend the context while the game is paused, resume after.
export function setAudioHold(hold) {
  _audioHold = hold
  if (!_ctx) return
  try {
    if (hold) _ctx.suspend?.()
    else _ctx.resume?.()
  } catch { /* audio unavailable */ }
}

// Explicit unlock on the first user gesture (iOS needs a resume() inside a gesture).
// Creates the shared context on that first gesture so later sounds start unlocked.
let _unlockInstalled = false
export function installAudioUnlock() {
  if (_unlockInstalled || typeof document === 'undefined') return
  _unlockInstalled = true
  const events = ['pointerdown', 'touchend', 'keydown']
  const unlock = () => {
    try {
      const ac = ctx()
      if (_audioHold) return
      const p = ac.resume?.()
      const done = () => {
        if (ac.state === 'running') events.forEach((e) => document.removeEventListener(e, unlock, true))
      }
      if (p?.then) p.then(done, () => {}); else done()
    } catch { /* audio unavailable */ }
  }
  events.forEach((e) => document.addEventListener(e, unlock, true))
}

// ─── volume buses (settings: volume = master, sfxVolume, musicVolume) ────────
// Slider 0..1 -> gain via a square curve, so the slider's middle sounds like the middle
// (a linear gain does nearly all of its audible work in the bottom quarter).
let _volGain = null      // master: everything
let _sfxGain = null      // effects through the muffle filter (what `ac.destination` returns)
let _sfxDryGain = null   // effects that bypass the muffle (heartbeat, stings)
let _musicGain = null    // music (still muffled with the rest)

export const volumeCurve = (v) => { const c = Math.max(0, Math.min(1, v)); return c * c }

function _setBus(node, v) {
  if (!node || !_ctx) return
  node.gain.setTargetAtTime(volumeCurve(v), _ctx.currentTime, 0.03)
}

// ─── master bus (low-HP / slow-mo muffle) ────────────────────────────────────
// Every sound connects to `ac.destination`. We shadow that property on the
// context instance with the effects bus feeding a lowpass, so all existing sounds
// (incl. panners) get effects volume and the muffle with no per-sound edits.
// Music connects to _musicGain instead. Heartbeat/stings use _realDest to bypass
// the filter and stay clear.
//   sounds -> _sfxGain ----\
//   music  -> _musicGain ---> _masterLP -> _volGain -> speakers
//   stings -> _sfxDryGain --------------/
export let _realDest = null
let _masterLP = null
let _muffleDanger = 0
let _muffleSlow = 0

function _installMasterBus(ac) {
  const st = useSettings.getState()
  const bus = (v, to) => { const g = ac.createGain(); g.gain.value = volumeCurve(v); g.connect(to); return g }
  _volGain = bus(st.volume, ac.destination)
  _masterLP = ac.createBiquadFilter()
  _masterLP.type = 'lowpass'
  _masterLP.frequency.value = 22000
  _masterLP.Q.value = 0.5
  _masterLP.connect(_volGain)
  _sfxGain = bus(st.sfxVolume, _masterLP)
  _sfxDryGain = bus(st.sfxVolume, _volGain)
  _musicGain = bus(st.musicVolume, _masterLP)
  _realDest = _sfxDryGain
  Object.defineProperty(ac, 'destination', { get: () => _sfxGain, configurable: true })
  useSettings.subscribe((s, prev) => {
    if (s.volume !== prev.volume) _setBus(_volGain, s.volume)
    if (s.sfxVolume !== prev.sfxVolume) { _setBus(_sfxGain, s.sfxVolume); _setBus(_sfxDryGain, s.sfxVolume) }
    if (s.musicVolume !== prev.musicVolume) _setBus(_musicGain, s.musicVolume)
  })
}

export const _musicOut = (ac) => _musicGain ?? ac.destination

// Short tick so a volume slider is audible from the menus (where nothing else plays).
// Skipped while the game is paused: the context is suspended and it would queue up.
let _lastPreview = 0
export function playVolumePreview(kind = 'sfx') {
  if (_audioHold) return
  const ac = ctx()
  const now = performance.now()
  if (now - _lastPreview < 140) return
  _lastPreview = now
  const t = ac.currentTime + 0.1   // let the bus glide to the new level first
  if (kind === 'music') {
    playTone(ac, t, 220, 218, 0.5, 0.12, _musicOut(ac))
    playTone(ac, t, 330, 327, 0.5, 0.08, _musicOut(ac))
  } else playTone(ac, t, 1900, 1300, 0.05, 0.12)
}

function _applyMuffle() {
  if (!_masterLP) return
  const amt = Math.max(_muffleDanger, _muffleSlow)
  // 0 -> fully open, 1 -> ~700 Hz (log scale)
  const f = 22000 * Math.pow(700 / 22000, amt)
  const ac = ctx()
  _masterLP.frequency.setTargetAtTime(f, ac.currentTime, 0.12)
}

// Low-HP muffle amount 0..1
export function setDangerMuffle(amount) {
  if (amount === _muffleDanger) return
  _muffleDanger = amount
  _applyMuffle()
}

// ─── helpers ────────────────────────────────────────────────────────────────

export function noiseBuffer(ac, seconds) {
  const len = Math.floor(ac.sampleRate * seconds)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

export function playNoise(ac, buf, t, duration, gainVal, filterType, freq, q = 1, dest = null) {
  const src = ac.createBufferSource()
  src.buffer = buf

  const filt = ac.createBiquadFilter()
  filt.type = filterType
  filt.frequency.value = freq
  filt.Q.value = q

  const gain = ac.createGain()
  gain.gain.setValueAtTime(gainVal, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration)

  src.connect(filt)
  filt.connect(gain)
  gain.connect(dest ?? ac.destination)
  src.start(t)
  src.stop(t + duration)
}

export function playTone(ac, t, startFreq, endFreq, duration, gainVal, dest = null) {
  const osc = ac.createOscillator()
  osc.frequency.setValueAtTime(startFreq, t)
  osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(gainVal, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration)

  osc.connect(gain)
  gain.connect(dest ?? ac.destination)
  osc.start(t)
  osc.stop(t + duration)
}

// Tanh soft-clip curve for WaveShaperNode.
// drive 1 = subtle warmth, 2 = moderate crunch, 3+ = heavy saturation.
// Normalised so |output| ≤ 1 and unity gain for small signals.
function _makeTanhCurve(drive = 2) {
  const n = 512
  const curve = new Float32Array(n)
  const norm = Math.tanh(drive)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1   // map index → [-1, +1]
    curve[i] = Math.tanh(x * drive) / norm
  }
  return curve
}

// Build a shared signal chain: inputGain → WaveShaper → Compressor → destination.
// Returns the inputGain node — connect audio sources to it.
// satDrive:  tanh saturation drive (1 = subtle, 2 = crunchy)
// threshold: compressor threshold in dBFS (e.g. -14)
export function _makeShotChain(ac, satDrive = 2, threshold = -14, dest = null) {
  const inputGain = ac.createGain()
  inputGain.gain.value = 1.0

  const sat = ac.createWaveShaper()
  sat.curve = _makeTanhCurve(satDrive)
  sat.oversample = '4x'          // reduce aliasing from clipping

  const comp = ac.createDynamicsCompressor()
  comp.threshold.value = threshold
  comp.knee.value      = 6       // soft knee — gentler onset
  comp.ratio.value     = 6       // 6 : 1
  comp.attack.value    = 0.010   // 10 ms — lets the transient peak through, then tames
  comp.release.value   = 0.080   // 80 ms — quick recovery so body feels full

  const makeupGain = ac.createGain()
  makeupGain.gain.value = 2.2    // restore level lost to compression

  inputGain.connect(sat)
  sat.connect(comp)
  comp.connect(makeupGain)
  makeupGain.connect(dest ?? ac.destination)

  return inputGain
}

export function mechanicalClick(ac, t, gainVal = 0.5) {
  const buf = noiseBuffer(ac, 0.04)
  playNoise(ac, buf, t, 0.035, gainVal, 'bandpass', 2400, 3)
  playTone(ac, t, 180, 60, 0.03, gainVal * 0.4)
}

// Slow-mo muffle (separate channel from the low-HP one; the louder wins)
export function setSlowMoMuffle(amount) {
  _muffleSlow = amount
  _applyMuffle()
}
