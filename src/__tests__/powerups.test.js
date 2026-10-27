import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore, MAX_RESERVE, doubleMoneyExtra } from '../store'
import * as pu from '../powerups'

const live = (id, over = {}) => ({ id, x: 0, z: 0, health: 2, maxHealth: 2, type: 'walker', ...over })
const S = () => useGameStore.getState()

describe('drop roll / pity', () => {
  it('chance is the base rate early, ramps after the soft threshold, guaranteed at the hard cap', () => {
    expect(pu.dropChance(1)).toBeCloseTo(pu.DROP_CHANCE)
    expect(pu.dropChance(pu.PITY_SOFT_KILLS)).toBeCloseTo(pu.DROP_CHANCE)
    expect(pu.dropChance(pu.PITY_SOFT_KILLS + 5)).toBeCloseTo(pu.DROP_CHANCE + 5 * pu.PITY_RAMP)
    expect(pu.dropChance(pu.PITY_HARD_KILLS)).toBe(1)
  })

  it('always drops at the hard pity kill even with the worst roll', () => {
    expect(pu.rollPowerupDrop(pu.PITY_HARD_KILLS, null, () => 0.9999).drop).toBe(true)
  })

  it('does not drop on a high roll below the cap, drops on a low roll', () => {
    expect(pu.rollPowerupDrop(1, null, () => 0.5).drop).toBe(false)
    expect(pu.rollPowerupDrop(1, null, () => 0.001).drop).toBe(true)
  })

  it('never repeats the previous type and covers every type over many rolls', () => {
    const seen = new Set()
    for (let i = 0; i < 400; i++) {
      const t = pu.pickPowerupType('nuke')
      expect(t).not.toBe('nuke')
      seen.add(t)
    }
    expect(seen.size).toBe(pu.POWERUP_TYPES.length - 1)
  })

  it('average gap between drops is within ~15-30 kills', () => {
    let seed = 7
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    let since = 0, drops = 0
    const N = 20000
    for (let i = 0; i < N; i++) {
      since++
      if (pu.rollPowerupDrop(since, null, rng).drop) { drops++; since = 0 }
    }
    const gap = N / drops
    expect(gap).toBeGreaterThan(15)
    expect(gap).toBeLessThan(30)
  })
})

describe('drop placement', () => {
  it('clamps outside points inside the interior', () => {
    const p = pu.clampDropPoint(-17, 25, { hw: 9, hd: 10 })
    expect(Math.abs(p.x)).toBeLessThanOrEqual(9 - 1.2 + 1e-9)
    expect(Math.abs(p.z)).toBeLessThanOrEqual(10 - 1.2 + 1e-9)
  })

  it('slides toward the anchor when the spot is unreachable', () => {
    // right half sealed off; player on the left
    const p = pu.clampDropPoint(6, 0, { hw: 9, hd: 10, anchorX: -4, anchorZ: 0, isFree: (x) => x < 0 })
    expect(p.x).toBeLessThan(0)
  })

  it('falls back to the anchor when nothing is free', () => {
    const p = pu.clampDropPoint(5, 5, { hw: 9, hd: 10, anchorX: 1, anchorZ: 2, isFree: () => false })
    expect(p).toEqual({ x: 1, z: 2 })
  })

  it('reachability hook defaults to true and is overridable', () => {
    expect(pu.isPointReachable(1, 1)).toBe(true)
    pu.setReachabilityCheck(() => false)
    expect(pu.isPointReachable(1, 1)).toBe(false)
    pu.setReachabilityCheck(null)
    expect(pu.isPointReachable(1, 1)).toBe(true)
  })
})

describe('drop pool', () => {
  beforeEach(() => pu.clearDrops())

  it('adds, takes once, and expires after the TTL', () => {
    const id = pu.addDrop({ type: 'nuke', x: 1, z: 2 })
    expect(pu.takeDrop(id)).toMatchObject({ type: 'nuke', x: 1, z: 2 })
    expect(pu.takeDrop(id)).toBeNull()
    pu.addDrop({ type: 'carpenter', x: 0, z: 0 })
    pu.ageDrops(pu.DROP_TTL - 0.1)
    expect(pu.slots.some((s) => s.active)).toBe(true)
    pu.ageDrops(0.2)
    expect(pu.slots.some((s) => s.active)).toBe(false)
  })

  it('blinks only in the last seconds', () => {
    expect(pu.dropVisible(1)).toBe(true)
    const seen = new Set()
    for (let a = pu.DROP_TTL - 4.9; a < pu.DROP_TTL; a += 0.05) seen.add(pu.dropVisible(a))
    expect(seen.size).toBe(2)
  })

  it('recycles the oldest slot when full', () => {
    for (let i = 0; i < pu.POOL_SIZE; i++) { pu.addDrop({ type: 'nuke', x: i, z: 0 }); pu.ageDrops(1) }
    pu.addDrop({ type: 'carpenter', x: 99, z: 0 })
    expect(pu.slots.filter((s) => s.active)).toHaveLength(pu.POOL_SIZE)
    expect(pu.slots.some((s) => s.x === 0)).toBe(false)
  })

  it('remote spawns keep the host id and notify listeners only when asked', () => {
    const fn = vi.fn()
    const off = pu.onDropSpawned(fn)
    pu.addDrop({ id: 500, type: 'nuke', x: 0, z: 0 }, { notify: false })
    expect(fn).not.toHaveBeenCalled()
    expect(pu.takeDrop(500)).not.toBeNull()
    pu.addDrop({ type: 'nuke', x: 0, z: 0 })
    expect(fn).toHaveBeenCalledTimes(1)
    off()
  })
})

