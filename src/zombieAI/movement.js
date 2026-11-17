// Zombie movement: collision-checked stepping, line of sight and waypoint following.
// Pure (no React / three.js). `pos` is anything with numeric x / z (a sim zombie).
import { ZOMBIE_R, ARENA_BOUND, WAYPOINT_REACH } from './constants'

// Does a zombie circle (radius ZOMBIE_R) at (x, z) overlap any wall box? Same test as walls.js
// collidesWithWalls, with a cheap per-wall reject first (most walls are metres away).
function collides(x, z, walls) {
  const R = ZOMBIE_R
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i]
    const ddx = x - w.x, ddz = z - w.z
    if (ddx > w.halfW + R || ddx < -w.halfW - R || ddz > w.halfD + R || ddz < -w.halfD - R) continue
    const nearX = Math.max(w.x - w.halfW, Math.min(x, w.x + w.halfW))
    const nearZ = Math.max(w.z - w.halfD, Math.min(z, w.z + w.halfD))
    const dx = x - nearX, dz = z - nearZ
    if (dx * dx + dz * dz < R * R) return true
  }
  return false
}

// Move a zombie: full move -> axis-split for wall-threading -> push-out.
// The axis-split is needed so zombies can thread through narrow window
// openings when following A* paths at a slight angle.
export function applyMove(pos, vx, vz, walls) {
  const R = ZOMBIE_R
  const nx = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.x + vx))
  const nz = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.z + vz))

  if (!collides(nx, nz, walls)) {
    pos.x = nx; pos.z = nz; return
  }
  if (!collides(nx, pos.z, walls)) {
    pos.x = nx; return
  }
  if (!collides(pos.x, nz, walls)) {
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
  const R = ZOMBIE_R
  // Only walls near the segment can touch it: reject the rest by bounding box (same answer, ~10x fewer tests)
  const minX = Math.min(x1, x2) - R, maxX = Math.max(x1, x2) + R
  const minZ = Math.min(z1, z2) - R, maxZ = Math.max(z1, z2) + R
  for (let k = 0; k < walls.length; k++) {
    const w = walls[k]
    if (w.x + w.halfW < minX || w.x - w.halfW > maxX || w.z + w.halfD < minZ || w.z - w.halfD > maxZ) continue
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const x = x1 + dx * t, z = z1 + dz * t
      const nearX = Math.max(w.x - w.halfW, Math.min(x, w.x + w.halfW))
      const nearZ = Math.max(w.z - w.halfD, Math.min(z, w.z + w.halfD))
      const ex = x - nearX, ez = z - nearZ
      if (ex * ex + ez * ez < R * R) return false
    }
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
