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

// ── Catalog ────────────────────────────────────────────────────────────────

const free = { type: 'free' }
const supporter = { type: 'supporter' }
const milestone = (stat, value) => ({ type: 'milestone', stat, value })

export const COSMETICS = Object.freeze([
  // Weapon finishes (apply to every gun)
  { id: 'default',    kind: 'skin', label: 'Factory',    blurb: 'The original finish.',                 unlock: free,                          swatch: '#585858' },
  { id: 'blood_rust', kind: 'skin', label: 'Blood-Rust', blurb: 'Rusted brown-red with dark accents.',  unlock: milestone('bestWave', 10),     swatch: '#5a2a1a' },
  { id: 'field_worn', kind: 'skin', label: 'Field-Worn', blurb: 'Matte olive-grey, well used.',         unlock: milestone('totalKills', 250),  swatch: '#4f5a4a' },
  { id: 'gold',       kind: 'skin', label: 'Gold',       blurb: 'Polished gold on every gun.',          unlock: supporter,                     swatch: '#c9a227' },
  { id: 'obsidian',   kind: 'skin', label: 'Obsidian',   blurb: 'Glossy black with a faint purple glow.', unlock: supporter,                   swatch: '#0b0b0f' },

  // Crosshair shapes
  { id: 'cross',   kind: 'crosshair', label: 'Cross',   blurb: 'Classic cross.',                unlock: free },
  { id: 'dot',     kind: 'crosshair', label: 'Dot',     blurb: 'A single centre dot.',          unlock: supporter },
  { id: 'chevron', kind: 'crosshair', label: 'Chevron', blurb: 'Two short angled lines.',       unlock: supporter },
  { id: 'circle',  kind: 'crosshair', label: 'Circle',  blurb: 'Ring with a centre dot.',       unlock: supporter },

  // Knife
  { id: 'default', kind: 'knifeSkin', label: 'Steel', blurb: 'Plain hunting knife.',           unlock: free,      swatch: '#b8b8b8' },
  { id: 'ember',   kind: 'knifeSkin', label: 'Ember', blurb: 'Dark steel with a glowing edge.', unlock: supporter, swatch: '#ff4a1a' },

  // Display-only (leaderboard star); not equippable
  { id: 'supporter_star', kind: 'badge', label: 'Supporter Star', blurb: 'A star next to your name on the leaderboard.', unlock: supporter },
])

// Crosshair colours are a separate small list (kind 'crosshairColor').
export const CROSSHAIR_COLORS = Object.freeze([
  { id: 'white', kind: 'crosshairColor', label: 'White', hex: '#ffffff', unlock: free },
  { id: 'amber', kind: 'crosshairColor', label: 'Amber', hex: '#ffe066', unlock: free },
  { id: 'green', kind: 'crosshairColor', label: 'Green', hex: '#7CFC00', unlock: milestone('bestWave', 5) },
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
  return false
}

/** Short player-facing unlock condition, e.g. "Reach wave 10", "250 kills", "Supporter". */
export function unlockText(item) {
  const u = item?.unlock
  if (!u || u.type === 'free') return ''
  if (u.type === 'supporter') return 'Supporter'
  if (u.type === 'milestone') {
    return u.stat === 'bestWave' ? `Reach wave ${u.value}` : `${u.value} kills`
  }
  return ''
}

/** Name for the death-screen "NEW UNLOCK" line. */
export function describeUnlock(item) {
  if (item.kind === 'skin') return `${item.label} finish`
  if (item.kind === 'crosshairColor') return `${item.label} crosshair`
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
  return {
    bestWave: nonNegInt(o.bestWave),
    totalKills: nonNegInt(o.totalKills),
    runs: nonNegInt(o.runs),
    totalHeadshots: nonNegInt(o.totalHeadshots),
    totalKnifeKills: nonNegInt(o.totalKnifeKills),
  }
}

/**
 * Combine two *independent* stat blocks (e.g. an anonymous local profile that
 * has never been uploaded + a cloud profile): bestWave is a high-water mark so
 * it takes the MAX; every other field is a lifetime counter of distinct runs,
 * so they SUM.
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
