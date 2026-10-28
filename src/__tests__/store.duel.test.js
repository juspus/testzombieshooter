import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore } from '../store'

const rival = { v: 1, seed: 'seed1234', map: 'cabin', name: 'R', waves: [3], final: { wave: 2, kills: 5 } }

describe('duel slice', () => {
  afterEach(() => { useGameStore.getState().startGame() })

  it('starts empty, with the rival when given', () => {
    useGameStore.getState().startSeededGame('duel', 'seed1234', { rival })
    const d = useGameStore.getState().duel
    expect(d.rival).toEqual(rival)
    expect(d.waveLog).toEqual([])
    useGameStore.getState().startSeededGame('duel', 'other')
    expect(useGameStore.getState().duel.rival).toBe(null)
  })

  it('logs cumulative kills at the end of each cleared wave and the final at death', () => {
    useGameStore.getState().startSeededGame('duel', 'seed1234')
    useGameStore.setState({ kills: 4 })
    useGameStore.getState().nextWave()
    useGameStore.setState({ kills: 11 })
    useGameStore.getState().nextWave()
    expect(useGameStore.getState().duel.waveLog).toEqual([4, 11])
    useGameStore.setState({ kills: 14, phase: 'playing' })
    useGameStore.getState().die()
    expect(useGameStore.getState().duel.final).toEqual({ wave: 3, kills: 14 })
  })

  it('does not record in other modes', () => {
    useGameStore.getState().startSeededGame('versus', 'x')
    useGameStore.setState({ kills: 4 })
    useGameStore.getState().nextWave()
    expect(useGameStore.getState().duel.waveLog).toEqual([])
  })

  it('a plain start clears the rival', () => {
    useGameStore.getState().startSeededGame('duel', 'seed1234', { rival })
    useGameStore.getState().startGame()
    expect(useGameStore.getState().duel.rival).toBe(null)
  })
})
