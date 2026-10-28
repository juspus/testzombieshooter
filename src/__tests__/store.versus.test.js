import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore } from '../store'

const st = () => useGameStore.getState()

describe('versus slice', () => {
  afterEach(() => { st().startGame() })

  it('starts clean', () => {
    expect(st().versus).toEqual({ active: false, mode: null, seed: null, linked: false, opponent: null, result: null, reason: null })
  })

  it('startVersusRun sets the slice, detaches from co-op and seeds the run', () => {
    useGameStore.setState({ mpRole: 'host', mpConnected: true })
    st().startVersusRun('mail', 'seed1234')
    const s = st()
    expect(s.versus).toMatchObject({ active: true, mode: 'mail', seed: 'seed1234', linked: true, result: null })
    expect(s.mpRole).toBe(null)
    expect(s.mpConnected).toBe(false)
    expect(s.runMode).toBe('versus')
    expect(s.runSeed).toBe('seed1234')
    expect(s.phase).not.toBe('start')
  })

  it('records the opponent and only the first result', () => {
    st().startVersusRun('mail', 's')
    st().setVersusOpponent({ hp: 5, maxHp: 10, wave: 2, kills: 3, alive: true, at: 1 })
    expect(st().versus.opponent.wave).toBe(2)
    expect(st().finishVersus('win', 'forfeit')).toBe(true)
    expect(st().finishVersus('lose', 'death')).toBe(false)
    expect(st().versus).toMatchObject({ result: 'win', reason: 'forfeit', linked: false, active: true })
  })

  it('a rematch start resets the result', () => {
    st().startVersusRun('mail', 'a')
    st().finishVersus('lose', 'death')
    st().startVersusRun('mail', 'b')
    expect(st().versus).toMatchObject({ seed: 'b', result: null, opponent: null, linked: true })
  })

  it('a normal start clears the slice', () => {
    st().startVersusRun('mail', 'a')
    st().startGame()
    expect(st().versus.active).toBe(false)
    expect(st().versus.seed).toBe(null)
    expect(st().runMode).toBe('normal')
  })

  it('a duel start clears the versus slice too', () => {
    st().startVersusRun('mail', 'a')
    st().startSeededGame('duel', 'd')
    expect(st().versus.active).toBe(false)
  })
})
