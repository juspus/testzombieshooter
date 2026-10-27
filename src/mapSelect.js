// Map selector + starting-loadout choice. Pure helpers (no store / three imports) so the
// maps module can use them at module load and tests can exercise them directly.
//
// Map choice is PERSISTED and applied on reload: ACTIVE_MAP is resolved once at module
// load in store.js / Player.jsx / Zombie.jsx / Grenades.jsx / BloodFX.jsx (wall segments,
// window defs, spawn clusters are all destructured at import time), so switching maps at
// runtime would mean re-plumbing all of them. Picking a map on the start screen saves the
// choice and reloads the page (the start screen is the only place it can change).

import { isLevelRewardUnlocked, sanitizeStats } from './cosmetics'

export const MAP_PREF_KEY = 'cabin.map.v1'
export const LOADOUT_PREF_KEY = 'cabin.loadout.v1'
const PROFILE_KEY = 'cabin.profile.v1'   // profilePersistence.js (not imported: it pulls in the store)

/** `reward` = id in cosmetics NAMED_LEVEL_REWARDS; absent = always available. */
export const MAP_CHOICES = [
  { id: 'cabin', label: 'Cabin', blurb: 'Four rooms, doors to open' },
  { id: 'diner', label: 'Diner', blurb: 'One open room, storefront glass', reward: 'diner_map', reqLevel: 5 },
]

export function isMapUnlocked(id, stats) {
  const c = MAP_CHOICES.find((m) => m.id === id)
  if (!c) return false
  return !c.reward || isLevelRewardUnlocked(c.reward, stats)
}

/** Starting loadouts. `reward` = NAMED_LEVEL_REWARDS id. Applied by loadoutPatch(). */
export const LOADOUTS = [
  { id: 'pistol', label: 'Pistol', blurb: 'Standard start' },
  { id: 'shotgun', label: 'Shotgun start', blurb: 'Pump shotgun, 1 clip + 8 spare', reward: 'loadout_shotgun', reqLevel: 8, gun: 'shotgun', clip: 8, reserve: 8 },
  { id: 'fast_hands', label: 'Fast Hands', blurb: 'Pistol + Fast Hands perk', reward: 'loadout_fast_hands', reqLevel: 12, perk: 'fast_hands' },
  { id: 'ak47', label: 'AK-47 start', blurb: 'AK-47, 1 clip, no spare', reward: 'loadout_ak47', reqLevel: 16, gun: 'ak47', clip: 30, reserve: 0 },
]

export function isLoadoutUnlocked(id, stats) {
  const l = LOADOUTS.find((x) => x.id === id)
  if (!l) return false
  return !l.reward || isLevelRewardUnlocked(l.reward, stats)
}

/**
 * Loadout actually used for a run: Daily Run ignores loadouts (everyone starts equal), a
 * locked / unknown choice falls back to the pistol start.
 */
export function effectiveLoadout(id, stats, daily = false) {
  if (daily) return LOADOUTS[0]
  return LOADOUTS.find((l) => l.id === id && isLoadoutUnlocked(l.id, stats)) ?? LOADOUTS[0]
}

/**
 * Store patch layering a loadout over the plain pistol start `base` =
 * { bulletsInClip, reserveBullets, savedClips, savedReserves }. Pistol ammo is parked in the
 * saved pools; the gun in hand takes the live pools. Perks merge into `perks`.
 */
export function loadoutPatch(loadout, base) {
  const patch = {}
  if (loadout.perk) patch.perks = { [loadout.perk]: true }
  if (loadout.gun) {
    patch.weapon = loadout.gun
    patch.ownedWeapons = ['pistol', loadout.gun]
    patch.savedClips = { ...base.savedClips, pistol: base.bulletsInClip }
    patch.savedReserves = { ...base.savedReserves, pistol: base.reserveBullets }
    patch.bulletsInClip = loadout.clip
    patch.reserveBullets = loadout.reserve
  }
  return patch
}

// ── Persistence (never throws) ───────────────────────────────────────────────
export function readPref(key) {
  try { return window.localStorage.getItem(key) } catch { return null }
}
export function writePref(key, value) {
  try { window.localStorage.setItem(key, value) } catch { /* private mode etc. */ }
}
/** Lifetime stats from the locally mirrored profile (works before the store exists). */
export function readLocalStats() {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY)
    return sanitizeStats(raw ? JSON.parse(raw)?.stats : null)
  } catch { return sanitizeStats(null) }
}

/**
 * Pure resolution of the map to load. Debug `?map=` wins outside production builds; else the
 * persisted choice, only if it is a known map the (locally mirrored) profile has unlocked.
 */
export function resolveMapId({ knownIds, debugParam, saved, stats, prod, fallback = 'cabin' }) {
  if (!prod && debugParam && knownIds.includes(debugParam)) return debugParam
  if (saved && knownIds.includes(saved) && isMapUnlocked(saved, stats)) return saved
  return fallback
}

/** Persist `id` and reload so every module re-resolves its map (drops a debug ?map= override). */
export function applyMapChoice(id) {
  writePref(MAP_PREF_KEY, id)
  try {
    const u = new URL(window.location.href)
    u.searchParams.delete('map')
    window.location.assign(u.toString())   // same-URL assign reloads
  } catch { window.location.reload() }
}
