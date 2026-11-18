// Player footsteps, hit feedback, heartbeat, last-kill sting and power-up cues.
import { _realDest, ctx, noiseBuffer, playNoise, playTone } from './core'
import { _makeSpatialOutput } from './spatial'

export function playFootstep(dest = null) {
  const ac = ctx()
  const t = ac.currentTime

  // Dull floor thud
  const buf = noiseBuffer(ac, 0.12)
  playNoise(ac, buf, t, 0.1, 0.55, 'lowpass', 180, 0.7, dest)
  playTone(ac, t, 100, 40, 0.08, 0.3, dest)
}

// Play a footstep coming from the remote player's world position.
export function playRemoteFootstep(x, y, z) {
  const ac   = ctx()
  const dest = _makeSpatialOutput(ac, x, y, z)
  playFootstep(dest)
}

// Play a knife-swing whoosh coming from the remote player's world position.
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

// ─── Wave 3: power-up drops ──────────────────────────────────────────────────
// Soft shimmer when a drop lands in the world
export function playPowerupDrop() {
  const ac = ctx()
  const t = ac.currentTime
  playTone(ac, t, 880, 1320, 0.18, 0.05)
  playTone(ac, t + 0.09, 1320, 1760, 0.22, 0.04)
}

// Pickup chime + announcer-ish stinger (formant-filtered saw "voice"), one per type
const _PU_NOTES = {
  max_ammo:     [523, 659, 784, 1046],     // bright major arpeggio
  insta_kill:   [392, 311, 233, 196],      // ominous falling line
  double_money: [988, 1319, 988, 1319],    // coin ka-ching
  nuke:         [110, 82, 55, 41],         // boom
  carpenter:    [330, 392, 330, 262],      // hammer-ish
}
export function playPowerupPickup(type) {
  const ac = ctx()
  const t = ac.currentTime
  const out = _realDest ?? ac.destination
  const notes = _PU_NOTES[type] ?? _PU_NOTES.max_ammo
  notes.forEach((f, i) => playTone(ac, t + i * 0.075, f, f * 1.01, 0.25, 0.09, out))
  // Announcer: vowel-ish formant sweep on a low saw
  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  const base = type === 'nuke' ? 70 : type === 'insta_kill' ? 85 : 100
  osc.frequency.setValueAtTime(base * 1.25, t + 0.05)
  osc.frequency.exponentialRampToValueAtTime(base, t + 0.7)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'; bp.Q.value = 4
  bp.frequency.setValueAtTime(500, t + 0.05)
  bp.frequency.linearRampToValueAtTime(1400, t + 0.25)
  bp.frequency.linearRampToValueAtTime(700, t + 0.6)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t + 0.05)
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.12)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.75)
  osc.connect(bp); bp.connect(g); g.connect(out)
  osc.start(t + 0.05); osc.stop(t + 0.8)
  if (type === 'nuke') playNoise(ac, noiseBuffer(ac, 1.2), t, 1.2, 0.35, 'lowpass', 500, 0.8, out)
}
