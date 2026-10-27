// Camera "weight": head bob, weapon sway and per-weapon screen kick.
// Pure state + math (no three / React) so it is unit-testable. Player.jsx calls
// updateFeel() once per frame and layers `feel.*` on top of the player's aim;
// Gun.jsx reads the sway/bob fields for the viewmodel.

const STORAGE_KEY = 'cabin_reduce_motion'

let _reduce = null
export function getReduceMotion() {
  if (_reduce === null) {
    try { _reduce = localStorage.getItem(STORAGE_KEY) === '1' } catch { _reduce = false }
  }
  return _reduce
}
export function setReduceMotion(v) {
  _reduce = !!v
  try { localStorage.setItem(STORAGE_KEY, _reduce ? '1' : '0') } catch { /* private mode etc. */ }
}

// Per-weapon kick. pitch/yaw/roll are radians added to the kick *target* per
// shot (yaw/roll randomly signed). `max` caps accumulated pitch (AK climb).
// `decay` is how fast the target relaxes (1/s); the visible kick chases the
// target at KICK_FOLLOW, so the kick-up is snappy and the recovery smooth.
export const KICK = {
  pistol:       { pitch: 0.012,  yaw: 0.004,  roll: 0.004, max: 0.03,  decay: 12 },
  deagle:       { pitch: 0.050,  yaw: 0.008,  roll: 0.012, max: 0.08,  decay: 9 },
  shotgun:      { pitch: 0.065,  yaw: 0.010,  roll: 0.014, max: 0.09,  decay: 8 },
  ak47:         { pitch: 0.011,  yaw: 0.006,  roll: 0.004, max: 0.07,  decay: 3.5 },
  crossbow:     { pitch: 0.012,  yaw: 0.003,  roll: 0.003, max: 0.03,  decay: 10 },
  flamethrower: { pitch: 0.0008, yaw: 0.0008, roll: 0,     max: 0.003, decay: 25 },
}
const KICK_FOLLOW = 45

export const BOB_AMP_Y = 0.035       // metres at full walking speed
export const BOB_ROLL = 0.006        // radians
const STEP_RATE = 2.4                // strides/s at full speed (≈ STEP_INTERVAL 0.42)
const SWAY_GAIN = 0.55
const SWAY_MAX = 0.07
const SWAY_RATE = 9                  // spring-back rate (1/s)
const TWO_PI = Math.PI * 2

export const feel = {
  // camera offsets (applied by Player on top of aim)
  kickPitch: 0, kickYaw: 0, kickRoll: 0,
  bobY: 0, bobRoll: 0,
  // viewmodel offsets (read by Gun)
  lagX: 0, lagY: 0,                  // sway lag (screen space, radians-ish)
  gunBobX: 0, gunBobY: 0,
  // internals
  _tPitch: 0, _tYaw: 0, _tRoll: 0, _phase: 0, _amp: 0,
}

export function resetFeel() {
  for (const k of Object.keys(feel)) feel[k] = 0
}

export function kick(weapon) {
  if (getReduceMotion()) return
  const k = KICK[weapon] ?? KICK.pistol
  feel._tPitch = Math.min(k.max, feel._tPitch + k.pitch)
  feel._tYaw += (Math.random() * 2 - 1) * k.yaw
  feel._tRoll += (Math.random() * 2 - 1) * k.roll
}

// speed: actual horizontal speed this frame (m/s). nominalSpeed: unmodified walk speed.
// dYaw / dPitch: aim change this frame (radians).
export function updateFeel(dt, speed, nominalSpeed, dYaw, dPitch, weapon) {
  const reduce = getReduceMotion()
  if (dt > 0.1) dt = 0.1

  // Sway: viewmodel lags aim, springs back (stays, subtler, under reduce-motion)
  const swayScale = reduce ? 0.4 : 1
  const swayDecay = Math.exp(-SWAY_RATE * dt)
  feel.lagX = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, (feel.lagX + dYaw * SWAY_GAIN * swayScale) * swayDecay))
  feel.lagY = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, (feel.lagY + dPitch * SWAY_GAIN * swayScale) * swayDecay))

  if (reduce) {
    feel.bobY = feel.bobRoll = feel.gunBobX = feel.gunBobY = 0
    feel.kickPitch = feel.kickYaw = feel.kickRoll = 0
    feel._tPitch = feel._tYaw = feel._tRoll = 0
    feel._amp = 0
    return
  }

  // Bob: amplitude and frequency both follow actual speed (armor penalty => gentler)
  const frac = nominalSpeed > 0 ? Math.min(1.3, speed / nominalSpeed) : 0
  feel._amp += (frac - feel._amp) * Math.min(1, dt * 10)
  feel._phase = (feel._phase + dt * TWO_PI * STEP_RATE * feel._amp) % TWO_PI
  const a = feel._amp
  feel.bobY = Math.sin(feel._phase * 2) * BOB_AMP_Y * a      // two dips per stride
  feel.bobRoll = Math.sin(feel._phase) * BOB_ROLL * a
  feel.gunBobX = Math.sin(feel._phase) * 0.008 * a
  feel.gunBobY = -Math.abs(Math.cos(feel._phase)) * 0.010 * a

  // Kick: visible offset chases a decaying target
  const td = Math.exp(-(KICK[weapon]?.decay ?? 10) * dt)
  feel._tPitch *= td; feel._tYaw *= td; feel._tRoll *= td
  const f = 1 - Math.exp(-KICK_FOLLOW * dt)
  feel.kickPitch += (feel._tPitch - feel.kickPitch) * f
  feel.kickYaw += (feel._tYaw - feel.kickYaw) * f
  feel.kickRoll += (feel._tRoll - feel.kickRoll) * f
}
