import * as THREE from 'three'
import { runRandom } from '../rng'
import { markerKind } from './common'
import { playGunshot, playReload, playPumpAction, playShellThonk } from '../sounds'

const PELLETS = 12
const SPREAD = 0.10   // NDC half-width of the pellet cone
const RANGE = 30

// 12ga pump shotgun: 12 pellets per shell, each raycast on its own, 0.5 s pump cooldown.
export const shotgun = {
  id: 'shotgun',
  name: 'Shotgun',
  upgradedName: 'Widowmaker',
  caliber: '12ga',
  clip: 8,
  startReserve: 24,
  maxReserve: 48,
  cost: 150,
  buyReserve: 0,
  boxWeight: 18,
  fireMode: 'pump',
  cooldown: 0.5,
  autoShootInterval: 0.6,
  vibrate: [30, 20, 30],
  damageMult: 1,
  pierce: 1,          // per pellet
  pellets: PELLETS,
  spread: SPREAD,
  range: RANGE,
  reload: { base: 1.5, fast: 1.0 },
  ammoPack: null,
  sounds: { shot: (upg) => playGunshot('shotgun', upg), reload: playReload },
  model: 'ShotgunModel',
  fire,
}

const _pelletRC = new THREE.Raycaster()
const _ndc = { x: 0, y: 0 }
const _killed = new Set()

function fire(ctx) {
  const { camera, zombieRefs } = ctx

  // Pump animation + sounds
  ctx.gun.pump?.()
  setTimeout(playPumpAction, 40)
  setTimeout(playShellThonk, 140)  // 0.1s after pump starts

  // Eject shell casing (Player.jsx places it ahead and right of the camera so it is visible)
  ctx.ejectShell()

  // Pellets spread in a cone: the random draws stay on the seeded 'spread' stream, in this order
  // (angle, then radius, per pellet), so Daily and versus runs repeat.
  _killed.clear()
  let anyHit = false, anyHead = false, anyKill = false
  for (let i = 0; i < PELLETS; i++) {
    const angle = runRandom('spread')() * Math.PI * 2
    const r = Math.sqrt(runRandom('spread')()) * SPREAD  // sqrt for even circular distribution
    _ndc.x = Math.cos(angle) * r
    _ndc.y = Math.sin(angle) * r
    _pelletRC.setFromCamera(_ndc, camera)
    ctx.shatter(_pelletRC.ray.origin, _pelletRC.ray.direction, RANGE)
    let bestId = null, bestDist = Infinity, bestPoint = null, bestHead = false
    for (const [id, ref] of Object.entries(zombieRefs)) {
      if (!ref) continue
      const hit = ctx.hitRay(_pelletRC, ref)
      if (hit && hit.distance < bestDist &&
          !ctx.los(camera.position.x, camera.position.z, hit.point.x, hit.point.z, ctx.bulletWalls)) {
        bestDist = hit.distance
        bestId = Number(id)
        bestPoint = hit.point
        bestHead = hit.isHead
      }
    }
    let trailEnd = bestPoint
    if (!trailEnd) {
      if (ctx.worldImpact(_pelletRC.ray, RANGE, ctx.windowPlanks, true, 0.35)) trailEnd = ctx.worldHit.clone()
      else trailEnd = camera.position.clone().addScaledVector(_pelletRC.ray.direction, RANGE)
    }
    ctx.trails.add(ctx.muzzle, trailEnd)
    if (bestId !== null) {
      if (!bestHead) bestHead = ctx.ironSights(zombieRefs[bestId], bestPoint, ctx.perks)
      const died = ctx.hitZombie(bestId, bestHead, 'gun', 'shotgun', bestDist, ctx.dmgMult)
      anyHit = true
      if (bestHead) anyHead = true
      if (died && !_killed.has(bestId)) { _killed.add(bestId); anyKill = true; ctx.deathSound(bestId) }
      ctx.hitFx(bestId, bestPoint, _pelletRC.ray.direction, bestHead, 'shotgun', bestDist)
      ctx.netSend('hit_zombie', { id: bestId, isHeadshot: bestHead, source: 'gun', mult: ctx.dmgMult, ...ctx.fxNet(bestPoint, _pelletRC.ray.direction, bestDist, 'shotgun') })
    }
  }
  // One marker per trigger pull, not per pellet
  if (anyHit) ctx.registerHit(markerKind(anyKill, anyHead))
}
