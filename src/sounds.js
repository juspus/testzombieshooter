// Procedural sound synthesis via Web Audio API — no audio files required.

let _ctx = null

function ctx() {
  if (!_ctx) { _ctx = new AudioContext(); _installMasterBus(_ctx) }
  // Resume if browser suspended it (autoplay policy)
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

// ─── master bus (low-HP / slow-mo muffle) ────────────────────────────────────
// Every sound connects to `ac.destination`. We shadow that property on the
// context instance with a lowpass bus, so all existing sounds (incl. panners and
// music) are muffled together with no per-sound edits. Heartbeat/stings use
// _realDest to bypass the filter and stay clear.
let _realDest = null
let _masterLP = null
let _muffleDanger = 0
let _muffleSlow = 0

function _installMasterBus(ac) {
  _realDest = ac.destination
  _masterLP = ac.createBiquadFilter()
  _masterLP.type = 'lowpass'
  _masterLP.frequency.value = 22000
  _masterLP.Q.value = 0.5
  _masterLP.connect(_realDest)
  Object.defineProperty(ac, 'destination', { get: () => _masterLP, configurable: true })
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

function noiseBuffer(ac, seconds) {
  const len = Math.floor(ac.sampleRate * seconds)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

function playNoise(ac, buf, t, duration, gainVal, filterType, freq, q = 1, dest = null) {
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

function playTone(ac, t, startFreq, endFreq, duration, gainVal, dest = null) {
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
function _makeShotChain(ac, satDrive = 2, threshold = -14, dest = null) {
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

function mechanicalClick(ac, t, gainVal = 0.5) {
  const buf = noiseBuffer(ac, 0.04)
  playNoise(ac, buf, t, 0.035, gainVal, 'bandpass', 2400, 3)
  playTone(ac, t, 180, 60, 0.03, gainVal * 0.4)
}

// ─── public sounds ───────────────────────────────────────────────────────────

// ─── per-weapon gunshot implementations ─────────────────────────────────────

// Glock 17 / 9mm pistol
// A real pistol shot is dominated by 150–400 Hz — heavy, guttural, slow to decay.
// The "snare" mistake is too much 2–5 kHz (snare wire territory) and no sustained
// low-mid body. This version leads with the gut and keeps HF as a subtle top-layer.
function _playPistolShot(ac, t, dest = null) {
  // Saturation + compression chain for all blast layers.
  // Drive 2.5 = strong harmonic spreading into the low-mids;
  // threshold -12 / ratio 6:1 compresses hard so the body stays fat.
  const chain = _makeShotChain(ac, 2.5, -12, dest)

  // 1. Sub-bass punch — felt pressure impact, 70→28 Hz, 35 ms.
  //    Saturation spreads harmonics upward, filling 70–200 Hz.
  const subOsc = ac.createOscillator()
  subOsc.type = 'sine'
  subOsc.frequency.setValueAtTime(70, t)
  subOsc.frequency.exponentialRampToValueAtTime(28, t + 0.035)
  const subGain = ac.createGain()
  subGain.gain.setValueAtTime(3.0, t)
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.042)
  subOsc.connect(subGain)
  subGain.connect(chain)
  subOsc.start(t)
  subOsc.stop(t + 0.045)

  // 2. Guttural body — the core of the pistol "BANG".
  //    Wide bandpass (Q 0.6) centred at 200 Hz, decays slowly over 200 ms.
  //    This is what distinguishes a pistol from a snare.
  //    No 2.5 kHz peaking — that was the snare wire rattle.
  const bodyBuf = noiseBuffer(ac, 0.25)
  const bodySrc = ac.createBufferSource()
  bodySrc.buffer = bodyBuf
  const bodyFilt = ac.createBiquadFilter()
  bodyFilt.type = 'bandpass'
  bodyFilt.frequency.value = 200
  bodyFilt.Q.value = 0.6          // wide Q → broad low-mid energy
  const bodyGain = ac.createGain()
  bodyGain.gain.setValueAtTime(3.5, t)
  bodyGain.gain.exponentialRampToValueAtTime(0.4, t + 0.035)
  bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.20)
  bodySrc.connect(bodyFilt)
  bodyFilt.connect(bodyGain)
  bodyGain.connect(chain)
  bodySrc.start(t)
  bodySrc.stop(t + 0.22)

  // 3. Bark layer — 380 Hz band, the "bark" on top of the body.
  //    Shorter than the body (80 ms), adds definition without becoming snare.
  const midBuf = noiseBuffer(ac, 0.12)
  const midSrc = ac.createBufferSource()
  midSrc.buffer = midBuf
  const midFilt = ac.createBiquadFilter()
  midFilt.type = 'bandpass'
  midFilt.frequency.value = 380
  midFilt.Q.value = 0.9
  const midGain = ac.createGain()
  midGain.gain.setValueAtTime(2.2, t)
  midGain.gain.exponentialRampToValueAtTime(0.001, t + 0.085)
  midSrc.connect(midFilt)
  midFilt.connect(midGain)
  midGain.connect(chain)
  midSrc.start(t)
  midSrc.stop(t + 0.09)

  // 4. Initial crack transient — very brief HP burst above 1.2 kHz.
  //    Kept subtle (gain 1.0, 16 ms) so it gives edge not snare.
  const crackBuf = noiseBuffer(ac, 0.018)
  const crackSrc = ac.createBufferSource()
  crackSrc.buffer = crackBuf
  const crackHP = ac.createBiquadFilter()
  crackHP.type = 'highpass'
  crackHP.frequency.value = 1200  // not 4.2 kHz — that was the snare crack
  const crackGain = ac.createGain()
  crackGain.gain.setValueAtTime(1.0, t)
  crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.016)
  crackSrc.connect(crackHP)
  crackHP.connect(crackGain)
  crackGain.connect(chain)
  crackSrc.start(t)
  crackSrc.stop(t + 0.018)

  // 5. Room resonance tail — low-freq bloom, delayed onset (room fills).
  //    130 Hz bandpass, rises 0→25 ms then decays over 280 ms.
  //    Goes dry to destination — the tail shouldn't be re-saturated.
  const roomBuf = noiseBuffer(ac, 0.35)
  const roomSrc = ac.createBufferSource()
  roomSrc.buffer = roomBuf
  const roomFilt = ac.createBiquadFilter()
  roomFilt.type = 'bandpass'
  roomFilt.frequency.value = 130
  roomFilt.Q.value = 1.2
  const roomGain = ac.createGain()
  roomGain.gain.setValueAtTime(0.001, t)
  roomGain.gain.linearRampToValueAtTime(0.55, t + 0.025)  // room builds up
  roomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.30)
  roomSrc.connect(roomFilt)
  roomFilt.connect(roomGain)
  roomGain.connect(dest ?? ac.destination)
  roomSrc.start(t)
  roomSrc.stop(t + 0.32)

  // 6. Slide cycling back (~78 ms) — mechanical, dry
  const slideBackBuf = noiseBuffer(ac, 0.032)
  playNoise(ac, slideBackBuf, t + 0.076, 0.030, 0.48, 'bandpass', 2700, 4.5, dest)
  playTone(ac, t + 0.076, 165, 82, 0.028, 0.30, dest)

  // 7. Slide snapping forward + chambering (~118 ms)
  const slideFwdBuf = noiseBuffer(ac, 0.026)
  playNoise(ac, slideFwdBuf, t + 0.116, 0.024, 0.58, 'bandpass', 3300, 5.5, dest)
  playTone(ac, t + 0.116, 205, 100, 0.022, 0.36, dest)
}

// 12-gauge pump shotgun — cannon
// No saturation chain: WaveShaper at drive 3 converts 60-120 Hz content
// into midrange harmonics, killing the guttural low body.
// Clean routing + sawtooth growl + setTargetAtTime sustained decay.
function _playShotgunShot(ac, t, dest = null) {
  // All layers → out(0.55) → limiter → destination.
  // out.gain 0.55 keeps shotgun noticeably louder than pistol while
  // the limiter prevents hard clipping.
  const out = ac.createGain()
  out.gain.value = 0.55

  const limiter = ac.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value     = 1
  limiter.ratio.value    = 20
  limiter.attack.value   = 0.002
  limiter.release.value  = 0.200
  out.connect(limiter)
  limiter.connect(dest ?? ac.destination)

  // 1. Sub hit — 60→25 Hz clean sine, 95 ms.
  //    Clean sine = no midrange artifacts from saturation.
  const subOsc = ac.createOscillator()
  subOsc.type = 'sine'
  subOsc.frequency.setValueAtTime(60, t)
  subOsc.frequency.exponentialRampToValueAtTime(25, t + 0.095)
  const subGain = ac.createGain()
  subGain.gain.setValueAtTime(4.0, t)
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.105)
  subOsc.connect(subGain)
  subGain.connect(out)
  subOsc.start(t)
  subOsc.stop(t + 0.110)

  // 2. Sawtooth growl — 55→22 Hz, LP 220 Hz, τ=150 ms (shorter, punchier).
  //    Harmonics at 55, 110, 165, 220 Hz give the "grrr" cannon texture.
  const growlOsc = ac.createOscillator()
  growlOsc.type = 'sawtooth'
  growlOsc.frequency.setValueAtTime(55, t)
  growlOsc.frequency.exponentialRampToValueAtTime(22, t + 0.200)
  const growlFilt = ac.createBiquadFilter()
  growlFilt.type = 'lowpass'
  growlFilt.frequency.value = 220
  const growlGain = ac.createGain()
  growlGain.gain.setValueAtTime(3.2, t)
  growlGain.gain.setTargetAtTime(0.001, t, 0.15)
  growlOsc.connect(growlFilt)
  growlFilt.connect(growlGain)
  growlGain.connect(out)
  growlOsc.start(t)
  growlOsc.stop(t + 0.320)

  // 3. Core boom body — 85 Hz, Q 0.40 (covers 45–160 Hz).
  //    τ=130 ms: punchy bloom that clears by ~400 ms.
  const bodyBuf = noiseBuffer(ac, 0.55)
  const bodySrc = ac.createBufferSource()
  bodySrc.buffer = bodyBuf
  const bodyFilt = ac.createBiquadFilter()
  bodyFilt.type = 'bandpass'
  bodyFilt.frequency.value = 85
  bodyFilt.Q.value = 0.40
  const bodyGain = ac.createGain()
  bodyGain.gain.setValueAtTime(4.5, t)
  bodyGain.gain.setTargetAtTime(0.001, t + 0.040, 0.130)
  bodySrc.connect(bodyFilt)
  bodyFilt.connect(bodyGain)
  bodyGain.connect(out)
  bodySrc.start(t)
  bodySrc.stop(t + 0.560)

  // 4. Upper body — 220 Hz, 180 ms.
  const upBuf = noiseBuffer(ac, 0.20)
  const upSrc = ac.createBufferSource()
  upSrc.buffer = upBuf
  const upFilt = ac.createBiquadFilter()
  upFilt.type = 'bandpass'
  upFilt.frequency.value = 220
  upFilt.Q.value = 0.8
  const upGain = ac.createGain()
  upGain.gain.setValueAtTime(2.5, t)
  upGain.gain.exponentialRampToValueAtTime(0.001, t + 0.180)
  upSrc.connect(upFilt)
  upFilt.connect(upGain)
  upGain.connect(out)
  upSrc.start(t)
  upSrc.stop(t + 0.200)

  // 5. Bark — 300 Hz, 140 ms. Fills the 250–400 Hz gap that was "empty".
  //    This is the primary "presence" band that makes the shot feel full.
  const barkBuf = noiseBuffer(ac, 0.16)
  const barkSrc = ac.createBufferSource()
  barkSrc.buffer = barkBuf
  const barkFilt = ac.createBiquadFilter()
  barkFilt.type = 'bandpass'
  barkFilt.frequency.value = 300
  barkFilt.Q.value = 0.9
  const barkGain = ac.createGain()
  barkGain.gain.setValueAtTime(3.5, t)
  barkGain.gain.exponentialRampToValueAtTime(0.001, t + 0.140)
  barkSrc.connect(barkFilt)
  barkFilt.connect(barkGain)
  barkGain.connect(out)
  barkSrc.start(t)
  barkSrc.stop(t + 0.155)

  // 6. Mid burst — 620 Hz, 55 ms. Fills 500–750 Hz gap for density.
  const midBuf = noiseBuffer(ac, 0.065)
  playNoise(ac, midBuf, t, 0.050, 2.2, 'bandpass', 620, 1.2, out)

  // 7. Pellet spray — 950 Hz, 32 ms. Shotgun "crack" texture, boosted.
  const sprayBuf = noiseBuffer(ac, 0.036)
  playNoise(ac, sprayBuf, t, 0.030, 2.2, 'bandpass', 950, 1.0, out)

  // 8. Muzzle crack — HP 1.5 kHz, 18 ms. Sharp edge on the initial transient.
  const crackBuf = noiseBuffer(ac, 0.020)
  playNoise(ac, crackBuf, t, 0.016, 2.2, 'highpass', 1500, 0.8, out)

  // 9. Room tail — 75 Hz, fills in 30 ms, τ=180 ms. ~550 ms total.
  //    Shorter than before — cabin shake, not a reverb cathedral.
  const roomBuf = noiseBuffer(ac, 0.55)
  const roomSrc = ac.createBufferSource()
  roomSrc.buffer = roomBuf
  const roomFilt = ac.createBiquadFilter()
  roomFilt.type = 'bandpass'
  roomFilt.frequency.value = 75
  roomFilt.Q.value = 0.9
  const roomGain = ac.createGain()
  roomGain.gain.setValueAtTime(0.001, t)
  roomGain.gain.linearRampToValueAtTime(2.5, t + 0.030)
  roomGain.gain.setTargetAtTime(0.001, t + 0.030, 0.180)
  roomSrc.connect(roomFilt)
  roomFilt.connect(roomGain)
  roomGain.connect(out)
  roomSrc.start(t)
  roomSrc.stop(t + 0.55)
}

// Generic fallback (used while other weapon sounds are not yet implemented)
function _playGenericShot(ac, t, dest = null) {
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
  crackGain.connect(dest ?? ac.destination)
  crack.start(t)
  crack.stop(t + 0.18)

  playTone(ac, t, 220, 35, 0.12, 1.2, dest)
  playTone(ac, t + 0.02, 80, 30, 0.1, 0.5, dest)
}

export function playGunshot(weapon = 'pistol') {
  const ac = ctx()
  const t  = ac.currentTime
  if (weapon === 'pistol')  return _playPistolShot(ac, t)
  if (weapon === 'shotgun') return _playShotgunShot(ac, t)
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

export function playZombieDie(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)

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
  groanGain.connect(dest ?? ac.destination)
  osc.start(t)
  osc.stop(t + 0.5)

  // Body thud as they fall
  const thudBuf = noiseBuffer(ac, 0.18)
  playNoise(ac, thudBuf, t + 0.1, 0.15, 0.5, 'lowpass', 220, 0.8, dest)
  playTone(ac, t + 0.1, 90, 30, 0.15, 0.4, dest)

  // Trailing wheeze
  const wheezeBuf = noiseBuffer(ac, 0.3)
  playNoise(ac, wheezeBuf, t + 0.25, 0.28, 0.25, 'bandpass', 700, 2, dest)
}

export function playFootstep(dest = null) {
  const ac = ctx()
  const t = ac.currentTime

  // Dull floor thud
  const buf = noiseBuffer(ac, 0.12)
  playNoise(ac, buf, t, 0.1, 0.55, 'lowpass', 180, 0.7, dest)
  playTone(ac, t, 100, 40, 0.08, 0.3, dest)
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

export function playZombieFootstep(x, y, z) {
  const now = performance.now()
  if (_zStepActive >= Z_STEP_MAX || now - _zStepLastMs < Z_STEP_GAP) return
  _zStepActive++
  _zStepLastMs = now

  const ac = ctx()
  const t = ac.currentTime

  if (!_zStepBuf1) _zStepBuf1 = noiseBuffer(ac, 0.18)
  if (!_zStepBuf2) _zStepBuf2 = noiseBuffer(ac, 0.10)
  const dest = _zombieOutput(ac, x, y, z)

  // Heavy dead-weight shuffle — lower and duller than player footstep
  playNoise(ac, _zStepBuf1, t, 0.13, 0.28, 'lowpass', 120, 0.5, dest)
  playTone(ac, t, 80, 35, 0.1, 0.18, dest)

  // Slight scrape / drag
  playNoise(ac, _zStepBuf2, t + 0.03, 0.08, 0.07, 'bandpass', 750, 4, dest)

  setTimeout(() => { _zStepActive-- }, 200)
}

export function playPlankHit(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)

  // Wood thud — heavy impact body
  const thudBuf = noiseBuffer(ac, 0.2)
  playNoise(ac, thudBuf, t, 0.15, 0.55, 'bandpass', 270, 1.0, dest)
  playTone(ac, t, 150, 52, 0.12, 0.42, dest)

  // Sharp crack transient
  const crackBuf = noiseBuffer(ac, 0.07)
  playNoise(ac, crackBuf, t + 0.01, 0.05, 0.28, 'highpass', 2800, 1, dest)

  // Short wood resonance
  playTone(ac, t + 0.02, 370, 190, 0.08, 0.13, dest)
}

export function playScreamerScreech(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)

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
  g1.connect(dest ?? ac.destination)
  osc1.start(t)
  osc1.stop(t + 0.72)

  // Airy rasp layer
  const raspBuf = noiseBuffer(ac, 0.5)
  playNoise(ac, raspBuf, t + 0.03, 0.42, 0.13, 'bandpass', 2300, 2.5, dest)

  // Low menace undertone
  playTone(ac, t + 0.02, 220, 130, 0.5, 0.08, dest)
}

