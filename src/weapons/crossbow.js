import { markerKind, UPGRADE_DAMAGE_MULT } from './common'
import { playGunshot, playCrossbowReload } from '../sounds'

// Repeating crossbow (Mystery Box only): each bolt pierces every zombie on its line (up to PIERCE)
// and kills anything that is not a brute / armored / boss outright. Tuning lives here; fire()
// resolves damage, Bolts.jsx owns the pooled bolts (pick-ups + Wraith blast).
export const CROSSBOW = {
  FIRE_INTERVAL: 0.45,    // s between shots
  RELOAD: 1.8,            // s
  RELOAD_FAST_HANDS: 1.2, // s
  PIERCE: 6,              // zombies one bolt passes through
  RANGE: 50,
  PICKUP_RADIUS: 1,       // m: walk this close to a stuck bolt to collect it (+1 reserve)
  MAX_BOLTS: 24,          // pooled bolts in the world; oldest recycled
  BLAST_RADIUS: 2,        // Wraith: bolts explode on impact
  BLAST_INNER: 0.6,
  BLAST_MAX: 4,           // < brute (7) / armored (5): walkers die inside ~1.3 m
  BLAST_SHAKE: 0.25,
}
export const crossbowReloadTime = (fastHands) => (fastHands ? CROSSBOW.RELOAD_FAST_HANDS : CROSSBOW.RELOAD)

// Bolt damage multiplier on the base hit (body 1 / head 3). Tough types take heavy but not
// lethal body damage (armour is ignored for the crossbow, see zombieSpecials.armorMultiplier):
// brute 7 hp: body 4 (a head kills), armored 5 hp: body 4 (a head kills), boss 16 hp: body 2 / head 6.
export const CROSSBOW_DAMAGE_MULT = 20
const BOLT_TYPE_MULT = { brute: 4, armored: 4, boss: 2 }
export const boltMult = (type, upgraded = false) =>
  (BOLT_TYPE_MULT[type] ?? CROSSBOW_DAMAGE_MULT) * (upgraded ? UPGRADE_DAMAGE_MULT : 1)
// Wraith blast damage at distance d (m) from the impact: full inside BLAST_INNER, 0 at BLAST_RADIUS.
export function boltBlastDamage(d) {
  if (d <= CROSSBOW.BLAST_INNER) return CROSSBOW.BLAST_MAX
  if (d >= CROSSBOW.BLAST_RADIUS) return 0
  return CROSSBOW.BLAST_MAX * (CROSSBOW.BLAST_RADIUS - d) / (CROSSBOW.BLAST_RADIUS - CROSSBOW.BLAST_INNER)
}

export const crossbow = {
  id: 'crossbow',
  name: 'Crossbow',
  upgradedName: 'Wraith',
  caliber: 'Bolt',
  clip: 5,
  startReserve: 30,
  maxReserve: 40,
  cost: null,          // Mystery Box only
  buyReserve: 0,
  boxWeight: 16,
  fireMode: 'semi',
  cooldown: CROSSBOW.FIRE_INTERVAL,
  autoShootInterval: 0.4,
  vibrate: 18,
  damageMult: CROSSBOW_DAMAGE_MULT,   // generic value; fire() uses the per-type boltMult
  pierce: CROSSBOW.PIERCE,
  range: CROSSBOW.RANGE,
  reload: { base: CROSSBOW.RELOAD, fast: CROSSBOW.RELOAD_FAST_HANDS },
  ammoPack: null,
  sounds: { shot: (upg) => playGunshot('crossbow', upg), reload: () => playCrossbowReload() },
  model: 'CrossbowModel',
  fire,
}

function fire(ctx) {
  const { camera, raycaster, zombieRefs, upg } = ctx
  // One bolt pierces every zombie on its line (CROSSBOW.PIERCE) until a wall / closed door.
  // Damage resolves now; Bolts.jsx draws the bolt, keeps it as a pick-up when it sticks (walls,
  // floor, a corpse) or detonates it (Wraith).
  ctx.shatter(raycaster.ray.origin, raycaster.ray.direction, CROSSBOW.RANGE)
  const hitWorld = ctx.worldImpact(raycaster.ray, CROSSBOW.RANGE, ctx.windowPlanks, !upg, 0.5)
  const worldDist = hitWorld ? ctx.worldRec.dist : Infinity
  const worldPt = hitWorld ? ctx.worldHit.clone() : null
  const hits = []
  for (const [id, ref] of Object.entries(zombieRefs)) {
    if (!ref) continue
    const hit = ctx.hitRay(raycaster, ref)
    if (hit) hits.push({ id: Number(id), dist: hit.distance, point: hit.point, head: hit.isHead })
  }
  hits.sort((a, b) => a.dist - b.dist)
  const targets = []
  for (const hit of hits) {
    if (hit.dist > worldDist) break
    if (ctx.los(camera.position.x, camera.position.z, hit.point.x, hit.point.z, ctx.bulletWalls)) break
    targets.push(hit)
    if (targets.length >= CROSSBOW.PIERCE) break
  }
  const capped = targets.length >= CROSSBOW.PIERCE
  const lastT = targets.length > 0 ? targets[targets.length - 1] : null
  let boltEnd = capped ? lastT.point : worldPt
  let anyKill = false, anyHead = false, lastDied = false
  const zs = ctx.zombies()
  for (const t of targets) {
    const mult = boltMult(zs.find((z) => z.id === t.id)?.type, upg)
    const died = ctx.hitZombie(t.id, t.head, 'gun', 'crossbow', t.dist, mult)
    if (died) { anyKill = true; ctx.deathSound(t.id) }
    if (t === lastT) lastDied = died
    if (t.head) anyHead = true
    ctx.hitFx(t.id, t.point, raycaster.ray.direction, t.head, 'crossbow', t.dist)
    ctx.netSend('hit_zombie', { id: t.id, isHeadshot: t.head, source: 'gun', mult, ...ctx.fxNet(t.point, raycaster.ray.direction, t.dist, 'crossbow') })
  }
  // Bolts are local to the shooter (not synced in co-op): the partner only sees the hit effects.
  if (boltEnd) {
    ctx.bolts.fire?.(ctx.muzzle, boltEnd, {
      wraith: upg,
      stick: !upg,
      attachId: capped ? (lastDied ? lastT.id : -2) : -1,   // -2: ends in a live zombie, drops to the floor
    })
  } else {
    boltEnd = camera.position.clone().addScaledVector(raycaster.ray.direction, CROSSBOW.RANGE)
    ctx.bolts.fire?.(ctx.muzzle, boltEnd, { wraith: false, stick: false, attachId: -1 })
  }
  if (targets.length > 0) ctx.registerHit(markerKind(anyKill, anyHead))
}
