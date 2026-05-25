// Procedural sound synthesis via Web Audio API — no audio files required.

let _ctx = null

function ctx() {
  if (!_ctx) _ctx = new AudioContext()
  // Resume if browser suspended it (autoplay policy)
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

// ─── helpers ────────────────────────────────────────────────────────────────

function noiseBuffer(ac, seconds) {
  const len = Math.floor(ac.sampleRate * seconds)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

function playNoise(ac, buf, t, duration, gainVal, filterType, freq, q = 1) {
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
  gain.connect(ac.destination)
  src.start(t)
  src.stop(t + duration)
}

function playTone(ac, t, startFreq, endFreq, duration, gainVal) {
  const osc = ac.createOscillator()
  osc.frequency.setValueAtTime(startFreq, t)
  osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(gainVal, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration)

  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(t)
  osc.stop(t + duration)
}

function mechanicalClick(ac, t, gainVal = 0.5) {
  const buf = noiseBuffer(ac, 0.04)
  playNoise(ac, buf, t, 0.035, gainVal, 'bandpass', 2400, 3)
  playTone(ac, t, 180, 60, 0.03, gainVal * 0.4)
}

// ─── public sounds ───────────────────────────────────────────────────────────

// ─── per-weapon gunshot implementations ─────────────────────────────────────

// Glock 17 / 9mm pistol
// Character: sharp, crisp "BANG" with high-mid emphasis, modest low end,
//            followed by the semi-auto slide cycling back and snapping forward.
function _playPistolShot(ac, t) {
  // 1. Muzzle blast — the dominant sound
  //    Broadband noise, highpass to kill sub-bass mud (pistol ≠ cannon),
  //    peaking boost at 2.5 kHz for the distinctive 9mm snap/crack.
  //    Very steep gain envelope: loud instant attack, 80% gone by 30 ms.
  const blastBuf = noiseBuffer(ac, 0.10)
  const blastSrc = ac.createBufferSource()
  blastSrc.buffer = blastBuf

  const blastHP = ac.createBiquadFilter()
  blastHP.type = 'highpass'
  blastHP.frequency.value = 380   // cut boom, keep punch

  const blastSnap = ac.createBiquadFilter()
  blastSnap.type = 'peaking'
  blastSnap.frequency.value = 2500
  blastSnap.gain.value = 10       // add the 9mm snap character
  blastSnap.Q.value = 0.85

  const blastGain = ac.createGain()
  blastGain.gain.setValueAtTime(1.7, t)
  blastGain.gain.exponentialRampToValueAtTime(0.06, t + 0.028)   // very steep drop
  blastGain.gain.exponentialRampToValueAtTime(0.001, t + 0.095)

  blastSrc.connect(blastHP)
  blastHP.connect(blastSnap)
  blastSnap.connect(blastGain)
  blastGain.connect(ac.destination)
  blastSrc.start(t)
  blastSrc.stop(t + 0.10)

  // 2. High-frequency crack — supersonic pressure front
  //    Very short bandpass burst at ~4 kHz. Decays in ~20 ms.
  //    Gives that sharp "crack" on top of the body.
  const crackBuf = noiseBuffer(ac, 0.025)
  const crackSrc = ac.createBufferSource()
  crackSrc.buffer = crackBuf

  const crackFilt = ac.createBiquadFilter()
  crackFilt.type = 'bandpass'
  crackFilt.frequency.value = 4200
  crackFilt.Q.value = 1.8

  const crackGain = ac.createGain()
  crackGain.gain.setValueAtTime(1.3, t)
  crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.022)

  crackSrc.connect(crackFilt)
  crackFilt.connect(crackGain)
  crackGain.connect(ac.destination)
  crackSrc.start(t)
  crackSrc.stop(t + 0.025)

  // 3. Pressure pop — short muzzle pressure wave, NOT a long bass sweep
  //    9mm has less low-end than .45 or .357; decays in ~40 ms max.
  //    This is what distinguishes a pistol "thump" from a snare-drum "boom".
  const popOsc = ac.createOscillator()
  popOsc.type = 'sine'
  popOsc.frequency.setValueAtTime(115, t)
  popOsc.frequency.exponentialRampToValueAtTime(42, t + 0.038)

  const popGain = ac.createGain()
  popGain.gain.setValueAtTime(0.85, t)
  popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.042)

  popOsc.connect(popGain)
  popGain.connect(ac.destination)
  popOsc.start(t)
  popOsc.stop(t + 0.045)

  // 4. Slide cycling back (~78 ms) — the semi-auto fingerprint
  //    Polymer frame + metal slide: two overlapping short bursts.
  //    The slight delay distinguishes this sound from any percussion hit.
  const slideBackBuf = noiseBuffer(ac, 0.032)
  playNoise(ac, slideBackBuf, t + 0.076, 0.030, 0.48, 'bandpass', 2700, 4.5)
  playTone(ac, t + 0.076, 165, 82, 0.028, 0.30)

  // 5. Slide snapping forward + chambering (~118 ms)
  //    Slightly sharper/higher than the back-stroke (spring loaded return).
  const slideFwdBuf = noiseBuffer(ac, 0.026)
  playNoise(ac, slideFwdBuf, t + 0.116, 0.024, 0.58, 'bandpass', 3300, 5.5)
  playTone(ac, t + 0.116, 205, 100, 0.022, 0.36)
}