export function playPlankBreak(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)

  // Main splintering crack — loud highpass burst
  const crackBuf = noiseBuffer(ac, 0.25)
  playNoise(ac, crackBuf, t, 0.22, 0.9, 'highpass', 1800, 0.8, dest)

  // Low wood body breaking — bandpass thud
  const thudBuf = noiseBuffer(ac, 0.3)
  playNoise(ac, thudBuf, t, 0.25, 0.7, 'bandpass', 220, 1.0, dest)
  playTone(ac, t, 130, 40, 0.2, 0.55, dest)

  // Secondary splinter scatter — short mid crackle
  const splinterBuf = noiseBuffer(ac, 0.15)
  playNoise(ac, splinterBuf, t + 0.05, 0.12, 0.35, 'bandpass', 900, 2.5, dest)

  // Resonant wood ring — decaying tone
  playTone(ac, t + 0.03, 320, 140, 0.18, 0.2, dest)
}

export function playGlassShatter(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)

  // Sharp initial crack — bright highpass burst
  const crackBuf = noiseBuffer(ac, 0.12)
  playNoise(ac, crackBuf, t, 0.10, 0.9, 'highpass', 3200, 1.2, dest)

  // Cascading shard scatter — brighter noise, decays a bit slower than the crack
  const scatterBuf = noiseBuffer(ac, 0.4)
  playNoise(ac, scatterBuf, t + 0.02, 0.38, 0.5, 'bandpass', 5200, 1.8, dest)

  // High glassy ring tones — a few overtones so it doesn't read as generic noise
  const ringFreqs = [2600, 3400, 4200]
  ringFreqs.forEach((f, i) => {
    playTone(ac, t + 0.01 + i * 0.015, f + Math.random() * 200, f * 0.6, 0.25, 0.12, dest)
  })

  // Low frame thud as the pane drops out of its housing
  const thudBuf = noiseBuffer(ac, 0.15)
  playNoise(ac, thudBuf, t + 0.05, 0.14, 0.4, 'bandpass', 180, 1.0, dest)
}

