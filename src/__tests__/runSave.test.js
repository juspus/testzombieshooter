import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore } from '../store'
import { run as trackerRun, initProgression, __resetProgressionForTests } from '../progressTracker'
import {
  initRunSave, __resetRunSaveForTests, readSave, clearSave, continuableSave, resumeKind,
  retryAvailable, retryFromCheckpoint, continueSavedRun, isSavableRun, validateSave, takeSnapshot,
} from '../runSave'

const S = () => useGameStore.getState()

// Play the current wave to its clear and into the next intermission, earning `kills` kills.
function clearWave(kills = 3) {
  useGameStore.setState({ phase: 'playing' })
  useGameStore.setState({ kills: S().kills + kills, money: S().money + kills })
  useGameStore.setState({ phase: 'wave_clear' })
  S().nextWave()
}
function die() {
  useGameStore.setState({ phase: 'playing' })
  S().die()
}

describe('runSave', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetRunSaveForTests()
    __resetProgressionForTests()
    useGameStore.setState({ phase: 'start', mpRole: null, mpConnected: false })
    initProgression()
    initRunSave(useGameStore)
    S().startGame()
  })

  it('saves a checkpoint at every intermission of a solo normal run', () => {
    expect(readSave().wave).toBe(1)
    clearWave(4)
    S().buyPerk('fast_hands')   // bought during the intermission: not in this wave's checkpoint
    const save = readSave()
    expect(save.wave).toBe(2)
    expect(save.state.kills).toBe(4)
    expect(save.state.perks).toEqual({})
    expect(save.midWave).toBe(false)
  })

  it('flags a save left mid-wave and clears the flag on the wave clear', () => {
    clearWave()
    useGameStore.setState({ phase: 'playing' })
    expect(readSave().midWave).toBe(true)
    expect(resumeKind(readSave())).toBe('continued')
    useGameStore.setState({ phase: 'wave_clear' })
    expect(readSave().midWave).toBe(false)
  })

  it('never saves daily, versus or co-op runs', () => {
    expect(isSavableRun({ ...S(), runMode: 'daily' })).toBe(false)
    expect(isSavableRun({ ...S(), mpRole: 'host', mpConnected: true })).toBe(false)
    expect(isSavableRun({ ...S(), mpRole: 'guest', mpConnected: false })).toBe(false)
    expect(isSavableRun({ ...S(), mpRole: 'host', mpConnected: false })).toBe(true)   // room open, nobody joined yet
    expect(isSavableRun({ ...S(), runSeed: 'x' })).toBe(false)
    expect(isSavableRun(S())).toBe(true)
  })

  it('resumes a run after a reload with its loadout, doors, planks and XP counters', () => {
    clearWave(5)
    clearWave(5)
    useGameStore.setState({
      money: 300, ownedWeapons: ['pistol', 'ak47'], weapon: 'ak47', perks: { deep_pockets: true },
      windowPlanks: { 0: 2 }, helmet: 'bike_helmet', maxHp: 25, hp: 22,
    })
    // Re-take the checkpoint as if this were the intermission start.
    useGameStore.setState({ phase: 'playing' }); useGameStore.setState({ phase: 'intermission' })
    const killXp = trackerRun.killXp
    const wavesCleared = trackerRun.wavesCleared
    expect(wavesCleared).toBe(2)

    // "Reload": fresh session state, then Continue.
    __resetRunSaveForTests(); __resetProgressionForTests(); initProgression(); initRunSave(useGameStore)
    useGameStore.setState({ phase: 'start', money: 10, wave: 1, kills: 0, ownedWeapons: ['pistol'], weapon: 'pistol' })
    expect(continueSavedRun(useGameStore)).toBe(true)
    const s = S()
    expect(s.phase).toBe('intermission')
    expect(s.wave).toBe(3)
    expect(s.kills).toBe(10)
    expect(s.money).toBe(300)
    expect(s.weapon).toBe('ak47')
    expect(s.ownedWeapons).toEqual(['pistol', 'ak47'])
    expect(s.perks).toEqual({ deep_pockets: true })
    expect(s.windowPlanks).toEqual({ 0: 2 })
    expect(s.helmet).toBe('bike_helmet')
    expect(s.hp).toBe(22)
    expect(s.zombies).toEqual([])
    expect(s.runContinued).toBe(false)
    expect(trackerRun.wavesCleared).toBe(wavesCleared)
    expect(trackerRun.killXp).toBe(killXp)
    expect(trackerRun.wave).toBe(3)
  })

  it('a resume from a mid-wave save is continued (unranked)', () => {
    clearWave()
    useGameStore.setState({ phase: 'playing' })
    __resetRunSaveForTests(); initRunSave(useGameStore)
    useGameStore.setState({ phase: 'start' })
    continueSavedRun(useGameStore)
    expect(S().runContinued).toBe(true)
    expect(S().runRetryUsed).toBe(false)
  })

  it('offers one retry after a death, from the wave start, unranked', () => {
    clearWave(3)
    clearWave(3)   // wave 3 intermission: 6 kills
    const money = S().money
    useGameStore.setState({ kills: 11, money: 2 })
    die()
    expect(S().phase).toBe('dead')
    expect(retryAvailable(S())).toBe(true)
    expect(readSave().dead).toBe(true)

    expect(retryFromCheckpoint(useGameStore)).toBe(true)
    expect(S().phase).toBe('intermission')
    expect(S().wave).toBe(3)
    expect(S().kills).toBe(6)
    expect(S().money).toBe(money)
    expect(S().runContinued).toBe(true)
    expect(S().runRetryUsed).toBe(true)
    expect(trackerRun.killXp).toBe(0)   // the death already paid the XP up to it

    // The second death has no retry and drops the save.
    die()
    expect(retryAvailable(S())).toBe(false)
    expect(retryFromCheckpoint(useGameStore)).toBe(false)
    expect(readSave()).toBe(null)
  })

  it('counts lifetime stats once across a retry', () => {
    clearWave(4)   // checkpoint at wave 2 with 4 kills
    const before = S().stats
    useGameStore.setState({ kills: 7 })
    die()
    expect(S().stats.runs).toBe(before.runs + 1)
    expect(S().stats.totalKills).toBe(before.totalKills + 7)
    retryFromCheckpoint(useGameStore)
    useGameStore.setState({ kills: 9 })   // 5 new kills after the retry
    die()
    expect(S().stats.runs).toBe(before.runs + 1)
    expect(S().stats.totalKills).toBe(before.totalKills + 7 + 5)
  })

  it('a dead save survives a reload as the retry', () => {
    clearWave()
    die()
    __resetRunSaveForTests(); initRunSave(useGameStore)
    useGameStore.setState({ phase: 'start' })
    const save = continuableSave(readSave(), S().mapId)
    expect(resumeKind(save)).toBe('retry')
    continueSavedRun(useGameStore)
    expect(S().runRetryUsed).toBe(true)
    expect(S().wave).toBe(2)
  })

  it('a new run replaces the save and resets the flags', () => {
    clearWave()
    die()
    retryFromCheckpoint(useGameStore)
    S().startGame()
    expect(readSave().wave).toBe(1)
    expect(S().runContinued).toBe(false)
    expect(S().runRetryUsed).toBe(false)
    expect(S().statsBase).toBe(null)
  })

  it('ignores saves for another map, a bad version or junk', () => {
    const save = takeSnapshot(S())
    expect(continuableSave(save, 'other-map')).toBe(null)
    expect(validateSave({ ...save, v: 99 })).toBe(null)
    expect(validateSave(null)).toBe(null)
    const cleaned = validateSave({ ...save, state: { ...save.state, ownedWeapons: ['raygun'], weapon: 'raygun' } })
    expect(cleaned.state.ownedWeapons).toEqual(['pistol'])
    expect(cleaned.state.weapon).toBe('pistol')
    localStorage.setItem('cabin.runSave.v1', '{nope')
    expect(readSave()).toBe(null)
    clearSave()
  })
})