describe('store effects', () => {
  beforeEach(() => {
    S().startGame()
    useGameStore.setState({ phase: 'playing', zombies: [live(1), live(2), live(3)], pendingSpawns: [live(9)] })
  })

  it('Insta-Kill makes any hit lethal and expires after 20 s', () => {
    S().applyPowerup('insta_kill')
    expect(S().instaKillOn).toBe(true)
    expect(S().hitZombie(1, false)).toBe(true)   // walker has 2 hp, a body shot normally does 1
    S().tickPowerups(19.9)
    expect(S().instaKillOn).toBe(true)
    S().tickPowerups(0.2)
    expect(S().instaKillOn).toBe(false)
    expect(S().hitZombie(2, false)).toBe(false)  // back to normal damage
  })

  it('re-picking a timed effect refreshes rather than stacks', () => {
    S().applyPowerup('double_money')
    S().tickPowerups(15)
    S().applyPowerup('double_money')
    expect(pu.effects.double_money).toBe(20)
  })

  it('Double Money pays the kill money a second time, incl. headshot and knife bonuses', () => {
    useGameStore.setState({ money: 0 })
    S().applyPowerup('double_money')
    S().hitZombie(1, true)
    S().hitZombie(1, true)               // 2 hp walker: headshot (3) kills in one
    expect(S().money).toBeCloseTo(doubleMoneyExtra('gun', true))
    expect(doubleMoneyExtra('gun', true)).toBeCloseTo(1.5)
    expect(doubleMoneyExtra('knife', true)).toBeCloseTo(3)
    expect(doubleMoneyExtra('gun', false)).toBeCloseTo(1)
    const before = S().money
    S().tickPowerups(21)
    S().hitZombie(2, true)
    expect(S().money).toBe(before)       // expired: no extra
  })

  it('Max Ammo refills clips and reserves of every owned weapon, never lowering', () => {
    useGameStore.setState({
      weapon: 'ak47', ownedWeapons: ['pistol', 'ak47', 'flamethrower'],
      bulletsInClip: 3, reserveBullets: 10,
      savedClips: { pistol: 1, ak47: 0, shotgun: 0, deagle: 0, flamethrower: 0 },
      savedReserves: { pistol: 5, ak47: 0, shotgun: 0, deagle: 0, flamethrower: 99999 },
    })
    S().applyPowerup('max_ammo')
    const s = S()
    expect(s.bulletsInClip).toBe(30)
    expect(s.reserveBullets).toBe(MAX_RESERVE.ak47)
    expect(s.savedClips.pistol).toBe(10)
    expect(s.savedReserves.pistol).toBe(MAX_RESERVE.pistol)
    expect(s.savedReserves.flamethrower).toBe(99999)   // already above max: untouched
    expect(s.savedReserves.shotgun).toBe(0)            // not owned
  })

  it('Max Ammo scales with Deep Pockets and refills flamethrower fuel when active', () => {
    useGameStore.setState({ weapon: 'flamethrower', ownedWeapons: ['pistol', 'flamethrower'], reserveBullets: 40, bulletsInClip: 0, perks: { deep_pockets: true } })
    S().applyPowerup('max_ammo')
    expect(S().reserveBullets).toBe(MAX_RESERVE.flamethrower * 1.5)
    expect(S().savedReserves.pistol).toBe(MAX_RESERVE.pistol * 1.5)
  })

  it('Nuke kills every live zombie (not pending), pays a flat sum, no per-kill money', () => {
    useGameStore.setState({ money: 0 })
    S().applyPowerup('nuke')
    const zs = S().zombies
    expect(zs.filter((z) => !z.dying)).toHaveLength(1)           // only the slotted-in pending one
    expect(zs.find((z) => z.id === 9)).toBeTruthy()
    expect(zs.filter((z) => z.dying)).toHaveLength(3)
    expect(S().money).toBe(pu.NUKE_REWARD)
    expect(S().waveKills).toBe(0)
    expect(S().kills).toBe(3)
  })

  it('Nuke with nothing pending ends the wave via the normal last-kill path', () => {
    useGameStore.setState({ pendingSpawns: [] })
    S().applyPowerup('nuke')
    expect(S().zombies.every((z) => z.dying)).toBe(true)
    expect(S().lastKillPending).toBe(true)
  })

  it('Nuke on a guest does not kill locally (host sync does) but still pays', () => {
    useGameStore.setState({ mpRole: 'guest', money: 0 })
    S().applyPowerup('nuke')
    expect(S().zombies.filter((z) => z.dying)).toHaveLength(0)
    expect(S().money).toBe(pu.NUKE_REWARD)
    useGameStore.setState({ mpRole: null })
  })

  it('Carpenter boards every window to 2 planks, resets hits, pays a bonus', () => {
    useGameStore.setState({ money: 0, windowPlanks: { 0: 1 }, plankHits: { 0: 3 } })
    S().applyPowerup('carpenter')
    const s = S()
    for (let i = 0; i < 6; i++) expect(s.windowPlanks[i]).toBe(2)
    expect(s.plankHits[0]).toBe(0)
    expect(s.money).toBe(pu.CARPENTER_REWARD)
  })

  it('Carpenter respects strong-plank semantics', () => {
    useGameStore.setState({ strongPlanksMode: true, windowPlanks: { 0: 1, 1: 1 }, windowPlankStrong: { 0: true } })
    S().applyPowerup('carpenter')
    const s = S()
    expect(s.windowPlankStrong[0]).toBe(true)      // already strong, stays strong
    expect(s.windowPlankStrong[1]).toBeFalsy()     // existing plain planks are not auto-upgraded
    expect(s.windowPlankStrong[2]).toBe(true)      // fresh planks follow the mode
    useGameStore.setState({ strongPlanksMode: false })
  })

  it('bumps the banner trigger on every pickup', () => {
    const id = S().powerupBannerId
    S().applyPowerup('carpenter')
    expect(S().powerupBannerId).toBe(id + 1)
    expect(S().powerupBannerType).toBe('carpenter')
  })

  it('startGame resets effects, pity counter and drops', () => {
    S().applyPowerup('insta_kill')
    pu.addDrop({ type: 'nuke', x: 0, z: 0 })
    useGameStore.setState({ killsSinceDrop: 12 })
    S().startGame()
    expect(S().instaKillOn).toBe(false)
    expect(pu.effects.insta_kill).toBe(0)
    expect(S().killsSinceDrop).toBe(0)
    expect(pu.slots.some((s) => s.active)).toBe(false)
  })
})

