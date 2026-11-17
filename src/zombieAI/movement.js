// Zombie movement: collision-checked stepping, line of sight and waypoint following.
// Pure (no React / three.js). `pos` is anything with numeric x / z (a sim zombie).
import { collidesWithWalls } from '../walls'
import { ZOMBIE_R, ARENA_BOUND, WAYPOINT_REACH } from './constants'

// Move a zombie: full move -> axis-split for wall-threading -> push-out.
// The axis-split is needed so zombies can thread through narrow window
// openings when following A* paths at a slight angle.
export function applyMove(pos, vx, vz, walls) {
  const R = ZOMBIE_R
  const nx = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.x + vx))
  const nz = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.z + vz))

  if (!collidesWithWalls(nx, nz, R, walls)) {
    pos.x = nx; pos.z = nz; return
  }
  if (!collidesWithWalls(nx, pos.z, R, walls)) {
    pos.x = nx; return
  }
  if (!collidesWithWalls(pos.x, nz, R, walls)) {
    pos.z = nz; return
  }

  // Fully blocked: push out of penetrating walls.
  let pushX = 0, pushZ = 0
  for (const w of walls) {
    const nearX = Math.max(w.x - w.halfW, Math.min(pos.x, w.x + w.halfW))
    const nearZ = Math.max(w.z - w.halfD, Math.min(pos.z, w.z + w.halfD))
    const dx = pos.x - nearX, dz = pos.z - nearZ
    const d2 = dx * dx + dz * dz
    if (d2 < R * R) {
      const d = Math.sqrt(d2) || 0.001
      pushX += (dx / d) * (R - d)
      pushZ += (dz / d) * (R - d)
    }
  }
  pos.x = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.x + pushX))
  pos.z = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.z + pushZ))
}

// Geometry-accurate line-of-sight: samples along the segment at half-radius
// intervals and checks the zombie's full circle against the real wall AABBs.
export function hasDirectPath(x1, z1, x2, z2, walls) {
  const dx = x2 - x1, dz = z2 - z1
  const dist = Math.sqrt(dx * dx + dz * dz)
  if (dist < 0.01) return true
  const steps = Math.max(2, Math.ceil(dist / (ZOMBIE_R * 0.5)))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    if (collidesWithWalls(x1 + dx * t, z1 + dz * t, ZOMBIE_R, walls)) return false
  }
  return true
}

// Direction toward the next waypoint (or straight at the fallback point when there is no path).
// Writes the unit vector to zs.mx / zs.mz and returns true, or returns false for "stand still".
export function followPath(zs, fallbackX, fallbackZ, walls) {
  const path = zs.path
  if (path.length > 0 && zs.wpIdx < path.length) {
    // LOS shortcut: skip waypoints we can already see directly
    while (
      zs.wpIdx < path.length - 1 &&
      hasDirectPath(zs.x, zs.z, path[zs.wpIdx + 1].x, path[zs.wpIdx + 1].z, walls)
    ) { zs.wpIdx++ }
    const wp = path[zs.wpIdx]
    const dx = wp.x - zs.x, dz = wp.z - zs.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < WAYPOINT_REACH) { zs.wpIdx++; return false }
    zs.mx = dx / dist; zs.mz = dz / dist
    return true
  }
  const dx = fallbackX - zs.x, dz = fallbackZ - zs.z
  const dist = Math.sqrt(dx * dx + dz * dz)
  if (dist > 0.01) { zs.mx = dx / dist; zs.mz = dz / dist; return true }
  return false
}
