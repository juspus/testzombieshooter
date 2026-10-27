import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import {
  GRENADE, blastFalloff, grenadeZombieDamage, grenadePlayerDamage, grenadePlankHits,
  restockGrenades, canBuyGrenade, fuseLeft, cookedOut, tickInterval, throwVelocity, stepBody,
} from '../grenades'
import { useGameStore, ZOMBIE_ARCHETYPES, _maxAmmoState } from '../store'
import { armorMultiplier } from '../zombieSpecials'

describe('blast falloff', () => {
  it('is full inside the inner radius, linear after, zero at the edge', () => {
    expect(blastFalloff(0)).toBe(1)
    expect(blastFalloff(GRENADE.INNER)).toBe(1)
    expect(blastFalloff(GRENADE.RADIUS)).toBe(0)
    expect(blastFalloff(GRENADE.RADIUS + 3)).toBe(0)
    const mid = (GRENADE.INNER + GRENADE.RADIUS) / 2
    expect(blastFalloff(mid)).toBeCloseTo(0.5, 5)
  })

  it('kills a walker (2 hp) inside ~3 m but not at the edge of the radius', () => {
    const walker = ZOMBIE_ARCHETYPES.walker.health
    expect(grenadeZombieDamage(0.5)).toBeGreaterThanOrEqual(walker)
    expect(grenadeZombieDamage(2.9)).toBeGreaterThanOrEqual(walker)
    expect(grenadeZombieDamage(4)).toBeLessThan(walker)
    expect(grenadeZombieDamage(4.6)).toBe(0)
  })

  it('hurts brutes / armored / boss heavily but never one-shots them', () => {
    for (const t of ['brute', 'armored', 'boss']) {
      const max = grenadeZombieDamage(0)
      expect(max).toBeLessThan(ZOMBIE_ARCHETYPES[t].health)
      expect(max).toBeGreaterThan(ZOMBIE_ARCHETYPES[t].health * 0.25)
    }
  })

  it('armored takes full damage from explosions (burst source ignores plating)', () => {
    expect(armorMultiplier('armored', { source: 'burst' })).toBe(1)
  })

  it('hurts the player with falloff but a point-blank blast is survivable at full HP', () => {
    expect(grenadePlayerDamage(0)).toBe(GRENADE.PLAYER_MAX)
    expect(grenadePlayerDamage(3)).toBeLessThan(grenadePlayerDamage(1.5))
    expect(grenadePlayerDamage(GRENADE.RADIUS)).toBe(0)
    expect(GRENADE.PLAYER_MAX).toBeLessThan(20)   // BASE_HP
  })

  it('breaks planks only inside the plank radius', () => {
    expect(grenadePlankHits(2)).toBe(GRENADE.PLANK_HITS)
    expect(grenadePlankHits(GRENADE.PLANK_RADIUS + 0.1)).toBe(0)
  })
})

describe('carry / restock rules', () => {
  it('restocks +2 per wave capped at the carry max', () => {
    expect(restockGrenades(0)).toBe(2)
    expect(restockGrenades(2)).toBe(4)
    expect(restockGrenades(3)).toBe(4)
    expect(restockGrenades(4)).toBe(4)
  })

  it('buying needs money and room', () => {
    expect(canBuyGrenade(1, GRENADE.COST)).toBe(true)
    expect(canBuyGrenade(1, GRENADE.COST - 1)).toBe(false)
    expect(canBuyGrenade(GRENADE.MAX, 999)).toBe(false)
  })
})

