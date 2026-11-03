import { describe, it, expect } from 'vitest'
import { turnIndex, turnAt, validTurn, roundWinner, resultFor, score, resolveCluster, activeIndices, cleanTurn, buildDirectorState, firstWave, lastWave } from '../directorFlow'

describe('directorFlow', () => {
  it('turn index and its inverse', () => {
    expect(turnIndex(1, 'host')).toBe(0)
    expect(turnIndex(1, 'guest')).toBe(1)
    expect(turnIndex(2, 'guest')).toBe(2)
    expect(turnIndex(2, 'host')).toBe(3)
    for (let i = 0; i < 6; i++) { const t = turnAt(i); expect(turnIndex(t.round, t.defender)).toBe(i) }
    expect(turnAt(2)).toEqual({ round: 2, defender: 'guest' })
  })
  it('validates turns and waves', () => {
    expect(validTurn(1, 'host')).toBe(true)
    expect(validTurn(4, 'host')).toBe(false)
    expect(validTurn(1, 'x')).toBe(false)
    expect([firstWave(2), lastWave(2)]).toEqual([4, 6])
  })
  it('cleans wire turn results', () => {
    expect(cleanTurn({ wavesCleared: 9, damageTaken: -3, died: 1 })).toEqual({ wavesCleared: 3, damageTaken: 0, died: true })
    expect(cleanTurn(null)).toBe(null)
  })
  it('round winner needs both turns; fewer damage breaks a tie', () => {
    const a = { wavesCleared: 2, damageTaken: 10, died: false }
    expect(roundWinner({ 1: { host: a, guest: null } }, 1)).toBe(null)
    expect(roundWinner({ 1: { host: a, guest: { ...a, damageTaken: 5 } } }, 1)).toBe('guest')
    expect(roundWinner({ 1: { host: a, guest: a } }, 1)).toBe('tie')
  })
  it('result and score from a side', () => {
    expect(resultFor(['host', 'host'], 'host')).toBe('win')
    expect(resultFor(['host', 'host'], 'guest')).toBe('lose')
    expect(resultFor(['host', 'guest', 'tie'], 'guest')).toBe('draw')
    expect(resultFor(['host'], 'host')).toBe(null)
    expect(score(['host', 'tie', 'guest', 'host'])).toEqual({ host: 2, guest: 1 })
  })
  it('resolves a cluster to itself or the nearest active one', () => {
    const all = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }]
    const active = [all[0], all[2]]
    expect(resolveCluster(2, all, active)).toBe(1)
    expect(resolveCluster(1, all, [all[0], all[2]])).toBe(0)   // 10 is equidistant: first wins
    expect(resolveCluster(5, all, active)).toBe(-1)
    expect(resolveCluster(1.5, all, active)).toBe(-1)
    expect(activeIndices(all, active)).toEqual([0, 2])
  })
  it('builds a dir_state with the contract fields', () => {
    const st = {
      versus: { seed: 's' }, wave: 2, phase: 'playing', hp: 80, maxHp: 100, windowPlanks: { 1: 2 },
      zombies: [{ id: 1, x: 1.234, z: 2, type: 'brute', health: 3, maxHealth: 6 }, { id: 2, x: 0, z: 0, type: 'walker', dying: true }],
      director: { round: 1, budget: 5, windowLeft: 12.34, nextMod: 'fog', turnCleared: 1, turnDamage: 7.4 },
    }
    const s = buildDirectorState(st, { 1: { x: 3.04, z: 4 } }, { x: 1, z: 2, yaw: 0.5 }, [0, 2])
    expect(s).toMatchObject({ seed: 's', round: 1, wave: 2, phase: 'playing', budgetLeft: 5, spawnLeft: 12.3, hp: 80, maxHp: 100, planks: { 1: 2 }, nextMod: 'fog', clusters: [0, 2], cleared: 1, damage: 7 })
    expect(s.zombies).toEqual([[3, 4, 4, 0.5]])
    expect(s.player).toEqual({ x: 1, z: 2, yaw: 0.5 })
  })
})
