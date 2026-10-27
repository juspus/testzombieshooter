import { describe, it, expect } from 'vitest'
import { buildGrid, findPath, collidesWithWalls, isBlocked, cellToWorld, GRID_SIZE } from '../walls'
import {
  FURNITURE_COLLIDERS, WINDOW_DEFS, SPAWN_CLUSTERS, ROOM_ANCHORS, CHEST_POS, DOOR_DEFS,
  allWallSegments, bulletWallSegments, cabinWallSegments,
} from '../maps/cabin'
import { allDoorsOpen } from '../doors'

const ALL_OPEN = allDoorsOpen(DOOR_DEFS)
const AMMO_CORNERS = [[-5.5, -7.5], [5.5, -7.5], [-5.5, 7.5], [5.5, 7.5]]
const SPAWN = [0, 0]

// Spots that must stay walkable: window attack spots, anchors, chest, ammo corners, spawn.
function keySpots() {
  const spots = [{ name: 'player spawn', x: SPAWN[0], z: SPAWN[1] }]
  for (const w of WINDOW_DEFS) spots.push({ name: `window ${w.id} inside`, x: w.ix, z: w.iz })
  for (const [room, a] of Object.entries(ROOM_ANCHORS)) {
    spots.push({ name: `${room} box`, x: a.box.x, z: a.box.z }, { name: `${room} bench`, x: a.bench.x, z: a.bench.z })
  }
  spots.push({ name: 'chest', x: CHEST_POS.x, z: CHEST_POS.z })
  AMMO_CORNERS.forEach(([x, z], i) => spots.push({ name: `ammo corner ${i}`, x, z }))
  return spots
}

// Gap centres (doors / partitions) that must not be obstructed.
function doorSpots() {
  return DOOR_DEFS.map((d) => ({ name: `door ${d.id}`, x: d.x, z: d.z }))
}

describe('cabin furniture colliders', () => {
  it('never overlaps a key spot (0.5 m player clearance)', () => {
    for (const s of [...keySpots(), ...doorSpots()]) {
      expect(collidesWithWalls(s.x, s.z, 0.5, FURNITURE_COLLIDERS), s.name).toBe(false)
    }
  })

  it('keeps every key spot free on the nav grid with all doors open', () => {
    // Spots hugging the outer wall are already blocked on the 1 m grid by the walls themselves;
    // only furniture may not ADD a blocked cell.
    const bare = allWallSegments({}, ALL_OPEN).filter((w) => !FURNITURE_COLLIDERS.includes(w))
    buildGrid(bare)
    const wasFree = [...keySpots(), ...doorSpots()].filter((s) => !isBlocked(s.x, s.z))
    expect(wasFree.length).toBeGreaterThan(10)
    buildGrid(allWallSegments({}, ALL_OPEN))
    for (const s of wasFree) expect(isBlocked(s.x, s.z), s.name).toBe(false)
  })

  it('zombies can still path from every spawn cluster to every key spot (all doors open)', () => {
    buildGrid(allWallSegments({}, ALL_OPEN))
    for (const c of SPAWN_CLUSTERS) {
      const win = WINDOW_DEFS[c.windowId]
      // Zombies enter via the window opening: path from the inside spot to every other spot.
      for (const s of keySpots()) {
        expect(findPath(win.ix, win.iz, s.x, s.z), `window ${win.id} -> ${s.name}`).not.toBeNull()
      }
    }
  })

  it('furniture never seals off a floor cell (flood fill, all doors open)', () => {
    const flood = (segs) => {
      buildGrid(segs)
      const key = (c, r) => r * GRID_SIZE + c
      const seen = new Set([key(18, 18)])
      const q = [[18, 18]]
      while (q.length) {
        const [c, r] = q.pop()
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc, nr = r + dr
          if (nc < 0 || nr < 0 || nc >= GRID_SIZE || nr >= GRID_SIZE || seen.has(key(nc, nr))) continue
          const { x, z } = cellToWorld(nc, nr)
          if (isBlocked(x, z)) continue
          seen.add(key(nc, nr)); q.push([nc, nr])
        }
      }
      return seen
    }
    const bare = flood(allWallSegments({}, ALL_OPEN).filter((w) => !FURNITURE_COLLIDERS.includes(w)))
    const withF = flood(allWallSegments({}, ALL_OPEN))
    // every cell reachable before is still reachable unless it is itself a furniture-blocked cell
    buildGrid(allWallSegments({}, ALL_OPEN))
    for (const k of bare) {
      if (withF.has(k)) continue
      const { x, z } = cellToWorld(k % GRID_SIZE, Math.floor(k / GRID_SIZE))
      expect(isBlocked(x, z), `cell ${k % GRID_SIZE},${Math.floor(k / GRID_SIZE)} cut off`).toBe(true)
    }
  })

  it('only tall pieces block bullets', () => {
    const bullet = bulletWallSegments(ALL_OPEN)
    const extra = bullet.length - cabinWallSegments().length
    const tall = FURNITURE_COLLIDERS.filter((c) => c.bullet).length
    expect(extra).toBe(tall)
    expect(tall).toBeGreaterThan(0)
    expect(tall).toBeLessThan(FURNITURE_COLLIDERS.length)
  })

  it('colliders stay inside the cabin interior', () => {
    for (const c of FURNITURE_COLLIDERS) {
      expect(Math.abs(c.x) + c.halfW).toBeLessThanOrEqual(9.1)
      expect(Math.abs(c.z) + c.halfD).toBeLessThanOrEqual(10.1)
    }
  })
})
