// Wall generation, grid building, A* pathfinding, and collision helpers.

export const WALL_HEIGHT = 2.5
export const WALL_THICKNESS = 0.3
export const WIN_BOTTOM = 0.75   // window opening starts at y=0.75
export const WIN_TOP = 1.75      // window opening ends at y=1.75

export const GRID_ORIGIN = -18
export const GRID_SIZE = 36     // 36x36, covering -18..18 at 1 unit/cell
export const CELL = 1.0

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

export function worldToCell(x, z) {
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

// ─── wall generation ─────────────────────────────────────────────────────────

const TEMPLATES = [
  // inner ring
  { x: -6,  z: -6,  axis: 'x', len: 5 },
  { x:  6,  z: -6,  axis: 'z', len: 5 },
  { x: -6,  z:  6,  axis: 'z', len: 5 },
  { x:  6,  z:  6,  axis: 'x', len: 5 },
  // mid ring
  { x: -11, z:  0,  axis: 'z', len: 6 },
  { x:  11, z:  0,  axis: 'z', len: 6 },
  { x:   0, z: -11, axis: 'x', len: 6 },
  { x:   0, z:  11, axis: 'x', len: 6 },
  // outer pockets
  { x: -13, z: -9,  axis: 'x', len: 5 },
  { x:  13, z: -9,  axis: 'z', len: 5 },
  { x: -13, z:  9,  axis: 'z', len: 5 },
  { x:  13, z:  9,  axis: 'x', len: 5 },
]

export function generateWalls() {
  const shuffled = [...TEMPLATES].sort(() => Math.random() - 0.5)
  const count = 6 + Math.floor(Math.random() * 3)   // 6–8 walls

  return shuffled.slice(0, count).map((t, i) => {
    const halfLen = t.len / 2
    const halfThick = WALL_THICKNESS / 2
    const hasWindow = Math.random() < 0.45   // ~45% of walls get a window
    const winSize = 1.5
    // random window position (not too close to either end)
    const margin = 0.8
    const range = t.len - winSize - margin * 2
    const wOff = range > 0 ? (Math.random() - 0.5) * range : 0
    const wStart = hasWindow ? wOff - winSize / 2 : null
    const wEnd   = hasWindow ? wOff + winSize / 2 : null

    // slight random jitter on position
    const jx = (Math.random() - 0.5) * 2
    const jz = (Math.random() - 0.5) * 2

    return {
      id: i,
      x: t.x + jx,
      z: t.z + jz,
      axis: t.axis,
      halfLen,
      halfW: t.axis === 'x' ? halfLen : halfThick,
      halfD: t.axis === 'z' ? halfLen : halfThick,
      wStart,   // relative to wall center, along main axis
      wEnd,
    }
  })
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

// ─── line-of-sight ───────────────────────────────────────────────────────────

export function hasLineOfSight(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1
  const dist = Math.sqrt(dx * dx + dz * dz)
  if (dist < 0.01) return true
  // sample at half-cell intervals along the segment
  const steps = Math.ceil(dist / (CELL * 0.5)) + 1
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const col = Math.floor((x1 + dx * t - GRID_ORIGIN) / CELL)
    const row = Math.floor((z1 + dz * t - GRID_ORIGIN) / CELL)
    if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) continue
    if (_grid[row * GRID_SIZE + col]) return false
  }
  return true
}

// ─── A* pathfinding ──────────────────────────────────────────────────────────

export function findPath(fromX, fromZ, toX, toZ) {
  const s = worldToCell(fromX, fromZ)
  const g = worldToCell(toX,   toZ)
  return aStar(s.col, s.row, g.col, g.row)
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
