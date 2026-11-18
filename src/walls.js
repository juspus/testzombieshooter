// Grid building, A* pathfinding, collision and line-of-sight helpers.

const GRID_ORIGIN = -18
export const GRID_SIZE = 36     // 36x36, covering -18..18 at 1 unit/cell
const CELL = 1.0

// Module-level blocked grid, rebuilt when walls change.
let _grid = new Uint8Array(GRID_SIZE * GRID_SIZE)

// Pre-allocated A* scratch buffers (single-threaded JS – safe).
const _g       = new Float32Array(GRID_SIZE * GRID_SIZE)
const _f       = new Float32Array(GRID_SIZE * GRID_SIZE)
const _par     = new Int32Array(GRID_SIZE * GRID_SIZE)
const _vis     = new Uint8Array(GRID_SIZE * GRID_SIZE)
// Binary min-heap open set: _heap[0..heapLen) holds cell indices ordered by _f.
// _heapPos[cell] = position in _heap, or -1 when not in the open set.
const _heap    = new Int32Array(GRID_SIZE * GRID_SIZE)
const _heapPos = new Int32Array(GRID_SIZE * GRID_SIZE)
let   _heapLen = 0

// ─── coordinate helpers ──────────────────────────────────────────────────────

function worldToCell(x, z) {
  return {
    col: Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((x - GRID_ORIGIN) / CELL))),
    row: Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((z - GRID_ORIGIN) / CELL))),
  }
}

export function isBlocked(x, z) {
  const col = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((x - GRID_ORIGIN) / CELL)))
  const row = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((z - GRID_ORIGIN) / CELL)))
  return _grid[row * GRID_SIZE + col] !== 0
}

export function cellToWorld(col, row) {
  return {
    x: GRID_ORIGIN + (col + 0.5) * CELL,
    z: GRID_ORIGIN + (row + 0.5) * CELL,
  }
}

// ─── grid ────────────────────────────────────────────────────────────────────

export function buildGrid(walls) {
  const PAD = 0   // no extra padding — keeps window gaps navigable
  _grid.fill(0)

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const wx = GRID_ORIGIN + col * CELL + CELL * 0.5
      const wz = GRID_ORIGIN + row * CELL + CELL * 0.5
      const hw = CELL * 0.5 + PAD
      const hd = CELL * 0.5 + PAD

      let blocked = false
      for (const w of walls) {
        if (aabbOverlap(wx, wz, hw, hd, w.x, w.z, w.halfW, w.halfD)) {
          blocked = true
          break
        }
      }
      _grid[row * GRID_SIZE + col] = blocked ? 1 : 0
    }
  }
  return _grid
}

function aabbOverlap(ax, az, ahw, ahd, bx, bz, bhw, bhd) {
  return Math.abs(ax - bx) < ahw + bhw && Math.abs(az - bz) < ahd + bhd
}

// ─── collision ───────────────────────────────────────────────────────────────

export function collidesWithWalls(x, z, radius, walls) {
  for (const w of walls) {
    const nearX = Math.max(w.x - w.halfW, Math.min(x, w.x + w.halfW))
    const nearZ = Math.max(w.z - w.halfD, Math.min(z, w.z + w.halfD))
    const dx = x - nearX, dz = z - nearZ
    if (dx * dx + dz * dz < radius * radius) return true
  }
  return false
}

// ─── auto-shoot occlusion ────────────────────────────────────────────────────

// True if any solid wall segment blocks the line from (x1,z1) to (x2,z2).
// Window gaps are treated as open (player/zombies are roughly at window height).
export function lineOfSightBlocked(x1, z1, x2, z2, walls) {
  const dx = x2 - x1, dz = z2 - z1
  for (const w of walls) {
    const minX = w.x - w.halfW, maxX = w.x + w.halfW
    const minZ = w.z - w.halfD, maxZ = w.z + w.halfD
    let tmin = 0, tmax = 1
    if (dx === 0) {
      if (x1 < minX || x1 > maxX) continue
    } else {
      let t1 = (minX - x1) / dx, t2 = (maxX - x1) / dx
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
      tmin = Math.max(tmin, t1)
      tmax = Math.min(tmax, t2)
    }
    if (dz === 0) {
      if (z1 < minZ || z1 > maxZ) continue
    } else {
      let t1 = (minZ - z1) / dz, t2 = (maxZ - z1) / dz
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
      tmin = Math.max(tmin, t1)
      tmax = Math.min(tmax, t2)
    }
    if (tmin > tmax) continue   // segment misses this wall's footprint

    if (w.wStart === null) return true   // solid wall, no window — fully blocked

    // Window present — open along [wStart, wEnd] relative to wall center.
    const along1 = w.axis === 'x' ? (x1 + dx * tmin) - w.x : (z1 + dz * tmin) - w.z
    const along2 = w.axis === 'x' ? (x1 + dx * tmax) - w.x : (z1 + dz * tmax) - w.z
    const lo = Math.min(along1, along2), hi = Math.max(along1, along2)
    if (lo >= w.wStart && hi <= w.wEnd) continue   // entirely within window gap
    return true
  }
  return false
}

