import { describe, it, expect } from 'vitest'
import { spreadMarkers, hitPoint, seededRandom, circleJitter } from '../directorPaper'

describe('marker spreading', () => {
  it('pushes overlapping markers apart, leaves others, and hit test follows the moved points', () => {
    const pts = [{ x: 100, y: 20, edge: 'N' }, { x: 125, y: 20, edge: 'N' }, { x: 400, y: 300, edge: 'E' }]
    const out = spreadMarkers(pts, 56, { w: 800, h: 400, pad: 10 })
    expect(Math.hypot(out[0].x - out[1].x, out[0].y - out[1].y)).toBeGreaterThanOrEqual(55)
    expect(out[2]).toEqual({ x: 400, y: 300 })
    expect(hitPoint(out, out[1].x + 3, out[1].y, 24)).toBe(1)
    expect(hitPoint(out, 600, 100, 24)).toBe(-1)
  })
  it('identical points separate along the edge tangent', () => {
    const same = spreadMarkers([{ x: 50, y: 50, edge: 'S' }, { x: 50, y: 50, edge: 'S' }], 40)
    expect(same[0].y).toBe(same[1].y)
    expect(same[0].x).not.toBe(same[1].x)
  })
  it('keeps markers inside the box', () => {
    const out = spreadMarkers([{ x: 5, y: 5, edge: 'N' }, { x: 8, y: 5, edge: 'N' }], 50, { w: 200, h: 100, pad: 20 })
    for (const p of out) { expect(p.x).toBeGreaterThanOrEqual(20); expect(p.y).toBeGreaterThanOrEqual(20) }
  })
})

describe('seeded jitter', () => {
  it('same seed gives the same sequence', () => {
    const a = seededRandom(7), b = seededRandom(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(circleJitter(seededRandom(3))).toEqual(circleJitter(seededRandom(3)))
  })
})
