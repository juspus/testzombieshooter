import { describe, it, expect, beforeEach, vi } from 'vitest'

// Don't touch localStorage / the network from store tests.
vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore } from '../store'
import { persistProfile } from '../profilePersistence'
import { DEFAULT_COSMETICS, DEFAULT_STATS } from '../cosmetics'

const reset = (over = {}) => {
  useGameStore.getState().startGame()
  useGameStore.setState({
    cosmetics: { ...DEFAULT_COSMETICS },
    stats: { ...DEFAULT_STATS },
    entitlements: [],
    lastRunUnlocks: [],
    runRecorded: false,
    phase: 'playing',
    ...over,
  })
  vi.mocked(persistProfile).mockClear()
}

describe('recordRunEnd', () => {
  beforeEach(() => reset())

  it('folds the run into lifetime stats exactly once', () => {
    useGameStore.setState({ wave: 6, kills: 40, runHeadshots: 12, runKnifeKills: 3 })
    useGameStore.getState().recordRunEnd()
    useGameStore.getState().recordRunEnd() // second call is a no-op
    expect(useGameStore.getState().stats).toEqual({
      bestWave: 6, totalKills: 40, runs: 1, totalHeadshots: 12, totalKnifeKills: 3,
    })
    expect(persistProfile).toHaveBeenCalledTimes(1)
  })

  it('accumulates across runs and keeps the best wave as a max', () => {
    useGameStore.setState({ stats: { ...DEFAULT_STATS, bestWave: 9, totalKills: 100, runs: 4 }, wave: 3, kills: 10 })
    useGameStore.getState().recordRunEnd()
    expect(useGameStore.getState().stats).toMatchObject({ bestWave: 9, totalKills: 110, runs: 5 })
  })

  it('computes lastRunUnlocks for milestones crossed in this run', () => {
    useGameStore.setState({ stats: { ...DEFAULT_STATS, totalKills: 240 }, wave: 10, kills: 15 })
    useGameStore.getState().recordRunEnd()
    const ids = useGameStore.getState().lastRunUnlocks.map((i) => i.id).sort()
    expect(ids).toEqual(['blood_rust', 'field_worn', 'green'])
  })

  it('die() records once, and repeated die() (co-op echo) does not double count', () => {
    useGameStore.setState({ wave: 4, kills: 20 })
    useGameStore.getState().die()
    useGameStore.getState().die()
    useGameStore.getState().die()
    expect(useGameStore.getState().phase).toBe('dead')
    expect(useGameStore.getState().stats.runs).toBe(1)
    expect(useGameStore.getState().stats.totalKills).toBe(20)
  })

  it('a guest dying through the net event path records too', () => {
    useGameStore.setState({ mpRole: 'guest', wave: 5, kills: 7 })
    useGameStore.getState().die() // NetManager 'die' event calls store.die()
    expect(useGameStore.getState().stats).toMatchObject({ runs: 1, bestWave: 5, totalKills: 7 })
    useGameStore.setState({ mpRole: null })
  })

  it('startGame resets run counters and allows the next run to record', () => {
    useGameStore.setState({ wave: 2, kills: 5, runHeadshots: 2 })
    useGameStore.getState().die()
    useGameStore.getState().startGame()
    const s = useGameStore.getState()
    expect(s.runRecorded).toBe(false)
    expect(s.runHeadshots).toBe(0)
    expect(s.lastRunUnlocks).toEqual([])
    expect(s.stats.runs).toBe(1) // lifetime stats survive startGame
  })

  it('startGame records an unfinished run (dropped co-op die event) but never a recorded one twice', () => {
    useGameStore.setState({ phase: 'intermission', wave: 4, kills: 20 })
    useGameStore.getState().startGame()
    expect(useGameStore.getState().stats).toMatchObject({ bestWave: 4, totalKills: 20, runs: 1 })
    // Normal path: die() records, then restarting from the death screen must not add again.
    useGameStore.setState({ phase: 'playing', wave: 2, kills: 5 })
    useGameStore.getState().die()
    useGameStore.getState().startGame()
    expect(useGameStore.getState().stats).toMatchObject({ bestWave: 4, totalKills: 25, runs: 2 })
  })

  it('counts headshot and knife kills over the run', () => {
    useGameStore.setState({
      phase: 'playing',
      zombies: [
        { id: 1, health: 1, type: 'walker' },
        { id: 2, health: 1, type: 'walker' },
        { id: 3, health: 1, type: 'walker' },
      ],
      pendingSpawns: [],
    })
    const { hitZombie } = useGameStore.getState()
    hitZombie(1, true, 'gun')
    hitZombie(2, false, 'knife')
    hitZombie(3, false, 'gun')
    const s = useGameStore.getState()
    expect(s.runHeadshots).toBe(1)
    expect(s.runKnifeKills).toBe(1)
  })
})

