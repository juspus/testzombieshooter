// Daily Run helpers: UTC day / week maths, the local "one ranked attempt per day" record,
// and the anonymous id used to dedupe ranked attempts for signed-out players.
// Pure functions take `now` (ms) so they are unit-testable.

const DAY_MS = 86400000
const ANON_KEY = 'cabin.anon.v1'      // same id analytics.js uses
const LOCAL_KEY = 'cabin.daily.v1'    // { date, wave, kills, name } of the ranked attempt

/** 'YYYY-MM-DD' for the UTC day containing `now`. Doubles as the RNG seed. */
export const dailyDate = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)

/** ms until the next UTC midnight (the next daily). */
export const msToNextDaily = (now = Date.now()) => DAY_MS - (now % DAY_MS)

/** Monday 00:00 UTC of the week containing `now`, as a ms timestamp. */
export function weekStartUTC(now = Date.now()) {
  const d = new Date(now)
  const sinceMonday = (d.getUTCDay() + 6) % 7   // Mon=0 .. Sun=6
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday)
}

/** ms until the weekly board resets (next Monday 00:00 UTC). */
export const msToWeekReset = (now = Date.now()) => weekStartUTC(now) + 7 * DAY_MS - now

/** "5h 12m" / "2d 3h" / "42m" */
export function formatCountdown(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000))
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/** A daily is only available in solo; co-op (host or guest) never gets one. */
export const canStartDaily = ({ mpRole = null, mpConnected = false } = {}) => !mpRole && !mpConnected

export function getAnonId() {
  try {
    let v = localStorage.getItem(ANON_KEY)
    if (!v) {
      v = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36))
      localStorage.setItem(ANON_KEY, v)
    }
    return v
  } catch { return null }
}

export function readLocalDaily(now = Date.now()) {
  try {
    const rec = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null')
    return rec && rec.date === dailyDate(now) ? rec : null
  } catch { return null }
}

/** Has this browser already used today's ranked attempt? */
export const dailyAttemptUsed = (now = Date.now()) => !!readLocalDaily(now)

export function writeLocalDaily(patch, now = Date.now()) {
  try {
    const rec = { ...(readLocalDaily(now) ?? {}), date: dailyDate(now), ...patch }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rec))
    return rec
  } catch { return null }
}
