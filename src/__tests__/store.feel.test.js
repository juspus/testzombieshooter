import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore } from '../store'
import { time } from '../timeScale'

const oneZombie = () => ({ id: 1, x: 0, z: 0, health: 1, maxHealth: 1, type: 'runner' })

describe('hit markers', () => {
  beforeEach(() => { useGameStore.getState().startGame() })

  it('bumps the trigger and records the kind', () => {
    const before = useGameStore.getState().hitMarkerId
    useGameStore.getState().registerHit('headkill')
    const s = useGameStore.getState()
    expect(s.hitMarkerId).toBe(before + 1)
    expect(s.hitMarkerKind).toBe('headkill')
  })

  it('throttles burn markers but never kills', () => {
    const nowSpy = vi.spyOn(performance, 'now')
    nowSpy.mockReturnValue(10_000)
    const id0 = useGameStore.getState().hitMarkerId
    useGameStore.getState().registerHit('burn')
    nowSpy.mockReturnValue(10_100)
    useGameStore.getState().registerHit('burn')
    expect(useGameStore.getState().hitMarkerId).toBe(id0 + 1)
    useGameStore.getState().registerHit('kill')
    expect(useGameStore.getState().hitMarkerId).toBe(id0 + 2)
    nowSpy.mockRestore()
  })
})

describe('damage direction', () => {
  it('stores the attacker position on hitPlayer', () => {
    useGameStore.getState().startGame()
    useGameStore.setState({ phase: 'playing' })
    useGameStore.getState().hitPlayer(1, 3, -4)
    const s = useGameStore.getState()
    expect([s.lastHitX, s.lastHitZ]).toEqual([3, -4])
  })
})

describe('last kill slow-mo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGameStore.getState().startGame()
    useGameStore.setState({ phase: 'playing', zombies: [oneZombie()], pendingSpawns: [] })
  })
  afterEach(() => { vi.useRealTimers() })

  it('slows time and holds wave_clear for a fixed delay', () => {
    expect(useGameStore.getState().hitZombie(1, true)).toBe(true)
    let s = useGameStore.getState()
    expect(s.phase).toBe('playing')
    expect(s.lastKillPending).toBe(true)
    expect(time.scale).toBeLessThan(0.5)

    vi.advanceTimersByTime(1200)
    s = useGameStore.getState()
    expect(s.phase).toBe('wave_clear')
    expect(s.lastWaveBonuses).toBeTruthy()
    expect(time.scale).toBe(1)
  })

  it('removing the dying zombie during the delay does not end the wave early', () => {
    useGameStore.getState().hitZombie(1, true)
    useGameStore.getState().removeDyingZombie(1)
    expect(useGameStore.getState().phase).toBe('playing')
    vi.advanceTimersByTime(1200)
    expect(useGameStore.getState().phase).toBe('wave_clear')
  })

  it('dying in the delay window cancels the transition and restores time', () => {
    useGameStore.getState().hitZombie(1, true)
    useGameStore.getState().die()
    vi.advanceTimersByTime(1200)
    expect(useGameStore.getState().phase).toBe('dead')
    expect(time.scale).toBe(1)
  })

  it('guest never gates wave_clear itself but can play the fx', () => {
    useGameStore.setState({ mpRole: 'guest' })
    useGameStore.getState().hitZombie(1, true)
    expect(useGameStore.getState().lastKillPending).toBe(false)
    const id = useGameStore.getState().lastKillId
    useGameStore.getState().startLastKillFx()
    expect(useGameStore.getState().lastKillId).toBe(id + 1)
    expect(time.scale).toBeLessThan(0.5)
    useGameStore.getState().endLastKillFx()
    expect(time.scale).toBe(1)
    useGameStore.setState({ mpRole: null })
  })
})

describe('kill money', () => {
  const walker = (id) => ({ id, x: 0, z: 0, health: 1, maxHealth: 1, type: 'walker' })
  beforeEach(() => {
    vi.useFakeTimers()
    useGameStore.getState().startGame()
    useGameStore.setState({ phase: 'playing', wave: 1, money: 0, waveElapsed: 999, waveStartPlanks: 0,
      zombies: [walker(1), walker(2), walker(3)], pendingSpawns: [] })
  })
  afterEach(() => { vi.useRealTimers() })

  it('pays on each kill (headshot / knife bonus included) and not again at wave end', () => {
    const S = useGameStore.getState
    S().hitZombie(1, false)
    expect(S().money).toBeCloseTo(1)
    S().hitZombie(2, true)
    expect(S().money).toBeCloseTo(2.5)
    S().hitZombie(3, true, 'knife')
    expect(S().money).toBeCloseTo(5.5)
    vi.advanceTimersByTime(1200)
    expect(S().phase).toBe('wave_clear')
    expect(S().lastWaveBonuses.total).toBe(0)   // no planks / fast clear / modifier
    S().nextWave()
    expect(S().money).toBeCloseTo(5.5 + S().lastWaveBonuses.base)
  })
})
