// @vitest-environment node
// A new run starts from an empty zombie system. Seeded runs (Daily, versus, duel) spawn the same zombie
// types at the same spots with ids from 0, so ensure() alone would hand the new run's zombie #0 the previous
// run's sim zombie, corpse and all. src/zombieLive.js resets the live system on the store's run_start event.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))
vi.mock('../sounds')
vi.mock('../components/RemotePlayer', () => ({ getRemotePlayerPos: () => null }))

import { useGameStore } from '../store'
import { zombieSystem } from '../zombieLive'
import { makeSim, DT } from './zombieAI.helper'

const store = useGameStore

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function startWave(seed) {
  store.getState().startSeededGame('duel', seed)
  store.getState().skipIntermission()
  store.getState().tick(0.1)
  zombieSystem.tick(DT)
}

describe('a new run does not revive the last run\'s corpses', () => {
  it('without a reset, ensure() hands a same-id, same-spot zombie the old corpse (why the reset exists)', () => {
    const { sys } = makeSim()
    const old = sys.ensure(0, 'walker', 12, 3)
    old.dying = true
    old.corpse = true
    const next = sys.ensure(0, 'walker', 12, 3)
    expect(next).toBe(old)
    expect(next.corpse).toBe(true)
    sys.reset()
    const fresh = sys.ensure(0, 'walker', 12, 3)
    expect(fresh).not.toBe(old)
    expect(fresh.corpse).toBeFalsy()
    expect(fresh.dying).toBeFalsy()
  })

  it('startSeededGame twice with the same seed resets the live system: zombie #0 is a new, living zombie', () => {
    startWave('restart-seed')
    expect(zombieSystem.list.length).toBeGreaterThan(0)
    const first = store.getState().zombies[0]
    const old = zombieSystem.get(first.id)
    expect(old).toBeTruthy()
    old.dying = true
    old.corpse = true   // it was killed and settled

    // Same seed: the same wave spawns the same types at the same spots under the same ids
    store.getState().startSeededGame('duel', 'restart-seed')
    expect(zombieSystem.list).toHaveLength(0)   // run_start reset the system
    store.getState().skipIntermission()
    store.getState().tick(0.1)
    zombieSystem.tick(DT)
    const again = store.getState().zombies.find((z) => z.id === first.id)
    expect(again).toBeTruthy()
    expect({ x: again.x, z: again.z, type: again.type }).toEqual({ x: first.x, z: first.z, type: first.type })   // the premise
    const fresh = zombieSystem.get(first.id)
    expect(fresh).not.toBe(old)
    expect(fresh.corpse).toBeFalsy()
    expect(fresh.dying).toBeFalsy()
  })

  it('the run-start reset leaves a running wave alone', () => {
    startWave('keep-going')
    const before = zombieSystem.list.slice()
    for (let i = 0; i < 5; i++) { store.getState().tick(DT); zombieSystem.tick(DT) }
    expect(zombieSystem.list).toHaveLength(before.length)
    for (const zs of before) expect(zombieSystem.get(zs.id)).toBe(zs)
  })
})