describe('setCosmetic', () => {
  beforeEach(() => reset())

  it('equips free items', () => {
    expect(useGameStore.getState().setCosmetic('crosshairColor', 'amber')).toBe(true)
    expect(useGameStore.getState().cosmetics.crosshairColor).toBe('amber')
    expect(persistProfile).toHaveBeenCalledTimes(1)
  })

  it('refuses locked supporter and milestone items', () => {
    const { setCosmetic } = useGameStore.getState()
    expect(setCosmetic('skin', 'gold')).toBe(false)
    expect(setCosmetic('skin', 'blood_rust')).toBe(false)
    expect(setCosmetic('knifeSkin', 'ember')).toBe(false)
    expect(setCosmetic('crosshair', 'dot')).toBe(false)
    expect(useGameStore.getState().cosmetics).toEqual(DEFAULT_COSMETICS)
    expect(persistProfile).not.toHaveBeenCalled()
  })

  it('refuses unknown kinds and ids', () => {
    const { setCosmetic } = useGameStore.getState()
    expect(setCosmetic('hat', 'default')).toBe(false)
    expect(setCosmetic('skin', 'nope')).toBe(false)
    expect(setCosmetic('skin', 'supporter_star')).toBe(false) // badge is not a skin
    expect(useGameStore.getState().cosmetics).toEqual(DEFAULT_COSMETICS)
  })

  it('milestone items unlock from stats', () => {
    useGameStore.setState({ stats: { ...DEFAULT_STATS, bestWave: 10 } })
    expect(useGameStore.getState().setCosmetic('skin', 'blood_rust')).toBe(true)
    expect(useGameStore.getState().cosmetics.skin).toBe('blood_rust')
  })

  it('the supporter entitlement unlocks all supporter items', () => {
    useGameStore.getState().setEntitlements(['supporter_pack'])
    const { setCosmetic } = useGameStore.getState()
    expect(setCosmetic('skin', 'gold')).toBe(true)
    expect(setCosmetic('skin', 'obsidian')).toBe(true)
    expect(setCosmetic('knifeSkin', 'ember')).toBe(true)
    expect(setCosmetic('crosshair', 'circle')).toBe(true)
    expect(setCosmetic('crosshairColor', 'cyan')).toBe(true)
    expect(useGameStore.getState().cosmetics).toEqual({
      skin: 'obsidian', crosshair: 'circle', crosshairColor: 'cyan', knifeSkin: 'ember',
    })
  })

  it('revalidateCosmetics drops items that are no longer unlocked (e.g. after sign-out)', () => {
    useGameStore.getState().setEntitlements(['supporter_pack'])
    useGameStore.getState().setCosmetic('skin', 'gold')
    useGameStore.getState().setCosmetic('crosshairColor', 'amber')
    useGameStore.getState().setEntitlements([])
    useGameStore.getState().revalidateCosmetics()
    expect(useGameStore.getState().cosmetics).toMatchObject({ skin: 'default', crosshairColor: 'amber' })
  })
})

describe('setters sanitize', () => {
  it('setEntitlements / setStats / setCosmetics reject junk', () => {
    const s = useGameStore.getState()
    s.setEntitlements('nope')
    expect(useGameStore.getState().entitlements).toEqual([])
    s.setStats({ bestWave: 'x', totalKills: 3 })
    expect(useGameStore.getState().stats).toEqual({ ...DEFAULT_STATS, totalKills: 3 })
    s.setCosmetics({ skin: 'bogus', crosshair: 'dot' })
    expect(useGameStore.getState().cosmetics).toEqual({ ...DEFAULT_COSMETICS, crosshair: 'dot' })
  })
})
