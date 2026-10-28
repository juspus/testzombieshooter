import { describe, it, expect } from 'vitest'
import { createGovernor, GOV_LEVELS, GOV_MAX_LEVEL } from '../frameGovernor'

// Feed `seconds` of frames at `ms` each; returns the list of step directions seen.
function run(g, ms, seconds) {
  const steps = []
  for (let t = 0; t < seconds * 1000; t += ms) {
    const d = g.update(ms)
    if (d) steps.push(d)
  }
  return steps
}

describe('frameGovernor', () => {
  it('has the four documented levels', () => {
    expect(GOV_LEVELS.map((l) => l.height)).toEqual([400, 340, 288, 288])
    expect(GOV_LEVELS.map((l) => l.shadowEvery)).toEqual([1, 1, 1, 2])
    expect(GOV_MAX_LEVEL).toBe(3)
  })

  it('stays at level 0 for a healthy 60 fps', () => {
    const g = createGovernor()
    expect(run(g, 16.7, 30)).toEqual([])
    expect(g.level).toBe(0)
  })

  it('ignores the warm-up period', () => {
    const g = createGovernor()
    expect(run(g, 50, 1.9)).toEqual([])
    expect(g.level).toBe(0)
  })

  it('steps down after ~2 s of slow frames', () => {
    const g = createGovernor()
    run(g, 16.7, 3)                 // past warm-up
    const steps = run(g, 33, 4)     // 30 fps
    expect(steps[0]).toBe(1)
    expect(g.level).toBeGreaterThanOrEqual(1)
  })

  it('does not step down for a short spike', () => {
    const g = createGovernor()
    run(g, 16.7, 3)
    run(g, 40, 0.6)
    run(g, 16.7, 5)
    expect(g.level).toBe(0)
  })

  it('respects the cooldown and the max level', () => {
    const g = createGovernor()
    run(g, 16.7, 3)
    const steps = run(g, 50, 60)
    expect(steps.every((s) => s === 1)).toBe(true)
    expect(g.level).toBe(GOV_MAX_LEVEL)
    expect(steps.length).toBe(GOV_MAX_LEVEL)
    // steps are at least cooldown (3 s) apart: 3 steps need at least 3 s + 2 * 3 s
    expect(g.steps).toBe(GOV_MAX_LEVEL)
  })

  it('steps back up after ~6 s of fast frames, one level at a time', () => {
    const g = createGovernor()
    run(g, 16.7, 3)
    run(g, 50, 30)
    expect(g.level).toBe(GOV_MAX_LEVEL)
    const steps = run(g, 10, 60)
    expect(steps.every((s) => s === -1)).toBe(true)
    expect(g.level).toBe(0)
  })

  it('steps back up when a degraded run holds a vsync-locked 60 fps', () => {
    const g = createGovernor()
    run(g, 16.7, 3)
    run(g, 40, 3)
    expect(g.level).toBe(1)
    run(g, 16.7, 10)
    expect(g.level).toBe(0)
  })

  it('does not step up in the hysteresis band (17.5-22 ms)', () => {
    const g = createGovernor()
    run(g, 16.7, 3)
    run(g, 40, 6)
    const lvl = g.level
    expect(lvl).toBeGreaterThan(0)
    run(g, 19, 40)
    expect(g.level).toBe(lvl)
  })

  it('backs off when a step up is immediately followed by a step down', () => {
    const g = createGovernor()
    run(g, 16.7, 3)
    run(g, 40, 3)                   // down one level
    expect(g.level).toBe(1)
    run(g, 10, 8)                   // up again
    expect(g.level).toBe(0)
    run(g, 40, 4)                   // down again soon -> flapping
    expect(g.backoff).toBeGreaterThan(1)
  })

  it('ignores zero, negative and suspend-length frames', () => {
    const g = createGovernor()
    run(g, 16.7, 3)
    for (let i = 0; i < 50; i++) { g.update(0); g.update(-5); g.update(5000) }
    expect(g.level).toBe(0)
    expect(g.ema).toBeLessThan(20)
  })

  it('reset returns to level 0', () => {
    const g = createGovernor()
    run(g, 16.7, 3)
    run(g, 60, 10)
    expect(g.level).toBeGreaterThan(0)
    g.reset()
    expect(g.level).toBe(0)
    expect(g.steps).toBe(0)
  })
})
