// Spider: floor <-> ceiling state machine glue (the pure state machine is spiderStep in
// zombieSpecials.js). The pose layer rolls the flip group by `zs.spd.flip`, poses the limbs and
// plays the death roll from `zs.spDead`.
import { SPIDER, spiderStep, spiderCeilingAt } from '../zombieSpecials'
import { applyMove } from './movement'

const _burstUp = { x: 0, y: 1, z: 0 }
const _burstPt = { x: 0, y: 0.9, z: 0 }

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// Anything but 'floor' = up off the ground: no melee, no plank attacks, moves with the ceiling
// walls (no furniture). Returns true while the spider is off the floor.
export function spiderTick(sys, zs, dt, px, pz) {
  const ctx = sys.ctx
  const sp = zs.spd
  const inside = Math.abs(zs.x) < sys.cabinHW - SPIDER.INSIDE_MARGIN && Math.abs(zs.z) < sys.cabinHD - SPIDER.INSIDE_MARGIN
  const ceilY = spiderCeilingAt(zs.x, zs.z, sys.wallH, sys.doors) - SPIDER.BODY_Y
  const ev = spiderStep(sp, dt, { inside, hdist: Math.hypot(px - zs.x, pz - zs.z), ceilY })
  const io = sys.io
  if (ev === 'climb') io.audio.spiderSkitter(zs.x, 1.2, zs.z)
  else if (ev === 'windup') io.audio.spiderShriek(zs.x, zs.y, zs.z)
  else if (ev === 'drop') { sp.tx = px; sp.tz = pz }
  else if (ev === 'land') {
    io.audio.spiderLand(zs.x, 0.2, zs.z)
    _burstPt.x = zs.x; _burstPt.y = 0.05; _burstPt.z = zs.z
    io.fx.impact(_burstPt, _burstUp, 'floor', 1.5)
    _burstPt.y = 0.9
    // Every client checks its OWN player (same model as melee)
    if (ctx.selfOk && (ctx.lx - zs.x) ** 2 + (ctx.lz - zs.z) ** 2 <= SPIDER.POUNCE_RADIUS * SPIDER.POUNCE_RADIUS) {
      sys.store.getState().hitPlayer(SPIDER.POUNCE_DAMAGE, zs.x, zs.z)
    }
    zs.attackTimer = 1.2   // no instant follow-up claw after the pounce
  }
  if (sp.s === 'drop') {
    // pulls toward where the player stood when it let go
    const dx = sp.tx - zs.x, dz = sp.tz - zs.z
    const d = Math.hypot(dx, dz)
    if (d > 0.05) {
      const st = Math.min(d, SPIDER.LUNGE_SPEED * dt)
      applyMove(zs, (dx / d) * st, (dz / d) * st, sys.walls)
    }
  }
  zs.y = sp.y
  return sp.s !== 'floor'
}

// Death: falls off the ceiling (gravity), rolls onto its belly with the limbs curling up, then
// settles like any other corpse. Returns true once it has settled.
export function spiderDeathTick(zs, dt) {
  const sp = zs.spd
  let d = zs.spDead
  if (!d) {
    d = zs.spDead = { t: 0, f0: sp.flip, vy: sp.s === 'drop' ? sp.vy : 0, k: 0 }
  }
  d.t += dt
  if (zs.y > SPIDER.CORPSE_Y) {
    d.vy += SPIDER.GRAVITY * dt
    zs.y = Math.max(SPIDER.CORPSE_Y, zs.y - d.vy * dt)
  }
  d.k = smooth(0, SPIDER.DEATH_ROLL, d.t)
  return d.t >= SPIDER.DEATH_ROLL && zs.y <= SPIDER.CORPSE_Y
}