// Generic fallback (used while other weapon sounds are not yet implemented)
function _playGenericShot(ac, t) {
  const crackBuf = noiseBuffer(ac, 0.18)
  const crack = ac.createBufferSource()
  crack.buffer = crackBuf

  const crackFilt = ac.createBiquadFilter()
  crackFilt.type = 'peaking'
  crackFilt.frequency.value = 1800
  crackFilt.gain.value = 12

  const crackGain = ac.createGain()
  crackGain.gain.setValueAtTime(1.1, t)
  crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)

  crack.connect(crackFilt)
  crackFilt.connect(crackGain)
  crackGain.connect(ac.destination)
  crack.start(t)
  crack.stop(t + 0.18)

  playTone(ac, t, 220, 35, 0.12, 1.2)
  playTone(ac, t + 0.02, 80, 30, 0.1, 0.5)
}

export function playGunshot(weapon = 'pistol') {
  const ac = ctx()
  const t  = ac.currentTime
  if (weapon === 'pistol') return _playPistolShot(ac, t)
  _playGenericShot(ac, t)
}

export function playEmptyClick() {
  const ac = ctx()
  mechanicalClick(ac, ac.currentTime, 0.35)
}

export function playReload() {
  const ac = ctx()
  const t = ac.currentTime

  // 1. Magazine release — dull thud + rattle
  const rattleBuf = noiseBuffer(ac, 0.12)
  playNoise(ac, rattleBuf, t, 0.1, 0.45, 'bandpass', 900, 1.5)
  playTone(ac, t, 120, 55, 0.08, 0.3)

  // 2. Magazine seat — firm click at ~0.45 s
  mechanicalClick(ac, t + 0.45, 0.7)

  // 3. Slide rack — swoosh then snap at ~0.85 s
  const swBuf = noiseBuffer(ac, 0.2)
  const swSrc = ac.createBufferSource()
  swSrc.buffer = swBuf

  const swFilt = ac.createBiquadFilter()
  swFilt.type = 'bandpass'
  swFilt.frequency.setValueAtTime(1200, t + 0.85)
  swFilt.frequency.exponentialRampToValueAtTime(300, t + 1.0)
  swFilt.Q.value = 1.2

  const swGain = ac.createGain()
  swGain.gain.setValueAtTime(0.5, t + 0.85)
  swGain.gain.exponentialRampToValueAtTime(0.001, t + 1.05)

  swSrc.connect(swFilt)
  swFilt.connect(swGain)
  swGain.connect(ac.destination)
  swSrc.start(t + 0.85)
  swSrc.stop(t + 1.05)

  mechanicalClick(ac, t + 1.0, 0.6)
}

export function playZombieDie() {
  const ac = ctx()
  const t = ac.currentTime

  // Low guttural groan — descending sawtooth through a throat formant
  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(180, t)
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.5)

  const formant = ac.createBiquadFilter()
  formant.type = 'bandpass'
  formant.frequency.setValueAtTime(400, t)
  formant.frequency.exponentialRampToValueAtTime(150, t + 0.5)
  formant.Q.value = 2.5

  const groanGain = ac.createGain()
  groanGain.gain.setValueAtTime(0.6, t)
  groanGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)

  osc.connect(formant)
  formant.connect(groanGain)
  groanGain.connect(ac.destination)
  osc.start(t)
  osc.stop(t + 0.5)

  // Body thud as they fall
  const thudBuf = noiseBuffer(ac, 0.18)
  playNoise(ac, thudBuf, t + 0.1, 0.15, 0.5, 'lowpass', 220, 0.8)
  playTone(ac, t + 0.1, 90, 30, 0.15, 0.4)

  // Trailing wheeze
  const wheezeBuf = noiseBuffer(ac, 0.3)
  playNoise(ac, wheezeBuf, t + 0.25, 0.28, 0.25, 'bandpass', 700, 2)
}

