import { markerKind } from './common'
import { playGunshot, playReload } from '../sounds'

const PIERCE = 3
const RANGE = 50

// .50 AE hand cannon: semi-auto, instant kill (every hit counts as a headshot), pierces up to
// PIERCE zombies on its line until a wall.
export const deagle = {
  id: 'deagle',
  name: 'Desert Eagle',
  upgradedName: 'Hand Cannon',
  caliber: '.50 AE',
  clip: 7,
  startReserve: 21,
  maxReserve: 42,
  cost: 700,
  buyReserve: 0,
  boxWeight: 10,
  fireMode: 'semi',
  cooldown: 0,
  autoShootInterval: 0.4,
  vibrate: 18,
  damageMult: 1,
  pierce: PIERCE,
  range: RANGE,
  reload: { base: 1.5, fast: 1.0 },
  ammoPack: null,
  sounds: { shot: (upg) => playGunshot('deagle', upg), reload: playReload },
  model: 'DeagleModel',
  fire,
}

function fire(ctx) {
  const { camera, raycaster, zombieRefs } = ctx
  // Pierce up to 3 enemies, instant kill each
  ctx.shatter(raycaster.ray.origin, raycaster.ray.direction, RANGE)
  const hits = []
  for (const [id, ref] of Object.entries(zombieRefs)) {
    if (!ref) continue
    const hit = ctx.hitRay(raycaster, ref)
    if (hit) hits.push({ id: Number(id), dist: hit.distance, point: hit.point })
  }
  hits.sort((a, b) => a.dist - b.dist)
  const targets = []
  for (const hit of hits) {
    if (ctx.los(camera.position.x, camera.position.z, hit.point.x, hit.point.z, ctx.bulletWalls)) break
    targets.push(hit)
    if (targets.length >= PIERCE) break
  }
  let trailEnd = targets.length > 0 ? targets[targets.length - 1].point : null
  if (targets.length < PIERCE && ctx.worldImpact(raycaster.ray, RANGE, ctx.windowPlanks)) {
    // Round passes through every zombie hit and ends on the world surface behind them
    if (!trailEnd || ctx.worldRec.dist > trailEnd.distanceTo(raycaster.ray.origin)) trailEnd = ctx.worldHit.clone()
  }
  if (!trailEnd) trailEnd = camera.position.clone().addScaledVector(raycaster.ray.direction, RANGE)
  ctx.trails.add(ctx.muzzle, trailEnd)
  let kill = false
  for (const target of targets) {
    if (ctx.hitZombie(target.id, true, 'gun', 'deagle', target.dist, ctx.dmgMult)) { kill = true; ctx.deathSound(target.id) }
    ctx.hitFx(target.id, target.point, raycaster.ray.direction, true, 'deagle', target.dist)
    ctx.netSend('hit_zombie', { id: target.id, isHeadshot: true, source: 'gun', mult: ctx.dmgMult, ...ctx.fxNet(target.point, raycaster.ray.direction, target.dist, 'deagle') })
  }
  if (targets.length > 0) ctx.registerHit(markerKind(kill, true))
}

