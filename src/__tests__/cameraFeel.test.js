import { describe, it, expect, beforeEach } from 'vitest'
import { feel, kick, updateFeel, resetFeel, setReduceMotion, getReduceMotion, KICK } from '../cameraFeel'
import { raycastWorld, HIT_WALL, HIT_FLOOR, HIT_PLANK } from '../worldRay'

describe('cameraFeel', () => {
  beforeEach(() => { setReduceMotion(false); resetFeel() })

  it('bob amplitude scales with speed (armor penalty => gentler bob)', () => {
    const peak = (speed) => {
      resetFeel()
      let max = 0
      for (let i = 0; i < 240; i++) { updateFeel(1 / 60, speed, 8, 0, 0, 'pistol'); max = Math.max(max, Math.abs(feel.bobY)) }
      return max
    }
    expect(peak(0)).toBe(0)
    expect(peak(8)).toBeGreaterThan(peak(5) * 1.3)
  })

  it('kick climbs then recovers fully to zero', () => {
    for (let i = 0; i < 20; i++) { kick('ak47'); updateFeel(0.1, 0, 8, 0, 0, 'ak47') }
    expect(feel.kickPitch).toBeGreaterThan(0.025)
    expect(feel._tPitch).toBeLessThanOrEqual(KICK.ak47.max)
    for (let i = 0; i < 120; i++) updateFeel(1 / 60, 0, 8, 0, 0, 'ak47')
    expect(Math.abs(feel.kickPitch)).toBeLessThan(0.002)
  })

  it('deagle kicks harder than pistol', () => {
    kick('deagle'); for (let i = 0; i < 3; i++) updateFeel(1 / 60, 0, 8, 0, 0, 'deagle')
    const d = feel.kickPitch
    resetFeel(); kick('pistol'); for (let i = 0; i < 3; i++) updateFeel(1 / 60, 0, 8, 0, 0, 'pistol')
    expect(d).toBeGreaterThan(feel.kickPitch * 2)
  })

  it('reduce motion disables bob and kick but keeps (subtle) sway', () => {
    setReduceMotion(true)
    expect(getReduceMotion()).toBe(true)
    kick('shotgun')
    for (let i = 0; i < 30; i++) updateFeel(1 / 60, 8, 8, 0.02, 0, 'shotgun')
    expect(feel.kickPitch).toBe(0)
    expect(feel.bobY).toBe(0)
    expect(Math.abs(feel.lagX)).toBeGreaterThan(0)
  })

  it('sway lags aim and springs back', () => {
    updateFeel(1 / 60, 0, 8, -0.1, 0, 'pistol')
    expect(feel.lagX).toBeLessThan(0)
    for (let i = 0; i < 120; i++) updateFeel(1 / 60, 0, 8, 0, 0, 'pistol')
    expect(Math.abs(feel.lagX)).toBeLessThan(0.001)
  })
})

describe('raycastWorld', () => {
  const out = { dist: 0, nx: 0, ny: 0, nz: 0, kind: 0 }
  const walls = [{ x: 0, z: -10, halfW: 5, halfD: 0.3 }]
  const call = (o, d, planks = {}) =>
    raycastWorld(o[0], o[1], o[2], d[0], d[1], d[2], 50, walls, 3.2,
      [{ id: 0, wall: 'S', winX: 0, winZ: 10 }], planks, 0.5, 2, 1, out)

  it('hits a wall face with the right normal', () => {
    expect(call([0, 1.7, 0], [0, 0, -1])).toBe(true)
    expect(out.kind).toBe(HIT_WALL)
    expect(out.dist).toBeCloseTo(9.7)
    expect(out.nz).toBe(1)
  })
  it('hits the floor when aiming down', () => {
    expect(call([0, 1.7, 0], [0, -1, 0])).toBe(true)
    expect(out.kind).toBe(HIT_FLOOR)
    expect(out.dist).toBeCloseTo(1.7)
  })
  it('passes through window gaps unless boarded', () => {
    expect(call([0, 1.2, 0], [0, 0, 1])).toBe(false)
    expect(call([0, 1.2, 0], [0, 0, 1], { 0: 2 })).toBe(true)
    expect(out.kind).toBe(HIT_PLANK)
    expect(out.dist).toBeCloseTo(10)
  })
})
