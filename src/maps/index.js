import * as cabin from './cabin'
import * as diner from './diner'

export const MAPS = { cabin, diner }
export const DEFAULT_MAP_ID = 'cabin'

export function getMap(id) {
  return MAPS[id] || cabin
}

// Debug-only: ?map=diner selects a non-default map. Same convention as the
// ?wave=/?money=/?weapon= debug params in store.js — disabled on Vercel
// production builds so players can't reach it, only dev/preview.
export function getInitialMapId() {
  if (import.meta.env.VITE_VERCEL_ENV === 'production') return DEFAULT_MAP_ID
  if (typeof window === 'undefined') return DEFAULT_MAP_ID
  const id = new URLSearchParams(window.location.search).get('map')
  return MAPS[id] ? id : DEFAULT_MAP_ID
}
