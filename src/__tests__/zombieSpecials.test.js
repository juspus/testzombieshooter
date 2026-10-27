import { describe, it, expect, vi } from 'vitest'
vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))
import {
  armorMultiplier, EXPLODER, burstFalloff, burstPlayerDamage, burstZombieDamage, burstPlankHits, globFlightTime, SPITTER,
} from '../zombieSpecials'
import { useGameStore, specialProbsForWave, buildTypeList, zombieTypesForWave, ZOMBIE_ARCHETYPES } from '../store'

describe('armour damage', () => {
  it('reduces pistol / AK body hits to 25%', () => {
    expect(armorMultiplier('armored', { weapon: 'pistol', dist: 3 })).toBe(0.25)
    expect(armorMultiplier('armored', { weapon: 'ak47', dist: 9 })).toBe(0.25)
    expect(armorMultiplier('armored', {})).toBe(0.25)
  })
  it('is bypassed by headshots, deagle, close shotgun, knife, flame, burst', () => {
    expect(armorMultiplier('armored', { head: true, weapon: 'pistol' })).toBe(1)
    expect(armorMultiplier('armored', { weapon: 'deagle' })).toBe(1)
    expect(armorMultiplier('armored', { weapon: 'shotgun', dist: 4 })).toBe(1)
    expect(armorMultiplier('armored', { weapon: 'shotgun', dist: 6 })).toBe(0.25)
    for (const source of ['knife', 'flame', 'burst']) expect(armorMultiplier('armored', { source })).toBe(1)
  })
  it('never affects other archetypes', () => {
    expect(armorMultiplier('walker', { weapon: 'pistol' })).toBe(1)
  })
  it('is applied by the store: 4 AK body hits = 1 hp, headshot = 3', () => {
    useGameStore.setState({
      phase: 'playing', mpRole: null, pendingSpawns: [],
      zombies: [{ id: 1, type: 'armored', health: 5, maxHealth: 5 }],
    })
    const s = useGameStore.getState()
    for (let i = 0; i < 4; i++) s.hitZombie(1, false, 'gun', 'ak47', 8)
    expect(useGameStore.getState().zombies[0].health).toBeCloseTo(4)
    s.hitZombie(1, true, 'gun', 'pistol', 8)
    expect(useGameStore.getState().zombies[0].health).toBeCloseTo(1)
    expect(s.hitZombie(1, true, 'gun', 'pistol', 8)).toBe(true)
  })
})

describe('exploder burst', () => {
  it('falls off linearly and ends at the radius', () => {
    expect(burstFalloff(0, 2.5)).toBe(1)
    expect(burstFalloff(1.25, 2.5)).toBeCloseTo(0.5)
    expect(burstFalloff(2.5, 2.5)).toBe(0)
    expect(burstFalloff(9, 2.5)).toBe(0)
  })
  it('player damage: full at centre, half at 1.25 m, none beyond 2.5 m', () => {
    expect(burstPlayerDamage(0)).toBe(EXPLODER.PLAYER_MAX)
    expect(burstPlayerDamage(1.25)).toBeCloseTo(EXPLODER.PLAYER_MAX / 2)
    expect(burstPlayerDamage(2.6)).toBe(0)
  })
  it('zombie damage chains: kills a walker (2hp) up close, spares it far away', () => {
    expect(burstZombieDamage(1)).toBeGreaterThanOrEqual(2)
    expect(burstZombieDamage(3.4)).toBeLessThan(1)
    expect(burstZombieDamage(4)).toBe(0)
  })
  it('breaks a plain plank at a window but not at a distance', () => {
    expect(burstPlankHits(1.8)).toBeGreaterThanOrEqual(5)
    expect(burstPlankHits(5)).toBe(0)
  })
  it('burst source kills through the store', () => {
    useGameStore.setState({
      phase: 'playing', mpRole: null, pendingSpawns: [],
      zombies: [{ id: 1, type: 'exploder', health: 2, maxHealth: 2 }, { id: 2, type: 'walker', health: 2, maxHealth: 2 }],
    })
    useGameStore.getState().hitZombieBurst(2, burstZombieDamage(1))
    expect(useGameStore.getState().zombies.find((z) => z.id === 2).dying).toBe(true)
  })
})

describe('spitter', () => {
  it('flight time is clamped', () => {
    expect(globFlightTime(1)).toBe(SPITTER.FLIGHT_MIN)
    expect(globFlightTime(100)).toBe(SPITTER.FLIGHT_MAX)
  })
})

describe('spawn weights', () => {
  it('unlocks exploder 4, armored 6, spitter 8', () => {
    expect(zombieTypesForWave(3)).not.toContain('exploder')
    expect(zombieTypesForWave(4)).toContain('exploder')
    expect(zombieTypesForWave(5)).not.toContain('armored')
    expect(zombieTypesForWave(6)).toContain('armored')
    expect(zombieTypesForWave(7)).not.toContain('spitter')
    expect(zombieTypesForWave(8)).toContain('spitter')
  })
  it('keeps the special share bounded at every wave', () => {
    for (let w = 1; w <= 40; w++) {
      const total = specialProbsForWave(w).reduce((a, [, p]) => a + p, 0)
      expect(total).toBeLessThanOrEqual(0.55 + 1e-9)
    }
  })
  it('type list guarantees one of each unlocked special and has the right length', () => {
    const list = buildTypeList(8, 23)
    expect(list).toHaveLength(23)
    for (const t of ['exploder', 'armored', 'spitter']) expect(list).toContain(t)
    expect(buildTypeList(3, 14)).not.toContain('exploder')
  })
  it('archetype table has the new entries', () => {
    for (const t of ['exploder', 'armored', 'spitter']) expect(ZOMBIE_ARCHETYPES[t]).toBeTruthy()
  })
})
