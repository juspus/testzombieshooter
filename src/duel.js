// Seed Duel: asynchronous 2-player versus. A token carries one finished run (seed, map,
// per-wave kill log, final result); the friend plays the same seed and the results are
// compared. No networking. Pure helpers (no store / three imports) plus a once-per-load reader.
import { MAP_CHOICES } from './mapSelect'

const SEED_RE = /^[A-Za-z0-9_-]{1,32}$/
const MAX_NAME = 16
const MAX_WAVES = 60
const MAX_TOKEN_LEN = 2048

const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi
const isKnownMap = (id) => MAP_CHOICES.some((m) => m.id === id)

function toB64Url(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64Url(b64) {
  const pad = b64.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/** Validates a decoded payload; returns a clean copy or null. */
export function validateDuel(p) {
  if (!p || typeof p !== 'object' || p.v !== 1) return null
  if (typeof p.seed !== 'string' || !SEED_RE.test(p.seed)) return null
  if (!isKnownMap(p.map)) return null
  if (typeof p.name !== 'string' || p.name.length > MAX_NAME) return null
  if (!Array.isArray(p.waves) || p.waves.length > MAX_WAVES) return null
  if (!p.waves.every((k) => isInt(k, 0, 99999))) return null
  const f = p.final
  if (!f || typeof f !== 'object' || !isInt(f.wave, 1, 999) || !isInt(f.kills, 0, 99999)) return null
  return { v: 1, seed: p.seed, map: p.map, name: p.name, waves: p.waves.slice(), final: { wave: f.wave, kills: f.kills } }
}

/** Encodes a run. Returns null if the run does not validate (so callers never emit a dead link). */
export function encodeDuel({ seed, map, name, waves, final }) {
  const clean = validateDuel({
    v: 1,
    seed: String(seed ?? ''),
    map,
    name: String(name ?? '').trim().slice(0, MAX_NAME) || 'Player',
    waves: (waves ?? []).slice(0, MAX_WAVES),
    final,
  })
  return clean ? toB64Url(JSON.stringify(clean)) : null
}

/** Token -> validated payload, or null for anything bad. Never throws. */
export function decodeDuel(token) {
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LEN) return null
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null
  try { return validateDuel(JSON.parse(fromB64Url(token))) } catch { return null }
}

export const buildDuelLink = (origin, token) => `${origin}/?duel=${token}`

// Returns { token } or null when the URL has no ?duel= param.
export function parseDuelParam(search) {
  const raw = new URLSearchParams(search || '').get('duel')
  if (raw == null) return null
  return { token: raw.trim() }
}

// Same URL with `duel` removed (keeps every other param + hash).
export function stripDuelParam(href) {
  const u = new URL(href)
  u.searchParams.delete('duel')
  return u.pathname + (u.search || '') + u.hash
}

/** 'win' | 'lose' | 'draw' for `mine` vs `theirs` ({wave, kills} or a token payload): wave, then kills. */
export function compareDuel(mine, theirs) {
  const a = mine?.final ?? mine
  const b = theirs?.final ?? theirs
  if (a.wave !== b.wave) return a.wave > b.wave ? 'win' : 'lose'
  if (a.kills !== b.kills) return a.kills > b.kills ? 'win' : 'lose'
  return 'draw'
}

/** Rival's cumulative kills at the end of `wave` (their final wave reads their final kills); null past it. */
export function ghostAt(rival, wave) {
  if (!rival || !Number.isInteger(wave) || wave < 1) return null
  if (wave <= rival.waves.length) return rival.waves[wave - 1]
  if (wave === rival.final.wave) return rival.final.kills
  return null
}

let _duel
/** Parses the page's ?duel= once (module cache: the map resolver needs it before React mounts). */
export function peekDuel() {
  if (_duel !== undefined) return _duel
  _duel = null
  try {
    const p = parseDuelParam(window.location.search)
    if (p) _duel = decodeDuel(p.token)
  } catch { /* no window */ }
  return _duel
}

let _stripped = false
/** Same value as peekDuel(), and removes the param from the address bar so a refresh does not re-challenge. */
export function consumeDuel() {
  const d = peekDuel()
  if (!_stripped) {
    _stripped = true
    try {
      if (parseDuelParam(window.location.search)) window.history.replaceState(null, '', stripDuelParam(window.location.href))
    } catch { /* ignore */ }
  }
  return d
}
