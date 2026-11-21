// The context handed to a weapon's fire / burn functions, and the pieces it uses (world impact, window
// glass, death sound, shell eject). Moved verbatim out of components/Player.jsx.
import * as THREE from 'three'
import { useGameStore } from '../store'
import { trails, bolts, gun, flameSpray, shells } from '../fxBus'
import { addBulletHole } from '../zombieRegistry'
import { zombieSystem } from '../zombieLive'
import { zombieHitFx, fxNet } from '../hitFx'
import { playZombieDie } from '../sounds'
import { WEAPONS } from '../weapons'
import { lineOfSightBlocked } from '../walls'
import { spawnImpact } from '../impactParticles'
import { kick } from '../cameraFeel'
import { raycastWorld, HIT_FLOOR, HIT_PLANK } from '../worldRay'
import { hitZombieRay } from '../hitboxes'
import { registerHit, BULLET_WALLS, MAP_WALL_H, netSend, WINDOW_DEFS, WIN_HALF, WIN_Y0, WIN_Y1 } from './constants'

// Visual-only world raycast for bullet impacts (sparks / splinters). Writes the hit
// point into _worldHit and returns true when a wall/floor/plank is within maxDist.
// Does not affect gameplay hit detection.
export const _wr = { dist: 0, nx: 0, ny: 0, nz: 0, kind: 0 }
export const _worldHit = new THREE.Vector3()
export const _worldNormal = new THREE.Vector3()
export function worldImpact(ray, maxDist, windowPlanks, spawn = true, intensity = 1) {
  if (!raycastWorld(ray.origin.x, ray.origin.y, ray.origin.z, ray.direction.x, ray.direction.y, ray.direction.z,
    maxDist, BULLET_WALLS, MAP_WALL_H, WINDOW_DEFS, windowPlanks, WIN_Y0, WIN_Y1, WIN_HALF, _wr)) return false
  _worldHit.copy(ray.direction).multiplyScalar(_wr.dist).add(ray.origin)
  if (spawn) {
    _worldNormal.set(_wr.nx, _wr.ny, _wr.nz)
    spawnImpact(_worldHit, _worldNormal, _wr.kind === HIT_PLANK ? 'plank' : _wr.kind === HIT_FLOOR ? 'floor' : 'wall', intensity)
  }
  return true
}

// Positional zombie death sound (falls back to flat audio if the zombie ref is gone).
export function deathSound(refs, id) {
  const r = refs[id]
  if (r) playZombieDie(r.position.x, 1.2, r.position.z)
  else playZombieDie()
}

// Shatters a window's glass the first time a bullet passes through its opening.
// Analytic ray/plane test against each window's wall-plane and opening rect;
// a no-op on maps whose windows have no glass to break.
export function checkWindowShatter(origin, direction, maxDist) {
  const broken = useGameStore.getState().brokenWindows
  for (const win of WINDOW_DEFS) {
    if (broken[win.id]) continue
    const isNS = win.wall === 'N' || win.wall === 'S'
    const denom = isNS ? direction.z : direction.x
    if (Math.abs(denom) < 1e-6) continue
    const t = ((isNS ? win.winZ : win.winX) - (isNS ? origin.z : origin.x)) / denom
    if (t <= 0 || t > maxDist) continue
    const py = origin.y + direction.y * t
    if (py < WIN_Y0 || py > WIN_Y1) continue
    const cross = isNS ? origin.x + direction.x * t : origin.z + direction.z * t
    const center = isNS ? win.winX : win.winZ
    if (Math.abs(cross - center) > WIN_HALF) continue
    useGameStore.getState().breakWindow(win.id)
  }
}

// Context handed to a weapon's fire / burn functions (src/weapons/<gun>.js; see weapons/common.js
// for the field list). One persistent object: per-shot fields are refreshed in shoot(), so firing
// allocates no context.
export const _centre = { x: 0, y: 0 }
export const _ejRight = new THREE.Vector3()
export const _ejFwd = new THREE.Vector3()
export const _ejPos = new THREE.Vector3()
export function ejectShell() {
  const e = FIRE.camera.matrixWorld.elements
  _ejRight.set(e[0], e[1], e[2])
  _ejFwd.set(-e[8], -e[9], -e[10])
  _ejPos.copy(FIRE.camera.position).addScaledVector(_ejFwd, 0.45).addScaledVector(_ejRight, 0.28)
  _ejPos.y -= 0.10
  shells.eject(_ejPos, _ejRight)
}
export const FIRE = {
  camera: null, raycaster: new THREE.Raycaster(), muzzle: null, upg: false, dmgMult: 1, weapon: 'pistol',
  perks: null, windowPlanks: null, bulletWalls: null, aimAssist: false, zombieRefs: null, delta: 0,
  hitZombie: null, hitZombieFlame: null, consumeFuel: null,
  hitRay: hitZombieRay, los: lineOfSightBlocked, shatter: checkWindowShatter,
  worldImpact, worldHit: _worldHit, worldRec: _wr,
  deathSound: (id) => deathSound(FIRE.zombieRefs, id),
  ironSights: isIronSightsHeadshot, netSend, fxNet, hitFx: zombieHitFx, registerHit, kick,
  trails, bolts, gun, flameSpray, ejectShell,
  addBulletHole,
  ignite: (id) => zombieSystem.ignite(id),
  zombies: () => useGameStore.getState().zombies,
  isUpgraded: (w) => !!useGameStore.getState().upgradedWeapons[w],
}
export const FLAMETHROWER = WEAPONS.flamethrower

export const _knifePoint = new THREE.Vector3()
export const _knifeDir = new THREE.Vector3()

export function isIronSightsHeadshot(zombieRef, point, perks) {
  if (!perks.iron_sights || !zombieRef || !point) return false
  const local = zombieRef.worldToLocal(point.clone())
  return local.y > 0.55 && Math.abs(local.x) < 0.34 && Math.abs(local.z) < 0.34
}

// Module-level reusables for mobile auto-shoot detection (no per-frame allocation)
export const _autoPos = new THREE.Vector3()
export const _autoFwd = new THREE.Vector3()
export const _autoDir = new THREE.Vector3()
export const _autoNearRefs = new Array(25)  // at most 25 active zombies
