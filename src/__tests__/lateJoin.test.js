import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore } from '../store'
import { canOpenRoom, welcomePatch, onJoinAnswer, usePublicRoom, joinMoney } from '../lateJoin'
import { welcomeSnapshot } from '../publicRoom'
import { cleanRuns, isRoomCode } from '../openRuns'
import { validateMessage } from '../netProtocol'

const S = () => useGameStore.getState()
const ge = (event, data) => ({ type: 'game_event', data: { event, data } })

describe('joinMoney', () => {
  it('starts at the run start money and grows with the wave', () => {
    expect(joinMoney(1)).toBe(10)
    expect(joinMoney(2)).toBe(10 + Math.round((5 + 15) * 0.75))
    expect(joinMoney(10)).toBeGreaterThan(joinMoney(5))
    expect(joinMoney(10)).toBeLessThan(300)
  })
})

describe('cleanRuns', () => {
  it('keeps valid rows for this map and protocol, once each', () => {
    const rows = [
      { code: 'ABCDE', map: 'cabin', proto: 1, wave: 4, updated_at: 't' },
      { code: 'ABCDE', map: 'cabin', proto: 1, wave: 4 },
      { code: 'abcde', map: 'cabin', proto: 1, wave: 2 },
      { code: 'QRSTU', map: 'diner', proto: 1, wave: 2 },
      { code: 'WXYZ2', map: 'cabin', proto: 2, wave: 2 },
      null,
    ]
    expect(cleanRuns(rows, 'cabin', 1)).toEqual([{ code: 'ABCDE', wave: 4, updatedAt: 't' }])
    expect(cleanRuns(null, 'cabin', 1)).toEqual([])
    expect(isRoomCode('AB1DE')).toBe(false)   // no 1 / I / O / 0 / L in room codes
  })
})

describe('late join', () => {
  beforeEach(() => {
    useGameStore.setState({ phase: 'start', mpRole: null, mpConnected: false })
    S().startGame()
  })

  it('only a solo normal run can be opened', () => {
    expect(canOpenRoom(S())).toBe(true)
    expect(canOpenRoom({ ...S(), mpRole: 'host' })).toBe(false)
    expect(canOpenRoom({ ...S(), runMode: 'daily' })).toBe(false)
    expect(canOpenRoom({ ...S(), phase: 'dead' })).toBe(false)
  })

  it('the welcome carries the house and passes the protocol check', () => {
    useGameStore.setState({ wave: 6, openDoors: { d1: true }, windowPlanks: { 2: 1 }, brokenWindows: { 3: true }, waveModifier: 'fog', intermissionLeft: 12.5 })
    const snap = welcomeSnapshot(S())
    expect(snap).toMatchObject({ wave: 6, modifier: 'fog', openDoors: { d1: true }, windowPlanks: { 2: 1 }, brokenWindows: { 3: true }, intermissionLeft: 12.5 })
    expect(snap.box.phase).toBe('idle')
    expect(validateMessage(ge('join_welcome', snap))).toBeNull()
    expect(validateMessage(ge('join_welcome', { ...snap, wave: 0 }))).not.toBeNull()
    expect(validateMessage(ge('join_wait', { wave: 7 }))).toBeNull()
    expect(validateMessage(ge('join_refuse', { reason: 'map' }))).toBeNull()
    expect(validateMessage(ge('join_refuse', {}))).not.toBeNull()
  })

  it('a guest lands in the host countdown with its own money and wave ammo', () => {
    useGameStore.setState({ wave: 6, openDoors: { d1: true }, windowPlanks: { 2: 2 }, intermissionLeft: 20 })
    const snap = welcomeSnapshot(S())
    // Guest side: a fresh client on the Start screen
    useGameStore.setState({ phase: 'start', mpRole: 'guest', mpConnected: true })
    S().startGame(); useGameStore.setState({ phase: 'start' })
    onJoinAnswer('join_welcome', snap)
    const s = S()
    expect(s.phase).toBe('intermission')
    expect(s.wave).toBe(6)
    expect(s.intermissionLeft).toBe(20)
    expect(s.openDoors).toEqual({ d1: true })
    expect(s.windowPlanks).toEqual({ 2: 2 })
    expect(s.money).toBe(joinMoney(6))
    expect(s.weapon).toBe('pistol')
    expect(s.bulletsInClip + s.reserveBullets).toBeGreaterThan(20)
  })

  it('welcomePatch keeps a non-pistol loadout ammo as is', () => {
    const p = welcomePatch({ wave: 3, intermissionLeft: 9, openDoors: {}, windowPlanks: {} }, { weapon: 'shotgun', nextId: 4 })
    expect(p.bulletsInClip).toBeUndefined()
    expect(p.nextId).toBe(4)
  })

  it('join_wait tells the guest which wave it joins at', () => {
    onJoinAnswer('join_wait', { wave: 9 })
    expect(usePublicRoom.getState()).toMatchObject({ join: 'waiting', joinWave: 9 })
  })
})
