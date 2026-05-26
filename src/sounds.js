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
function _makeShotChain(ac, satDrive = 2, threshold = -14) {
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
  makeupGain.connect(ac.destination)

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
function _playPistolShot(ac, t) {
  // Saturation + compression chain for all blast layers.
  // Drive 2.5 = strong harmonic spreading into the low-mids;
  // threshold -12 / ratio 6:1 compresses hard so the body stays fat.
  const chain = _makeShotChain(ac, 2.5, -12)

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
  roomGain.connect(ac.destination)
  roomSrc.start(t)
  roomSrc.stop(t + 0.32)

  // 6. Slide cycling back (~78 ms) — mechanical, dry
  const slideBackBuf = noiseBuffer(ac, 0.032)
  playNoise(ac, slideBackBuf, t + 0.076, 0.030, 0.48, 'bandpass', 2700, 4.5)
  playTone(ac, t + 0.076, 165, 82, 0.028, 0.30)

  // 7. Slide snapping forward + chambering (~118 ms)
  const slideFwdBuf = noiseBuffer(ac, 0.026)
  playNoise(ac, slideFwdBuf, t + 0.116, 0.024, 0.58, 'bandpass', 3300, 5.5)
  playTone(ac, t + 0.116, 205, 100, 0.022, 0.36)
}

// 12-gauge pump shotgun — "tuTUUUUF"
// Waveform target: near-instant rise → wide dense peak (300 ms) → smooth tail (1.5 s+).
// The limiter holds output at max while the summed layers are above threshold,
// creating the plateau automatically. Once layers drop below threshold, the
// room tail (τ=1200 ms) carries the long decay.
// "tu" = short 350 Hz click at t=0. "TUUUUF" = instant-onset boom + tail.
function _playShotgunShot(ac, t) {
  // out.gain = 1.0 → the shotgun hits roughly twice as loud as the pistol.
  // Higher gain also keeps layers above the limiter threshold for longer,
  // extending the "wall of sound" plateau to ~700 ms (body) + ~2 s (room).
  const out = ac.createGain()
  out.gain.value = 1.0

  const limiter = ac.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value     = 1
  limiter.ratio.value    = 20
  limiter.attack.value   = 0.002
  limiter.release.value  = 0.250
  out.connect(limiter)
  limiter.connect(ac.destination)

  // ── "tu" — short percussive click, 0–30 ms ───────────────────────────
  // 350 Hz bandpass + brief sine = the plosive onset before the main boom.
  const tuBuf = noiseBuffer(ac, 0.034)
  playNoise(ac, tuBuf, t, 0.030, 2.2, 'bandpass', 350, 1.8, out)

  const tuOsc = ac.createOscillator()
  tuOsc.type = 'sine'
  tuOsc.frequency.setValueAtTime(88, t)
  tuOsc.frequency.exponentialRampToValueAtTime(44, t + 0.028)
  const tuGain = ac.createGain()
  tuGain.gain.setValueAtTime(2.0, t)
  tuGain.gain.exponentialRampToValueAtTime(0.001, t + 0.032)
  tuOsc.connect(tuGain)
  tuGain.connect(out)
  tuOsc.start(t)
  tuOsc.stop(t + 0.035)

  // ── "TUUUUF" — INSTANT onset, all layers at full gain from t=0 ───────
  // No swell. The limiter pins everything at max while the sum is above
  // threshold (~300–500 ms), then natural decay takes over.

  // Sub: 62→24 Hz, 130 ms
  const subOsc = ac.createOscillator()
  subOsc.type = 'sine'
  subOsc.frequency.setValueAtTime(62, t)
  subOsc.frequency.exponentialRampToValueAtTime(24, t + 0.130)
  const subGain = ac.createGain()
  subGain.gain.setValueAtTime(4.2, t)
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.140)
  subOsc.connect(subGain)
  subGain.connect(out)
  subOsc.start(t)
  subOsc.stop(t + 0.145)

  // Growl 1: 55→22 Hz sawtooth, LP 230 Hz — instant, τ=350 ms decay
  const g1Osc = ac.createOscillator()
  g1Osc.type = 'sawtooth'
  g1Osc.frequency.setValueAtTime(55, t)
  g1Osc.frequency.exponentialRampToValueAtTime(22, t + 0.350)
  const g1Filt = ac.createBiquadFilter()
  g1Filt.type = 'lowpass'
  g1Filt.frequency.value = 230
  const g1Gain = ac.createGain()
  g1Gain.gain.setValueAtTime(3.5, t)
  g1Gain.gain.setTargetAtTime(0.001, t, 0.35)
  g1Osc.connect(g1Filt)
  g1Filt.connect(g1Gain)
  g1Gain.connect(out)
  g1Osc.start(t)
  g1Osc.stop(t + 0.600)

  // Growl 2: 59→26 Hz detuned, 4 Hz beat — instant, τ=280 ms decay
  const g2Osc = ac.createOscillator()
  g2Osc.type = 'sawtooth'
  g2Osc.frequency.setValueAtTime(59, t)
  g2Osc.frequency.exponentialRampToValueAtTime(26, t + 0.280)
  const g2Filt = ac.createBiquadFilter()
  g2Filt.type = 'lowpass'
  g2Filt.frequency.value = 200
  const g2Gain = ac.createGain()
  g2Gain.gain.setValueAtTime(2.8, t)
  g2Gain.gain.setTargetAtTime(0.001, t, 0.28)
  g2Osc.connect(g2Filt)
  g2Filt.connect(g2Gain)
  g2Gain.connect(out)
  g2Osc.start(t)
  g2Osc.stop(t + 0.500)

  // Core boom body: 78 Hz Q 0.38 — instant at 4.5, flat 50 ms, then τ=350 ms.
  // Limiter holds output at max until ~500 ms, then natural decay begins.
  const bodyBuf = noiseBuffer(ac, 1.50)
  const bodySrc = ac.createBufferSource()
  bodySrc.buffer = bodyBuf
  const bodyFilt = ac.createBiquadFilter()
  bodyFilt.type = 'bandpass'
  bodyFilt.frequency.value = 65   // lower than pistol's 200 Hz centre
  bodyFilt.Q.value = 0.38
  const bodyGain = ac.createGain()
  bodyGain.gain.setValueAtTime(4.5, t)
  bodyGain.gain.setTargetAtTime(0.001, t + 0.050, 0.35)
  bodySrc.connect(bodyFilt)
  bodyFilt.connect(bodyGain)
  bodyGain.connect(out)
  bodySrc.start(t)
  bodySrc.stop(t + 1.50)

  // Upper body: 185 Hz, instant at 2.5, 380 ms decay
  const upBuf = noiseBuffer(ac, 0.42)
  const upSrc = ac.createBufferSource()
  upSrc.buffer = upBuf
  const upFilt = ac.createBiquadFilter()
  upFilt.type = 'bandpass'
  upFilt.frequency.value = 185
  upFilt.Q.value = 0.7
  const upGain = ac.createGain()
  upGain.gain.setValueAtTime(2.5, t)
  upGain.gain.exponentialRampToValueAtTime(0.001, t + 0.380)
  upSrc.connect(upFilt)
  upFilt.connect(upGain)
  upGain.connect(out)
  upSrc.start(t)
  upSrc.stop(t + 0.400)

  // Muzzle snap: HP 900 Hz, 20 ms — gives the "TU" initial edge
  const snapBuf = noiseBuffer(ac, 0.022)
  playNoise(ac, snapBuf, t, 0.018, 1.8, 'highpass', 900, 0.8, out)

  // Room tail: 60 Hz, fills in 50 ms, τ=1200 ms — rings the cabin for 4 s.
  // While room + body are above limiter threshold, output stays pinned at max.
  // After ~1 s, the natural room tail decays smoothly to silence.
  const roomBuf = noiseBuffer(ac, 4.20)
  const roomSrc = ac.createBufferSource()
  roomSrc.buffer = roomBuf
  const roomFilt = ac.createBiquadFilter()
  roomFilt.type = 'bandpass'
  roomFilt.frequency.value = 60
  roomFilt.Q.value = 0.8
  const roomGain = ac.createGain()
  roomGain.gain.setValueAtTime(0.001, t)
  roomGain.gain.linearRampToValueAtTime(3.5, t + 0.050)   // louder room peak
  roomGain.gain.setTargetAtTime(0.001, t + 0.050, 1.50)  // τ=1500 ms — even longer
  roomSrc.connect(roomFilt)
  roomFilt.connect(roomGain)
  roomGain.connect(out)
  roomSrc.start(t)
  roomSrc.stop(t + 4.20)
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
