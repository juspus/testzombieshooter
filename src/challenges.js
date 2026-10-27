// Wave 4 daily / weekly challenges. Pure: generation is deterministic from the UTC date
// (seeded RNG), so every device agrees without a server, and it works offline.
// Progress is fed by game events (see progressTracker.js) and persisted in
// `stats.challenges` = { daily: {key, progress, done}, weekly: {key, progress, done} }.
//
// Only templates whose events exist are in the pool. Grenade templates are
// deliberately absent (grenades land concurrently); add them once the event exists.

import { XP } from './progression'

// ── Seeded RNG ──────────────────────────────────────────────────────────────
function hashStr(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}
export function seededRng(seedStr) {
  let a = hashStr(seedStr) || 1
  return () => {                       // mulberry32
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1))
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)]
const step = (n, s) => Math.max(s, Math.round(n / s) * s)

// ── Date keys (UTC) ─────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0')
export const dayKey = (d = new Date()) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
/** UTC date of the Monday that starts `d`'s week. */
export function weekKey(d = new Date()) {
  const dow = (d.getUTCDay() + 6) % 7   // Mon=0
  return dayKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)))
}
/** Milliseconds until the daily / weekly reset (next UTC midnight / next UTC Monday). */
export function msUntilDailyReset(now = new Date()) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()
}
export function msUntilWeeklyReset(now = new Date()) {
  const dow = (now.getUTCDay() + 6) % 7
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (7 - dow)) - now.getTime()
}
export function formatCountdown(ms) {
  const m = Math.max(0, Math.floor(ms / 60000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return d > 0 ? `${d}d ${h}h` : `${h}h ${pad(m % 60)}m`
}

// ── Templates ───────────────────────────────────────────────────────────────
// gen(rng, weekly) -> params; text(p); target(p); inc(evt, p, run) -> progress increment.
// Events (evt.name): kill {type, source, head, weapon}, wave_start {wave, modifier},
// wave_clear {wave, modifier}, plank, door_open {id, wave}, powerup {type},
// box_take {weapon}, upgrade, nuke {count}, burst {count}, run_end {wave}.
// `run` is the live run tracker (run.wavePlanks = planks bought this wave).
const WEAPON_NAMES = { pistol: 'pistol', ak47: 'AK-47', shotgun: 'shotgun', deagle: 'Desert Eagle', flamethrower: 'flamethrower', crossbow: 'crossbow' }
const MOD_NAMES = { fog: 'Fog', bloodlust: 'Bloodlust', blackout: 'Blackout', horde: 'Horde' }
const SPECIAL_NAMES = { brute: 'Brutes', armored: 'Armored', spitter: 'Spitters' }
const playerKill = (e) => e.name === 'kill' && e.source !== 'nuke' && e.source !== 'burst' && e.source !== 'grenade'
const W = (weekly, d, w) => (weekly ? w : d)

export const TEMPLATES = [
  { id: 'headshots', gen: (r, wk) => ({ n: step(W(wk, randInt(r, 15, 35), randInt(r, 120, 200)), 5) }),
    text: (p) => `Get ${p.n} headshots`, target: (p) => p.n,
    inc: (e) => (playerKill(e) && e.head && e.source === 'gun' ? 1 : 0) },
  { id: 'headshots_weapon', gen: (r, wk) => ({ weapon: pick(r, ['pistol', 'ak47', 'shotgun', 'deagle']), n: step(W(wk, randInt(r, 8, 18), randInt(r, 50, 80)), 2) }),
    text: (p) => `Get ${p.n} headshots with the ${WEAPON_NAMES[p.weapon]}`, target: (p) => p.n,
    inc: (e, p) => (playerKill(e) && e.head && e.source === 'gun' && e.weapon === p.weapon ? 1 : 0) },
  { id: 'knife_kills', gen: (r, wk) => ({ n: W(wk, randInt(r, 5, 12), randInt(r, 40, 60)) }),
    text: (p) => `Kill ${p.n} zombies with the knife`, target: (p) => p.n,
    inc: (e) => (e.name === 'kill' && e.source === 'knife' ? 1 : 0) },
  { id: 'weapon_kills', gen: (r, wk) => ({ weapon: pick(r, ['pistol', 'ak47', 'shotgun', 'deagle']), n: step(W(wk, randInt(r, 25, 55), randInt(r, 250, 400)), 5) }),
    text: (p) => `Kill ${p.n} zombies with the ${WEAPON_NAMES[p.weapon]}`, target: (p) => p.n,
    inc: (e, p) => (playerKill(e) && e.source === 'gun' && e.weapon === p.weapon ? 1 : 0) },
  { id: 'kills', gen: (r, wk) => ({ n: step(W(wk, randInt(r, 70, 140), randInt(r, 500, 800)), 10) }),
    text: (p) => `Kill ${p.n} zombies`, target: (p) => p.n,
    inc: (e) => (e.name === 'kill' ? 1 : 0) },
  { id: 'burn', gen: (r, wk) => ({ n: step(W(wk, randInt(r, 10, 25), randInt(r, 80, 120)), 5) }),
    text: (p) => `Burn ${p.n} zombies to death`, target: (p) => p.n,
    inc: (e) => (e.name === 'kill' && e.source === 'flame' ? 1 : 0) },
  { id: 'reach_wave', gen: (r) => ({ w: randInt(r, 5, 9) }),
    text: (p) => `Reach wave ${p.w} in a single run`, target: () => 1,
    inc: (e, p) => (e.name === 'wave_start' && e.wave >= p.w ? 1 : 0) },
  { id: 'waves_total', gen: (r, wk) => ({ n: W(wk, randInt(r, 6, 10), randInt(r, 40, 60)) }),
    text: (p) => `Clear ${p.n} waves`, target: (p) => p.n,
    inc: (e) => (e.name === 'wave_clear' ? 1 : 0) },
  { id: 'no_board', gen: (r) => ({ w: randInt(r, 2, 5) }),
    text: (p) => `Clear wave ${p.w} without boarding a window`, target: () => 1,
    inc: (e, p, run) => (e.name === 'wave_clear' && e.wave === p.w && !run.wavePlanks ? 1 : 0) },
  { id: 'powerups', gen: (r, wk) => ({ n: W(wk, randInt(r, 3, 6), randInt(r, 15, 25)) }),
    text: (p) => `Collect ${p.n} power-ups`, target: (p) => p.n,
    inc: (e) => (e.name === 'powerup' ? 1 : 0) },
  { id: 'exploders', gen: (r, wk) => ({ n: W(wk, randInt(r, 2, 4), randInt(r, 12, 20)) }),
    text: (p) => `Kill ${p.n} Exploders before they burst`, target: (p) => p.n,
    inc: (e) => (playerKill(e) && e.type === 'exploder' ? 1 : 0) },
  { id: 'specials', gen: (r, wk) => ({ type: pick(r, ['brute', 'armored', 'spitter']), n: W(wk, randInt(r, 3, 6), randInt(r, 25, 40)) }),
    text: (p) => `Kill ${p.n} ${SPECIAL_NAMES[p.type]}`, target: (p) => p.n,
    inc: (e, p) => (e.name === 'kill' && e.type === p.type ? 1 : 0) },
  { id: 'bedroom_door', gen: (r) => ({ w: randInt(r, 3, 5) }), needsDoors: true,
    text: (p) => `Open the bedroom door before wave ${p.w} (Cabin)`, target: () => 1,
    inc: (e, p) => (e.name === 'door_open' && e.id === 'bedroom' && e.wave < p.w ? 1 : 0) },
  { id: 'survive_mod', gen: (r) => ({ mod: pick(r, ['blackout', 'fog', 'bloodlust', 'horde']) }),
    text: (p) => `Survive a ${MOD_NAMES[p.mod]} wave`, target: () => 1,
    inc: (e, p) => (e.name === 'wave_clear' && e.modifier === p.mod ? 1 : 0) },
  { id: 'upgrade', gen: () => ({}),
    text: () => 'Upgrade a weapon at the bench', target: () => 1,
    inc: (e) => (e.name === 'upgrade' ? 1 : 0) },
  { id: 'box', gen: (r, wk) => ({ n: W(wk, randInt(r, 1, 2), randInt(r, 4, 6)) }),
    text: (p) => `Take ${p.n === 1 ? 'a weapon' : `${p.n} weapons`} from the Mystery Box`, target: (p) => p.n,
    inc: (e) => (e.name === 'box_take' ? 1 : 0) },
  { id: 'grenade_kills', gen: (r, wk) => ({ n: W(wk, randInt(r, 5, 10), randInt(r, 40, 60)) }),
    text: (p) => `Kill ${p.n} zombies with grenades`, target: (p) => p.n,
    inc: (e) => (e.name === 'kill' && e.source === 'grenade' ? 1 : 0) },
  { id: 'grenade_multi', gen: (r) => ({ n: randInt(r, 3, 5) }),
    text: (p) => `Land a ${p.n}-kill grenade`, target: () => 1,
    inc: (e, p) => (e.name === 'grenade' && e.count >= p.n ? 1 : 0) },
  { id: 'nuke', gen: (r) => ({ n: randInt(r, 10, 15) }), weeklyOnly: true,
    text: (p) => `Nuke ${p.n}+ zombies at once`, target: () => 1,
    inc: (e, p) => (e.name === 'nuke' && e.count >= p.n ? 1 : 0) },
  { id: 'burst3', gen: () => ({ n: 3 }), weeklyOnly: true,
    text: (p) => `Kill ${p.n} zombies with one Exploder burst`, target: () => 1,
    inc: (e, p) => (e.name === 'burst' && e.count >= p.n ? 1 : 0) },
  { id: 'boss', gen: () => ({}), weeklyOnly: true,
    text: () => 'Kill a boss', target: () => 1,
    inc: (e) => (playerKill(e) && e.type === 'boss' ? 1 : 0) },
  { id: 'crossbow', gen: () => ({}), weeklyOnly: true,
    text: () => 'Take a crossbow from the Mystery Box', target: () => 1,
    inc: (e) => (e.name === 'box_take' && e.weapon === 'crossbow' ? 1 : 0) },
]
const BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]))

