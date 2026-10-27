import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore, spawnZombies, getZombieArchetype } from '../store'
import {
  rollModifier, MOD_MIN_WAVE, MOD_CHANCE, MOD_BONUS, MODIFIER_IDS,
  modifiedZombieCount, modifiedZombieHealth, modifierBonus, isMilestoneBossWave,
} from '../modifiers'

describe('rollModifier', () => {
  it('never rolls before wave 4', () => {
    for (let w = 1; w < MOD_MIN_WAVE; w++) expect(rollModifier(w, null, () => 0)).toBeNull()
  })
  it('never rolls right after a modifier wave', () => {
    expect(rollModifier(6, 'fog', () => 0)).toBeNull()
  })
  it('never rolls on milestone boss waves', () => {
    expect(isMilestoneBossWave(10)).toBe(true)
    expect(rollModifier(10, null, () => 0)).toBeNull()
    expect(rollModifier(20, null, () => 0)).toBeNull()
    expect(rollModifier(11, null, () => 0)).not.toBeNull()
  })
  it('rolls with ~MOD_CHANCE and picks every modifier', () => {
    expect(rollModifier(5, null, () => MOD_CHANCE + 0.01)).toBeNull()
    const seen = new Set(MODIFIER_IDS.map((_, i) => {
      const seq = [0, i / MODIFIER_IDS.length + 0.001]
      return rollModifier(5, null, () => seq.shift())
    }))
    expect([...seen].sort()).toEqual([...MODIFIER_IDS].sort())
  })
  it('over many rolls never produces back-to-back modifier waves', () => {
    let prev = null
    let hits = 0
    for (let w = 2; w < 4000; w++) {
      const m = rollModifier(w, prev)
      if (m) { expect(prev).toBeNull(); hits++ }
      prev = m
    }
    expect(hits).toBeGreaterThan(0)
  })
})

describe('horde math + bonus', () => {
  it('doubles count, halves HP rounding up', () => {
    expect(modifiedZombieCount(8, 'horde')).toBe(16)
    expect(modifiedZombieCount(8, 'fog')).toBe(8)
    expect(modifiedZombieHealth(1, 'horde')).toBe(1)
    expect(modifiedZombieHealth(5, 'horde')).toBe(3)
    expect(modifiedZombieHealth(16, 'horde')).toBe(8)
    expect(modifiedZombieHealth(5, 'blackout')).toBe(5)
  })
  it('spawnZombies applies horde to count and health', () => {
    const base = spawnZombies(5, 0, undefined, null)
    const horde = spawnZombies(5, 0, undefined, 'horde')
    expect(horde.length).toBe(base.length * 2)
    for (const z of horde) expect(z.health).toBe(Math.ceil(getZombieArchetype(z.type).health / 2))
  })
  it('modifier waves pay the bonus', () => {
    expect(modifierBonus('fog')).toBe(MOD_BONUS)
    expect(modifierBonus(null)).toBe(0)
  })
})

describe('store wiring', () => {
  beforeEach(() => { useGameStore.getState().startGame() })

  it('starts with no modifier and rolls on nextWave (solo)', () => {
    expect(useGameStore.getState().waveModifier).toBeNull()
    vi.spyOn(Math, 'random').mockReturnValue(0)   // always roll, first modifier
    useGameStore.setState({ wave: 4 })
    useGameStore.getState().nextWave()
    expect(useGameStore.getState().wave).toBe(5)
    expect(useGameStore.getState().waveModifier).toBe(MODIFIER_IDS[0])
    // ...but never twice in a row
    useGameStore.getState().nextWave()
    expect(useGameStore.getState().waveModifier).toBeNull()
    vi.restoreAllMocks()
  })

  it('guest takes the host roll and never rolls itself', () => {
    useGameStore.setState({ mpRole: 'guest', wave: 5 })
    useGameStore.getState().nextWave('horde')
    expect(useGameStore.getState().waveModifier).toBe('horde')
    useGameStore.getState().nextWave()
    expect(useGameStore.getState().waveModifier).toBeNull()
    useGameStore.setState({ mpRole: null })
  })

  it('horde wave spawns double zombies at half HP and the HUD total follows', () => {
    useGameStore.setState({ wave: 5, waveModifier: 'horde', intermissionLeft: 0.01 })
    expect(useGameStore.getState().getZombiesForWave()).toBe(34)
    useGameStore.getState().tick(1)
    const st = useGameStore.getState()
    expect(st.zombies.length + st.pendingSpawns.length).toBe(34)
  })

  it('modifier bonus lands in the wave-clear summary and total', () => {
    useGameStore.setState({ phase: 'playing', wave: 5, waveModifier: 'bloodlust', pendingSpawns: [],
      zombies: [{ id: 1, x: 0, z: 0, health: 0, maxHealth: 2, type: 'walker', dying: true }] })
    useGameStore.getState().removeDyingZombie(1)
    const b = useGameStore.getState().lastWaveBonuses
    expect(b.modifierBonus).toBe(MOD_BONUS)
    expect(b.total).toBeGreaterThanOrEqual(MOD_BONUS)
  })
})
