import { describe, it, expect } from 'vitest'
import {
  COSMETICS,
  CROSSHAIR_COLORS,
  DEFAULT_COSMETICS,
  DEFAULT_STATS,
  SKIN_PALETTES,
  applySkin,
  getItem,
  isUnlocked,
  maxStats,
  mergeStats,
  newUnlocksBetween,
  sanitizeCosmetics,
  unlockText,
} from '../cosmetics'

const stats = (o = {}) => ({ ...DEFAULT_STATS, ...o })
const ctx = (o = {}) => ({ entitlements: [], stats: stats(), ...o })

describe('catalog', () => {
  it('has exactly the specified items', () => {
    const ids = (kind) => COSMETICS.filter((i) => i.kind === kind).map((i) => i.id)
    expect(ids('skin')).toEqual(['default', 'blood_rust', 'field_worn', 'gold', 'obsidian'])
    expect(ids('crosshair')).toEqual(['cross', 'dot', 'chevron', 'circle'])
    expect(ids('knifeSkin')).toEqual(['default', 'ember'])
    expect(ids('badge')).toEqual(['supporter_star'])
    expect(CROSSHAIR_COLORS.map((c) => c.id)).toEqual(['white', 'amber', 'green', 'red', 'cyan'])
  })

  it('every paid skin has a palette covering all roles', () => {
    for (const id of ['blood_rust', 'field_worn', 'gold', 'obsidian']) {
      for (const role of ['metal', 'dark', 'wood', 'grip', 'chrome', 'accent']) {
        const o = SKIN_PALETTES[id][role]
        expect(o, `${id}.${role}`).toBeTruthy()
        expect(typeof o.color).toBe('string')
        expect(o.metalness).toBeGreaterThanOrEqual(0)
        expect(o.roughness).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('isUnlocked', () => {
  it('free items are always unlocked', () => {
    expect(isUnlocked(getItem('skin', 'default'), ctx())).toBe(true)
    expect(isUnlocked(getItem('crosshair', 'cross'), ctx())).toBe(true)
    expect(isUnlocked(getItem('crosshairColor', 'amber'), ctx())).toBe(true)
  })

  it('supporter items need the supporter_pack sku', () => {
    const gold = getItem('skin', 'gold')
    expect(isUnlocked(gold, ctx())).toBe(false)
    expect(isUnlocked(gold, ctx({ entitlements: ['something_else'] }))).toBe(false)
    expect(isUnlocked(gold, ctx({ entitlements: ['supporter_pack'] }))).toBe(true)
    for (const item of [...COSMETICS, ...CROSSHAIR_COLORS].filter((i) => i.unlock.type === 'supporter')) {
      expect(isUnlocked(item, ctx({ entitlements: ['supporter_pack'] }))).toBe(true)
    }
  })

  it('milestone edges: value-1 locked, value unlocked', () => {
    const rust = getItem('skin', 'blood_rust')
    expect(isUnlocked(rust, ctx({ stats: stats({ bestWave: 9 }) }))).toBe(false)
    expect(isUnlocked(rust, ctx({ stats: stats({ bestWave: 10 }) }))).toBe(true)
    const worn = getItem('skin', 'field_worn')
    expect(isUnlocked(worn, ctx({ stats: stats({ totalKills: 249 }) }))).toBe(false)
    expect(isUnlocked(worn, ctx({ stats: stats({ totalKills: 250 }) }))).toBe(true)
    const green = getItem('crosshairColor', 'green')
    expect(isUnlocked(green, ctx({ stats: stats({ bestWave: 4 }) }))).toBe(false)
    expect(isUnlocked(green, ctx({ stats: stats({ bestWave: 5 }) }))).toBe(true)
  })

  it('does not crash on missing / junk input', () => {
    expect(isUnlocked(null, ctx())).toBe(false)
    expect(isUnlocked(getItem('skin', 'gold'), { entitlements: undefined })).toBe(false)
    expect(isUnlocked(getItem('skin', 'blood_rust'), { stats: { bestWave: 'x' } })).toBe(false)
  })

  it('unlockText', () => {
    expect(unlockText(getItem('skin', 'blood_rust'))).toBe('Reach wave 10')
    expect(unlockText(getItem('skin', 'field_worn'))).toBe('250 kills')
    expect(unlockText(getItem('skin', 'gold'))).toBe('Supporter')
    expect(unlockText(getItem('skin', 'default'))).toBe('')
  })
})

describe('applySkin', () => {
  it('returns the override for a skinned role and base otherwise', () => {
    const base = { color: '#123456' }
    expect(applySkin('gold', 'metal', base)).toBe(SKIN_PALETTES.gold.metal)
    expect(applySkin('gold', 'metal', base).color).toBe('#c9a227')
    expect(applySkin('default', 'metal', base)).toBe(base)
    expect(applySkin('nope', 'metal', base)).toBe(base)
    expect(applySkin('gold', 'nope', base)).toBe(base)
    expect(applySkin('gold', 'metal')).toBe(SKIN_PALETTES.gold.metal)
    expect(applySkin('default', 'metal')).toBeNull()
  })

  it('does not allocate: same object every call', () => {
    expect(applySkin('obsidian', 'dark')).toBe(applySkin('obsidian', 'dark'))
  })
})

describe('newUnlocksBetween', () => {
  it('reports items that cross a milestone', () => {
    const out = newUnlocksBetween(stats({ bestWave: 4, totalKills: 200 }), stats({ bestWave: 10, totalKills: 260 }), [])
    expect(out.map((i) => i.id).sort()).toEqual(['blood_rust', 'field_worn', 'green'])
  })

  it('reports nothing when nothing flipped, or already unlocked', () => {
    expect(newUnlocksBetween(stats({ bestWave: 5 }), stats({ bestWave: 6 }), [])).toEqual([])
    expect(newUnlocksBetween(stats({ bestWave: 10 }), stats({ bestWave: 20 }), [])).toEqual([])
  })

  it('does not report supporter items (entitlements do not change during a run)', () => {
    const out = newUnlocksBetween(stats(), stats({ bestWave: 50, totalKills: 9999 }), ['supporter_pack'])
    expect(out.every((i) => i.unlock.type === 'milestone')).toBe(true)
  })
})

describe('mergeStats', () => {
  it('maxes bestWave and sums counters', () => {
    const merged = mergeStats(
      { bestWave: 7, totalKills: 100, runs: 3, totalHeadshots: 10, totalKnifeKills: 2 },
      { bestWave: 5, totalKills: 40, runs: 2, totalHeadshots: 4, totalKnifeKills: 1 }
    )
    expect(merged).toEqual({ bestWave: 7, totalKills: 140, runs: 5, totalHeadshots: 14, totalKnifeKills: 3 })
  })

  it('tolerates empty / junk blocks', () => {
    expect(mergeStats({}, null)).toEqual(DEFAULT_STATS)
    expect(mergeStats({ bestWave: -3, totalKills: 'abc' }, { totalKills: 5.9 })).toEqual({ ...DEFAULT_STATS, totalKills: 5 })
  })

  it('maxStats never double counts the same lineage', () => {
    const a = { bestWave: 7, totalKills: 100, runs: 3, totalHeadshots: 10, totalKnifeKills: 2 }
    expect(maxStats(a, a)).toEqual(a)
  })
})

describe('sanitizeCosmetics', () => {
  it('keeps valid ids', () => {
    const c = { skin: 'gold', crosshair: 'chevron', crosshairColor: 'cyan', knifeSkin: 'ember' }
    expect(sanitizeCosmetics(c)).toEqual(c)
  })

  it('unknown ids and wrong-kind ids fall back to defaults', () => {
    expect(sanitizeCosmetics({ skin: 'rainbow', crosshair: 'gold', crosshairColor: 'pink', knifeSkin: 'x' })).toEqual(DEFAULT_COSMETICS)
    expect(sanitizeCosmetics({ skin: 'supporter_star' })).toEqual(DEFAULT_COSMETICS) // badge is not a skin
  })

  it('handles junk input', () => {
    expect(sanitizeCosmetics(null)).toEqual(DEFAULT_COSMETICS)
    expect(sanitizeCosmetics('str')).toEqual(DEFAULT_COSMETICS)
    expect(sanitizeCosmetics({})).toEqual(DEFAULT_COSMETICS)
    expect(sanitizeCosmetics({ skin: 42 })).toEqual(DEFAULT_COSMETICS)
  })
})
