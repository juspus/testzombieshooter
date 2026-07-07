// Diner geometry — gas-station diner map. Single open room instead of the
// cabin's four, storefront glass packed into one wall instead of windows
// spread across four, one solid back door as the only non-window wall gap.

export const HW = 8        // X: ±8  (width = 16)
export const HD = 6        // Z: ±6  (depth = 12)
export const WALL_H = 3.0
export const WALL_T = 0.6
export const WALL_HT = WALL_T / 2   // 0.3

export const WIN_Y0 = 0.4   // storefront glass sits lower than the cabin's windows
export const WIN_Y1 = 2.2
export const WIN_HALF = 1.0

// Back door (north wall) — solid/cosmetic, same convention as the cabin's
// barricaded west door: it reads as a door but never opens.
export const DOOR_X = 0
export const DOOR_HALF = 1.2

// Solid wall AABB segments (window gaps excluded) — used by buildGrid and collidesWithWalls.
export function wallSegments() {
  const HT = WALL_HT
  return [
    // === STOREFRONT (south wall, z=+HD): 4 windows packed across it ===
    { x: -7.5, z: +HD, halfW: 0.5, halfD: HT },  // x∈[-8,-7]
    { x:   -4, z: +HD, halfW:   1, halfD: HT },  // x∈[-5,-3]
    { x:    0, z: +HD, halfW:   1, halfD: HT },  // x∈[-1,1]
    { x:    4, z: +HD, halfW:   1, halfD: HT },  // x∈[3,5]
    { x:  7.5, z: +HD, halfW: 0.5, halfD: HT },  // x∈[7,8]

    // === BACK WALL (north, z=-HD): single solid back door at x=0 ===
    { x: -4.6, z: -HD, halfW: 3.4, halfD: HT },  // x∈[-8,-1.2]
    { x:  4.6, z: -HD, halfW: 3.4, halfD: HT },  // x∈[1.2,8]

    // === EAST WALL (x=+HW): window at z=0 ===
    { x: +HW, z: -3.5, halfW: HT, halfD: 2.5 },  // z∈[-6,-1]
    { x: +HW, z:  3.5, halfW: HT, halfD: 2.5 },  // z∈[1,6]

    // === WEST WALL (x=-HW): window at z=0 ===
    { x: -HW, z: -3.5, halfW: HT, halfD: 2.5 },  // z∈[-6,-1]
    { x: -HW, z:  3.5, halfW: HT, halfD: 2.5 },  // z∈[1,6]

    // === INTERIOR: front counter — cover in the middle of the open floor,
    // clear of every window's approach so it never blocks pathing to a window ===
    { x: 0, z: -1.5, halfW: 6, halfD: 0.3 },  // x∈[-6,6], z∈[-1.8,-1.2]
  ]
}

// Window definitions — used for boarding interaction, visuals, and grid blocking.
export const WINDOW_DEFS = [
  { id: 0, wall: 'S', winX: -6, winZ: +HD, ix: -6, iz: HD - 1.5, ax: -6, az: HD + 1.5 },
  { id: 1, wall: 'S', winX: -2, winZ: +HD, ix: -2, iz: HD - 1.5, ax: -2, az: HD + 1.5 },
  { id: 2, wall: 'S', winX:  2, winZ: +HD, ix:  2, iz: HD - 1.5, ax:  2, az: HD + 1.5 },
  { id: 3, wall: 'S', winX:  6, winZ: +HD, ix:  6, iz: HD - 1.5, ax:  6, az: HD + 1.5 },
  { id: 4, wall: 'E', winX: +HW, winZ: 0, ix:  HW - 1.5, iz: 0, ax:  HW + 1.5, az: 0 },
  { id: 5, wall: 'W', winX: -HW, winZ: 0, ix: -HW + 1.5, iz: 0, ax: -HW - 1.5, az: 0 },
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
  const base = wallSegments()
  const extra = Object.entries(windowPlanks)
    .filter(([, count]) => count > 0)
    .map(([id]) => windowBlockSegment(Number(id)))
  return [...base, ...extra]
}

// Player collision walls: diner structure + every window opening always blocked.
export function playerCollisionWalls() {
  return [
    ...wallSegments(),
    ...WINDOW_DEFS.map((win) => windowBlockSegment(win.id)),
  ]
}

// Spawn clusters tucked into the forecourt just past each window — one per window,
// same convention as the cabin's treeline spawn points.
export const SPAWN_CLUSTERS = [
  { x: -6, z: HD + 8.2, edge: 'S' },
  { x: -2, z: HD + 8.2, edge: 'S' },
  { x:  2, z: HD + 8.2, edge: 'S' },
  { x:  6, z: HD + 8.2, edge: 'S' },
  { x:  HW + 8.2, z: 0, edge: 'E' },
  { x: -(HW + 8.2), z: 0, edge: 'W' },
]

// Supply chest (shop) position — sheltered behind the counter, near the back door.
export const CHEST_POS = { x: 0, z: -3.2 }
