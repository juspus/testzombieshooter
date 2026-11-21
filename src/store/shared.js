// Pieces every slice needs: the map the session is fixed to, wave numbers, state predicates.
import { getMap, getInitialMapId } from '../maps'
import * as WR from '../weaponRules'

// Map is chosen once (debug ?map= param) and fixed for the whole session.
export const ACTIVE_MAP = getMap(getInitialMapId())

export const { playerCollisionWalls, wallSegments, allWallSegments, SPAWN_CLUSTERS } = ACTIVE_MAP

export const DOOR_DEFS = ACTIVE_MAP.DOOR_DEFS ?? []
export const activeSpawnClusters = ACTIVE_MAP.activeSpawnClusters ?? (() => SPAWN_CLUSTERS)

export const intermissionForWave = (wave) => 10 + (wave - 1) * 5

export const bulletsForWave = (wave) => zombiesForWave(wave) + 5
export const zombiesForWave = (wave) => 5 + (wave - 1) * 3
export const speedForWave = (wave) => 1.5 + (wave - 1) * 0.05

// Clip size of a weapon, honouring the Upgrade Bench's +50% mag (see weaponRules.js).
export const clipSizeForWeapon = (w, upgraded = false) => WR.clipSize(w, upgraded)

export const EMPTY_SAVED = { pistol: 0, ak47: 0, shotgun: 0, deagle: 0, flamethrower: 0, crossbow: 0 }

// W5: true when this client is a downed / bled-out co-op player
export function isSelfDowned(s) {
  return !!s.mpRole && !!s.mpConnected && !!s.coop && s.coop[s.mpRole].status !== 'alive'
}

export const dirDefending = (s) => s.director.active && s.director.role === 'defender' && s.director.stage === 'turn'
export const dirWindowOpen = (s) => dirDefending(s) && s.director.windowLeft > 0
