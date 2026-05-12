// Cabin geometry — source of truth for structure, windows, and spawn points.

export const CABIN_HW  = 9        // X: ±9  (width = 18)
export const CABIN_HD  = 10       // Z: ±10 (depth = 20)
export const WALL_H    = 3.2
export const WALL_T    = 0.6
export const WALL_HT   = WALL_T / 2   // 0.15

export const WIN_Y0    = 0.5      // window sill height
export const WIN_Y1    = 2.0      // window lintel height
export const WIN_HALF  = 1.0      // half-width of each window opening (2 units wide)

// West wall exterior door (hall section)
export const DOOR_Z    = 0        // door center Z on west wall
export const DOOR_HALF = 1.2      // door half-width

// Interior partition positions
export const PART_Z_BH = -4       // Z of bedroom/hall partition
export const PART_Z_HK =  5       // Z of hall/kitchen partition
export const PART_X    = -2       // X of west-rooms/main-room partition

// Rooms (for reference):
//   Bedroom:   X∈[-9,-2], Z∈[-10,-4]
//   Hall:      X∈[-9,-2], Z∈[-4,+5]   (west exterior door + window)
//   Kitchen:   X∈[-9,-2], Z∈[+5,+10]  (small, not connected to main room)
//   Main room: X∈[-2,+9], Z∈[-10,+10]

// Solid wall AABB segments (window/door gaps excluded) — used by buildGrid and collidesWithWalls.
export function cabinWallSegments() {
  const HW = CABIN_HW, HD = CABIN_HD, HT = WALL_HT
  return [
    // === EXTERIOR WALLS ===

    // North wall (Z=-10), bedroom section: windows at X=-7 and X=-4
    { x: -8.5, z: -HD, halfW: 0.5, halfD: HT },  // x∈[-9,-8]
    { x: -5.5, z: -HD, halfW: 0.5, halfD: HT },  // x∈[-6,-5]
    { x: -2.5, z: -HD, halfW: 0.5, halfD: HT },  // x∈[-3,-2]
    // North wall (Z=-10), main room section: solid
    { x:   3.5, z: -HD, halfW: 5.5, halfD: HT },  // x∈[-2,+9]

    // South wall (Z=+10), kitchen section: window at X=-5
    { x: -7.5, z: +HD, halfW: 1.5, halfD: HT },  // x∈[-9,-6]
    { x:  -3,  z: +HD, halfW:   1, halfD: HT },  // x∈[-4,-2]
    // South wall (Z=+10), main room section: window at X=+4
    { x:  0.5, z: +HD, halfW: 2.5, halfD: HT },  // x∈[-2,+3]
    { x:    7, z: +HD, halfW:   2, halfD: HT },  // x∈[+5,+9]

    // East wall (X=+9): window at Z=0
    { x: +HW, z: -5.5, halfW: HT, halfD: 4.5 },  // z∈[-10,-1]
    { x: +HW, z: +5.5, halfW: HT, halfD: 4.5 },  // z∈[+1,+10]

    // West wall (X=-9), bedroom section: solid
    { x: -HW, z:   -7, halfW: HT, halfD:    3 },  // z∈[-10,-4]
    // West wall (X=-9), hall section: door at Z=0±1.2 (barricaded/solid), window at Z=2.5±1.0
    { x: -HW, z: -2.6,    halfW: HT, halfD:  1.4 },  // z∈[-4,-1.2]
    { x: -HW, z: DOOR_Z,  halfW: HT, halfD: DOOR_HALF }, // z∈[-1.2,+1.2] barricaded door
    { x: -HW, z: 1.35,    halfW: HT, halfD: 0.15 },  // z∈[+1.2,+1.5] column between door and window
    { x: -HW, z: 4.25,    halfW: HT, halfD: 0.75 },  // z∈[+3.5,+5]
    // West wall (X=-9), kitchen section: solid
    { x: -HW, z:  7.5, halfW: HT, halfD:  2.5 },  // z∈[+5,+10]

    // === INTERIOR PARTITIONS ===

    // Bedroom/Hall partition (Z=-4, X∈[-9,-2]): door at X=-6±1.0
    { x:   -8, z: PART_Z_BH, halfW:   1, halfD: HT },  // x∈[-9,-7]
    { x: -3.5, z: PART_Z_BH, halfW: 1.5, halfD: HT },  // x∈[-5,-2]

    // Hall/Kitchen partition (Z=+5, X∈[-9,-2]): door at X=-5±1.0
    { x: -7.5, z: PART_Z_HK, halfW: 1.5, halfD: HT },  // x∈[-9,-6]
    { x:   -3, z: PART_Z_HK, halfW:   1, halfD: HT },  // x∈[-4,-2]

    // West/Main partition (X=-2, Z∈[-10,+10])
    // Bedroom→Main door at Z=-7±1.0; Hall→Main door at Z=0±1.0; kitchen section solid
    { x: PART_X, z:   -9, halfW: HT, halfD:   1 },  // z∈[-10,-8]
    { x: PART_X, z:   -5, halfW: HT, halfD:   1 },  // z∈[-6,-4]
    { x: PART_X, z: -2.5, halfW: HT, halfD: 1.5 },  // z∈[-4,-1]
    { x: PART_X, z:    3, halfW: HT, halfD:   2 },  // z∈[+1,+5]
    { x: PART_X, z:  7.5, halfW: HT, halfD: 2.5 },  // z∈[+5,+10]
  ]
}

// Window definitions — used for boarding interaction, visuals, and grid blocking.
export const WINDOW_DEFS = [
  { id: 0, wall: 'N', winX:  -7, winZ: -CABIN_HD, ix:  -7, iz: -CABIN_HD + 1.5, ax:  -7, az: -CABIN_HD - 1.5 },
  { id: 1, wall: 'N', winX:  -4, winZ: -CABIN_HD, ix:  -4, iz: -CABIN_HD + 1.5, ax:  -4, az: -CABIN_HD - 1.5 },
  { id: 2, wall: 'W', winX: -CABIN_HW, winZ: 2.5, ix: -CABIN_HW + 1.5, iz: 2.5, ax: -CABIN_HW - 1.5, az: 2.5 },
  { id: 3, wall: 'E', winX: +CABIN_HW, winZ:   0, ix:  CABIN_HW - 1.5, iz:   0, ax:  CABIN_HW + 1.5, az:   0 },
  { id: 4, wall: 'S', winX:   4, winZ: +CABIN_HD, ix:    4, iz: CABIN_HD - 1.5, ax:    4, az: CABIN_HD + 1.5 },
  { id: 5, wall: 'S', winX:  -5, winZ: +CABIN_HD, ix:   -5, iz: CABIN_HD - 1.5, ax:   -5, az: CABIN_HD + 1.5 },
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
export function playerCollisionWalls() {
  return [
    ...cabinWallSegments(),
    ...WINDOW_DEFS.map((win) => windowBlockSegment(win.id)),
  ]
}

export const SPAWN_CLUSTERS = [
  { x:  -7, z: -16 },   // near north window 0 (bedroom)
  { x:  -4, z: -16 },   // near north window 1 (bedroom)
  { x: -15, z:  2.5 },  // near west window (hall)
  { x:  15, z:   0 },   // near east window (main room)
  { x:   4, z:  16 },   // near south window (main room)
  { x:  -5, z:  16 },   // near south window (kitchen)
]
