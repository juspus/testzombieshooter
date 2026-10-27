import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))
vi.mock('../sounds', async (importOriginal) => ({ ...(await importOriginal()), playDoorOpen: vi.fn() }))

import { useGameStore } from '../store'
import { buildGrid, findPath, isBlocked, collidesWithWalls } from '../walls'
import {
  DOOR_DEFS, DOOR_COSTS, WINDOW_DEFS, SPAWN_CLUSTERS, ROOM_ANCHORS,
  allWallSegments, playerCollisionWalls, bulletWallSegments, activeSpawnClusters, isWindowActive,
} from '../maps/cabin'
import * as diner from '../maps/diner'
import {
  openRoomSet, withLinksOpened, doorBuyStatus, allDoorsOpen, sealedWindowIds, START_ROOM,
} from '../doors'

const MAIN = { x: 3, z: 0 }
const HALL = { x: -5.5, z: 0.5 }
const KITCHEN = { x: -5.5, z: 8 }
const BEDROOM = { x: -5.5, z: -7 }

const reach = (a, b, openDoors) => {
  buildGrid(allWallSegments({}, openDoors))
  return findPath(a.x, a.z, b.x, b.z) !== null
}

describe('door data', () => {
  it('has one price table, with costs balanced against the early economy', () => {
    expect(DOOR_COSTS.hall).toBeGreaterThanOrEqual(75)
    expect(DOOR_COSTS.hall).toBeLessThanOrEqual(100)
    for (const k of ['bedroom', 'kitchen']) {
      expect(DOOR_COSTS[k]).toBeGreaterThanOrEqual(150)
      expect(DOOR_COSTS[k]).toBeLessThanOrEqual(250)
    }
    for (const d of DOOR_DEFS.filter((x) => !x.link)) expect(d.cost).toBe(DOOR_COSTS[d.id])
  })

  it('every window belongs to a room and every spawn cluster to a window', () => {
    for (const w of WINDOW_DEFS) expect(['main', 'hall', 'kitchen', 'bedroom']).toContain(w.room)
    for (const c of SPAWN_CLUSTERS) expect(WINDOW_DEFS[c.windowId]).toBeTruthy()
    expect(Object.keys(ROOM_ANCHORS).sort()).toEqual(['bedroom', 'hall', 'kitchen', 'main'])
    for (const a of Object.values(ROOM_ANCHORS)) {
      expect(a.box).toBeTruthy()
      expect(a.bench).toBeTruthy()
    }
  })

  it('diner has no doors and keeps all windows/clusters active', () => {
    expect(diner.DOOR_DEFS).toEqual([])
    expect(diner.activeSpawnClusters({})).toBe(diner.SPAWN_CLUSTERS)
    expect(diner.isWindowActive(3, {})).toBe(true)
    expect(diner.allWallSegments({}, {}).length).toBe(diner.allWallSegments({}).length)
  })

  it('opening a room unlocks it; the hall-bedroom link opens only when both are open', () => {
    expect([...openRoomSet(DOOR_DEFS, {})]).toEqual([START_ROOM])
    let od = withLinksOpened(DOOR_DEFS, { hall: true })
    expect(od.hall_bedroom).toBeUndefined()
    od = withLinksOpened(DOOR_DEFS, { ...od, bedroom: true })
    expect(od.hall_bedroom).toBe(true)
    expect(openRoomSet(DOOR_DEFS, od).has('bedroom')).toBe(true)
  })

  it('doorBuyStatus covers ok / broke / locked / open / link', () => {
    const hall = DOOR_DEFS.find((d) => d.id === 'hall')
    const kitchen = DOOR_DEFS.find((d) => d.id === 'kitchen')
    const link = DOOR_DEFS.find((d) => d.id === 'hall_bedroom')
    expect(doorBuyStatus(hall, DOOR_DEFS, {}, 1000)).toBe('ok')
    expect(doorBuyStatus(hall, DOOR_DEFS, {}, hall.cost - 1)).toBe('broke')
    expect(doorBuyStatus(kitchen, DOOR_DEFS, {}, 1000)).toBe('locked')
    expect(doorBuyStatus(kitchen, DOOR_DEFS, { hall: true }, 1000)).toBe('ok')
    expect(doorBuyStatus(hall, DOOR_DEFS, { hall: true }, 1000)).toBe('open')
    expect(doorBuyStatus(link, DOOR_DEFS, {}, 1000)).toBe('link')
  })
})

