// Spitter: decides where to stand (hold still while the target is visible and in range; otherwise,
// when outside, walk to the nearest window with a clear line to the player and spit through it),
// winds up, and lobs a glob. The head / throat-sac wind-up pose is drawn by the pose layer from
// `zs.sp.poseK` (set whenever the old loop called spitterPose).
import { SPITTER, globFlightTime } from '../zombieSpecials'
import { raycastWorld } from '../worldRay'
import { runRandom } from '../rng'

const _spitWr = { dist: 0, nx: 0, ny: 0, nz: 0, kind: 0 }

// Spitter line of sight: mouth height -> player's chest, against the bullet wall list
// (window gaps are open; boarded planks do not block the acid).
export function spitLOS(sys, x1, z1, x2, z2) {
  const dx = x2 - x1, dy = 1.0 - 1.45, dz = z2 - z1
  const len = Math.hypot(dx, dy, dz) || 1
  return !raycastWorld(x1, 1.45, z1, dx / len, dy / len, dz / len, len - 0.2, sys.bulletWalls, sys.wallH, null, null, 0, 0, 0, _spitWr)
}

function pose(sp, k) { sp.poseK = k; sp.poseDirty = true }

export function spitterThink(sys, zs, dt, px, pz) {
  const sp = zs.sp
  const defs = sys.map.WINDOW_DEFS
  const dist = Math.hypot(px - zs.x, pz - zs.z)
  sp.postT -= dt
  if (sp.postT <= 0) {
    sp.postT = 0.4
    sp.los = dist <= SPITTER.RANGE && spitLOS(sys, zs.x, zs.z, px, pz)
    sp.post = -1
    if (!sp.los && !(Math.abs(zs.x) < sys.cabinHW && Math.abs(zs.z) < sys.cabinHD)) {
      let best = Infinity
      for (let i = 0; i < defs.length; i++) {
        const w = defs[i]
        const d = (w.ax - zs.x) ** 2 + (w.az - zs.z) ** 2
        if (d < best && Math.hypot(w.ax - px, w.az - pz) <= SPITTER.RANGE && spitLOS(sys, w.ax, w.az, px, pz)) { best = d; sp.post = w.id }
      }
    }
  }
  sp.hold = sp.los && dist <= SPITTER.RANGE
  if (sp.post >= 0 && !sp.hold) { sp.gx = defs[sp.post].ax; sp.gz = defs[sp.post].az } else { sp.gx = px; sp.gz = pz }
}

export function spitterCancel(zs) {
  const sp = zs.sp
  if (sp.state !== 1) return
  sp.state = 0
  sp.cd = 1.5          // getting hit mid-wind-up interrupts the spit
  pose(sp, 0)
}

export function spitterTick(sys, zs, dt, px, pz) {
  const sp = zs.sp
  if (sp.state === 0) {
    sp.cd -= dt
    if (sp.cd <= 0 && sp.hold) { sp.state = 1; sp.t = SPITTER.WINDUP; sys.io.audio.spitWindup(zs.x, 1.3, zs.z) }
    return
  }
  sp.t -= dt
  pose(sp, 1 - Math.max(0, sp.t) / SPITTER.WINDUP)
  if (sp.t <= 0) {
    sp.state = 0
    sp.cd = SPITTER.COOLDOWN_MIN + runRandom('ai')() * (SPITTER.COOLDOWN_MAX - SPITTER.COOLDOWN_MIN)
    pose(sp, 0)
    if (spitLOS(sys, zs.x, zs.z, px, pz)) {
      const dx = px - zs.x, dz = pz - zs.z
      const d = Math.hypot(dx, dz) || 1
      sys.io.fx.spit(zs.x + (dx / d) * 0.4, 1.45, zs.z + (dz / d) * 0.4, px, pz, globFlightTime(d))
      sys.io.audio.spitLaunch(zs.x, 1.4, zs.z)
    }
  }
}
