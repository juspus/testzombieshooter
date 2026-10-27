// Cosmetics catalog + pure helpers.
//
// Hard rule (SOUL.md / docs/MONETIZATION.md): everything here is visual only.
// Nothing in this file may feed a gameplay number (damage, HP, money, ammo,
// speed, unlock pacing). Every paid item has a free sibling earned by playing.
//
// Performance rule (CLAUDE.md "Known performance notes"): skins only swap
// `color / metalness / roughness` on the existing meshStandardMaterials, so
// no new shader programs. All palettes are module-level frozen constants;
// `applySkin` does a map lookup and never allocates.

import { levelFromXp, legacyXp } from './progression'
import { sanitizeChallengeState, mergeChallengeState } from './challenges'

// ── Catalog ────────────────────────────────────────────────────────────────

const free = { type: 'free' }
const supporter = { type: 'supporter' }
const milestone = (stat, value) => ({ type: 'milestone', stat, value })
const level = (value) => ({ type: 'level', value })   // Wave 4: earned by player level (progression.js)

export const COSMETICS = Object.freeze([
  // Weapon finishes (apply to every gun)
  { id: 'default',    kind: 'skin', label: 'Factory',    blurb: 'The original finish.',                 unlock: free,                          swatch: '#585858' },
  { id: 'blood_rust', kind: 'skin', label: 'Blood-Rust', blurb: 'Rusted brown-red with dark accents.',  unlock: milestone('bestWave', 10),     swatch: '#5a2a1a' },
  { id: 'field_worn', kind: 'skin', label: 'Field-Worn', blurb: 'Matte olive-grey, well used.',         unlock: level(3),                  swatch: '#4f5a4a' },
  { id: 'arctic',     kind: 'skin', label: 'Arctic',     blurb: 'Frost-white polymer, cold steel.',     unlock: level(10),                     swatch: '#c9d6df' },
  { id: 'verdigris',  kind: 'skin', label: 'Verdigris',  blurb: 'Weathered copper-green patina.',       unlock: level(20),                     swatch: '#3f7f6e' },
  { id: 'gold',       kind: 'skin', label: 'Gold',       blurb: 'Polished gold on every gun.',          unlock: supporter,                     swatch: '#c9a227' },
  { id: 'obsidian',   kind: 'skin', label: 'Obsidian',   blurb: 'Glossy black with a faint purple glow.', unlock: supporter,                   swatch: '#0b0b0f' },

  // Crosshair shapes
  { id: 'cross',   kind: 'crosshair', label: 'Cross',   blurb: 'Classic cross.',                unlock: free },
  { id: 'dot',     kind: 'crosshair', label: 'Dot',     blurb: 'A single centre dot.',          unlock: supporter },
  { id: 'chevron', kind: 'crosshair', label: 'Chevron', blurb: 'Two short angled lines.',       unlock: supporter },
  { id: 'circle',  kind: 'crosshair', label: 'Circle',  blurb: 'Ring with a centre dot.',       unlock: supporter },

  // Knife
  { id: 'default', kind: 'knifeSkin', label: 'Steel', blurb: 'Plain hunting knife.',           unlock: free,      swatch: '#b8b8b8' },
  { id: 'bone',    kind: 'knifeSkin', label: 'Bone',  blurb: 'Pale bone-white blade.',         unlock: level(4),  swatch: '#d8d2bc' },
  { id: 'bloodied', kind: 'knifeSkin', label: 'Bloodied', blurb: 'Dull steel, dark red edge glow.', unlock: level(14), swatch: '#8a1c1c' },
  { id: 'ember',   kind: 'knifeSkin', label: 'Ember', blurb: 'Dark steel with a glowing edge.', unlock: supporter, swatch: '#ff4a1a' },

  // Display-only (leaderboard star); not equippable
  { id: 'supporter_star', kind: 'badge', label: 'Supporter Star', blurb: 'A star next to your name on the leaderboard.', unlock: supporter },
])

// Crosshair colours are a separate small list (kind 'crosshairColor').
export const CROSSHAIR_COLORS = Object.freeze([
  { id: 'white', kind: 'crosshairColor', label: 'White', hex: '#ffffff', unlock: free },
  { id: 'amber', kind: 'crosshairColor', label: 'Amber', hex: '#ffe066', unlock: free },
  { id: 'green', kind: 'crosshairColor', label: 'Green', hex: '#7CFC00', unlock: level(2) },
  { id: 'violet', kind: 'crosshairColor', label: 'Violet', hex: '#b388ff', unlock: level(6) },
  { id: 'red',   kind: 'crosshairColor', label: 'Red',   hex: '#ff3b3b', unlock: supporter },
  { id: 'cyan',  kind: 'crosshairColor', label: 'Cyan',  hex: '#3ff0ff', unlock: supporter },
])

