// Hit reaction input: called on every gun / knife / blast hit (see hitFx.js, Zombie.hitReact). It only
// records timers and the killing blow in the zombie's sim state; the pose layer draws the flash, lean,
// head snap and death fall from them. Returns blood intensity: 0 = regular hit, 1 = kill,
// 2 = headshot / deagle kill.
import { FLASH_DURATION, LEAN_DURATION, HEAD_SNAP_DURATION, STAGGER_COOLDOWN, FLASH_ON } from './constants'

export function recordHit(sys, zs, dx, dy, dz, head, weapon, dist) {
  if (!zs || zs.corpse) return 0
  const f = zs.fx
  const now = sys.io.now()
  if (now - f.lastHit > 150) f.pellets = 0
  f.lastHit = now
  if (weapon === 'shotgun') f.pellets++
  if (f.flash <= 0) zs.flashCmd = FLASH_ON   // already flashing (e.g. next shotgun pellet): just extend
  f.flash = FLASH_DURATION

  const st = sys.store.getState().zombies.find((z) => z.id === zs.id)
  if (st?.dying) {
    // The first hit that finds the zombie dying is the killing blow (the death
    // animation hasn't started yet); later pellets just add to the blast.
    if (zs.deathStarted) return 0
    if (f.kill) { f.kill.pellets = f.pellets; return 0 }
    f.kill = { weapon, head, dx, dz, dist, pellets: f.pellets }
    return (head || weapon === 'deagle') ? 2 : 1
  }

  const heavy = zs.type === 'brute' || zs.type === 'armored' || zs.arch.boss
  const big = weapon === 'deagle' || (weapon === 'shotgun' && dist < 5)
  if (heavy && !big) return 0   // small hits on brutes/bosses only flash

  // Shot direction in the zombie's local frame (the body is yawed about Y only)
  const c = Math.cos(zs.yaw), s = Math.sin(zs.yaw)
  const vx = dx * c - dz * s
  const vz = dx * s + dz * c
  const l = Math.hypot(vx, vz) || 1
  f.lx = vx / l; f.lz = vz / l
  f.leanA = (head ? 0.3 : 0.17) * (big ? 1.5 : 1) * (heavy ? 0.6 : 1)
  f.lean = LEAN_DURATION
  if (head && f.head <= 0) {
    f.hbSet = false   // the pose layer captures the head's rest position when the snap starts
    f.headA = heavy ? 0.4 : 0.65
    f.head = HEAD_SNAP_DURATION
  }
  if (f.staggerCd <= 0) {
    f.stagger = head ? 0.26 : 0.18
    f.staggerCd = STAGGER_COOLDOWN
  }
  return 0
}
