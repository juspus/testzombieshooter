import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../sounds', () => ({ setAudioHold: vi.fn() }))
vi.mock('../net', () => ({ send: vi.fn() }))

import { useGameStore } from '../store'
import { send } from '../net'
import { pauseGame, resumeGame, usePauseUi, RESUME_SECONDS } from '../pause'

describe('pause / resume', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    send.mockClear()
    useGameStore.setState({ phase: 'playing', paused: false, mpRole: null, mpConnected: false })
    usePauseUi.setState({ menu: null, count: 0 })
  })
  afterEach(() => vi.useRealTimers())

  it('pauses only during playing/intermission', () => {
    useGameStore.setState({ phase: 'start' })
    expect(pauseGame()).toBe(false)
    useGameStore.setState({ phase: 'intermission' })
    expect(pauseGame()).toBe(true)
    expect(useGameStore.getState().paused).toBe(true)
  })

  it('resumes after a 3-2-1 countdown', () => {
    pauseGame()
    resumeGame()
    expect(usePauseUi.getState().menu).toBe('countdown')
    vi.advanceTimersByTime(1000 * (RESUME_SECONDS - 1) + 10)
    expect(useGameStore.getState().paused).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(useGameStore.getState().paused).toBe(false)
    expect(usePauseUi.getState().menu).toBe(null)
  })

  it('a co-op guest cannot pause the host world', () => {
    useGameStore.setState({ mpRole: 'guest', mpConnected: true })
    expect(pauseGame()).toBe(false)
    expect(useGameStore.getState().paused).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('a co-op host pause is broadcast', () => {
    useGameStore.setState({ mpRole: 'host', mpConnected: true })
    pauseGame()
    expect(send).toHaveBeenCalledWith('game_event', { event: 'pause', data: {} })
  })
})