// id -> hex lookup, precomputed so HUD render never allocates.
export const CROSSHAIR_HEX = Object.freeze(
  Object.fromEntries(CROSSHAIR_COLORS.map((c) => [c.id, c.hex]))
)

export const DEFAULT_COSMETICS = Object.freeze({
  skin: 'default',
  crosshair: 'cross',
  crosshairColor: 'white',
  knifeSkin: 'default',
})

export const DEFAULT_STATS = Object.freeze({
  bestWave: 0,
  totalKills: 0,
  runs: 0,
  totalHeadshots: 0,
  totalKnifeKills: 0,
  // Wave 4 progression (lives in the same stats object so it persists / syncs with the rest)
  xp: 0,                 // lifetime XP -> level (progression.js)
  achievements: Object.freeze({}),   // { [achievementId]: unix-day it was earned }
  challenges: Object.freeze({}),     // { daily: {key, progress, done}, weekly: {...} } (challenges.js)
  lastRunDay: '',                    // UTC 'YYYY-MM-DD' of the last finished run (first-run-of-day bonus)
})

export const SUPPORTER_SKU = 'supporter_pack'

const ALL_ITEMS = Object.freeze([...COSMETICS, ...CROSSHAIR_COLORS])

/** Items of one kind in catalog order. kind 'crosshairColor' returns CROSSHAIR_COLORS. */
export function itemsOfKind(kind) {
  return ALL_ITEMS.filter((i) => i.kind === kind)
}

export function getItem(kind, id) {
  return ALL_ITEMS.find((i) => i.kind === kind && i.id === id) ?? null
}

// ── Unlock logic ───────────────────────────────────────────────────────────

/**
 * @param item   catalog entry
 * @param ctx    { entitlements: string[] (sku list), stats: lifetime stats }
 */
export function isUnlocked(item, { entitlements = [], stats = DEFAULT_STATS } = {}) {
  if (!item) return false
  const u = item.unlock
  if (!u || u.type === 'free') return true
  if (u.type === 'supporter') return Array.isArray(entitlements) && entitlements.includes(SUPPORTER_SKU)
  if (u.type === 'milestone') return (Number(stats?.[u.stat]) || 0) >= u.value
  if (u.type === 'level') return levelFromXp(stats?.xp).level >= u.value
  return false
}

/** Short player-facing unlock condition, e.g. "Reach wave 10", "250 kills", "Supporter". */
export function unlockText(item) {
  const u = item?.unlock
  if (!u || u.type === 'free') return ''
  if (u.type === 'supporter') return 'Supporter'
  if (u.type === 'level') return `Level ${u.value}`
  if (u.type === 'milestone') {
    return u.stat === 'bestWave' ? `Reach wave ${u.value}` : `${u.value} kills`
  }
  return ''
}

/** Name for the death-screen "NEW UNLOCK" line. */
export function describeUnlock(item) {
  if (item.kind === 'skin') return `${item.label} finish`
  if (item.kind === 'crosshairColor') return `${item.label} crosshair`
  if (item.kind === 'knifeSkin') return `${item.label} knife`
  return item.label
}

/**
 * Items that were locked with `prevStats` and are unlocked with `nextStats`
 * (entitlements held constant). Only milestone items can flip this way.
 */
export function newUnlocksBetween(prevStats, nextStats, entitlements = []) {
  return ALL_ITEMS.filter(
    (item) =>
      !isUnlocked(item, { entitlements, stats: prevStats }) &&
      isUnlocked(item, { entitlements, stats: nextStats })
  )
}

// ── Level rewards ──────────────────────────────────────────────────────────
// Named (non-cosmetic) rewards reserved for other work: another agent implements the
// Diner map gate and the starting loadout; they only need `isLevelRewardUnlocked`.
export const NAMED_LEVEL_REWARDS = Object.freeze([
  { id: 'diner_map',        level: 5, text: 'Diner map' },
  { id: 'loadout_shotgun',  level: 8, text: 'Starting loadout: Shotgun' },
])

/** True once the player's level (from stats.xp) has reached the named reward's level. */
export function isLevelRewardUnlocked(rewardId, stats = DEFAULT_STATS) {
  const r = NAMED_LEVEL_REWARDS.find((x) => x.id === rewardId)
  return !!r && levelFromXp(stats?.xp).level >= r.level
}

