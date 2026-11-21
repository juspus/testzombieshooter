// Barricades, doors, glass, storm, Mystery Box and Upgrade Bench.
import { ctx, noiseBuffer, playNoise, playTone } from './core'
import { _zombieOutput } from './spatial'

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

// ─── storm: rain loop + rolling thunder ─────────────────────────────────────

const RAIN_GAIN_OUT = 0.085
const RAIN_GAIN_IN  = 0.035
const RAIN_LP_OUT   = 6500
const RAIN_LP_IN    = 1300

let _rain = null   // { src, filt, gain }

export function startRain() {
  if (_rain) return
  const ac = ctx()
  const t = ac.currentTime
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, 4)
  src.loop = true

  const hp = ac.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 500

  const filt = ac.createBiquadFilter()
  filt.type = 'lowpass'
  filt.frequency.value = RAIN_LP_IN

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(RAIN_GAIN_IN, t + 4)

  src.connect(hp)
  hp.connect(filt)
  filt.connect(gain)
  gain.connect(ac.destination)
  src.start(t)
  _rain = { src, filt, gain }
}

export function stopRain() {
  if (!_rain) return
  const ac = ctx()
  const t = ac.currentTime
  const { src, gain } = _rain
  _rain = null
  gain.gain.cancelScheduledValues(t)
  gain.gain.setValueAtTime(gain.gain.value, t)
  gain.gain.linearRampToValueAtTime(0, t + 2)
  src.stop(t + 2.1)
}

// Muffle + quieten the rain when the listener is inside the cabin.
export function setRainIndoor(indoor) {
  if (!_rain) return
  const t = ctx().currentTime
  _rain.gain.gain.setTargetAtTime(indoor ? RAIN_GAIN_IN : RAIN_GAIN_OUT, t, 0.25)
  _rain.filt.frequency.setTargetAtTime(indoor ? RAIN_LP_IN : RAIN_LP_OUT, t, 0.25)
}

// distance 0 (overhead) .. 1 (far away). The rumble arrives after a delay
// proportional to distance — roughly the speed of sound scaled to feel good.
export function playThunder(distance = 0.5) {
  const ac = ctx()
  const d = Math.max(0, Math.min(1, distance))
  const t0 = ac.currentTime + 0.12 + d * 4.5
  const vol = 0.55 * (1 - 0.6 * d)

  // Rumble: low-passed noise with irregular amplitude bumps and a sinking cutoff.
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, 6)
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(260 - d * 110, t0)
  lp.frequency.exponentialRampToValueAtTime(55, t0 + 5)
  const g = ac.createGain()
  const len = 3.5 + (1 - d) * 1.5 + Math.random()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(vol, t0 + 0.08 + d * 0.4)
  let tt = t0 + 0.4
  while (tt < t0 + len - 0.6) {
    g.gain.linearRampToValueAtTime(vol * (0.35 + Math.random() * 0.6), tt)
    tt += 0.25 + Math.random() * 0.5
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len)
  src.connect(lp)
  lp.connect(g)
  g.connect(ac.destination)
  src.start(t0)
  src.stop(t0 + len + 0.1)

  // Close strikes get a sharp crack on top.
  if (d < 0.4) {
    playNoise(ac, noiseBuffer(ac, 0.5), t0, 0.35, 0.7 * (1 - d), 'bandpass', 1400, 0.6)
  }
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

// Box: ticking arpeggio while the weapon models cycle (scheduled in one go, ~3 s).
export function playBoxCycle(x, y, z, seconds = 3) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  const notes = [392, 494, 587, 659, 784, 659, 587, 494]
  const n = Math.floor(seconds / 0.12)
  for (let i = 0; i < n; i++) {
    const f = notes[i % notes.length] * (1 + i / n * 0.6)
    playTone(ac, t + i * 0.12, f, f, 0.09, 0.07 * (0.5 + i / n), dest)
  }
}
// Box: landed on a weapon — rising major jingle.
export function playBoxJingle(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  ;[523, 659, 784, 1046].forEach((f, i) => {
    playTone(ac, t + i * 0.09, f, f, 0.35, 0.12, dest)
    playTone(ac, t + i * 0.09, f * 2, f * 2, 0.25, 0.04, dest)
  })
}
// Box: teddy bear — sad descending music-box tune.
export function playBoxTeddy(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  ;[784, 740, 659, 587, 523, 392].forEach((f, i) => playTone(ac, t + i * 0.2, f, f * 0.98, 0.3, 0.1, dest))
}
// Bench: machinery whirr while the gun is inside, then a bell when it comes back.
export function playBenchWork(x, y, z, seconds = 3) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  playTone(ac, t, 70, 140, seconds, 0.16, dest)
  playTone(ac, t, 140, 420, seconds, 0.05, dest)
  const n = Math.floor(seconds / 0.25)
  for (let i = 0; i < n; i++) playNoise(ac, noiseBuffer(ac, 0.08), t + i * 0.25, 0.05, 0.14, 'bandpass', 1200 + i * 120, 3, dest)
}
export function playBenchDone(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  ;[880, 1320, 1760].forEach((f, i) => playTone(ac, t + i * 0.1, f, f, 0.5, 0.12, dest))
  playTone(ac, t, 2200, 4400, 0.2, 0.06, dest)
}
