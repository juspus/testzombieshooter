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

import {
  closedDoorSegments, sealedWindowIds, activeSpawnClusters as _activeSpawnClusters,
  isWindowActive as _isWindowActive,
} from '../doors'

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
  { id: 0, wall: 'N', room: 'bedroom', winX:  -7, winZ: -CABIN_HD, ix:  -7, iz: -CABIN_HD + 1.5, ax:  -7, az: -CABIN_HD - 1.5 },
  { id: 1, wall: 'N', room: 'bedroom', winX:  -4, winZ: -CABIN_HD, ix:  -4, iz: -CABIN_HD + 1.5, ax:  -4, az: -CABIN_HD - 1.5 },
  { id: 2, wall: 'W', room: 'hall', winX: -CABIN_HW, winZ: 2.5, ix: -CABIN_HW + 1.5, iz: 2.5, ax: -CABIN_HW - 1.5, az: 2.5 },
  { id: 3, wall: 'E', room: 'main', winX: +CABIN_HW, winZ:   0, ix:  CABIN_HW - 1.5, iz:   0, ax:  CABIN_HW + 1.5, az:   0 },
  { id: 4, wall: 'S', room: 'main', winX:   4, winZ: +CABIN_HD, ix:    4, iz: CABIN_HD - 1.5, ax:    4, az: CABIN_HD + 1.5 },
  { id: 5, wall: 'S', room: 'kitchen', winX:  -5, winZ: +CABIN_HD, ix:   -5, iz: CABIN_HD - 1.5, ax:   -5, az: CABIN_HD + 1.5 },
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

// ─── Buyable doors (Wave 3) ──────────────────────────────────────────────────
// Runs start sealed in the main room; each door below fills one of the interior
// partition gaps with a boarded barricade until bought. ALL door prices live in
// this one table. Balance vs. the economy (start €10, wave clear €15 + €1/kill + bonuses):
// the hall door is affordable around the end of wave 2, the rest are mid-run goals.
//   hall    — X=-2 partition, Z=0 gap  (opens hall + window 2)
//   bedroom — X=-2 partition, Z=-7 gap (opens bedroom + windows 0, 1)
//   kitchen — Z=5 partition, X=-5 gap  (opens kitchen + window 5; only reachable via the hall)
//   hall_bedroom — Z=-4 partition, X=-6 gap: free passage that opens by itself once
//                  BOTH hall and bedroom are open (keeps sealed rooms sealed).
export const DOOR_COSTS = { hall: 100, bedroom: 200, kitchen: 250 }

export const DOOR_DEFS = [
  { id: 'hall',    label: 'Hall door',    x: PART_X, z: 0,  halfW: WALL_HT, halfD: 1, axis: 'z', cost: DOOR_COSTS.hall,    opens: ['hall'] },
  { id: 'bedroom', label: 'Bedroom door', x: PART_X, z: -7, halfW: WALL_HT, halfD: 1, axis: 'z', cost: DOOR_COSTS.bedroom, opens: ['bedroom'] },
  { id: 'kitchen', label: 'Kitchen door', x: -5, z: PART_Z_HK, halfW: 1, halfD: WALL_HT, axis: 'x', cost: DOOR_COSTS.kitchen, opens: ['kitchen'], requires: ['hall'] },
  { id: 'hall_bedroom', label: 'Hall passage', x: -6, z: PART_Z_BH, halfW: 1, halfD: WALL_HT, axis: 'x', cost: 0, opens: [], link: ['hall', 'bedroom'] },
]

// Where later features should place things per room (Mystery Box, Upgrade Bench, ...).
// Positions are the room's floor centre; `box` / `bench` are clear floor spots
// (against a wall, off the walking line) reserved for those features.
export const ROOM_ANCHORS = {
  main:    { x: 3.5,  z: 0,    box: { x: 7.8,  z: -8 },   bench: { x: 7.8, z: 3.5 } },
  hall:    { x: -5.5, z: 0.5,  box: { x: -8.2, z: -2.2 }, bench: { x: -3.4, z: 3.8 } },
  kitchen: { x: -5.5, z: 7.5,  box: { x: -8.2, z: 8.8 },  bench: { x: -8.2, z: 6.3 } },
  bedroom: { x: -5.5, z: -7,   box: { x: -8.2, z: -6 },   bench: { x: -8.0, z: -8.8 } },
}

// null openDoors = legacy callers that don't know about doors (everything open).
const _closedSegs = (openDoors) => (openDoors ? closedDoorSegments(DOOR_DEFS, openDoors) : [])
const _sealedWinSegs = (openDoors) =>
  (openDoors ? sealedWindowIds(WINDOW_DEFS, DOOR_DEFS, openDoors).map(windowBlockSegment) : [])

export const isWindowActive = (id, openDoors) => (openDoors ? _isWindowActive(WINDOW_DEFS, id, DOOR_DEFS, openDoors) : true)
export const activeSpawnClusters = (openDoors) =>
  (openDoors ? _activeSpawnClusters(SPAWN_CLUSTERS, WINDOW_DEFS, DOOR_DEFS, openDoors) : SPAWN_CLUSTERS)

