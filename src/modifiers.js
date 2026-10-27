// Wave 3 "Wave modifiers": pure rules (roll, horde math, bonus) + the tiny mutable
// runtime state (`modFx`) that the render/audio/AI loops read with zero subscription
// cost. The store owns WHICH modifier a wave has (`waveModifier`); the ModifierFx
// component eases `modFx` toward the active modifier's targets every frame.

export const MOD_MIN_WAVE = 4     // earliest wave that can roll a modifier
export const MOD_CHANCE = 0.35    // chance per eligible wave
export const MOD_BONUS = 10       // € paid on clear for a modifier wave

export const MODIFIERS = {
  fog:       { id: 'fog',       name: 'FOG',       icon: '🌫', color: '#9fb4c8', desc: 'Can’t see far' },
  bloodlust: { id: 'bloodlust', name: 'BLOODLUST', icon: '🩸', color: '#ff4433', desc: 'Zombies 2× faster' },
  blackout:  { id: 'blackout',  name: 'BLACKOUT',  icon: '🔦', color: '#ffd27a', desc: 'Lights out · flashlight' },
  horde:     { id: 'horde',     name: 'HORDE',     icon: '🧟', color: '#9acd32', desc: '2× zombies · half HP' },
}
export const MODIFIER_IDS = Object.keys(MODIFIERS)

// Milestone boss waves (10, 20, ...) never roll one. (Every wave >= 10 spawns a boss in
// buildTypeList, so excluding all of them would retire the feature after wave 9.)
export const isMilestoneBossWave = (wave) => wave >= 10 && wave % 10 === 0

// prevModifier: the modifier of the wave just cleared (never two modifier waves in a row).
export function rollModifier(wave, prevModifier = null, rng = Math.random) {
  if (wave < MOD_MIN_WAVE || prevModifier || isMilestoneBossWave(wave)) return null
  if (rng() >= MOD_CHANCE) return null
  return MODIFIER_IDS[Math.min(MODIFIER_IDS.length - 1, Math.floor(rng() * MODIFIER_IDS.length))]
}

export const modifiedZombieCount = (base, mod) => (mod === 'horde' ? base * 2 : base)
export const modifiedZombieHealth = (health, mod) => (mod === 'horde' ? Math.ceil(health / 2) : health)
export const modifierBonus = (mod) => (mod && MODIFIERS[mod] ? MOD_BONUS : 0)

// Dev/preview only: ?mod=fog|bloodlust|blackout|horde forces the first wave's modifier.
export function debugForcedModifier() {
  if (typeof window === 'undefined' || import.meta.env.VITE_VERCEL_ENV === 'production') return null
  const m = new URLSearchParams(window.location.search).get('mod')
  return m && MODIFIERS[m] ? m : null
}

// ── Runtime state (written by ModifierFx each frame, read everywhere else) ──
export const FOG_DEFAULT = { near: 7, far: 34 }
export const FOG_THICK = { near: 3, far: 14 }
export const modFx = {
  active: null,      // modifier id in effect right now (playing phase only)
  speedMul: 1,       // zombie move speed multiplier
  groanGain: 1,      // idle groan loudness multiplier
  groanReach: 1,     // idle groan audible-distance multiplier
  tint: 0,           // 0..1 red colour grade (LofiPass uniform)
  lightMul: 1,       // interior point lights (blackout -> ~0)
  ambMul: 1,         // ambient / hemisphere / moonlight (blackout -> low)
  fireMul: 1,        // fireplace lights (blackout -> flicker on, dimmer)
  flashlight: 0,     // 0..1 flashlight on-ness
}