describe('grenade inventory in the store', () => {
  beforeEach(() => { useGameStore.getState().startGame() })

  it('starts each run with 2', () => {
    expect(useGameStore.getState().grenades).toBe(2)
  })

  it('useGrenade spends one and stops at zero', () => {
    const s = useGameStore.getState()
    expect(s.useGrenade()).toBe(true)
    expect(s.useGrenade()).toBe(true)
    expect(s.useGrenade()).toBe(false)
    expect(useGameStore.getState().grenades).toBe(0)
  })

  it('nextWave restocks +2 up to 4', () => {
    useGameStore.getState().nextWave(null)
    expect(useGameStore.getState().grenades).toBe(4)
    useGameStore.getState().nextWave(null)
    expect(useGameStore.getState().grenades).toBe(4)
    useGameStore.setState({ grenades: 0 })
    useGameStore.getState().nextWave(null)
    expect(useGameStore.getState().grenades).toBe(2)
  })

  it('shop purchase charges money, respects the cap', () => {
    useGameStore.setState({ money: 100, grenades: 3 })
    expect(useGameStore.getState().buyItem('grenade')).toBe(true)
    expect(useGameStore.getState().grenades).toBe(4)
    expect(useGameStore.getState().money).toBe(100 - GRENADE.COST)
    expect(useGameStore.getState().buyItem('grenade')).toBe(false)
    expect(useGameStore.getState().money).toBe(100 - GRENADE.COST)
  })

  it('Max Ammo refills grenades to the cap', () => {
    useGameStore.setState({ grenades: 0 })
    useGameStore.getState().applyPowerup('max_ammo')
    expect(useGameStore.getState().grenades).toBe(GRENADE.MAX)
    expect(_maxAmmoState(useGameStore.getState()).grenades).toBe(GRENADE.MAX)
  })

  it('startGame resets a depleted stock', () => {
    useGameStore.setState({ grenades: 0 })
    useGameStore.getState().startGame()
    expect(useGameStore.getState().grenades).toBe(2)
  })
})

describe('cook timing', () => {
  it('fuse is 2.5 s total and cooking eats into it', () => {
    expect(GRENADE.FUSE).toBe(2.5)
    expect(fuseLeft(0)).toBe(2.5)
    expect(fuseLeft(1)).toBeCloseTo(1.5)
    expect(fuseLeft(2.5)).toBe(0)
    expect(fuseLeft(9)).toBe(0)
    expect(fuseLeft(-1)).toBe(2.5)
  })

  it('goes off in hand once cooked for the whole fuse', () => {
    expect(cookedOut(2.49)).toBe(false)
    expect(cookedOut(2.5)).toBe(true)
  })

  it('ticks get faster as the fuse burns down', () => {
    expect(tickInterval(0)).toBeGreaterThan(tickInterval(1.5))
    expect(tickInterval(1.5)).toBeGreaterThan(tickInterval(2.5))
    expect(tickInterval(2.5)).toBeGreaterThan(0.05)
  })
})

describe('ballistics', () => {
  // flat world: a floor at y=0 and an infinite wall at x=6 facing -x
  const rayFn = (ox, oy, oz, dx, dy, dz, maxDist, out) => {
    let best = maxDist, found = false
    if (dy < -1e-6) { const t = -oy / dy; if (t > 0 && t < best) { best = t; out.nx = 0; out.ny = 1; out.nz = 0; found = true } }
    if (dx > 1e-6) { const t = (6 - ox) / dx; if (t > 0 && t < best) { best = t; out.nx = -1; out.ny = 0; out.nz = 0; found = true } }
    if (found) out.dist = best
    return found
  }
  const run = (b, seconds) => { for (let i = 0; i < seconds * 60; i++) stepBody(b, 1 / 60, rayFn) }

  it('arcs under gravity, lands, and rolls to a stop on the floor', () => {
    const b = { x: 0, y: 1.6, z: 0, vx: 0, vy: 0, vz: 0, rest: false, rolling: false, bounce: 0 }
    const v = throwVelocity(0, 0.1, -1, {})
    Object.assign(b, { vx: v.x, vy: v.y, vz: v.z })
    run(b, 0.3)
    expect(b.y).toBeGreaterThan(0.1)
    expect(b.z).toBeLessThan(-2)
    run(b, 6)
    expect(b.rest).toBe(true)
    expect(b.y).toBeCloseTo(GRENADE.RADIUS_BODY, 2)
    expect(b.z).toBeLessThan(-6)
  })

  it('bounces off a wall with damping and never ends up inside it', () => {
    const b = { x: 0, y: 1.5, z: 0, vx: 12, vy: 0, vz: 0, rest: false, rolling: false, bounce: 0 }
    let reflected = false
    for (let i = 0; i < 120; i++) {
      stepBody(b, 1 / 60, rayFn)
      expect(b.x).toBeLessThanOrEqual(6)
      if (b.vx < 0) reflected = true
    }
    expect(reflected).toBe(true)
    expect(Math.abs(b.vx)).toBeLessThan(12 * GRENADE.BOUNCE_WALL + 1)
  })
})