export function playPumpAction() {
  const ac = ctx()
  const t = ac.currentTime

  // "chik" — slide racking back: tight high snap at 3.8 kHz, 22 ms.
  // No low tones — those were making it sound clunky.
  const c1 = noiseBuffer(ac, 0.026)
  playNoise(ac, c1, t, 0.022, 0.80, 'bandpass', 3800, 7.0)

  // "chik" — slamming forward: slightly heavier snap at 3.2 kHz, 22 ms.
  const c2 = noiseBuffer(ac, 0.026)
  playNoise(ac, c2, t + 0.110, 0.022, 1.05, 'bandpass', 3200, 6.5)
  // Hard lock click as bolt seats — gives the definitive end of the stroke.
  mechanicalClick(ac, t + 0.133, 0.70)
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

export function playKnifeSwing(dest = null) {
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
  gain.connect(dest ?? ac.destination)
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
  ringGain.connect(dest ?? ac.destination)
  osc.start(t + 0.04)
  osc.stop(t + 0.20)
}

// ─── flamethrower ────────────────────────────────────────────────────────────

let _flameNodes = null

/// Continuous gas-jet roar: filtered noise loop + low rumble + hissing top end.
// start/stop pair — call start while the trigger is held, stop on release.
export function startFlamethrowerSound() {
  if (_flameNodes) return
  const ac = ctx()
  const t = ac.currentTime

  const out = ac.createGain()
  out.gain.setValueAtTime(0, t)
  out.gain.linearRampToValueAtTime(0.5, t + 0.08)
  out.connect(ac.destination)

  // Core roar — looping noise through a low bandpass, gives the "whoosh" body
  const roarBuf = noiseBuffer(ac, 1.0)
  const roarSrc = ac.createBufferSource()
  roarSrc.buffer = roarBuf
  roarSrc.loop = true
  const roarFilt = ac.createBiquadFilter()
  roarFilt.type = 'bandpass'
  roarFilt.frequency.value = 320
  roarFilt.Q.value = 0.7
  const roarGain = ac.createGain()
  roarGain.gain.value = 0.9
  roarSrc.connect(roarFilt)
  roarFilt.connect(roarGain)
  roarGain.connect(out)
  roarSrc.start(t)

  // Hiss — high-frequency noise loop for the gas jet edge
  const hissBuf = noiseBuffer(ac, 1.0)
  const hissSrc = ac.createBufferSource()
  hissSrc.buffer = hissBuf
  hissSrc.loop = true
  const hissFilt = ac.createBiquadFilter()
  hissFilt.type = 'highpass'
  hissFilt.frequency.value = 2600
  const hissGain = ac.createGain()
  hissGain.gain.value = 0.18
  hissSrc.connect(hissFilt)
  hissFilt.connect(hissGain)
  hissGain.connect(out)
  hissSrc.start(t)

  // Low rumble — gives the spray weight
  const rumble = ac.createOscillator()
  rumble.type = 'sawtooth'
  rumble.frequency.value = 48
  const rumbleFilt = ac.createBiquadFilter()
  rumbleFilt.type = 'lowpass'
  rumbleFilt.frequency.value = 140
  const rumbleGain = ac.createGain()
  rumbleGain.gain.value = 0.35
  rumble.connect(rumbleFilt)
  rumbleFilt.connect(rumbleGain)
  rumbleGain.connect(out)
  rumble.start(t)

  // Slow flicker LFO on overall gain so the roar isn't perfectly static
  const lfo = ac.createOscillator()
  lfo.frequency.value = 7
  const lfoGain = ac.createGain()
  lfoGain.gain.value = 0.06
  lfo.connect(lfoGain)
  lfoGain.connect(out.gain)
  lfo.start(t)

  _flameNodes = { out, roarSrc, hissSrc, rumble, lfo }
}

export function stopFlamethrowerSound() {
  if (!_flameNodes) return
  const ac = ctx()
  const t = ac.currentTime
  const { out, roarSrc, hissSrc, rumble, lfo } = _flameNodes
  _flameNodes = null

  out.gain.cancelScheduledValues(t)
  out.gain.setValueAtTime(out.gain.value, t)
  out.gain.linearRampToValueAtTime(0, t + 0.12)

  setTimeout(() => {
    try { roarSrc.stop() } catch (_) {}
    try { hissSrc.stop() } catch (_) {}
    try { rumble.stop() } catch (_) {}
    try { lfo.stop() } catch (_) {}
    out.disconnect()
  }, 200)
}

// ─── remote player spatial audio ─────────────────────────────────────────────

// Keep the AudioContext listener's pose in sync with the local camera each frame.
// forwardX / forwardZ are the camera's -sin(yaw) / -cos(yaw) unit vector components.
export function setListenerPose(x, y, z, forwardX, forwardZ) {
  if (!_ctx) return
  const ac = _ctx
  ac.listener.positionX.value = x
  ac.listener.positionY.value = y
  ac.listener.positionZ.value = z
  ac.listener.forwardX.value = forwardX
  ac.listener.forwardY.value = 0
  ac.listener.forwardZ.value = forwardZ
  ac.listener.upX.value = 0
  ac.listener.upY.value = 1
  ac.listener.upZ.value = 0
}

// Create a PannerNode rooted at a world position and connected to ac.destination.
// All audio routed through this node will be spatially positioned in 3-D.
function _makeSpatialOutput(ac, x, y, z, rolloff = 1) {
  const panner = ac.createPanner()
  panner.panningModel   = 'equalpower'
  panner.distanceModel  = 'linear'
  panner.refDistance    = 1    // full volume up to 1 unit away
  panner.maxDistance    = 32   // ~= cabin diagonal, inaudible beyond this
  panner.rolloffFactor  = rolloff
  panner.positionX.value = x
  panner.positionY.value = y
  panner.positionZ.value = z
  panner.connect(ac.destination)
  return panner
}

// ─── positional zombie / world sounds ────────────────────────────────────────

// Returns a PannerNode at (x,y,z), or null when no position was given (legacy
// no-arg callers such as TestLab keep playing flat, centred audio).
// Zombie sounds roll off a little faster than the co-op partner's.
function _zombieOutput(ac, x, y, z) {
  if (typeof x !== 'number' || typeof z !== 'number') return null
  return _makeSpatialOutput(ac, x, typeof y === 'number' ? y : 1, z, 1.3)
}

// Idle groan. Globally rate-limited so a full wave never becomes a wall of noise:
// at most Z_GROAN_MAX voices at once, and the more voices are already playing the
// closer a zombie has to be to get one (nearest zombies win). `dist` is the
// zombie's distance to the player; `pitch` lets types sound different.
const Z_GROAN_MAX = 3
let _zGroanActive = 0
let _zGroanLastMs = 0
export function zombieGroanAllowed(dist = 0) {
  if (_zGroanActive >= Z_GROAN_MAX) return false
  if (performance.now() - _zGroanLastMs < 300) return false
  const reach = _zGroanActive === 0 ? 26 : _zGroanActive === 1 ? 16 : 9
  return dist <= reach
}

export function playZombieGroan(x, y, z, pitch = 1, dist = 0) {
  if (!zombieGroanAllowed(dist)) return false
  _zGroanActive++
  _zGroanLastMs = performance.now()
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  const dur = 0.9 + Math.random() * 0.5

  // Throaty drone: detuned sawtooth with a slow wobble, formant-filtered
  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  const f0 = (85 + Math.random() * 25) * pitch
  osc.frequency.setValueAtTime(f0 * 1.25, t)
  osc.frequency.linearRampToValueAtTime(f0, t + dur * 0.35)
  osc.frequency.linearRampToValueAtTime(f0 * 0.7, t + dur)

  const lfo = ac.createOscillator()
  lfo.frequency.value = 5 + Math.random() * 3
  const lfoGain = ac.createGain()
  lfoGain.gain.value = 4
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)

  const formant = ac.createBiquadFilter()
  formant.type = 'bandpass'
  formant.frequency.setValueAtTime(320 * pitch, t)
  formant.frequency.linearRampToValueAtTime(520 * pitch, t + dur * 0.4)
  formant.frequency.linearRampToValueAtTime(260 * pitch, t + dur)
  formant.Q.value = 3

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.001, t)
  gain.gain.exponentialRampToValueAtTime(0.32, t + 0.12)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)

  osc.connect(formant)
  formant.connect(gain)
  gain.connect(dest ?? ac.destination)
  osc.start(t); lfo.start(t)
  osc.stop(t + dur); lfo.stop(t + dur)

  // Wet breath rasp
  const buf = noiseBuffer(ac, 0.6)
  playNoise(ac, buf, t + 0.05, dur * 0.8, 0.07, 'bandpass', 900 * pitch, 2, dest)

  setTimeout(() => { _zGroanActive-- }, dur * 1000 + 50)
  return true
}