/** What reaching level `n` gives: { level, text, named: [...], items: [...] } or null when nothing. */
export function levelReward(n) {
  const named = NAMED_LEVEL_REWARDS.filter((r) => r.level === n)
  const items = ALL_ITEMS.filter((i) => i.unlock?.type === 'level' && i.unlock.value === n)
  if (!named.length && !items.length) return null
  const text = [...named.map((r) => r.text), ...items.map(describeUnlock)].join(' + ')
  return { level: n, text, named, items }
}

/** Soonest reward above `currentLevel`: { level, text } or null. */
export function nextLevelReward(currentLevel) {
  for (let n = currentLevel + 1; n <= 100; n++) {
    const r = levelReward(n)
    if (r) return { level: n, text: r.text }
  }
  return null
}

// ── Skin palettes ──────────────────────────────────────────────────────────
// role -> { color, metalness, roughness }. Roles used by Gun.jsx:
//   metal (receivers/slides), dark (barrels/mags/sights), wood (stocks),
//   grip, chrome (deagle slide/frame), accent (small highlights, tank, sights).

const m = (color, metalness, roughness) => Object.freeze({ color, metalness, roughness })

export const SKIN_PALETTES = Object.freeze({
  // No overrides: models keep their authored colours.
  default: Object.freeze({}),

  blood_rust: Object.freeze({
    metal:  m('#5a2a1a', 0.6, 0.8),
    chrome: m('#6b3322', 0.6, 0.75),
    dark:   m('#2a1410', 0.5, 0.8),
    wood:   m('#3a2216', 0.0, 0.95),
    grip:   m('#1f0f0b', 0.1, 0.95),
    accent: m('#7a1010', 0.4, 0.7),
  }),

  field_worn: Object.freeze({
    metal:  m('#4f5a4a', 0.3, 0.85),
    chrome: m('#6a7264', 0.35, 0.8),
    dark:   m('#2c3128', 0.3, 0.85),
    wood:   m('#5b5a48', 0.0, 0.95),
    grip:   m('#2a2d26', 0.05, 0.95),
    accent: m('#8a8f7a', 0.3, 0.8),
  }),

  gold: Object.freeze({
    metal:  m('#c9a227', 0.95, 0.2),
    chrome: m('#dcb53a', 0.95, 0.15),
    dark:   m('#2b2416', 0.8, 0.25),   // dark parts stay dark
    wood:   m('#6b4a12', 0.6, 0.4),
    grip:   m('#1a1710', 0.1, 0.9),
    accent: m('#f2d36b', 0.9, 0.2),
  }),

  obsidian: Object.freeze({
    metal:  m('#0b0b0f', 0.9, 0.1),
    chrome: m('#14141c', 0.9, 0.08),
    dark:   m('#050507', 0.9, 0.12),
    wood:   m('#0e0c14', 0.5, 0.2),
    grip:   m('#08080b', 0.2, 0.6),
    accent: m('#5a3a8f', 0.8, 0.2),    // faint purple
  }),

  arctic: Object.freeze({
    metal:  m('#b9c6cf', 0.35, 0.55),
    chrome: m('#dfe8ee', 0.5, 0.4),
    dark:   m('#4a5560', 0.4, 0.6),
    wood:   m('#8a97a0', 0.1, 0.8),
    grip:   m('#3a444c', 0.05, 0.9),
    accent: m('#7fc4e8', 0.5, 0.4),
  }),

  verdigris: Object.freeze({
    metal:  m('#3f7f6e', 0.7, 0.55),
    chrome: m('#5fa08c', 0.75, 0.45),
    dark:   m('#1b3a32', 0.5, 0.65),
    wood:   m('#4a3a22', 0.0, 0.9),
    grip:   m('#16241f', 0.1, 0.9),
    accent: m('#b87333', 0.8, 0.35),
  }),
})

/**
 * Knife blade palettes. Same material config as the factory knife (emissive is always
 * carried, black/0 by default) so equipping never compiles a new shader.
 */
export const KNIFE_PALETTES = Object.freeze({
  default:  Object.freeze({ color: '#b8b8b8', metalness: 0.95, roughness: 0.10, emissive: '#000000', emissiveIntensity: 0 }),
  ember:    Object.freeze({ color: '#3a3a40', metalness: 0.9,  roughness: 0.25, emissive: '#ff4a1a', emissiveIntensity: 0.9 }),
  bone:     Object.freeze({ color: '#d8d2bc', metalness: 0.2,  roughness: 0.6,  emissive: '#000000', emissiveIntensity: 0 }),
  bloodied: Object.freeze({ color: '#6a6a70', metalness: 0.85, roughness: 0.35, emissive: '#8a1c1c', emissiveIntensity: 0.5 }),
})

