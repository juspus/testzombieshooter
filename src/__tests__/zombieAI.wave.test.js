// @vitest-environment node
// A whole wave, headless (no React, no three.js, no browser): spawn, walk to the planks, claw them,
// break in, reach the player, attack, die. The balance sim (t-sim) builds on exactly this loop.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))
// the store plays glass / plank sounds; there is no AudioContext in Node
vi.mock('../sounds')

import { useGameStore } from '../store'
import { makeSim, step, live, insideCabin, DT } from './zombieAI.helper'

const store = useGameStore

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('zombie AI: a whole wave, headless', () => {
  it('spawns, walks to the planks, claws, breaks in, reaches the player, attacks and dies', () => {
    store.getState().startSeededGame('duel', 'wave-one')
    store.setState({ money: 1000, hp: 1000, maxHp: 1000 })
    // Board the two windows of the main room (where the player stands)
    expect(store.getState().addPlank(3)).toBe(true)
    expect(store.getState().addPlank(4)).toBe(true)
    const { sys, log } = makeSim({ playerAt: { x: 3.5, z: 0 } })

    // Spawn: the store's wave start fills `zombies`, the system mirrors it
    store.getState().skipIntermission()
    store.getState().tick(0.1)
    expect(store.getState().phase).toBe('playing')
    sys.tick(DT)
    const total = store.getState().zombies.length
    expect(total).toBe(5)
    expect(sys.list).toHaveLength(total)
    for (const zs of sys.list) { zs.aggressor = true }   // everyone goes for the planks (the roll is 38%)
    const start = sys.list.map((z) => ({ x: z.x, z: z.z }))
    for (const s of start) expect(Math.abs(s.x) > 9 || Math.abs(s.z) > 10).toBe(true)   // spawned outside

    const seen = { atWindow: false, clawing: false, planksLost: 0, inside: false, hpLost: false, attackPlayer: false }
    for (let i = 0; i < 90 * 30 && !(seen.inside && seen.hpLost); i++) {
      step(sys)
      const s = store.getState()
      for (const zs of sys.list) {
        if (zs.mode === 'attack_window') seen.atWindow = true
        if (zs.mode === 'attack_window' && zs.attacking) seen.clawing = true
        if (zs.mode === 'attack_player') seen.attackPlayer = true
        if (insideCabin(zs)) seen.inside = true
      }
      seen.planksLost = s.wavePlanksLost
      if (s.hp < 1000) seen.hpLost = true
    }
    expect(seen.atWindow).toBe(true)         // walked to a boarded window
    expect(seen.clawing).toBe(true)          // and clawed it
    expect(log.plankHit).toBeGreaterThan(0)  // (the claw sound)
    expect(seen.planksLost).toBeGreaterThan(0)   // a plank broke (host-side damage went through the store)
    expect(seen.inside).toBe(true)           // somebody got in
    expect(seen.attackPlayer).toBe(true)     // reached the player
    expect(seen.hpLost).toBe(true)           // and hit them through store.hitPlayer
    expect(log.footstep).toBeGreaterThan(0)

    // Die: shoot everything dead (headshots), the death sequence settles each into a corpse
    for (let guard = 0; guard < 400 && live(store).length > 0; guard++) {
      for (const z of live(store)) store.getState().hitZombie(z.id, true, 'gun', 'pistol', 3)
      step(sys)
    }
    expect(live(store)).toHaveLength(0)
    for (let i = 0; i < 4 * 30; i++) step(sys)
    const zs = store.getState().zombies
    expect(zs.length).toBeGreaterThan(0)
    expect(zs.every((z) => z.corpse && z.dying)).toBe(true)        // corpses stay in the store, always dying
    expect(sys.list.every((z) => z.corpse)).toBe(true)
    expect(store.getState().kills).toBe(total)
    vi.advanceTimersByTime(1500)                                   // the last-kill slow-mo window
    expect(store.getState().phase).toBe('wave_clear')
  })

  it('a settled corpse does no more work and is not reported as a position', () => {
    store.getState().startSeededGame('duel', 'corpse')
    store.setState({ hp: 1000, maxHp: 1000 })
    const { sys } = makeSim()
    store.getState().skipIntermission()
    store.getState().tick(0.1)
    sys.tick(DT)
    const id = store.getState().zombies[0].id
    expect(Object.keys(sys.positions())).toContain(String(id))
    store.getState().hitZombie(id, true, 'gun', 'pistol', 3)
    for (let i = 0; i < 3 * 30; i++) step(sys)
    const zs = sys.get(id)
    expect(zs.corpse).toBe(true)
    expect(Object.keys(sys.positions())).not.toContain(String(id))
    const { x, z } = zs
    for (let i = 0; i < 30; i++) step(sys)
    expect([zs.x, zs.z]).toEqual([x, z])
  })

  it('the pause flag freezes the world', () => {
    store.getState().startSeededGame('duel', 'pause')
    const { sys } = makeSim()
    store.getState().skipIntermission()
    store.getState().tick(0.1)
    sys.tick(DT)
    for (let i = 0; i < 30; i++) step(sys)
    const before = sys.list.map((z) => [z.x, z.z])
    store.setState({ paused: true })
    for (let i = 0; i < 30; i++) sys.tick(DT)
    expect(sys.list.map((z) => [z.x, z.z])).toEqual(before)
    store.setState({ paused: false })
    for (let i = 0; i < 30; i++) step(sys)
    expect(sys.list.map((z) => [z.x, z.z])).not.toEqual(before)
  })
})
