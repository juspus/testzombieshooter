// Where a power-up drop lands, and the drop roll on a kill.
import { collidesWithWalls } from '../walls'
import { rollPowerupDrop, clampDropPoint, isPointReachable, getZombieWorldPos, getPlayerWorldPos } from '../powerups'
import { openRoomSet } from '../doors'
import { runRandom } from '../rng'
import { ACTIVE_MAP } from './shared'

// Where a drop lands: inside the playable interior, off interior walls, and on a
// reachable spot (isPointReachable — the hook the buyable-doors work implements).
// Blocked / unreachable spots slide toward the player's current position.
// Doors: a point inside a still-sealed room is not a valid drop spot.
function _roomIsOpen(get, x, z) {
  const defs = ACTIVE_MAP.DOOR_DEFS
  if (!defs?.length || !ACTIVE_MAP.roomAt) return true
  return openRoomSet(defs, get().openDoors).has(ACTIVE_MAP.roomAt(x, z))
}

export function _dropPoint(get, x, z) {
  const walls = get().walls
  const pl = getPlayerWorldPos()
  return clampDropPoint(x, z, {
    hw: ACTIVE_MAP.HW, hd: ACTIVE_MAP.HD,
    anchorX: pl ? pl.x : 0, anchorZ: pl ? pl.z : 0,
    isFree: (px, pz) => !collidesWithWalls(px, pz, 0.6, walls) && _roomIsOpen(get, px, pz) && isPointReachable(px, pz),
  })
}

export function maybeDropPowerup(get, set, zombie) {
  if (get().phase !== 'playing') return
  const count = get().killsSinceDrop + 1
  const r = rollPowerupDrop(count, get().lastDropType, runRandom('drop'))
  if (!r.drop) { set({ killsSinceDrop: count }); return }
  set({ killsSinceDrop: 0, lastDropType: r.type })
  const zp = getZombieWorldPos(zombie.id) ?? zombie
  get().dropPowerup(r.type, zp.x, zp.z)
}