// ─── A* pathfinding ──────────────────────────────────────────────────────────

// Grid column/row of world origin (0,0) — cabin interior centre.
const GRID_CENTER = Math.floor((0 - GRID_ORIGIN) / CELL)  // = 18

export function findPath(fromX, fromZ, toX, toZ) {
  const s = worldToCell(fromX, fromZ)
  const g = worldToCell(toX,   toZ)
  // If the goal cell is blocked (player pressed into a corner), reroute to the
  // nearest open neighbour that is closest to cabin centre so we always pick an
  // interior cell rather than accidentally targeting one outside the wall.
  const gc = _grid[g.row * GRID_SIZE + g.col] ? nearestOpenToCenter(g.col, g.row) : g
  if (!gc) return null
  return aStar(s.col, s.row, gc.col, gc.row)
}

function nearestOpenToCenter(col, row) {
  for (let r = 1; r <= 3; r++) {
    let best = null, bestDist = Infinity
    for (let dc = -r; dc <= r; dc++) {
      for (let dr = -r; dr <= r; dr++) {
        if (Math.abs(dc) !== r && Math.abs(dr) !== r) continue
        const nc = col + dc, nr = row + dr
        if (nc < 0 || nc >= GRID_SIZE || nr < 0 || nr >= GRID_SIZE) continue
        if (!_grid[nr * GRID_SIZE + nc]) {
          const d = (nc - GRID_CENTER) * (nc - GRID_CENTER) + (nr - GRID_CENTER) * (nr - GRID_CENTER)
          if (d < bestDist) { bestDist = d; best = { col: nc, row: nr } }
        }
      }
    }
    if (best) return best
  }
  return null
}

function aStar(sc, sr, gc, gr) {
  _g.fill(Infinity)
  _f.fill(Infinity)
  _par.fill(-1)
  _vis.fill(0)
  _heapPos.fill(-1)
  _heapLen = 0

  const si = sr * GRID_SIZE + sc
  _g[si] = 0
  _f[si] = h(sc, sr, gc, gr)
  heapPush(si)

  const DIRS = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [1, 1, 1.414],
  ]

  while (_heapLen > 0) {
    const minI = heapPop()
    const cc = minI % GRID_SIZE
    const cr = (minI / GRID_SIZE) | 0

    if (cc === gc && cr === gr) {
      const path = []
      let cur = minI
      while (cur !== -1) {
        const c = cur % GRID_SIZE, r = (cur / GRID_SIZE) | 0
        path.unshift(cellToWorld(c, r))
        cur = _par[cur]
      }
      return path
    }

    _vis[minI] = 1

    for (const [dc, dr, cost] of DIRS) {
      const nc = cc + dc, nr = cr + dr
      if (nc < 0 || nc >= GRID_SIZE || nr < 0 || nr >= GRID_SIZE) continue
      const ni = nr * GRID_SIZE + nc
      if (_grid[ni] || _vis[ni]) continue
      if (dc !== 0 && dr !== 0 && (_grid[cr * GRID_SIZE + cc + dc] || _grid[(cr + dr) * GRID_SIZE + cc])) continue

      const tg = _g[minI] + cost
      if (tg < _g[ni]) {
        _par[ni] = minI
        _g[ni] = tg
        _f[ni] = tg + h(nc, nr, gc, gr)
        if (_heapPos[ni] >= 0) {
          heapSiftUp(_heapPos[ni])   // decrease-key: already in heap, bubble up
        } else {
          heapPush(ni)
        }
      }
    }
  }
  return null
}

// ─── min-heap helpers ────────────────────────────────────────────────────────

function heapPush(ci) {
  const pos = _heapLen++
  _heap[pos] = ci
  _heapPos[ci] = pos
  heapSiftUp(pos)
}

function heapPop() {
  const top = _heap[0]
  _heapPos[top] = -1
  const last = _heap[--_heapLen]
  if (_heapLen > 0) {
    _heap[0] = last
    _heapPos[last] = 0
    heapSiftDown(0)
  }
  return top
}

function heapSiftUp(pos) {
  const ci = _heap[pos]
  const f  = _f[ci]
  while (pos > 0) {
    const parent = (pos - 1) >> 1
    const pci = _heap[parent]
    if (_f[pci] <= f) break
    _heap[pos] = pci
    _heapPos[pci] = pos
    pos = parent
  }
  _heap[pos] = ci
  _heapPos[ci] = pos
}

function heapSiftDown(pos) {
  const ci = _heap[pos]
  const f  = _f[ci]
  while (true) {
    const left = (pos << 1) + 1
    if (left >= _heapLen) break
    const right = left + 1
    const child = (right < _heapLen && _f[_heap[right]] < _f[_heap[left]]) ? right : left
    if (_f[_heap[child]] >= f) break
    _heap[pos] = _heap[child]
    _heapPos[_heap[pos]] = pos
    pos = child
  }
  _heap[pos] = ci
  _heapPos[ci] = pos
}

function h(c, r, gc, gr) {
  return Math.abs(c - gc) + Math.abs(r - gr)
}
