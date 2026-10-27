// Wave 4 "Come back tomorrow": player level + XP. Pure rules only (no store / DOM),
// so they can be unit-tested and shared by the tracker, cosmetics and the screens.
// Everything earned here unlocks COSMETICS or named rewards (levelReward in
// cosmetics.js) - never a gameplay number (SOUL.md: no pay-to-win).

export const MAX_LEVEL = 100

// XP needed to go from level n to n+1 (n >= 1). Gentle early (100 for 1 -> 2, one
// decent run), steadier later: 100 + 60 * (n-1)^1.35.
export function xpToNext(n) {
  const lv = Math.max(1, Math.floor(Number(n) || 1))
  if (lv >= MAX_LEVEL) return Infinity
  return Math.round(100 + 60 * Math.pow(lv - 1, 1.35))
}

// Cumulative XP at which `level` is reached (level 1 = 0). Table built once.
const _cum = [0, 0]
for (let n = 1; n < MAX_LEVEL; n++) _cum[n + 1] = _cum[n] + xpToNext(n)
export const xpForLevel = (level) => _cum[Math.min(MAX_LEVEL, Math.max(1, Math.floor(level) || 1))]

/** { level, into, need, pct (0..1), toNext } for a lifetime XP total. At the cap `need`/`toNext` are 0 and pct 1. */
export function levelFromXp(xp) {
  const total = Math.max(0, Math.floor(Number(xp) || 0))
  let lo = 1
  let hi = MAX_LEVEL
  while (lo < hi) {              // largest level with _cum[level] <= total
    const mid = (lo + hi + 1) >> 1
    if (_cum[mid] <= total) lo = mid
    else hi = mid - 1
  }
  if (lo >= MAX_LEVEL) return { level: MAX_LEVEL, into: 0, need: 0, pct: 1, toNext: 0 }
  const into = total - _cum[lo]
  const need = xpToNext(lo)
  return { level: lo, into, need, pct: into / need, toNext: need - into }
}

// ── XP sources ──────────────────────────────────────────────────────────────
export const XP = {
  KILL: 1,
  SPECIAL_KILL: 3,       // brute / armored / spitter / exploder
  BOSS_KILL: 25,
  HEADSHOT: 1,           // on top of the kill
  WAVE_PER_NUMBER: 10,   // cleared wave N pays 10 * N
  MODIFIER_WAVE: 25,     // per cleared modifier wave
  FIRST_RUN_OF_DAY: 50,
  DAILY: 150,
  WEEKLY: 600,
}

const SPECIALS = new Set(['brute', 'armored', 'spitter', 'exploder'])
export function killXp(type) {
  if (type === 'boss') return XP.BOSS_KILL
  return SPECIALS.has(type) ? XP.SPECIAL_KILL : XP.KILL
}

/**
 * XP breakdown for one run.
 * run: { killXp, headshots, wavesCleared (count of waves cleared: 1..n), modifierWaves,
 *        challenges: [{ xp, label }], firstRunOfDay }
 * Returns { rows: [{ id, label, xp }], total } - zero rows are dropped.
 */
export function calcRunXp(run = {}) {
  const cleared = Math.max(0, Math.floor(run.wavesCleared) || 0)
  const waveXp = XP.WAVE_PER_NUMBER * (cleared * (cleared + 1)) / 2
  const rows = [
    { id: 'kills', label: 'Kills', xp: Math.max(0, Math.floor(run.killXp) || 0) },
    { id: 'headshots', label: 'Headshots', xp: Math.max(0, Math.floor(run.headshots) || 0) * XP.HEADSHOT },
    { id: 'waves', label: `Waves cleared (${cleared})`, xp: waveXp },
    { id: 'modifiers', label: 'Modifier waves', xp: Math.max(0, Math.floor(run.modifierWaves) || 0) * XP.MODIFIER_WAVE },
    ...(run.challenges ?? []).map((c, i) => ({ id: `challenge${i}`, label: c.label, xp: c.xp })),
    { id: 'firstRun', label: 'First run of the day', xp: run.firstRunOfDay ? XP.FIRST_RUN_OF_DAY : 0 },
  ].filter((r) => r.xp > 0)
  return { rows, total: rows.reduce((a, r) => a + r.xp, 0) }
}

/** Rough XP for a pre-Wave-4 profile, so veterans don't restart at level 1 and lose unlocks. */
export function legacyXp({ totalKills = 0, bestWave = 0 } = {}) {
  const w = Math.max(0, bestWave - 1)
  return Math.max(0, totalKills) + XP.WAVE_PER_NUMBER * (w * (w + 1)) / 2
}
