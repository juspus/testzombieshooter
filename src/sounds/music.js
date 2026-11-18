// Calm and intense background music layers.
import { _musicOut, ctx, noiseBuffer } from './core'

// ─── background music ────────────────────────────────────────────────────────

let _masterGain = null
let _musicNodes = []

export function startEerieMusic() {
  if (_masterGain) return
  const ac = ctx()
  const t = ac.currentTime

  _masterGain = ac.createGain()
  _masterGain.gain.setValueAtTime(0, t)
  _masterGain.gain.linearRampToValueAtTime(0.22, t + 5)
  _masterGain.connect(_musicOut(ac))

  // Add a sustained drone oscillator with slow LFO pitch wobble
  function addDrone(freq, gainVal, lfoRate, lfoDepth) {
    const osc = ac.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq

    const lfo = ac.createOscillator()
    lfo.frequency.value = lfoRate
    const lfoG = ac.createGain()
    lfoG.gain.value = lfoDepth
    lfo.connect(lfoG)
    lfoG.connect(osc.frequency)

    const g = ac.createGain()
    g.gain.value = gainVal
    osc.connect(g)
    g.connect(_masterGain)

    osc.start(t)
    lfo.start(t)
    _musicNodes.push(osc, lfo)
  }

  addDrone(55,    0.50, 0.04, 1.2)   // bass A1, very slow wobble
  addDrone(82.4,  0.24, 0.07, 0.9)   // E2 (5th), adds rumble beating
  addDrone(146.8, 0.14, 0.03, 2.0)   // D3, dissonant tension with 55 Hz
  addDrone(220,   0.07, 0.13, 3.0)   // A3, eerie high note with faster shimmer

  // Filtered noise bed — soft, low-level texture
  const nBuf = noiseBuffer(ac, 8)
  const nSrc = ac.createBufferSource()
  nSrc.buffer = nBuf
  nSrc.loop = true

  const nFilt = ac.createBiquadFilter()
  nFilt.type = 'lowpass'
  nFilt.frequency.value = 160

  const nGain = ac.createGain()
  nGain.gain.value = 0.055

  nSrc.connect(nFilt)
  nFilt.connect(nGain)
  nGain.connect(_masterGain)
  nSrc.start(t)
  _musicNodes.push(nSrc)
}

export function stopEerieMusic() {
  if (!_masterGain) return
  const ac = ctx()
  const t = ac.currentTime

  _masterGain.gain.cancelScheduledValues(t)
  _masterGain.gain.setValueAtTime(_masterGain.gain.value, t)
  _masterGain.gain.linearRampToValueAtTime(0, t + 2.5)

  _stopIntenseLayer(2.5)

  const nodes = _musicNodes
  const mg = _masterGain
  _musicNodes = []
  _masterGain = null

  setTimeout(() => {
    nodes.forEach((n) => { try { n.stop?.() } catch (_) {} })
    mg.disconnect()
  }, 2700)
}

// ─── intense (wave) music layer ───────────────────────────────────────────────
// 80 BPM half-time feel: kick every 1.5 s, off-beat hat at 0.75 s,
// slow dissonant drone pair (55 + 58.3 Hz → 3.3 Hz beating), and a
// deep boom stab every 4 beats. All routes through _intenseGain so the
// crossfade in setMusicIntensity() controls the whole layer.

let _intenseGain = null
let _intenseNodes = []
let _beatSchedulerId = null
let _nextBeatTime = 0
let _beatCount = 0
let _cachedHatBuf = null
let _cachedStabBuf = null

const INTENSE_BEAT_S = 1.5  // 80 BPM half-time (kick every 1.5 s)

function _scheduleKick(ac, t) {
  const osc = ac.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(75, t)
  osc.frequency.exponentialRampToValueAtTime(20, t + 0.12)
  const g = ac.createGain()
  g.gain.setValueAtTime(2.0, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
  osc.connect(g)
  g.connect(_intenseGain)
  osc.start(t)
  osc.stop(t + 0.16)
}

function _scheduleHat(ac, t) {
  if (!_cachedHatBuf) _cachedHatBuf = noiseBuffer(ac, 0.06)
  const src = ac.createBufferSource()
  src.buffer = _cachedHatBuf
  const filt = ac.createBiquadFilter()
  filt.type = 'highpass'
  filt.frequency.value = 4500
  const g = ac.createGain()
  g.gain.setValueAtTime(0.14, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.025)
  src.connect(filt)
  filt.connect(g)
  g.connect(_intenseGain)
  src.start(t)
  src.stop(t + 0.03)
}

function _scheduleBoomStab(ac, t) {
  // Deep bandpass noise burst — a rumble from below
  if (!_cachedStabBuf) _cachedStabBuf = noiseBuffer(ac, 0.55)
  const buf = _cachedStabBuf
  const src = ac.createBufferSource()
  src.buffer = buf
  const filt = ac.createBiquadFilter()
  filt.type = 'bandpass'
  filt.frequency.value = 80
  filt.Q.value = 0.6
  const g = ac.createGain()
  g.gain.setValueAtTime(0.001, t)
  g.gain.linearRampToValueAtTime(2.8, t + 0.04)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
  src.connect(filt)
  filt.connect(g)
  g.connect(_intenseGain)
  src.start(t)
  src.stop(t + 0.50)

  // Dissonant tonal spike layered on the stab (tritone: 55 + 77.8 Hz → A1 + D#2)
  for (const freq of [55, 77.8]) {
    const osc = ac.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 400
    const sg = ac.createGain()
    sg.gain.setValueAtTime(0, t)
    sg.gain.linearRampToValueAtTime(0.18, t + 0.03)
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.40)
    osc.connect(lp)
    lp.connect(sg)
    sg.connect(_intenseGain)
    osc.start(t)
    osc.stop(t + 0.45)
  }
}

