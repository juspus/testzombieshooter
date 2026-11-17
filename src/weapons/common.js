// Shared pieces for the gun files in this folder (src/weapons/<gun>.js).
//
// A weapon file is plain data plus a `fire(ctx)` function. It may import pure modules
// (rng, walls, hitboxes, sounds) but never a component or the store: components import the
// registry, so that would be a cycle. Everything that lives in the scene (bullet trails, bolts,
// shell casings, hit effects, the world ray, the Zombie class) comes in through `ctx`, which
// Player.jsx builds once and refreshes per shot (no per-shot allocation of the object itself).
//
// ctx, per shot (set by Player.jsx right before fire):
//   camera, raycaster (centre ray, already aimed), muzzle (Vector3), upg (bool), dmgMult,
//   perks, windowPlanks, bulletWalls, aimAssist (bool), weapon (id)
// ctx, stable helpers:
//   zombieRefs, hitZombie, hitRay(rc, ref), los(x1, z1, x2, z2, walls), shatter(origin, dir, max),
//   worldImpact(ray, max, planks, spawn, intensity) -> bool, worldHit (Vector3), worldRec ({ dist }),
//   deathSound(id), ironSights(ref, point, perks), netSend(event, data), fxNet(...), hitFx(...), kick(id),
//   registerHit(kind), trails.add(a, b), bolts.fire(a, b, opts), flameSpray.spray(...), ignite(id),
//   gun (Gun.jsx statics: pump, setFlameActive, getMuzzlePosition), ejectShell(), addBulletHole(id, localPos, normal),
//   zombies() (store list), isUpgraded(weaponId), hitZombieFlame, consumeFuel, delta (frame loop only)
import * as THREE from 'three'

// Upgrade Bench multipliers (weaponRules re-exports these).
export const UPGRADE_CLIP_MULT = 1.5
export const UPGRADE_DAMAGE_MULT = 2

// Shop ammo pack: every gun except the flamethrower. Deep Pockets raises `deepAmount`.
export const DEFAULT_AMMO_PACK = { cost: 10, amount: 20, deepAmount: 30 }

export const markerKind = (killed, head) => (killed ? (head ? 'headkill' : 'kill') : (head ? 'head' : 'hit'))

const _fallbackNormal = new THREE.Vector3(0, 0, 1)
// Mobile aim assist: small forgiveness cone tried when the centre ray misses.
const AIM_OFFSETS = [
  { x: 0.04, y: 0 }, { x: -0.04, y: 0 },
  { x: 0, y: 0.04 }, { x: 0, y: -0.04 },
  { x: 0.03, y: 0.03 }, { x: -0.03, y: 0.03 },
]
const _assistRC = new THREE.Raycaster()

// Single-target hitscan: pistol and AK-47 (the one body of the old `else` branch in Player.jsx).
export function fireSingle(ctx) {
  const { camera, raycaster, zombieRefs } = ctx
  ctx.shatter(raycaster.ray.origin, raycaster.ray.direction, 50)
  let closest = null, closestDist = Infinity, hitPoint = null, isHeadshot = false, hitFaceNormal = null
  for (const [id, ref] of Object.entries(zombieRefs)) {
    if (!ref) continue
    const hit = ctx.hitRay(raycaster, ref)
    if (hit && hit.distance < closestDist &&
        !ctx.los(camera.position.x, camera.position.z, hit.point.x, hit.point.z, ctx.bulletWalls)) {
      closestDist = hit.distance
      closest = id
      hitPoint = hit.point
      isHeadshot = hit.isHead
      hitFaceNormal = hit.face?.normal.clone() ?? _fallbackNormal.clone()
    }
  }

  if (closest === null && ctx.aimAssist) {
    for (const offset of AIM_OFFSETS) {
      if (closest !== null) break
      _assistRC.setFromCamera(offset, camera)
      for (const [id, ref] of Object.entries(zombieRefs)) {
        if (!ref) continue
        const hit = ctx.hitRay(_assistRC, ref)
        if (hit && hit.distance < closestDist &&
            !ctx.los(camera.position.x, camera.position.z, hit.point.x, hit.point.z, ctx.bulletWalls)) {
          closestDist = hit.distance
          closest = id
          hitPoint = hit.point
          isHeadshot = hit.isHead
          hitFaceNormal = hit.face?.normal.clone() ?? _fallbackNormal.clone()
        }
      }
    }
  }

  let trailEnd = hitPoint
  if (!trailEnd) {
    if (ctx.worldImpact(raycaster.ray, 50, ctx.windowPlanks)) trailEnd = ctx.worldHit.clone()
    else trailEnd = camera.position.clone().addScaledVector(raycaster.ray.direction, 50)
  }
  ctx.trails.add(ctx.muzzle, trailEnd)
  if (closest !== null) {
    const id = Number(closest)
    const zombieRef = zombieRefs[closest]
    if (!isHeadshot && hitPoint && zombieRef) isHeadshot = ctx.ironSights(zombieRef, hitPoint, ctx.perks)
    if (!isHeadshot && hitPoint && zombieRef && hitFaceNormal) {
      const localPos = zombieRef.worldToLocal(hitPoint.clone())
      localPos.addScaledVector(hitFaceNormal, 0.012)
      ctx.addBulletHole(id, localPos, hitFaceNormal)
    }
    const kill = ctx.hitZombie(id, isHeadshot, 'gun', ctx.weapon, closestDist, ctx.dmgMult)
    if (kill) ctx.deathSound(id)
    ctx.registerHit(markerKind(kill, isHeadshot))
    if (hitPoint) ctx.hitFx(id, hitPoint, raycaster.ray.direction, isHeadshot, ctx.weapon, closestDist)
    ctx.netSend('hit_zombie', { id, isHeadshot, source: 'gun', mult: ctx.dmgMult, ...(hitPoint ? ctx.fxNet(hitPoint, raycaster.ray.direction, closestDist, ctx.weapon) : {}) })
  }
}
