import { describe, it, expect, beforeEach } from 'vitest'
import {
  MAP_CHOICES, LOADOUTS, isMapUnlocked, isLoadoutUnlocked, effectiveLoadout, loadoutPatch,
  resolveMapId, LOADOUT_PREF_KEY,
} from '../mapSelect'
import { canStartDaily } from '../daily'
import { xpForLevel } from '../progression'
import { DEFAULT_STATS, nextLevelReward, levelReward } from '../cosmetics'
import { dailyChallenges, weeklyChallenges, challengeNeedsDoors, TEMPLATES } from '../challenges'
import { useGameStore } from '../store'

const atLevel = (n) => ({ ...DEFAULT_STATS, xp: xpForLevel(n) })

describe('map gating', () => {
  it('cabin is always available; diner needs level 5', () => {
    expect(isMapUnlocked('cabin', atLevel(1))).toBe(true)
    expect(isMapUnlocked('diner', atLevel(4))).toBe(false)
    expect(isMapUnlocked('diner', atLevel(5))).toBe(true)
    expect(isMapUnlocked('nope', atLevel(50))).toBe(false)
    expect(MAP_CHOICES.find((m) => m.id === 'diner').reqLevel).toBe(5)
  })

  const base = { knownIds: ['cabin', 'diner'], prod: true }
  it('a saved diner choice only resolves when unlocked', () => {
    expect(resolveMapId({ ...base, saved: 'diner', stats: atLevel(4) })).toBe('cabin')
    expect(resolveMapId({ ...base, saved: 'diner', stats: atLevel(5) })).toBe('diner')
    expect(resolveMapId({ ...base, saved: 'bogus', stats: atLevel(9) })).toBe('cabin')
    expect(resolveMapId({ ...base, saved: null, stats: atLevel(9) })).toBe('cabin')
  })
  it('debug ?map= works only outside production', () => {
    expect(resolveMapId({ ...base, prod: false, debugParam: 'diner', saved: null, stats: atLevel(1) })).toBe('diner')
    expect(resolveMapId({ ...base, prod: true, debugParam: 'diner', saved: null, stats: atLevel(1) })).toBe('cabin')
  })
  it('Daily Run needs the cabin map', () => {
    expect(canStartDaily({ mapId: 'cabin' })).toBe(true)
    expect(canStartDaily({ mapId: 'diner' })).toBe(false)
    expect(canStartDaily()).toBe(true)
  })
})

describe('loadouts', () => {
  it('unlock at their reward levels', () => {
    expect(isLoadoutUnlocked('pistol', atLevel(1))).toBe(true)
    expect(isLoadoutUnlocked('shotgun', atLevel(7))).toBe(false)
    expect(isLoadoutUnlocked('shotgun', atLevel(8))).toBe(true)
    expect(isLoadoutUnlocked('fast_hands', atLevel(11))).toBe(false)
    expect(isLoadoutUnlocked('fast_hands', atLevel(12))).toBe(true)
    expect(isLoadoutUnlocked('ak47', atLevel(15))).toBe(false)
    expect(isLoadoutUnlocked('ak47', atLevel(16))).toBe(true)
  })
  it('appear in the level reward table', () => {
    expect(levelReward(12).text).toMatch(/Fast Hands/)
    expect(nextLevelReward(11).level).toBe(12)
    expect(levelReward(16).text).toMatch(/AK-47/)
  })
  it('locked / daily fall back to the pistol start', () => {
    expect(effectiveLoadout('shotgun', atLevel(3)).id).toBe('pistol')
    expect(effectiveLoadout('shotgun', atLevel(20)).id).toBe('shotgun')
    expect(effectiveLoadout('shotgun', atLevel(20), true).id).toBe('pistol')
    expect(effectiveLoadout('garbage', atLevel(20)).id).toBe('pistol')
  })
  it('patches ammo pools: pistol parked, gun live, 3-gun limit respected', () => {
    const base = { bulletsInClip: 10, reserveBullets: 0, savedClips: { pistol: 0, shotgun: 0 }, savedReserves: { pistol: 0, shotgun: 0 } }
    const p = loadoutPatch(LOADOUTS.find((l) => l.id === 'shotgun'), base)
    expect(p).toMatchObject({ weapon: 'shotgun', ownedWeapons: ['pistol', 'shotgun'], bulletsInClip: 8, reserveBullets: 8 })
    expect(p.savedClips.pistol).toBe(10)
    const ak = loadoutPatch(LOADOUTS.find((l) => l.id === 'ak47'), base)
    expect(ak).toMatchObject({ weapon: 'ak47', bulletsInClip: 30, reserveBullets: 0 })
    expect(loadoutPatch(LOADOUTS.find((l) => l.id === 'fast_hands'), base)).toEqual({ perks: { fast_hands: true } })
    for (const l of LOADOUTS) expect((loadoutPatch(l, base).ownedWeapons ?? []).length).toBeLessThanOrEqual(3)
  })
})

describe('store startGame applies loadouts', () => {
  beforeEach(() => {
    useGameStore.setState({ phase: 'start', stats: atLevel(20), loadoutId: 'pistol', runMode: 'normal' })
  })
  it('shotgun start in a normal run', () => {
    useGameStore.setState({ loadoutId: 'shotgun' })
    useGameStore.getState().startGame()
    const s = useGameStore.getState()
    expect(s.weapon).toBe('shotgun')
    expect(s.ownedWeapons).toEqual(['pistol', 'shotgun'])
    expect([s.bulletsInClip, s.reserveBullets]).toEqual([8, 8])
    expect(s.savedClips.pistol).toBe(10)
    s.switchWeapon('pistol')
    expect(useGameStore.getState().bulletsInClip).toBe(10)
  })
  it('fast hands start grants the perk', () => {
    useGameStore.setState({ loadoutId: 'fast_hands' })
    useGameStore.getState().startGame()
    expect(useGameStore.getState().perks.fast_hands).toBe(true)
    expect(useGameStore.getState().weapon).toBe('pistol')
  })
  it('a locked loadout is ignored', () => {
    useGameStore.setState({ loadoutId: 'ak47', stats: atLevel(2) })
    useGameStore.getState().startGame()
    expect(useGameStore.getState().weapon).toBe('pistol')
  })
  it('Daily Run ignores the loadout', () => {
    useGameStore.setState({ loadoutId: 'ak47' })
    expect(useGameStore.getState().startDaily(false)).toBe(true)
    const s = useGameStore.getState()
    expect(s.runMode).toBe('daily')
    expect(s.weapon).toBe('pistol')
    expect(s.ownedWeapons).toEqual(['pistol'])
    expect(s.perks).toEqual({})
  })
  it('exposes a persistence key', () => {
    expect(LOADOUT_PREF_KEY).toBe('cabin.loadout.v1')
  })
})

describe('door challenges on doorless maps', () => {
  it('door templates are flagged and tagged (Cabin)', () => {
    const doorTpls = TEMPLATES.filter((t) => t.needsDoors)
    expect(doorTpls.map((t) => t.id)).toContain('bedroom_door')
    let seen = 0
    for (let i = 0; i < 300; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i))
      for (const c of [...dailyChallenges(d), ...weeklyChallenges(d)]) {
        if (challengeNeedsDoors(c)) { seen++; expect(c.text).toMatch(/\(Cabin\)/) }
      }
    }
    expect(seen).toBeGreaterThan(0)
  })
})