// Weekly picks must be big enough to feel like a week of play, daily ones quick.
const DAILY_POOL = TEMPLATES.filter((t) => !t.weeklyOnly)
const WEEKLY_POOL = TEMPLATES.filter((t) => !['reach_wave', 'no_board', 'bedroom_door', 'upgrade'].includes(t.id))

function build(scope, key, idx, tpl, params) {
  return {
    id: `${scope === 'daily' ? 'd' : 'w'}${idx}`,
    scope,
    key,
    tpl: tpl.id,
    params,
    text: tpl.text(params),
    target: tpl.target(params),
    xp: scope === 'daily' ? XP.DAILY : XP.WEEKLY,
  }
}

/** 3 distinct dailies for the UTC day of `date`. Deterministic. */
export function dailyChallenges(date = new Date()) {
  const key = dayKey(date)
  const rng = seededRng(`cabin-daily-${key}`)
  const pool = [...DAILY_POOL]
  const out = []
  for (let i = 0; i < 3; i++) {
    const tpl = pool.splice(Math.floor(rng() * pool.length), 1)[0]
    out.push(build('daily', key, i, tpl, tpl.gen(rng, false)))
  }
  return out
}

/**
 * Door-dependent challenges (template `needsDoors`) can only be completed on a map with
 * buyable doors (the cabin; the diner has none). Generation stays map-independent so the
 * date-seeded list is identical on every device; the text carries a "(Cabin)" tag and the UI
 * can use this to flag the entry.
 */