describe('kill path drops', () => {
  beforeEach(() => {
    S().startGame()
    pu.clearDrops()
    useGameStore.setState({ phase: 'playing', zombies: [live(1), live(2)], pendingSpawns: [live(3)], killsSinceDrop: pu.PITY_HARD_KILLS - 1 })
  })

  it('a kill at the pity cap spawns a drop and resets the counter', () => {
    S().hitZombie(1, true)
    expect(pu.slots.filter((s) => s.active)).toHaveLength(1)
    expect(S().killsSinceDrop).toBe(0)
  })

  it('never drops on the last kill of a wave (counter is kept)', () => {
    useGameStore.setState({ zombies: [live(1)], pendingSpawns: [] })
    S().hitZombie(1, true)
    expect(pu.slots.some((s) => s.active)).toBe(false)
    expect(S().killsSinceDrop).toBe(pu.PITY_HARD_KILLS - 1)
  })

  it('guests never roll drops (host broadcasts them)', () => {
    useGameStore.setState({ mpRole: 'guest' })
    S().hitZombie(1, true)
    expect(pu.slots.some((s) => s.active)).toBe(false)
    useGameStore.setState({ mpRole: null })
  })

  it('drops land inside the cabin even when the zombie died outside', () => {
    useGameStore.setState({ zombies: [live(1, { x: -17, z: -17 }), live(2)] })
    S().hitZombie(1, true)
    const d = pu.slots.find((s) => s.active)
    expect(Math.abs(d.x)).toBeLessThan(9)
    expect(Math.abs(d.z)).toBeLessThan(10)
  })

  it('drops never land in a sealed room (zombie died in the sealed bedroom)', () => {
    useGameStore.setState({ zombies: [live(1, { x: -6, z: -7 }), live(2)] })
    S().hitZombie(1, true)
    const d = pu.slots.find((s) => s.active)
    expect(d.x).toBeGreaterThanOrEqual(-2)   // main room only
  })
})
