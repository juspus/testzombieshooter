// Analytic ray vs. static world (wall AABBs, floor, ceiling, boarded windows).
// Used only to find a visual impact point for sparks/splinters and to end bullet
// trails on the surface they hit; it does NOT affect gameplay hit detection.
// Pure math, no allocations (writes into `out`).

export const HIT_NONE = 0
export const HIT_WALL = 1
export const HIT_FLOOR = 2
export const HIT_PLANK = 3

// out: { dist, nx, ny, nz, kind }. Returns true when something is hit within maxDist.
export function raycastWorld(ox, oy, oz, dx, dy, dz, maxDist, segments, wallH, windows, windowPlanks, winY0, winY1, winHalf, out) {
  let best = maxDist
  let kind = HIT_NONE
  let nx = 0, ny = 0, nz = 0

  // Floor / ceiling
  if (dy < -1e-6) {
    const t = -oy / dy
    if (t > 0 && t < best) { best = t; kind = HIT_FLOOR; nx = 0; ny = 1; nz = 0 }
  } else if (dy > 1e-6) {
    const t = (wallH - oy) / dy
    if (t > 0 && t < best) { best = t; kind = HIT_WALL; nx = 0; ny = -1; nz = 0 }
  }

  // Wall AABBs (slab test in X/Z, clipped to [0, wallH] in Y)
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    let tmin = 0, tmax = best
    let enterAxis = 0, enterSign = 0

    // X slab
    if (Math.abs(dx) < 1e-9) {
      if (ox < s.x - s.halfW || ox > s.x + s.halfW) continue
    } else {
      let t1 = (s.x - s.halfW - ox) / dx, t2 = (s.x + s.halfW - ox) / dx
      let sign = -1
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1 }
      if (t1 > tmin) { tmin = t1; enterAxis = 1; enterSign = sign }
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) continue
    }
    // Z slab
    if (Math.abs(dz) < 1e-9) {
      if (oz < s.z - s.halfD || oz > s.z + s.halfD) continue
    } else {
      let t1 = (s.z - s.halfD - oz) / dz, t2 = (s.z + s.halfD - oz) / dz
      let sign = -1
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1 }
      if (t1 > tmin) { tmin = t1; enterAxis = 2; enterSign = sign }
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) continue
    }
    if (enterAxis === 0 || tmin <= 0 || tmin >= best) continue   // started inside, or farther than best
    const hy = oy + dy * tmin
    if (hy < 0 || hy > wallH) continue
    best = tmin
    kind = HIT_WALL
    nx = enterAxis === 1 ? enterSign : 0
    ny = 0
    nz = enterAxis === 2 ? enterSign : 0
  }

  // Boarded window openings
  if (windows && windowPlanks) {
    for (let i = 0; i < windows.length; i++) {
      const win = windows[i]
      if (!(windowPlanks[win.id] > 0)) continue
      const isNS = win.wall === 'N' || win.wall === 'S'
      const denom = isNS ? dz : dx
      if (Math.abs(denom) < 1e-6) continue
      const t = ((isNS ? win.winZ : win.winX) - (isNS ? oz : ox)) / denom
      if (t <= 0 || t >= best) continue
      const hy = oy + dy * t
      if (hy < winY0 || hy > winY1) continue
      const cross = isNS ? ox + dx * t : oz + dz * t
      if (Math.abs(cross - (isNS ? win.winX : win.winZ)) > winHalf) continue
      best = t
      kind = HIT_PLANK
      nx = isNS ? 0 : (denom > 0 ? -1 : 1)
      ny = 0
      nz = isNS ? (denom > 0 ? -1 : 1) : 0
    }
  }

  if (kind === HIT_NONE) return false
  out.dist = best; out.kind = kind; out.nx = nx; out.ny = ny; out.nz = nz
  return true
}
