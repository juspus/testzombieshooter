import { describe, it, expect } from 'vitest'
import {
  DIRECTOR, DIR_UNITS, unitDef, modDef, unitsForWave, modsForWave, waveBudget, turnWaves, firstDefender,
  canBuy, autoFill, compareTurns, matchWinner, encodeZombies, decodeZombie, makeState, TYPE_CODES,
} from '../director'

describe('director rules', () => {
  it('budget is the solo wave size plus the bonus', () => {
    expect(waveBudget(1)).toBe(5 + DIRECTOR.BUDGET_BONUS)
    expect(waveBudget(4)).toBe(14 + DIRECTOR.BUDGET_BONUS)
  })

  it('rounds map to consecutive waves of each run', () => {
    expect(turnWaves(1)).toEqual([1, 2, 3])
    expect(turnWaves(3)).toEqual([7, 8, 9])
  })

  it('alternates who defends first', () => {
    expect([1, 2, 3].map(firstDefender)).toEqual(['host', 'guest', 'host'])
  })

  it('unlocks units and modifiers by wave', () => {
    expect(unitsForWave(1).map((u) => u.id)).toEqual(['walker', 'crawler'])
    expect(unitsForWave(9).length).toBe(DIR_UNITS.length)
    expect(modsForWave(1)).toEqual([])
    expect(modsForWave(3).map((m) => m.id)).toEqual(['fog', 'blackout'])
  })

  it('checks unlock wave and budget', () => {
    expect(canBuy(unitDef('brute'), 4, 4)).toBe(true)
    expect(canBuy(unitDef('brute'), 3, 10)).toBe(false)
    expect(canBuy(unitDef('brute'), 4, 3)).toBe(false)
    expect(canBuy(modDef('blackout'), 3, 5)).toBe(true)
    expect(canBuy(null, 9, 99)).toBe(false)
  })

  it('auto-fills leftover budget with walkers', () => {
    expect(autoFill(3)).toEqual(['walker', 'walker', 'walker'])
    expect(autoFill(0)).toEqual([])
    expect(autoFill(-2)).toEqual([])
  })

  it('compares turns by waves cleared, then damage taken', () => {
    expect(compareTurns({ wavesCleared: 3, damageTaken: 50 }, { wavesCleared: 2, damageTaken: 0 })).toBe('a')
    expect(compareTurns({ wavesCleared: 3, damageTaken: 20 }, { wavesCleared: 3, damageTaken: 10 })).toBe('b')
    expect(compareTurns({ wavesCleared: 3, damageTaken: 10 }, { wavesCleared: 3, damageTaken: 10 })).toBe('tie')
  })

  it('decides best of 3', () => {
    expect(matchWinner(['host'])).toBe(null)
    expect(matchWinner(['host', 'host'])).toBe('host')
    expect(matchWinner(['host', 'guest'])).toBe(null)
    expect(matchWinner(['host', 'guest', 'guest'])).toBe('guest')
    expect(matchWinner(['tie', 'tie', 'host'])).toBe('host')
    expect(matchWinner(['tie', 'tie', 'tie'])).toBe('draw')
  })

  it('encodes live zombies compactly and decodes them', () => {
    const zs = [
      { id: 1, x: 1.234, z: -2.06, type: 'brute', health: 3, maxHealth: 6 },
      { id: 2, x: 0, z: 0, type: 'walker', health: 2, maxHealth: 2, dying: true },
    ]
    const enc = encodeZombies(zs, { 1: { x: 3.333, z: 4.444 } })
    expect(enc).toEqual([[3.3, 4.4, TYPE_CODES.indexOf('brute'), 0.5]])
    expect(decodeZombie(enc[0])).toEqual({ x: 3.3, z: 4.4, type: 'brute', hp: 0.5 })
  })

  it('builds a state snapshot', () => {
    const s = makeState({ seed: 's', round: 1, wave: 2, phase: 'playing', budgetLeft: 4, spawnLeft: 12.34, hp: 15, maxHp: 20, player: { x: 1.26, z: 2, yaw: 0.31 }, zombies: [] })
    expect(s).toMatchObject({ seed: 's', spawnLeft: 12.3, player: { x: 1.3, z: 2, yaw: 0.3 }, planks: {}, nextMod: null })
  })
})
