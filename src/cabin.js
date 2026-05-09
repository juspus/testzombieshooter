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
export const SPAWN_CLUSTERS = [
  { x: -4, z: -13 },   // near north window 1 (x=-4)
  { x:  4, z: -13 },   // near north window 2 (x=+4)
  { x: 13, z:   0 },   // near east window   (z=0)
  { x: -13, z: -3 },   // near west window   (z=-3)
  { x:  4, z:  13 },   // near south window  (x=+4)
]
