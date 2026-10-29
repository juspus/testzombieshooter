import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore } from '../store'
import { isSeeded, currentSeed, waveRandom } from '../rng'

describe('startSeededGame', () => {
  afterEach(() => { useGameStore.getState().startGame() })

  it('starts a seeded run with the given mode and seed', () => {
    useGameStore.getState().startSeededGame('versus', 'abc123')
    const s = useGameStore.getState()
    expect(s.runMode).toBe('versus')
    expect(s.runSeed).toBe('abc123')
    expect(s.dailyDate).toBe(null)
    expect(isSeeded()).toBe(true)
    expect(currentSeed()).toBe('abc123')
  })

  it('gives two runs with the same seed the same wave rolls', () => {
    useGameStore.getState().startSeededGame('duel', 'same-seed')
    const a = waveRandom('spawn', 3)()
    useGameStore.getState().startSeededGame('duel', 'same-seed')
    expect(waveRandom('spawn', 3)()).toBe(a)
  })

  it('ignores the saved loadout', () => {
    useGameStore.setState({ loadoutId: 'shotgun', stats: { bestWave: 99, runs: 99, kills: 9999 } })
    useGameStore.getState().startSeededGame('versus', 's')
    const s = useGameStore.getState()
    expect(s.weapon).toBe('pistol')
    expect(s.ownedWeapons).toEqual(['pistol'])
  })

  it('a plain start clears the seeded mode', () => {
    useGameStore.getState().startSeededGame('versus', 's')
    useGameStore.getState().startGame()
    const s = useGameStore.getState()
    expect(s.runMode).toBe('normal')
    expect(s.runSeed).toBe(null)
    expect(isSeeded()).toBe(false)
  })
})
