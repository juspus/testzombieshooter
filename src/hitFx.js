// Cosmetic per-hit feedback: zombie flinch/death-style (Zombie.hitReact) and
// blood burst + decals (BloodFX.spawn). Called by Player.jsx for local hits and
// by NetManager for the co-op partner's hits (the payload from fxNet below
// rides along on the existing 'hit_zombie' event). Must run AFTER
// store.hitZombie so the zombie's `dying` flag is already set.
import BloodFX from './components/BloodFX'
import { Zombie, getZombiePositions } from './components/Zombie'

const _p = { x: 0, y: 0, z: 0 }
const _d = { x: 0, y: 0, z: 1 }

export function zombieHitFx(id, point, dir, head, weapon, dist) {
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
