import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore } from '../store'
import { MAX_CORPSES } from '../fxConfig'

const mk = (id, over = {}) => ({ id, x: 0, z: 0, health: 0, maxHealth: 2, type: 'walker', dying: true, ...over })

describe('zombie corpses', () => {
  beforeEach(() => {
    useGameStore.getState().startGame()
    useGameStore.setState({ phase: 'playing' })
  })

  it('keeps a finished death as a corpse, excluded from the active count', () => {
    useGameStore.setState({ zombies: [mk(1), mk(2, { dying: false, health: 2 })] })
    useGameStore.getState().removeDyingZombie(1)
    const zs = useGameStore.getState().zombies
    expect(zs.find((z) => z.id === 1).corpse).toBe(true)
    expect(zs.filter((z) => !z.dying)).toHaveLength(1)
    expect(useGameStore.getState().phase).toBe('playing')
  })

  it('caps corpses and drops the oldest first', () => {
    const total = MAX_CORPSES + 3
    useGameStore.setState({ zombies: Array.from({ length: total }, (_, i) => mk(i)) })
    for (let i = 0; i < total; i++) useGameStore.getState().removeDyingZombie(i)
    const corpses = useGameStore.getState().zombies.filter((z) => z.corpse)
    expect(corpses).toHaveLength(MAX_CORPSES)
    expect(corpses.map((z) => z.id)).not.toContain(0)
    expect(corpses.map((z) => z.id)).toContain(total - 1)
  })

  it('still ends the wave when the last zombie finishes dying', () => {
    useGameStore.setState({ zombies: [mk(1)], pendingSpawns: [] })
    useGameStore.getState().removeDyingZombie(1)
    expect(useGameStore.getState().phase).toBe('wave_clear')
  })

  it('clears corpses when the next wave starts', () => {
    useGameStore.setState({ zombies: [mk(1)] })
    useGameStore.getState().removeDyingZombie(1)
    useGameStore.getState().nextWave()
    expect(useGameStore.getState().zombies).toEqual([])
  })
})
