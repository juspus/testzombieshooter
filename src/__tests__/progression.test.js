import { describe, it, expect } from 'vitest'
import { xpToNext, xpForLevel, levelFromXp, calcRunXp, killXp, legacyXp, MAX_LEVEL } from '../progression'
import { levelReward, nextLevelReward, isLevelRewardUnlocked, isUnlocked, getItem, DEFAULT_STATS } from '../cosmetics'

describe('level curve', () => {
  it('matches 100 + 60*(n-1)^1.35 and is strictly increasing', () => {
    expect(xpToNext(1)).toBe(100)
    expect(xpToNext(2)).toBe(160)
    expect(xpToNext(9)).toBe(Math.round(100 + 60 * Math.pow(8, 1.35)))
    for (let n = 1; n < MAX_LEVEL - 1; n++) expect(xpToNext(n + 1)).toBeGreaterThan(xpToNext(n))
  })

  it('level 2 comes after about one good run, later levels are steadier', () => {
    expect(levelFromXp(99).level).toBe(1)
    expect(levelFromXp(100).level).toBe(2)
    expect(xpForLevel(3)).toBe(260)
    expect(levelFromXp(259).level).toBe(2)
    expect(levelFromXp(260).level).toBe(3)
  })

  it('caps at 100 and reports progress inside a level', () => {
    expect(levelFromXp(1e9)).toMatchObject({ level: MAX_LEVEL, pct: 1, toNext: 0 })
    const lv = levelFromXp(130)
    expect(lv).toMatchObject({ level: 2, into: 30, need: 160 })
    expect(lv.pct).toBeCloseTo(30 / 160)
    expect(levelFromXp(-5).level).toBe(1)
    expect(levelFromXp('junk').level).toBe(1)
  })
})

describe('run XP', () => {
  it('kill values: specials 3, boss 25', () => {
    expect(killXp('walker')).toBe(1)
    for (const t of ['brute', 'armored', 'spitter', 'exploder']) expect(killXp(t)).toBe(3)
    expect(killXp('boss')).toBe(25)
  })

  it('sample run adds up', () => {
    const { rows, total } = calcRunXp({
      killXp: 40, headshots: 10, wavesCleared: 4, modifierWaves: 1,
      challenges: [{ xp: 150, label: 'Daily: x' }], firstRunOfDay: true,
    })
    // 40 kills + 10 hs + (10+20+30+40) + 25 + 150 + 50
    expect(total).toBe(40 + 10 + 100 + 25 + 150 + 50)
    expect(rows.map((r) => r.id)).toEqual(['kills', 'headshots', 'waves', 'modifiers', 'challenge0', 'firstRun'])
  })

  it('an empty run pays nothing and drops zero rows', () => {
    expect(calcRunXp({})).toEqual({ rows: [], total: 0 })
  })

  it('legacy profiles get a sensible starting level', () => {
    expect(legacyXp({ totalKills: 250, bestWave: 8 })).toBe(250 + 10 * 28)
  })
})

describe('level rewards', () => {
  it('reserves level 5 (Diner map) and level 8 (Shotgun loadout)', () => {
    expect(levelReward(5).text).toContain('Diner map')
    expect(levelReward(8).text).toContain('Starting loadout: Shotgun')
    expect(isLevelRewardUnlocked('diner_map', { xp: xpForLevel(5) - 1 })).toBe(false)
    expect(isLevelRewardUnlocked('diner_map', { xp: xpForLevel(5) })).toBe(true)
    expect(isLevelRewardUnlocked('loadout_shotgun', { xp: xpForLevel(8) })).toBe(true)
    expect(isLevelRewardUnlocked('nope', { xp: 1e6 })).toBe(false)
  })

  it('nextLevelReward always finds the next thing, null past the last', () => {
    expect(nextLevelReward(1)).toMatchObject({ level: 2 })
    expect(nextLevelReward(4).level).toBe(5)
    expect(nextLevelReward(99)).toBeNull()
    expect(levelReward(7)).toBeNull()
  })

  it('level-gated cosmetics follow stats.xp', () => {
    const bone = getItem('knifeSkin', 'bone')
    expect(isUnlocked(bone, { stats: { ...DEFAULT_STATS, xp: xpForLevel(4) - 1 } })).toBe(false)
    expect(isUnlocked(bone, { stats: { ...DEFAULT_STATS, xp: xpForLevel(4) } })).toBe(true)
  })
})
