// Wave 3 "Power-up drops" — pure logic + the module-level drop pool.
// No store / net / three imports so it is trivially unit-testable; store.js owns
// the effects (applyPowerup), PowerUps.jsx the visuals, NetManager.jsx the sync.

export const POWERUP_TYPES = ['max_ammo', 'insta_kill', 'double_money', 'nuke', 'carpenter']

export const POWERUP_DEFS = {
  max_ammo:     { label: 'MAX AMMO',     color: '#3ddc5a', weight: 22, duration: 0 },
  insta_kill:   { label: 'INSTA-KILL',   color: '#ff3030', weight: 22, duration: 20 },
  double_money: { label: 'DOUBLE MONEY', color: '#ffd21a', weight: 22, duration: 20 },
  nuke:         { label: 'NUKE',         color: '#ff9a1f', weight: 14, duration: 0 },
  carpenter:    { label: 'CARPENTER',    color: '#c98a4b', weight: 20, duration: 0 },
}

// ── Drop roll tuning ─────────────────────────────────────────────────────────
export const DROP_CHANCE = 0.025      // base chance per kill
export const PITY_SOFT_KILLS = 15     // after this many kills without a drop the chance ramps up...
export const PITY_RAMP = 0.01         // ...by this much per extra kill
export const PITY_HARD_KILLS = 30     // ...and a drop is guaranteed on this kill

export const DROP_TTL = 25            // seconds a pickup stays in the world
export const DROP_BLINK_START = 5     // blinks during its last N seconds
export const PICKUP_RADIUS = 1.2
export const POOL_SIZE = 8
export const NUKE_REWARD = 10         // flat €, no per-kill money from nuked zombies
export const CARPENTER_REWARD = 5

// killsSinceDrop counts this kill (>= 1).
export function dropChance(killsSinceDrop) {
  if (killsSinceDrop >= PITY_HARD_KILLS) return 1
  const over = Math.max(0, killsSinceDrop - PITY_SOFT_KILLS)
  return Math.min(1, DROP_CHANCE + over * PITY_RAMP)
}

// Weighted pick that never repeats the previous type back to back.
export function pickPowerupType(lastType = null, rng = Math.random) {
  const pool = POWERUP_TYPES.filter((t) => t !== lastType)
  let total = 0
  for (const t of pool) total += POWERUP_DEFS[t].weight
  let r = rng() * total
  for (const t of pool) {
    r -= POWERUP_DEFS[t].weight
    if (r < 0) return t
  }
  return pool[pool.length - 1]
}

export function rollPowerupDrop(killsSinceDrop, lastType = null, rng = Math.random) {
  if (rng() < dropChance(killsSinceDrop)) return { drop: true, type: pickPowerupType(lastType, rng) }
  return { drop: false, type: null }
}

// ── Drop placement ───────────────────────────────────────────────────────────
// Move (x,z) inside the playable interior, then, if the spot is blocked (interior
// wall) or unreachable (isFree false), step toward the anchor (the player — who by
// definition stands somewhere reachable, i.e. on the same side of any sealed door).
export function clampDropPoint(x, z, { hw, hd, inset = 1.2, anchorX = 0, anchorZ = 0, isFree = () => true }) {
  const mx = Math.max(0, hw - inset), mz = Math.max(0, hd - inset)
  const cl = (v, m) => Math.max(-m, Math.min(m, v))
  const sx = cl(x, mx), sz = cl(z, mz)
  const ax = cl(anchorX, mx), az = cl(anchorZ, mz)
  const STEPS = 24
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    const px = sx + (ax - sx) * t, pz = sz + (az - sz) * t
    if (isFree(px, pz)) return { x: px, z: pz }
  }
  return { x: ax, z: az }
}

// Hook for the buyable-doors work: return false for points in a sealed room.
// Default: everything is reachable.
let _reachable = () => true
export function setReachabilityCheck(fn) { _reachable = typeof fn === 'function' ? fn : () => true }
export function isPointReachable(x, z) { return _reachable(x, z) }

// Position providers (registered by PowerUps.jsx; tests leave them unset).
let _zombiePos = null
let _playerPos = null
export function setPositionProviders(zombiePosFn, playerPosFn) { _zombiePos = zombiePosFn; _playerPos = playerPosFn }
export function getZombieWorldPos(id) { return _zombiePos?.(id) ?? null }
export function getPlayerWorldPos() { return _playerPos?.() ?? null }

// ── Timed effects (remaining seconds, mutated by tickEffects) ────────────────
export const effects = { insta_kill: 0, double_money: 0 }

export function startEffect(type, seconds = POWERUP_DEFS[type]?.duration ?? 0) {
  if (!(type in effects)) return
  effects[type] = seconds   // refresh, never stack
}
export function clearEffects() { effects.insta_kill = 0; effects.double_money = 0 }

// Returns the list of effect types that expired this tick.
export function tickEffects(dt) {
  const expired = []
  for (const k in effects) {
    if (effects[k] <= 0) continue
    effects[k] -= dt
    if (effects[k] <= 0) { effects[k] = 0; expired.push(k) }
  }
  return expired
}

// ── Drop pool (always-mounted meshes in PowerUps.jsx mirror this array) ──────
export const slots = Array.from({ length: POOL_SIZE }, () => ({ active: false, id: 0, type: null, x: 0, z: 0, age: 0, reqAt: 0 }))
let _nextDropId = 1
const _spawnListeners = new Set()
export function onDropSpawned(fn) { _spawnListeners.add(fn); return () => _spawnListeners.delete(fn) }

// Add a drop. `id` is supplied for remote (guest) spawns; the host mints its own.
export function addDrop({ id, type, x, z }, { notify = true } = {}) {
  const did = id ?? _nextDropId++
  if (id != null && id >= _nextDropId) _nextDropId = id + 1
  let slot = slots.find((s) => !s.active)
  if (!slot) slot = slots.reduce((a, b) => (b.age > a.age ? b : a))   // recycle the oldest
  slot.active = true; slot.id = did; slot.type = type; slot.x = x; slot.z = z; slot.age = 0; slot.reqAt = 0
  if (notify) for (const fn of _spawnListeners) fn({ id: did, type, x, z })
  return did
}

// Remove and return a drop by id (null if already gone).
export function takeDrop(id) {
  const s = slots.find((d) => d.active && d.id === id)
  if (!s) return null
  s.active = false
  return { id: s.id, type: s.type, x: s.x, z: s.z }
}

export function clearDrops() { for (const s of slots) s.active = false }

// Ages drops and expires old ones; callers read `slots`.
export function ageDrops(dt) {
  for (const s of slots) {
    if (!s.active) continue
    s.age += dt
    if (s.age >= DROP_TTL) s.active = false
  }
}

// Blink visibility for a drop (always visible until the last DROP_BLINK_START s).
export function dropVisible(age) {
  const left = DROP_TTL - age
  if (left > DROP_BLINK_START) return true
  return Math.floor(left * 5) % 2 === 0
}