describe('grid rebuild / pathing', () => {
  it('sealed start: main room cannot reach any other room', () => {
    expect(reach(MAIN, HALL, {})).toBe(false)
    expect(reach(MAIN, BEDROOM, {})).toBe(false)
    expect(reach(MAIN, KITCHEN, {})).toBe(false)
  })

  it('buying the hall door opens the hall only', () => {
    expect(reach(MAIN, HALL, { hall: true })).toBe(true)
    expect(reach(MAIN, BEDROOM, { hall: true })).toBe(false)
    expect(reach(MAIN, KITCHEN, { hall: true })).toBe(false)
  })

  it('kitchen is reached through the hall; bedroom links to the hall once both are open', () => {
    expect(reach(MAIN, KITCHEN, withLinksOpened(DOOR_DEFS, { hall: true, kitchen: true }))).toBe(true)
    // bedroom door only: reachable from main, but NOT from the (still sealed) hall
    const od = withLinksOpened(DOOR_DEFS, { bedroom: true })
    expect(reach(MAIN, BEDROOM, od)).toBe(true)
    expect(reach(BEDROOM, HALL, od)).toBe(false)
    expect(reach(BEDROOM, HALL, withLinksOpened(DOOR_DEFS, { bedroom: true, hall: true }))).toBe(true)
  })

  it('windows of sealed rooms are blocked in the grid and open up with the room', () => {
    buildGrid(allWallSegments({}, {}))
    const hallWin = WINDOW_DEFS[2]
    expect(isBlocked(hallWin.winX, hallWin.winZ)).toBe(true)
    buildGrid(allWallSegments({}, { hall: true }))
    expect(isBlocked(hallWin.winX, hallWin.winZ)).toBe(false)
    expect(sealedWindowIds(WINDOW_DEFS, DOOR_DEFS, {})).toEqual([0, 1, 2, 5])
  })

  it('closed doors are solid for the player and for bullets; open doors are not', () => {
    const hall = DOOR_DEFS.find((d) => d.id === 'hall')
    expect(collidesWithWalls(hall.x, hall.z, 0.35, playerCollisionWalls({}))).toBe(true)
    expect(collidesWithWalls(hall.x, hall.z, 0.35, playerCollisionWalls({ hall: true }))).toBe(false)
    expect(bulletWallSegments({}).length).toBe(bulletWallSegments(allDoorsOpen(DOOR_DEFS)).length + DOOR_DEFS.length)
  })

  it('legacy callers (no door state) behave as before', () => {
    expect(allWallSegments({}).length).toBe(allWallSegments({}, allDoorsOpen(DOOR_DEFS)).length)
    expect(activeSpawnClusters(null)).toBe(SPAWN_CLUSTERS)
  })
})

describe('spawn-window filtering', () => {
  it('only windows of open rooms spawn zombies', () => {
    expect(activeSpawnClusters({}).map((c) => c.windowId)).toEqual([3, 4])
    expect(activeSpawnClusters({ hall: true }).map((c) => c.windowId)).toEqual([2, 3, 4])
    expect(activeSpawnClusters(withLinksOpened(DOOR_DEFS, { hall: true, kitchen: true })).map((c) => c.windowId)).toEqual([2, 3, 4, 5])
    expect(activeSpawnClusters(allDoorsOpen(DOOR_DEFS))).toHaveLength(SPAWN_CLUSTERS.length)
    expect(isWindowActive(0, {})).toBe(false)
    expect(isWindowActive(0, { bedroom: true })).toBe(true)
  })
})

describe('store', () => {
  beforeEach(() => {
    useGameStore.getState().startGame()
  })

  it('every run starts sealed', () => {
    expect(useGameStore.getState().openDoors).toEqual({})
    useGameStore.setState({ money: 500 })
    useGameStore.getState().buyDoor('hall')
    expect(useGameStore.getState().openDoors.hall).toBe(true)
    useGameStore.getState().startGame()
    expect(useGameStore.getState().openDoors).toEqual({})
    expect(isBlocked(-2, 0)).toBe(true)
  })

  it('buyDoor charges, rebuilds collision + grid, and refuses when broke / locked / owned', () => {
    const s = useGameStore.getState()
    expect(s.buyDoor('hall')).toBe(false)            // €10 only
    useGameStore.setState({ money: 1000 })
    expect(s.buyDoor('kitchen')).toBe(false)         // needs the hall first
    expect(useGameStore.getState().money).toBe(1000)
    expect(s.buyDoor('hall')).toBe(true)
    expect(useGameStore.getState().money).toBe(1000 - DOOR_COSTS.hall)
    expect(isBlocked(-2, 0)).toBe(false)             // grid rebuilt: doorway open
    expect(collidesWithWalls(-2, 0, 0.35, useGameStore.getState().walls)).toBe(false)
    expect(s.buyDoor('hall')).toBe(false)            // already open, no double charge
    expect(useGameStore.getState().money).toBe(1000 - DOOR_COSTS.hall)
    expect(s.buyDoor('kitchen')).toBe(true)
  })

  it('applyDoorOpen (net sync) opens without charging and links doors', () => {
    useGameStore.setState({ money: 5 })
    useGameStore.getState().applyDoorOpen('hall')
    useGameStore.getState().applyDoorOpen('bedroom')
    const st = useGameStore.getState()
    expect(st.money).toBe(5)
    expect(st.openDoors.hall_bedroom).toBe(true)
    st.setOpenDoors({})
    expect(useGameStore.getState().openDoors).toEqual({})
    expect(isBlocked(-2, 0)).toBe(true)
  })

  it('a wave spawns only at open-room windows and the 25-cap/pending queue still works', () => {
    const s = useGameStore.getState()
    useGameStore.setState({ wave: 8, intermissionLeft: 0.001, phase: 'intermission' })   // 26 zombies
    s.tick(0.1)
    let st = useGameStore.getState()
    expect(st.phase).toBe('playing')
    expect(st.zombies.length + st.pendingSpawns.length).toBe(26)
    expect(st.zombies).toHaveLength(25)
    expect(st.pendingSpawns).toHaveLength(1)
    // sealed: every spawn is by the east (x>9) or south-main (x≈4, z>10) windows
    for (const z of [...st.zombies, ...st.pendingSpawns]) {
      const nearEast = z.x > 12 && Math.abs(z.z) < 4
      const nearSouthMain = z.z > 12 && Math.abs(z.x - 4) < 4
      expect(nearEast || nearSouthMain).toBe(true)
    }
    // open everything: the west/north/kitchen treelines come into play
    useGameStore.getState().startGame()
    s.setOpenDoors(allDoorsOpen(DOOR_DEFS))
    useGameStore.setState({ wave: 8, intermissionLeft: 0.001, phase: 'intermission' })
    s.tick(0.1)
    st = useGameStore.getState()
    expect(st.zombies.some((z) => z.x < -12)).toBe(true)
    expect(st.zombies.some((z) => z.z < -12)).toBe(true)
  })
})
