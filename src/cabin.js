// Cabin geometry — source of truth for structure, windows, and spawn points.

export const CABIN_HW  = 7        // X: ±7  (width = 14)
export const CABIN_HD  = 9        // Z: ±9  (depth = 18)
export const WALL_H    = 3.2
export const WALL_T    = 0.3
export const WALL_HT   = WALL_T / 2   // 0.15

export const WIN_Y0    = 0.5      // window sill height
export const WIN_Y1    = 2.0      // window lintel height
export const WIN_HALF  = 1.0      // half-width of each window opening (2 units wide)

export const DOOR_CX   = -2       // door center X (south wall)
export const DOOR_HALF = 1.2      // door half-width

// Solid wall AABB segments (window/door gaps excluded) — used by buildGrid and collidesWithWalls.
// halfW = half-extent in X, halfD = half-extent in Z.
export function cabinWallSegments() {
  const HW = CABIN_HW, HD = CABIN_HD, HT = WALL_HT
  return [
    // North wall (z=-HD), windows at x=-4 and x=+4
    { x: -6,  z: -HD, halfW: 1,   halfD: HT  },  // x ∈ [-7, -5]
    { x:  0,  z: -HD, halfW: 3,   halfD: HT  },  // x ∈ [-3,  3]
    { x:  6,  z: -HD, halfW: 1,   halfD: HT  },  // x ∈ [ 5,  7]
    // South wall (z=+HD), window at x=+4; door at x=-2 is barricaded (solid)
    { x: -2,  z:  HD, halfW: 5,   halfD: HT  },  // x ∈ [-7,  3]
    { x:  6,  z:  HD, halfW: 1,   halfD: HT  },  // x ∈ [ 5,  7]
    // East wall (x=+HW), window at z=0
    { x:  HW, z: -5,  halfW: HT,  halfD: 4   },  // z ∈ [-9, -1]
    { x:  HW, z:  5,  halfW: HT,  halfD: 4   },  // z ∈ [ 1,  9]
    // West wall (x=-HW), window at z=-3
    { x: -HW, z: -6.5, halfW: HT, halfD: 2.5 },  // z ∈ [-9, -4]
    { x: -HW, z:  3.5, halfW: HT, halfD: 5.5 },  // z ∈ [-2,  9]
  ]
}

// Zombie spawn clusters — one per window, positioned outside the cabin.
// Window definitions — used for boarding interaction, visuals, and grid blocking.
// ix/iz: interior interaction point (player stands here to board).
// winX/winZ: wall-center of the window opening (for plank placement).
export const WINDOW_DEFS = [
  { id: 0, wall: 'N', winX: -4,        winZ: -CABIN_HD, ix: -4,               iz: -CABIN_HD + 1.5, ax: -4,               az: -CABIN_HD - 1.5 },
  { id: 1, wall: 'N', winX:  4,        winZ: -CABIN_HD, ix:  4,               iz: -CABIN_HD + 1.5, ax:  4,               az: -CABIN_HD - 1.5 },
  { id: 2, wall: 'E', winX:  CABIN_HW, winZ:  0,        ix:  CABIN_HW - 1.5,  iz:  0,              ax:  CABIN_HW + 1.5,  az:  0              },
  { id: 3, wall: 'W', winX: -CABIN_HW, winZ: -3,        ix: -CABIN_HW + 1.5,  iz: -3,              ax: -CABIN_HW - 1.5,  az: -3              },
  { id: 4, wall: 'S', winX:  4,        winZ:  CABIN_HD, ix:  4,               iz:  CABIN_HD - 1.5, ax:  4,               az:  CABIN_HD + 1.5 },
]

// AABB segment added to the grid when a window is boarded (≥1 plank).
export function windowBlockSegment(id) {
  const HT = WALL_HT, W = WIN_HALF
  const win = WINDOW_DEFS[id]
  const isNS = win.wall === 'N' || win.wall === 'S'
  return isNS
    ? { x: win.winX, z: win.winZ, halfW: W,  halfD: HT }
    : { x: win.winX, z: win.winZ, halfW: HT, halfD: W  }
}

// Full wall segment list including boarded windows.
export function allWallSegments(windowPlanks = {}) {
  const base = cabinWallSegments()
  const extra = Object.entries(windowPlanks)
    .filter(([, count]) => count > 0)
    .map(([id]) => windowBlockSegment(Number(id)))
  return [...base, ...extra]
}

// Player collision walls: cabin structure + every window opening always blocked.
// Windows are for zombies only — player cannot climb through them.
export function playerCollisionWalls() {
  return [
    ...cabinWallSegments(),
    ...WINDOW_DEFS.map((win) => windowBlockSegment(win.id)),
  ]
}

export const SPAWN_CLUSTERS = [
  { x: -4, z: -13 },   // near north window 1 (x=-4)
  { x:  4, z: -13 },   // near north window 2 (x=+4)
  { x: 13, z:   0 },   // near east window   (z=0)
  { x: -13, z: -3 },   // near west window   (z=-3)
  { x:  4, z:  13 },   // near south window  (x=+4)
]
