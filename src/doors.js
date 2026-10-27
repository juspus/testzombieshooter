// Buyable doors — pure helpers shared by the maps, store, zombies and tests.
//
// A map describes its doors as DOOR_DEFS (see src/maps/cabin.js):
//   { id, label, x, z, halfW, halfD, cost, opens: [roomId], requires?: [roomId], link?: [roomA, roomB] }
// Runs start sealed in START_ROOM; buying a door opens the rooms in `opens`.
// A `link` door has no price: it is an interior passage between two rooms that
// stays walled off until BOTH rooms are open (it would otherwise let you walk
// into a sealed room from an open one).
// State is `openDoors`: { [doorId]: true } for every door that is open.

export const START_ROOM = 'main'

// Set of room ids the players/zombies can currently use (start room + rooms of open doors).
export function openRoomSet(doorDefs, openDoors = {}, startRoom = START_ROOM) {
  const rooms = new Set([startRoom])
  for (const d of doorDefs) {
    if (openDoors[d.id] && !d.link) for (const r of d.opens) rooms.add(r)
  }
  return rooms
}

// Doors currently walled shut.
export function closedDoors(doorDefs, openDoors = {}) {
  return doorDefs.filter((d) => !openDoors[d.id])
}

// Wall segment filling a door's gap.
export function doorSegment(def) {
  return { x: def.x, z: def.z, halfW: def.halfW, halfD: def.halfD }
}

// Segments of every closed door (grid + collision + bullets).
export function closedDoorSegments(doorDefs, openDoors = {}) {
  return closedDoors(doorDefs, openDoors).map(doorSegment)
}

// Is this window part of a room that is open? Windows with no `room` are always active.
export function isWindowActive(windowDefs, windowId, doorDefs, openDoors = {}, startRoom = START_ROOM) {
  const win = windowDefs[windowId]
  if (!win || !win.room || !doorDefs.length) return true
  return openRoomSet(doorDefs, openDoors, startRoom).has(win.room)
}

// Windows whose room is still sealed (they stay blocked in the nav grid).
export function sealedWindowIds(windowDefs, doorDefs, openDoors = {}, startRoom = START_ROOM) {
  if (!doorDefs.length) return []
  const rooms = openRoomSet(doorDefs, openDoors, startRoom)
  return windowDefs.filter((w) => w.room && !rooms.has(w.room)).map((w) => w.id)
}

// Spawn clusters whose window belongs to an open room. Clusters carry a
// `windowId` (cabin); clusters without one are always kept.
export function activeSpawnClusters(clusters, windowDefs, doorDefs, openDoors = {}, startRoom = START_ROOM) {
  if (!doorDefs.length) return clusters
  const rooms = openRoomSet(doorDefs, openDoors, startRoom)
  const out = clusters.filter((c) => {
    if (c.windowId === undefined) return true
    const w = windowDefs[c.windowId]
    return !w || !w.room || rooms.has(w.room)
  })
  return out.length ? out : clusters
}

// After opening a door, auto-open every link door whose two rooms are now both open.
export function withLinksOpened(doorDefs, openDoors) {
  const next = { ...openDoors }
  const rooms = openRoomSet(doorDefs, next)
  for (const d of doorDefs) {
    if (d.link && !next[d.id] && d.link.every((r) => rooms.has(r))) next[d.id] = true
  }
  return next
}

// Can this door be bought right now? 'ok' | 'open' | 'link' | 'locked' | 'broke'
export function doorBuyStatus(def, doorDefs, openDoors, money) {
  if (!def) return 'open'
  if (openDoors[def.id]) return 'open'
  if (def.link) return 'link'
  if (def.requires) {
    const rooms = openRoomSet(doorDefs, openDoors)
    if (!def.requires.every((r) => rooms.has(r))) return 'locked'
  }
  return money >= def.cost ? 'ok' : 'broke'
}

// Every door open (debug ?doors=open, bench).
export function allDoorsOpen(doorDefs) {
  const o = {}
  for (const d of doorDefs) o[d.id] = true
  return o
}