/**
 * Returns the skin's override `{ color, metalness, roughness }` for `role`,
 * or `base` when the skin (or the role) has no override. Pure lookup into
 * frozen module-level maps: it never allocates, so it is safe in render.
 * Pass `base = null` to just ask "is there an override?".
 */
export function applySkin(skinId, role, base = null) {
  const palette = SKIN_PALETTES[skinId]
  return (palette && palette[role]) || base
}

// ── Stats ──────────────────────────────────────────────────────────────────

function nonNegInt(v) {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function sanitizeStats(obj) {
  const o = obj && typeof obj === 'object' ? obj : {}
  const base = {
    bestWave: nonNegInt(o.bestWave),
    totalKills: nonNegInt(o.totalKills),
    runs: nonNegInt(o.runs),
    totalHeadshots: nonNegInt(o.totalHeadshots),
    totalKnifeKills: nonNegInt(o.totalKnifeKills),
  }
  return {
    ...base,
    // Pre-Wave-4 profiles have no `xp` key: estimate it once so veterans keep their level-gated unlocks.
    xp: o.xp === undefined && base.runs > 0 ? Math.floor(legacyXp(base)) : nonNegInt(o.xp),
    achievements: sanitizeAchievements(o.achievements),
    challenges: sanitizeChallengeState(o.challenges),
    lastRunDay: typeof o.lastRunDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.lastRunDay) ? o.lastRunDay : '',
  }
}

function sanitizeAchievements(a) {
  const out = {}
  if (a && typeof a === 'object') {
    for (const k of Object.keys(a).slice(0, 200)) {
      if (k.length <= 40) out[k] = nonNegInt(a[k]) || 1
    }
  }
  return out
}

/**
 * Combine two *independent* stat blocks (e.g. an anonymous local profile that
 * has never been uploaded + a cloud profile): bestWave is a high-water mark so
 * it takes the MAX; every other counter is a lifetime total of distinct runs,
 * so they SUM. Achievements union; challenge progress keeps the better of each.
 *
 * Do NOT use this for two views of the same lineage (local copy that was
 * already synced to this account + the cloud copy): summing would double
 * count. Use `maxStats` for that.
 */
export function mergeStats(a, b) {
  const x = sanitizeStats(a)
  const y = sanitizeStats(b)
  return {
    bestWave: Math.max(x.bestWave, y.bestWave),
    totalKills: x.totalKills + y.totalKills,
    runs: x.runs + y.runs,
    totalHeadshots: x.totalHeadshots + y.totalHeadshots,
    totalKnifeKills: x.totalKnifeKills + y.totalKnifeKills,
    xp: x.xp + y.xp,
    achievements: { ...y.achievements, ...x.achievements },
    challenges: mergeChallengeState(x.challenges, y.challenges),
    lastRunDay: x.lastRunDay > y.lastRunDay ? x.lastRunDay : y.lastRunDay,
  }
}

/** Field-wise max: reconcile two copies of the same lineage without double counting. */
export function maxStats(a, b) {
  const x = sanitizeStats(a)
  const y = sanitizeStats(b)
  return {
    bestWave: Math.max(x.bestWave, y.bestWave),
    totalKills: Math.max(x.totalKills, y.totalKills),
    runs: Math.max(x.runs, y.runs),
    totalHeadshots: Math.max(x.totalHeadshots, y.totalHeadshots),
    totalKnifeKills: Math.max(x.totalKnifeKills, y.totalKnifeKills),
    xp: Math.max(x.xp, y.xp),
    achievements: { ...y.achievements, ...x.achievements },
    challenges: mergeChallengeState(x.challenges, y.challenges),
    lastRunDay: x.lastRunDay > y.lastRunDay ? x.lastRunDay : y.lastRunDay,
  }
}

// ── Equipped cosmetics ─────────────────────────────────────────────────────

const EQUIP_KINDS = Object.freeze({
  skin: 'skin',
  crosshair: 'crosshair',
  crosshairColor: 'crosshairColor',
  knifeSkin: 'knifeSkin',
})

/** Unknown / missing ids fall back to the default for that slot. Does not check unlocks. */
export function sanitizeCosmetics(obj) {
  const o = obj && typeof obj === 'object' ? obj : {}
  const out = { ...DEFAULT_COSMETICS }
  for (const key of Object.keys(EQUIP_KINDS)) {
    if (typeof o[key] === 'string' && getItem(EQUIP_KINDS[key], o[key])) out[key] = o[key]
  }
  return out
}

/** True when `obj` has no meaningful keys (used so an empty cloud `{}` doesn't beat local). */
export function isEmptyCosmetics(obj) {
  return !obj || typeof obj !== 'object' || Object.keys(obj).length === 0
}