// ─── Furniture colliders ─────────────────────────────────────────────────────
// Big solid pieces (see src/components/Furniture.jsx for the visuals). They block
// the PLAYER and ZOMBIE pathing like walls (nav grid cells are 1 m, so keep them
// off windows / door gaps / anchors — src/__tests__/furniture.test.js checks it).
// `bullet: true` only for pieces taller than ~1 m (wardrobe, fridge, clock): low
// furniture (sofa, tables, counter) never stops shots. Small clutter has no collider.
export const FURNITURE_COLLIDERS = [
  // main room
  { x:  3.8,   z: -6.2,  halfW: 1.0,  halfD: 0.45 },               // sofa (faces the fireplace)
  { x:  1.9,   z: -6.2,  halfW: 0.55, halfD: 0.55 },               // armchair
  { x:  8.42,  z: -2.3,  halfW: 0.22, halfD: 0.5  },               // console table (book + recorder)
  // hall
  { x: -8.54,  z:  4.15, halfW: 0.18, halfD: 0.26, bullet: true }, // grandfather clock
  { x: -2.5,   z:  2.0,  halfW: 0.22, halfD: 0.5  },               // hall console
  // bedroom
  { x: -3.2,   z: -4.58, halfW: 0.58, halfD: 0.3,  bullet: true }, // wardrobe
  { x: -7.9,   z: -4.53, halfW: 0.5,  halfD: 0.25 },               // dresser
  // kitchen
  { x: -3.4,   z:  6.4,  halfW: 0.57, halfD: 0.33 },               // dining table
  { x: -2.62,  z:  8.0,  halfW: 0.31, halfD: 0.8  },               // counter + sink
  { x: -3.1,   z:  9.36, halfW: 0.38, halfD: 0.35, bullet: true }, // fridge
  { x: -8.3,   z:  7.7,  halfW: 0.24, halfD: 0.28 },               // stove
]

// Full wall segment list for the nav grid / zombie collision: structure + boarded
// windows + closed doors + the windows of rooms that are still sealed.
export function allWallSegments(windowPlanks = {}, openDoors = null) {
  const base = cabinWallSegments()
  const extra = Object.entries(windowPlanks)
    .filter(([, count]) => count > 0)
    .map(([id]) => windowBlockSegment(Number(id)))
  return [...base, ...extra, ...FURNITURE_COLLIDERS, ..._closedSegs(openDoors), ..._sealedWinSegs(openDoors)]
}

// Player collision walls: cabin structure + every window opening always blocked + closed doors.
export function playerCollisionWalls(openDoors = null) {
  return [
    ...cabinWallSegments(),
    ...WINDOW_DEFS.map((win) => windowBlockSegment(win.id)),
    ...FURNITURE_COLLIDERS,
    ..._closedSegs(openDoors),
  ]
}

export const SPAWN_CLUSTERS = [
  { x:  -7, z: -17.2, edge: 'N', windowId: 0 },   // tucked into north treeline near bedroom window 0
  { x:  -4, z: -17.2, edge: 'N', windowId: 1 },   // tucked into north treeline near bedroom window 1
  { x: -17.2, z:  2.5, edge: 'W', windowId: 2 },  // tucked into west treeline near hall window
  { x:  17.2, z:   0, edge: 'E', windowId: 3 },   // tucked into east treeline near main room window
  { x:   4, z:  17.2, edge: 'S', windowId: 4 },   // tucked into south treeline near main room window
  { x:  -5, z:  17.2, edge: 'S', windowId: 5 },   // tucked into south treeline near kitchen window
]

// Supply chest (shop) position — was previously defined in Arena.jsx.
export const CHEST_POS = { x: 5, z: 7 }

// Generic aliases so map-agnostic code (store.js, Player.jsx, Zombie.jsx,
// NetManager.jsx, src/maps/index.js) can consume any map through the same
// shape without knowing it's the cabin. Arena.jsx keeps using the named
// exports above directly since it's cabin-specific and there was no reason
// to touch its 1200 lines to rename them.
export const HW = CABIN_HW
export const HD = CABIN_HD
export const wallSegments = cabinWallSegments
// Gunfire is blocked by the walls (+ tall furniture); low furniture never stops shots.
const _tallFurniture = FURNITURE_COLLIDERS.filter((c) => c.bullet)
export const bulletWallSegments = (openDoors = null) => [...cabinWallSegments(), ..._tallFurniture, ..._closedSegs(openDoors)]

// Room id containing a floor point (interior only) — used to keep power-up drops out of sealed rooms.
export function roomAt(x, z) {
  if (x >= PART_X) return 'main'
  if (z < PART_Z_BH) return 'bedroom'
  if (z < PART_Z_HK) return 'hall'
  return 'kitchen'
}
