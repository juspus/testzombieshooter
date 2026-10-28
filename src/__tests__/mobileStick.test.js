import { describe, it, expect } from 'vitest'
import { stickVector, STICK_RADIUS, STICK_DEADZONE } from '../mobileInput'

describe('floating stick vector', () => {
  it('is zero at the centre and inside the dead zone', () => {
    expect(stickVector(0, 0).mag).toBe(0)
    const v = stickVector(STICK_RADIUS * STICK_DEADZONE * 0.9, 0)
    expect(v.x).toBe(0)
    expect(v.y).toBe(0)
  })
  it('ramps analog from the dead-zone edge to 1 at the ring edge', () => {
    const half = stickVector(STICK_RADIUS * 0.55, 0)
    expect(half.mag).toBeGreaterThan(0.4)
    expect(half.mag).toBeLessThan(0.6)
    expect(stickVector(STICK_RADIUS, 0).mag).toBeCloseTo(1)
  })
  it('clamps to 1 beyond the ring and keeps direction', () => {
    const v = stickVector(0, -500)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1)
    expect(v.y).toBeCloseTo(-1)
    expect(Math.hypot(v.knobX, v.knobY)).toBeCloseTo(1)
  })
  it('is monotonic in distance', () => {
    let prev = -1
    for (let d = 0; d <= STICK_RADIUS * 1.5; d += 2) {
      const m = stickVector(d, 0).mag
      expect(m).toBeGreaterThanOrEqual(prev)
      prev = m
    }
  })
})
