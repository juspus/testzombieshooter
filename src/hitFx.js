// Cosmetic per-hit feedback: zombie flinch/death-style (Zombie.hitReact) and
// blood burst + decals (BloodFX.spawn). Called by Player.jsx for local hits and
// by NetManager for the co-op partner's hits (the payload from fxNet below
// rides along on the existing 'hit_zombie' event). Must run AFTER
// store.hitZombie so the zombie's `dying` flag is already set.
import BloodFX from './components/BloodFX'
import { Zombie, getZombiePositions } from './components/Zombie'
import { useGameStore } from './store'
import { isArmorDeflect } from './zombieSpecials'
import { spawnImpact } from './impactParticles'
import { playArmorPing } from './sounds'

const _p = { x: 0, y: 0, z: 0 }
const _d = { x: 0, y: 0, z: 1 }
const _back = { x: 0, y: 0, z: 0 }

export function zombieHitFx(id, point, dir, head, weapon, dist) {
  // Armour deflect: sparks + metal ping instead of blood, no flinch. A killing blow
  // (zombie already dying) falls through to the normal reaction.
  const z = useGameStore.getState().zombies.find((q) => q.id === id)
  if (z && z.type === 'armored' && !z.dying && isArmorDeflect('armored', { head, weapon, dist, source: 'gun' })) {
    _back.x = -dir.x; _back.y = 0.25 - dir.y * 0.5; _back.z = -dir.z
    spawnImpact(point, _back, 'metal', weapon === 'shotgun' ? 0.4 : 1)
    playArmorPing(point.x, point.y, point.z)
    return
  }
  const intensity = Zombie.hitReact(id, dir.x, dir.y, dir.z, head, weapon, dist)
  BloodFX.spawn?.(point, dir, intensity, weapon === 'shotgun')
}

const r2 = (n) => Math.round(n * 100) / 100

// Extra fields for the 'hit_zombie' net event
export function fxNet(point, dir, dist, weapon) {
  return { px: r2(point.x), py: r2(point.y), pz: r2(point.z), dx: r2(dir.x), dy: r2(dir.y), dz: r2(dir.z), dist: r2(dist), weapon }
}

// Partner's hit arrived (old clients may omit the fx fields)
export function zombieHitFxFromNet(data) {
  if (data.px === undefined) return
  _p.x = data.px; _p.y = data.py; _p.z = data.pz
  _d.x = data.dx; _d.y = data.dy; _d.z = data.dz
  zombieHitFx(data.id, _p, _d, !!data.isHeadshot, data.weapon ?? 'pistol', data.dist ?? 5)
}

// Dev/preview only: hooks for browser-driven verification
if (typeof window !== 'undefined' && import.meta.env.VITE_VERCEL_ENV !== 'production') {
  window.__zombieHitFx = zombieHitFx
  window.__zombiePositions = getZombiePositions
}
