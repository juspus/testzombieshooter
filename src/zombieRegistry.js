// Live zombie instances, by id: the scene group of each zombie (hit tests, melee, flame, auto-shoot
// read it) and the callback that pastes a bullet hole into a zombie's model. Zombie.jsx registers
// both in an effect and unregisters them in its cleanup, so a remount or a hot reload never leaves a
// stale entry; the lookups here are plain module state (no React, no component).
// (The zombie AI itself, src/zombieAI/*, has its own state: this is only the scene side.)

// id -> THREE.Group. One live mutable map: readers may hold the object and see every change.
export const zombieRefs = {}

// Unregister only removes the group it is given, so a newer registration under the same id
// (StrictMode runs effect, cleanup, effect; a re-keyed zombie registers before the old cleanup
// lands) is never wiped by an older cleanup.
export function registerZombieRef(id, ref) { zombieRefs[id] = ref }
export function unregisterZombieRef(id, ref) {
  if (zombieRefs[id] === ref) delete zombieRefs[id]
}

const _holeAdders = {}
export function registerHoleAdder(id, fn) { _holeAdders[id] = fn }
// (`fn` omitted: remove whatever is registered, used when a corpse settles.)
export function unregisterHoleAdder(id, fn) {
  if (fn === undefined || _holeAdders[id] === fn) delete _holeAdders[id]
}
export function addBulletHole(id, localPos, localNormal) { return _holeAdders[id]?.(localPos, localNormal) }

// Per-particle flame damage: Player registers it while mounted, FlameSpray calls it for every
// zombie a particle touches (once per particle and zombie).
let _flameHit = null
export function setFlameHitHandler(fn) {
  _flameHit = fn
  return () => { if (_flameHit === fn) _flameHit = null }
}
export function getFlameHitHandler() { return _flameHit }

// Dev/preview: browser tests read the live map
if (typeof window !== 'undefined' && import.meta.env?.VITE_VERCEL_ENV !== 'production') window.__zombieRefs = zombieRefs

// Test / reset helper (a new run, tests): forget every zombie.
export function clearZombieRegistry() {
  for (const k of Object.keys(zombieRefs)) delete zombieRefs[k]
  for (const k of Object.keys(_holeAdders)) delete _holeAdders[k]
}