export const challengeNeedsDoors = (ch) => !!BY_ID[ch.tpl]?.needsDoors

/** The week's single big challenge (Mon-Sun UTC). Deterministic. */
export function weeklyChallenges(date = new Date()) {
  const key = weekKey(date)
  const rng = seededRng(`cabin-weekly-${key}`)
  const tpl = WEEKLY_POOL[Math.floor(rng() * WEEKLY_POOL.length)]
  return [build('weekly', key, 0, tpl, tpl.gen(rng, true))]
}

export const challengeById = (list, id) => list.find((c) => c.id === id)

// ── Persisted state ─────────────────────────────────────────────────────────
// { daily: { key, progress: {id: n}, done: {id: 1} }, weekly: {...} }
function sanitizeSlice(s) {
  if (!s || typeof s !== 'object' || typeof s.key !== 'string' || s.key.length > 12) return null
  const progress = {}
  const done = {}
  for (const [k, v] of Object.entries(s.progress ?? {})) if (k.length <= 8) progress[k] = Math.max(0, Math.floor(Number(v)) || 0)
  for (const k of Object.keys(s.done ?? {})) if (k.length <= 8) done[k] = 1
  return { key: s.key, progress, done }
}
export function sanitizeChallengeState(c) {
  const out = {}
  const d = sanitizeSlice(c?.daily)
  const w = sanitizeSlice(c?.weekly)
  if (d) out.daily = d
  if (w) out.weekly = w
  return out
}
function mergeSlice(a, b) {
  if (!a) return b
  if (!b) return a
  if (a.key !== b.key) return a.key > b.key ? a : b      // newer period wins
  const progress = { ...b.progress }
  for (const [k, v] of Object.entries(a.progress)) progress[k] = Math.max(v, progress[k] ?? 0)
  return { key: a.key, progress, done: { ...b.done, ...a.done } }
}
export function mergeChallengeState(a, b) {
  const x = sanitizeChallengeState(a)
  const y = sanitizeChallengeState(b)
  const out = {}
  const d = mergeSlice(x.daily, y.daily)
  const w = mergeSlice(x.weekly, y.weekly)
  if (d) out.daily = d
  if (w) out.weekly = w
  return out
}

/** The slice for `list` (fresh/empty when the stored key is from an older period). Never mutates `state`. */
export function sliceFor(state, scope, key) {
  const s = state?.[scope]
  return s && s.key === key ? s : { key, progress: {}, done: {} }
}

/**
 * Feed one event to a list of challenges, mutating `slice` ({progress, done}).
 * Returns the challenges completed by this event. Pure apart from `slice`.
 */
export function applyEvent(list, slice, evt, run = {}) {
  const completed = []
  for (const ch of list) {
    if (slice.done[ch.id]) continue
    const tpl = BY_ID[ch.tpl]
    if (!tpl) continue
    const inc = tpl.inc(evt, ch.params, run)
    if (!inc) continue
    const next = Math.min(ch.target, (slice.progress[ch.id] ?? 0) + inc)
    slice.progress[ch.id] = next
    if (next >= ch.target) {
      slice.done[ch.id] = 1
      completed.push(ch)
    }
  }
  return completed
}
