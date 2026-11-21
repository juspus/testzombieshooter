// Zombie, special-zombie and spider sounds.
import { modFx } from '../modifiers'   // Wave 3: Fog modifier boosts idle groans
import { ctx, noiseBuffer, playNoise, playTone } from './core'
import { _zombieOutput } from './spatial'

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
  const reach = (_zGroanActive === 0 ? 26 : _zGroanActive === 1 ? 16 : 9) * modFx.groanReach
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
  gain.gain.exponentialRampToValueAtTime(0.32 * modFx.groanGain, t + 0.12)
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

// ─── Wave 3 special zombies ───────────────────────────────────────────────────

// Bullet glancing off armour: bright metallic "tink" with an inharmonic ring.
// Tone-only (no buffer allocation) and rate-limited so a full-auto spray stays a rattle.
let _armorPingMs = 0
export function playArmorPing(x, y, z) {
  const now = performance.now()
  if (now - _armorPingMs < 60) return
  _armorPingMs = now
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  const f = 2300 + Math.random() * 500
  playTone(ac, t, f, f * 0.9, 0.16, 0.2, dest)
  playTone(ac, t, f * 1.51, f * 1.4, 0.1, 0.1, dest)
  playTone(ac, t, f * 2.76, f * 2.5, 0.06, 0.05, dest)
}

// Exploder fuse: rising wet hiss
export function playExploderHiss(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  const g = ac.createGain()
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, 0.7)
  const f = ac.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 1.4
  f.frequency.setValueAtTime(1200, t)
  f.frequency.exponentialRampToValueAtTime(5200, t + 0.6)
  g.gain.setValueAtTime(0.001, t)
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.5)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.62)
  src.connect(f); f.connect(g); g.connect(dest ?? ac.destination)
  src.start(t); src.stop(t + 0.65)
  playTone(ac, t, 90, 190, 0.6, 0.12, dest)
}

// Exploder burst: low boom + wet splat
export function playExplosion(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  playNoise(ac, noiseBuffer(ac, 0.6), t, 0.5, 0.9, 'lowpass', 700, 0.8, dest)
  playTone(ac, t, 120, 28, 0.55, 0.8, dest)
  playNoise(ac, noiseBuffer(ac, 0.25), t, 0.18, 0.5, 'bandpass', 2200, 1.2, dest)
}

// Spitter wind-up: wet rising gurgle
export function playSpitWindup(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(70, t)
  osc.frequency.exponentialRampToValueAtTime(240, t + 0.7)
  const lfo = ac.createOscillator()
  lfo.frequency.value = 22
  const lg = ac.createGain()
  lg.gain.value = 30
  lfo.connect(lg); lg.connect(osc.frequency)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 4
  const g = ac.createGain()
  g.gain.setValueAtTime(0.001, t)
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.5)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.78)
  osc.connect(bp); bp.connect(g); g.connect(dest ?? ac.destination)
  osc.start(t); lfo.start(t); osc.stop(t + 0.8); lfo.stop(t + 0.8)
}

// Spitter launch: short wet "thwup"
export function playSpitLaunch(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  playNoise(ac, noiseBuffer(ac, 0.2), t, 0.14, 0.45, 'bandpass', 1500, 2, dest)
  playTone(ac, t, 420, 140, 0.14, 0.25, dest)
}

// Acid glob landing: sizzling splat
export function playAcidSplash(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  playNoise(ac, noiseBuffer(ac, 0.5), t, 0.4, 0.35, 'highpass', 3500, 0.8, dest)
  playTone(ac, t, 260, 70, 0.16, 0.3, dest)
}

// ── Spider zombie ────────────────────────────────────────────────────────────
// Skitter: a burst of dry clicks (claws on wood). Played from wherever the spider is,
// so on the ceiling the panner puts it above the listener. Shares the footstep budget idea
// but keeps its own throttle so a spider never starves the walkers' steps.
let _skitBuf = null
let _skitActive = 0
let _skitLastMs = 0
export function playSpiderSkitter(x, y, z) {
  const now = performance.now()
  if (_skitActive >= 2 || now - _skitLastMs < 90) return
  _skitActive++
  _skitLastMs = now
  const ac = ctx()
  const t = ac.currentTime
  if (!_skitBuf) _skitBuf = noiseBuffer(ac, 0.04)
  const dest = _zombieOutput(ac, x, y, z)
  for (let i = 0; i < 4; i++) {
    playNoise(ac, _skitBuf, t + i * 0.038 + Math.random() * 0.012, 0.022, 0.2, 'bandpass', 2300 + Math.random() * 1400, 7, dest)
  }
  setTimeout(() => { _skitActive-- }, 220)
}

// Wind-up before the drop: a rising, raspy shriek. This is the player's "look up" cue,
// so it is louder than a groan.
export function playSpiderShriek(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(260, t)
  osc.frequency.exponentialRampToValueAtTime(980, t + 0.55)
  const lfo = ac.createOscillator()
  lfo.frequency.value = 31
  const lg = ac.createGain()
  lg.gain.value = 60
  lfo.connect(lg); lg.connect(osc.frequency)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 2.5
  const g = ac.createGain()
  g.gain.setValueAtTime(0.001, t)
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.12)
  g.gain.setValueAtTime(0.32, t + 0.45)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.62)
  osc.connect(bp); bp.connect(g); g.connect(dest ?? ac.destination)
  osc.start(t); lfo.start(t); osc.stop(t + 0.65); lfo.stop(t + 0.65)
  playNoise(ac, noiseBuffer(ac, 0.6), t, 0.58, 0.12, 'highpass', 3500, 0.8, dest)
}

// Landing from the ceiling: body thud + claw scrape
export function playSpiderLand(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  playNoise(ac, noiseBuffer(ac, 0.25), t, 0.2, 0.6, 'lowpass', 260, 0.7, dest)
  playTone(ac, t, 95, 38, 0.18, 0.4, dest)
  playNoise(ac, noiseBuffer(ac, 0.12), t + 0.04, 0.1, 0.12, 'bandpass', 1800, 3, dest)
}
