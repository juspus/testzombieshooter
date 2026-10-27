import * as cabin from './cabin'
import * as diner from './diner'
import { resolveMapId, readPref, readLocalStats, MAP_PREF_KEY } from '../mapSelect'

export const MAPS = { cabin, diner }
export const DEFAULT_MAP_ID = 'cabin'

export function getMap(id) {
  return MAPS[id] || cabin
}

// Map for this page load: the persisted start-screen choice (only if unlocked — see
// mapSelect.js), or the debug ?map= param, which is disabled on Vercel production builds
// (same convention as the ?wave=/?money=/?weapon= params in store.js).
export function getInitialMapId() {
  if (typeof window === 'undefined') return DEFAULT_MAP_ID
  return resolveMapId({
    knownIds: Object.keys(MAPS),
    debugParam: new URLSearchParams(window.location.search).get('map'),
    saved: readPref(MAP_PREF_KEY),
    stats: readLocalStats(),
    prod: import.meta.env.VITE_VERCEL_ENV === 'production',
    fallback: DEFAULT_MAP_ID,
  })
}