function _runBeatScheduler() {
  if (!_intenseGain) return
  const ac = ctx()
  while (_nextBeatTime < ac.currentTime + 0.30) {
    _scheduleKick(ac, _nextBeatTime)
    _scheduleHat(ac, _nextBeatTime + INTENSE_BEAT_S * 0.5)
    if (_beatCount % 4 === 2) _scheduleBoomStab(ac, _nextBeatTime)
    _nextBeatTime += INTENSE_BEAT_S
    _beatCount++
  }
  _beatSchedulerId = setTimeout(_runBeatScheduler, 100)
}

function _startIntenseLayer() {
  if (_intenseGain) return
  const ac = ctx()
  const t = ac.currentTime

  _intenseGain = ac.createGain()
  _intenseGain.gain.setValueAtTime(0, t)
  _intenseGain.connect(_musicOut(ac))

  // Beating drone pair: 55 Hz + 58.3 Hz → 3.3 Hz slow pulse
  for (const [freq, gain] of [[55, 0.28], [58.3, 0.22]]) {
    const osc = ac.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 320
    const g = ac.createGain()
    g.gain.value = gain
    // Slow pitch wobble (0.25 Hz, depth 1.5 Hz) for instability
    const pitchLFO = ac.createOscillator()
    pitchLFO.frequency.value = 0.25
    const pitchLFOGain = ac.createGain()
    pitchLFOGain.gain.value = 1.5
    pitchLFO.connect(pitchLFOGain)
    pitchLFOGain.connect(osc.frequency)
    osc.connect(lp)
    lp.connect(g)
    g.connect(_intenseGain)
    osc.start(t)
    pitchLFO.start(t)
    _intenseNodes.push(osc, pitchLFO)
  }

  _beatCount = 0
  _nextBeatTime = t + 0.08
  _runBeatScheduler()
}

function _stopIntenseLayer(fadeTime = 1.5) {
  if (!_intenseGain) return

  if (_beatSchedulerId !== null) {
    clearTimeout(_beatSchedulerId)
    _beatSchedulerId = null
  }

  const ac = ctx()
  const t = ac.currentTime
  _intenseGain.gain.cancelScheduledValues(t)
  _intenseGain.gain.setValueAtTime(_intenseGain.gain.value, t)
  _intenseGain.gain.linearRampToValueAtTime(0, t + fadeTime)

  const nodes = _intenseNodes
  const ig = _intenseGain
  _intenseNodes = []
  _intenseGain = null

  setTimeout(() => {
    nodes.forEach((n) => { try { n.stop?.() } catch (_) {} })
    ig.disconnect()
  }, (fadeTime + 0.2) * 1000)
}

// Call this from Game.jsx when the wave phase changes.
// level 1 → zombies are here (duck calm, start intense)
// level 0 → intermission/wave_clear (restore calm, fade intense out)
export function setMusicIntensity(level) {
  if (!_masterGain) return
  const ac = ctx()
  const t = ac.currentTime

  if (level >= 1) {
    _masterGain.gain.cancelScheduledValues(t)
    _masterGain.gain.setValueAtTime(_masterGain.gain.value, t)
    _masterGain.gain.linearRampToValueAtTime(0.05, t + 1.5)

    _startIntenseLayer()
    _intenseGain.gain.cancelScheduledValues(t)
    _intenseGain.gain.setValueAtTime(_intenseGain.gain.value, t)
    _intenseGain.gain.linearRampToValueAtTime(0.32, t + 1.5)
  } else if (_intenseGain) {
    _masterGain.gain.cancelScheduledValues(t)
    _masterGain.gain.setValueAtTime(_masterGain.gain.value, t)
    _masterGain.gain.linearRampToValueAtTime(0.22, t + 2.5)

    _stopIntenseLayer(2.5)
  }
}