export function playFootstep() {
  const ac = ctx()
  const t = ac.currentTime

  // Dull floor thud
  const buf = noiseBuffer(ac, 0.12)
  playNoise(ac, buf, t, 0.1, 0.55, 'lowpass', 180, 0.7)
  playTone(ac, t, 100, 40, 0.08, 0.3)
}

// Pooled noise buffers for zombie footsteps — created once, reused every call.
// AudioBuffer is read-only sample data; multiple BufferSource nodes can reference it safely.
let _zStepBuf1 = null   // main thud (~0.18 s of noise)
let _zStepBuf2 = null   // scrape (~0.10 s of noise)

// Global throttle: cap simultaneous zombie footstep sounds and minimum gap between plays.
const Z_STEP_MAX  = 3      // max concurrent footstep sounds across all zombies
const Z_STEP_GAP  = 100    // ms minimum between any two global zombie footstep plays
let _zStepActive  = 0
let _zStepLastMs  = 0

export function playZombieFootstep() {
  const now = performance.now()
  if (_zStepActive >= Z_STEP_MAX || now - _zStepLastMs < Z_STEP_GAP) return
  _zStepActive++
  _zStepLastMs = now

  const ac = ctx()
  const t = ac.currentTime

  if (!_zStepBuf1) _zStepBuf1 = noiseBuffer(ac, 0.18)
  if (!_zStepBuf2) _zStepBuf2 = noiseBuffer(ac, 0.10)

  // Heavy dead-weight shuffle — lower and duller than player footstep
  playNoise(ac, _zStepBuf1, t, 0.13, 0.28, 'lowpass', 120, 0.5)
  playTone(ac, t, 80, 35, 0.1, 0.18)

  // Slight scrape / drag
  playNoise(ac, _zStepBuf2, t + 0.03, 0.08, 0.07, 'bandpass', 750, 4)

  setTimeout(() => { _zStepActive-- }, 200)
}

export function playPlankHit() {
  const ac = ctx()
  const t = ac.currentTime

  // Wood thud — heavy impact body
  const thudBuf = noiseBuffer(ac, 0.2)
  playNoise(ac, thudBuf, t, 0.15, 0.55, 'bandpass', 270, 1.0)
  playTone(ac, t, 150, 52, 0.12, 0.42)

  // Sharp crack transient
  const crackBuf = noiseBuffer(ac, 0.07)
  playNoise(ac, crackBuf, t + 0.01, 0.05, 0.28, 'highpass', 2800, 1)

  // Short wood resonance
  playTone(ac, t + 0.02, 370, 190, 0.08, 0.13)
}

export function playScreamerScreech() {
  const ac = ctx()
  const t = ac.currentTime

  // Main piercing scream body
  const osc1 = ac.createOscillator()
  osc1.type = 'sawtooth'
  osc1.frequency.setValueAtTime(980, t)
  osc1.frequency.exponentialRampToValueAtTime(1460, t + 0.22)
  osc1.frequency.exponentialRampToValueAtTime(820, t + 0.65)

  const bp1 = ac.createBiquadFilter()
  bp1.type = 'bandpass'
  bp1.frequency.setValueAtTime(1650, t)
  bp1.Q.value = 3.2

  const g1 = ac.createGain()
  g1.gain.setValueAtTime(0.001, t)
  g1.gain.exponentialRampToValueAtTime(0.34, t + 0.04)
  g1.gain.exponentialRampToValueAtTime(0.18, t + 0.35)
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.7)

  osc1.connect(bp1)
  bp1.connect(g1)
  g1.connect(ac.destination)
  osc1.start(t)
  osc1.stop(t + 0.72)

  // Airy rasp layer
  const raspBuf = noiseBuffer(ac, 0.5)
  playNoise(ac, raspBuf, t + 0.03, 0.42, 0.13, 'bandpass', 2300, 2.5)

  // Low menace undertone
  playTone(ac, t + 0.02, 220, 130, 0.5, 0.08)
}