// Play a weapon-specific gunshot coming from the remote player's world position.
export function playRemoteGunshot(weapon, x, y, z) {
  const ac   = ctx()
  const t    = ac.currentTime
  const dest = _makeSpatialOutput(ac, x, y, z)
  if (weapon === 'pistol')  return _playPistolShot(ac, t, dest)
  if (weapon === 'shotgun') return _playShotgunShot(ac, t, dest)
  _playGenericShot(ac, t, dest)   // ak47 / deagle fallback
}

// Play a footstep coming from the remote player's world position.
export function playRemoteFootstep(x, y, z) {
  const ac   = ctx()
  const dest = _makeSpatialOutput(ac, x, y, z)
  playFootstep(dest)
}

// Play a knife-swing whoosh coming from the remote player's world position.
export function playRemoteKnifeSwing(x, y, z) {
  const ac   = ctx()
  const dest = _makeSpatialOutput(ac, x, y, z)
  playKnifeSwing(dest)
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
  _intenseGain.connect(ac.destination)

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


// ─── Wave 1 "Feel": hit feedback, heartbeat, last-kill sting ──────────────────
// Kept deliberately quiet and short. All go through the master bus except the
// heartbeat and sting (unfiltered so they cut through the low-HP muffle).

export function playHitTick() {
  const ac = ctx()
  const t = ac.currentTime
  playTone(ac, t, 1900, 1300, 0.035, 0.07)
  playNoise(ac, noiseBuffer(ac, 0.03), t, 0.02, 0.05, 'highpass', 3500, 1)
}

// Sharper metallic "tink" for headshots
export function playHeadshotTink() {
  const ac = ctx()
  const t = ac.currentTime
  playTone(ac, t, 3400, 3000, 0.12, 0.09)
  playTone(ac, t, 5100, 4600, 0.07, 0.04)
  playTone(ac, t, 1800, 1500, 0.05, 0.05)
}

// Low confirming thump + tick on a kill
export function playKillConfirm(headshot = false) {
  const ac = ctx()
  const t = ac.currentTime
  playTone(ac, t, 240, 90, 0.11, 0.16)
  playTone(ac, t + 0.015, headshot ? 3000 : 1500, headshot ? 2600 : 1100, 0.07, 0.06)
}

// Final-kill sting: sub drop + rising shimmer, bypasses the muffle filter
export function playLastKillSting() {
  const ac = ctx()
  const t = ac.currentTime
  const out = _realDest ?? ac.destination
  playTone(ac, t, 130, 38, 0.9, 0.35, out)
  playTone(ac, t, 520, 1040, 0.5, 0.05, out)
  playNoise(ac, noiseBuffer(ac, 0.9), t, 0.9, 0.12, 'bandpass', 700, 0.8, out)
}

// Heartbeat loop ("lub-dub"). intensity 0..1 speeds it up and makes it louder.
let _hbTimer = null
let _hbIntensity = 0
let _hbNext = 0

function _beat(ac, t, vol) {
  const out = _realDest ?? ac.destination
  playTone(ac, t, 62, 34, 0.14, vol, out)
  playTone(ac, t + 0.2, 52, 30, 0.12, vol * 0.7, out)
}

function _hbRun() {
  const ac = ctx()
  const period = 1.05 - 0.4 * _hbIntensity
  const vol = 0.55 + 0.45 * _hbIntensity
  if (_hbNext < ac.currentTime) _hbNext = ac.currentTime + 0.05
  while (_hbNext < ac.currentTime + 0.25) {
    _beat(ac, _hbNext, vol)
    _hbNext += period
  }
  _hbTimer = setTimeout(_hbRun, 100)
}

export function startHeartbeat(intensity = 0.5) {
  _hbIntensity = intensity
  if (_hbTimer !== null) return
  _hbNext = 0
  _hbRun()
}

export function setHeartbeatIntensity(intensity) { _hbIntensity = intensity }

export function stopHeartbeat() {
  if (_hbTimer !== null) { clearTimeout(_hbTimer); _hbTimer = null }
}

// Slow-mo muffle (separate channel from the low-HP one; the louder wins)
export function setSlowMoMuffle(amount) {
  _muffleSlow = amount
  _applyMuffle()
}

// ─── Wave 3: buyable doors ────────────────────────────────────────────────────
// Register ding + barricade boards ripped off + heavy thud as the door clears.
export function playDoorOpen(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)

  // Coin "ka-ching" so the purchase reads as a purchase
  playTone(ac, t, 1320, 1320, 0.09, 0.10, dest)
  playTone(ac, t + 0.07, 1760, 1760, 0.18, 0.09, dest)

  // Nails squealing out of old wood
  playNoise(ac, noiseBuffer(ac, 0.35), t + 0.04, 0.3, 0.22, 'bandpass', 2400, 4, dest)
  playTone(ac, t + 0.04, 520, 260, 0.28, 0.07, dest)

  // Boards clattering down
  playNoise(ac, noiseBuffer(ac, 0.45), t + 0.12, 0.4, 0.5, 'bandpass', 380, 1.2, dest)
  playNoise(ac, noiseBuffer(ac, 0.2), t + 0.2, 0.15, 0.4, 'highpass', 1500, 1, dest)

  // Final heavy thud
  playTone(ac, t + 0.3, 110, 38, 0.3, 0.5, dest)
}

// Dull "locked" knock for a door you can't afford / can't reach yet.
export function playDoorDenied() {
  const ac = ctx()
  const t = ac.currentTime
  playTone(ac, t, 180, 120, 0.09, 0.25)
  playTone(ac, t + 0.1, 150, 90, 0.12, 0.25)
  playNoise(ac, noiseBuffer(ac, 0.08), t, 0.06, 0.15, 'bandpass', 500, 2)
}
