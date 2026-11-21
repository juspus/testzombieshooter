// Exploder: hiss + swell + flash, then a burst. Armed either by reaching a player / window
// (PRIME_TIME) or by dying (DEATH_FUSE, plays over the fall).
import { burstPlayerDamage, burstZombieDamage, burstPlankHits } from '../zombieSpecials'
import { FLASH_ON, FLASH_OFF } from './constants'

const _burstUp = { x: 0, y: 1, z: 0 }
const _burstPt = { x: 0, y: 0.9, z: 0 }

export function startFuse(sys, zs, total) {
  const ex = zs.ex
  if (ex.done || ex.fuse >= 0) return
  ex.fuse = ex.total = total
  sys.io.audio.exploderHiss(zs.x, 1.2, zs.z)
}

// The pose layer scales the body and swaps the hit-flash material from `zs.ex` / `zs.flashCmd`.
export function exploderTick(sys, zs, dt) {
  const ex = zs.ex
  if (ex.done || ex.fuse < 0) return
  ex.fuse -= dt
  const k = Math.min(1, 1 - ex.fuse / ex.total)
  ex.flashT -= dt
  if (ex.flashT <= 0) {
    ex.flashOn = !ex.flashOn
    ex.flashT = 0.13 - 0.08 * k
    zs.flashCmd = ex.flashOn ? FLASH_ON : FLASH_OFF
  }
  if (ex.fuse <= 0) explode(sys, zs)
}

// Every client plays the VFX and damages its OWN player (same model as melee). Only the
// host applies world damage (other zombies, planks, the exploder's own death); guests
// receive it through the usual zombie_update / hit_plank sync.
function explode(sys, zs) {
  const ex = zs.ex
  ex.done = true; ex.fuse = -1
  zs.flashCmd = FLASH_OFF
  const x = zs.x, z = zs.z
  const io = sys.io
  io.fx.flash(x, 0.9, z)
  io.fx.scorch(x, z)
  _burstPt.x = x; _burstPt.y = 0.9; _burstPt.z = z
  io.fx.impact(_burstPt, _burstUp, 'burst')
  io.audio.explosion(x, 1, z)
  const ctx = sys.ctx
  const pd = burstPlayerDamage(Math.hypot(ctx.lx - x, ctx.lz - z))
  if (pd > 0) sys.store.getState().hitPlayer(pd, x, z)

  const st = sys.store.getState()
  if (st.mpRole && st.mpRole !== 'host') return
  const id = zs.id
  const me = st.zombies.find((q) => q.id === id)
  if (me && !me.dying) st.hitZombieBurst(id, 999)
  const list = sys.list
  for (let i = 0; i < list.length; i++) {
    const o = list[i]
    if (o === zs || o.corpse) continue
    const dx = o.x - x, dz = o.z - z
    const d = Math.hypot(dx, dz)
    const dmg = burstZombieDamage(d)
    if (dmg <= 0) continue
    const other = sys.store.getState().zombies.find((q) => q.id === o.id)
    if (!other || other.dying) continue
    sys.store.getState().hitZombieBurst(o.id, dmg)
    sys.hitReact(o.id, dx / (d || 1), 0.15, dz / (d || 1), false, 'shotgun', d)   // after the store update, so a kill gets the blast-back fall
  }
  const planks = sys.store.getState().windowPlanks
  const defs = sys.map.WINDOW_DEFS
  for (let i = 0; i < defs.length; i++) {
    const w = defs[i]
    const hits = burstPlankHits(Math.hypot(w.winX - x, w.winZ - z))
    if (hits <= 0) continue
    sys.store.getState().breakWindow(w.id)
    if ((planks[w.id] ?? 0) === 0) continue
    for (let h = 0; h < hits; h++) {
      sys.store.getState().hitPlank(w.id)
      sys.io.net.event('hit_plank', { windowId: w.id })
    }
  }
}
