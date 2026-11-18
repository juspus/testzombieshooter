// Player constants shared by the hooks in this folder: the map's geometry, the live bullet wall list,
// perk maths, speeds. Moved verbatim out of components/Player.jsx.
import { useGameStore, BODY_ARMOR_DEFS } from '../store'
import { WEAPONS, reloadTimeFor } from '../weapons'
import { getMap, getInitialMapId } from '../maps'
import { send, isConnected } from '../net'

// Hit-marker kind for one trigger pull (see store.registerHit)
export const markerKind = (killed, head) => (killed ? (head ? 'headkill' : 'kill') : (head ? 'head' : 'hit'))
export const registerHit = (kind) => useGameStore.getState().registerHit(kind)

// Map is chosen once (debug ?map= param) and fixed for the whole session.
export const ACTIVE_MAP = getMap(getInitialMapId())
export const { WINDOW_DEFS, CHEST_POS, WIN_HALF, WIN_Y0, WIN_Y1 } = ACTIVE_MAP

// Static walls with window/door gaps already excluded — bullets pass through those openings.
// Uses bulletWallSegments() rather than wallSegments(): the collision system is
// height-blind (flat X/Z test), so any short cover meant to be shot over (e.g.
// the diner's counter) has to be excluded here even though it blocks movement.
// Wave 3: closed doors also stop bullets, so this list is rebuilt when a door opens.
export let BULLET_WALLS = ACTIVE_MAP.bulletWallSegments(useGameStore.getState?.().openDoors ?? {})
useGameStore.subscribe?.((s, prev) => {
  if (s.openDoors !== prev.openDoors) BULLET_WALLS = ACTIVE_MAP.bulletWallSegments(s.openDoors)
})
export const DOOR_DEFS = ACTIVE_MAP.DOOR_DEFS ?? []
export const DOOR_REACH_SQ = 2.4 * 2.4   // distance to a door's centre at which the buy prompt appears
export const DOOR_HOLD = 0.7             // seconds to hold E / interact so a door is never bought by accident
export const MAP_WALL_H = ACTIVE_MAP.WALL_H ?? 3.2

export function netSend(event, data) {
  if (isConnected()) send('game_event', { event, data })
}

export const CHEST_RADIUS_SQ = 1.5 * 1.5
export const BASE_KNIFE_COOLDOWN = 0.4
export const BASE_KNIFE_RANGE = 2.2
export const SKIP_TIME = 0.6

export const reloadTimeForPerks = (perks, weapon) => reloadTimeFor(weapon, !!perks.fast_hands)
export const playReloadFor = (weapon) => (WEAPONS[weapon] ?? WEAPONS.pistol).sounds.reload()
export const boardTimeForPerks = (perks) => perks.carpenter ? 1.3 : 2.0
export const moveSpeedForPerks = (perks, bodyArmor) => MOVE_SPEED * (perks.runners_breath ? 1.15 : 1) * (BODY_ARMOR_DEFS[bodyArmor]?.speedMultiplier ?? 1)
export const knifeCooldownForPerks = (perks) => perks.knife_mastery ? 0.25 : BASE_KNIFE_COOLDOWN
export const knifeRangeForPerks = (perks) => perks.knife_mastery ? 2.8 : BASE_KNIFE_RANGE

export const PLAYER_HEIGHT = 1.7
export const MOVE_SPEED = 8
export const LOOK_SENSITIVITY = 0.002
export const MOBILE_LOOK_SENSITIVITY = 0.007
export const ARENA_BOUND = 18.5
export const STEP_INTERVAL = 0.42
