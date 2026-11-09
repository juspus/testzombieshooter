import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../sounds', () => ({ setAudioHold: vi.fn() }))
vi.mock('../net', () => ({ send: vi.fn() }))

import { useGameStore } from '../store'
import { send } from '../net'
import { pauseGame, resumeGame, usePauseUi, RESUME_SECONDS, onMouseLost, onEscapeKey, requestResume, openSettings, installLifecycle } from '../pause'

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

// Desktop: the mouse leaving pointer lock mid-run opens the menu (pause.js onMouseLost).
describe('desktop menu on mouse lost', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    send.mockClear()
    useGameStore.setState({ phase: 'playing', paused: false, shopOpen: false, mpRole: null, mpConnected: false, runMode: 'normal' })
    usePauseUi.setState({ menu: null, count: 0, glLost: false, partnerAway: false })
  })
  afterEach(() => vi.useRealTimers())

  it('solo: pauses and opens the menu', () => {
    expect(onMouseLost()).toBe(true)
    expect(useGameStore.getState().paused).toBe(true)
    expect(usePauseUi.getState().menu).toBe('pause')
  })

  it('ignores unlocks the game asked for (shop, frozen world, menu already up, not in a run)', () => {
    useGameStore.setState({ shopOpen: true })
    expect(onMouseLost()).toBe(false)
    useGameStore.setState({ shopOpen: false, paused: true })
    expect(onMouseLost()).toBe(false)
    useGameStore.setState({ paused: false })
    usePauseUi.setState({ menu: 'settings' })
    expect(onMouseLost()).toBe(false)
    usePauseUi.setState({ menu: null })
    useGameStore.setState({ phase: 'wave_clear' })
    expect(onMouseLost()).toBe(false)
    expect(usePauseUi.getState().menu).toBe(null)
  })

  it('Esc during the 3-2-1 goes back to the menu, still frozen', () => {
    pauseGame()
    resumeGame()
    expect(usePauseUi.getState().menu).toBe('countdown')
    expect(onMouseLost()).toBe(true)
    expect(usePauseUi.getState().menu).toBe('pause')
    vi.advanceTimersByTime(5000)
    expect(useGameStore.getState().paused).toBe(true)
  })

  it('co-op (host or guest): menu without freezing, partner told AWAY, BACK on close', () => {
    const stop = installLifecycle()
    for (const role of ['host', 'guest']) {
      send.mockClear()
      useGameStore.setState({ mpRole: role, mpConnected: true, paused: false })
      usePauseUi.setState({ menu: null })
      expect(onMouseLost()).toBe(true)
      expect(useGameStore.getState().paused).toBe(false)
      expect(usePauseUi.getState().menu).toBe('pause')
      expect(send).toHaveBeenCalledWith('game_event', { event: 'away', data: { away: true } })
      expect(send).not.toHaveBeenCalledWith('game_event', { event: 'pause', data: {} })
      requestResume()   // jsdom: no pointer lock target -> resumes at once
      expect(usePauseUi.getState().menu).toBe(null)
      expect(send).toHaveBeenLastCalledWith('game_event', { event: 'away', data: { away: false } })
    }
    stop()
  })

  it('versus: menu without freezing', () => {
    useGameStore.setState({ runMode: 'versus', versus: { ...useGameStore.getState().versus, linked: true } })
    expect(onMouseLost()).toBe(true)
    expect(useGameStore.getState().paused).toBe(false)
    expect(usePauseUi.getState().menu).toBe('pause')
  })

  it('the Esc press that opened the menu does not close it; a later one resumes', () => {
    vi.setSystemTime(0)
    onMouseLost()
    onEscapeKey()
    expect(usePauseUi.getState().menu).toBe('pause')
    vi.advanceTimersByTime(500)
    onEscapeKey()
    expect(usePauseUi.getState().menu).toBe('countdown')
  })

  it('Esc in settings goes back to the menu', () => {
    onMouseLost()
    openSettings('pause')
    vi.advanceTimersByTime(500)
    onEscapeKey()
    expect(usePauseUi.getState().menu).toBe('pause')
  })
})

describe('desktop Esc key', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGameStore.setState({ phase: 'playing', paused: false, shopOpen: false, mpRole: null, mpConnected: false, runMode: 'normal' })
    usePauseUi.setState({ menu: null, count: 0, glLost: false })
  })
  afterEach(() => vi.useRealTimers())

  it('opens the menu mid-run even before the mouse was captured, never outside a run', () => {
    onEscapeKey()
    expect(usePauseUi.getState().menu).toBe('pause')
    usePauseUi.setState({ menu: null })
    useGameStore.setState({ phase: 'start', paused: false })
    onEscapeKey()
    expect(usePauseUi.getState().menu).toBe(null)
  })
})