export function playPlankBreak() {
  const ac = ctx()
  const t = ac.currentTime

  // Main splintering crack — loud highpass burst
  const crackBuf = noiseBuffer(ac, 0.25)
  playNoise(ac, crackBuf, t, 0.22, 0.9, 'highpass', 1800, 0.8)

  // Low wood body breaking — bandpass thud
  const thudBuf = noiseBuffer(ac, 0.3)
  playNoise(ac, thudBuf, t, 0.25, 0.7, 'bandpass', 220, 1.0)
  playTone(ac, t, 130, 40, 0.2, 0.55)

  // Secondary splinter scatter — short mid crackle
  const splinterBuf = noiseBuffer(ac, 0.15)
  playNoise(ac, splinterBuf, t + 0.05, 0.12, 0.35, 'bandpass', 900, 2.5)

  // Resonant wood ring — decaying tone
  playTone(ac, t + 0.03, 320, 140, 0.18, 0.2)
}

export function playPumpAction() {
  const ac = ctx()
  const t = ac.currentTime

  // First stroke — pulling slide back: sharp bandpass snap + woody thud
  const buf1 = noiseBuffer(ac, 0.06)
  playNoise(ac, buf1, t, 0.055, 0.9, 'bandpass', 2200, 4)
  playTone(ac, t, 160, 55, 0.05, 0.55)

  // Slight scrape mid-stroke
  const scrape = noiseBuffer(ac, 0.08)
  playNoise(ac, scrape, t + 0.04, 0.06, 0.25, 'bandpass', 900, 2)

  // Second stroke — slamming forward: harder crack + lower body thud
  const buf2 = noiseBuffer(ac, 0.06)
  playNoise(ac, buf2, t + 0.13, 0.055, 1.1, 'bandpass', 2600, 5)
  playTone(ac, t + 0.13, 200, 65, 0.05, 0.7)
  // Locking click at end of forward stroke
  mechanicalClick(ac, t + 0.18, 0.55)
}

export function playShellThonk() {
  const ac = ctx()
  const t = ac.currentTime

  // Hollow plastic thud — empty shell tube hitting floor
  const thud = noiseBuffer(ac, 0.08)
  playNoise(ac, thud, t, 0.07, 0.6, 'bandpass', 420, 2.5)
  playTone(ac, t, 320, 140, 0.06, 0.35)

  // Short hollow resonance — the tube body ringing
  const osc = ac.createOscillator()
  osc.frequency.setValueAtTime(480 + Math.random() * 60, t + 0.01)
  osc.frequency.exponentialRampToValueAtTime(260, t + 0.09)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.18, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.11)
  osc.connect(g)
  g.connect(ac.destination)
  osc.start(t + 0.01)
  osc.stop(t + 0.11)
}

export function playKnifeSwing() {
  const ac = ctx()
  const t = ac.currentTime

  // Blade whoosh — bandpass noise sweeping upward then decaying
  const buf = noiseBuffer(ac, 0.20)
  const src = ac.createBufferSource()
  src.buffer = buf
  const filt = ac.createBiquadFilter()
  filt.type = 'bandpass'
  filt.frequency.setValueAtTime(600, t)
  filt.frequency.exponentialRampToValueAtTime(3200, t + 0.08)
  filt.frequency.exponentialRampToValueAtTime(500, t + 0.20)
  filt.Q.value = 2.5
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.45, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
  src.connect(filt)
  filt.connect(gain)
  gain.connect(ac.destination)
  src.start(t)
  src.stop(t + 0.22)

  // Metallic blade ring — thin high oscillator
  const osc = ac.createOscillator()
  osc.frequency.setValueAtTime(3800, t + 0.04)
  osc.frequency.exponentialRampToValueAtTime(1600, t + 0.18)
  const ringGain = ac.createGain()
  ringGain.gain.setValueAtTime(0.07, t + 0.04)
  ringGain.gain.exponentialRampToValueAtTime(0.001, t + 0.20)
  osc.connect(ringGain)
  ringGain.connect(ac.destination)
  osc.start(t + 0.04)
  osc.stop(t + 0.20)
}

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
  _masterGain.connect(ac.destination)

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

  const nodes = _musicNodes
  const mg = _masterGain
  _musicNodes = []
  _masterGain = null

  setTimeout(() => {
    nodes.forEach((n) => { try { n.stop?.() } catch (_) {} })
    mg.disconnect()
  }, 2700)
}
