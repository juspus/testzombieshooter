import { describe, it, expect } from 'vitest'
import { getZombieVariant, getVariantColors, SHIRTS, PANTS, TONES, hash32 } from '../zombieVariant'

const TYPES = ['walker', 'runner', 'brute', 'screamer', 'crawler', 'boss']
const BASE = { skin: '#7d8c65', skinDark: '#5c6e4e', skinVein: '#4a5c3a' }

describe('zombie variants', () => {
  it('is deterministic per (type, id) so host and guest agree', () => {
    for (const t of TYPES) for (let id = 0; id < 50; id++) {
      expect(getZombieVariant(t, id)).toEqual(getZombieVariant(t, id))
    }
    expect(hash32(7)).toBe(hash32(7))
    expect(hash32('pg1')).not.toBe(hash32('pg2'))
  })

  it('stays inside the per-archetype envelope and palette bounds', () => {
    for (const t of TYPES) for (let id = 0; id < 400; id++) {
      const v = getZombieVariant(t, id)
      expect(v.h).toBeGreaterThanOrEqual(0.91); expect(v.h).toBeLessThanOrEqual(1.09)
      expect(v.w).toBeGreaterThanOrEqual(0.92); expect(v.w).toBeLessThanOrEqual(1.08)
      expect(v.shirt).toBeLessThan(SHIRTS[t].length)
      expect(v.pants).toBeLessThan(PANTS.length)
      expect(v.tone).toBeLessThan(TONES.length)
      expect(v.gait.rate).toBeGreaterThanOrEqual(3.6)
    }
  })

  it('actually varies, with sane damage rates; boss stays clean, crawler never limps', () => {
    const N = 2000
    const walkers = Array.from({ length: N }, (_, i) => getZombieVariant('walker', i))
    const frac = (f) => walkers.filter(f).length / N
    expect(new Set(walkers.map((v) => v.shirt)).size).toBe(SHIRTS.walker.length)
    expect(new Set(walkers.map((v) => v.tone)).size).toBe(TONES.length)
    expect(frac((v) => v.noArm !== 0)).toBeGreaterThan(0.07); expect(frac((v) => v.noArm !== 0)).toBeLessThan(0.17)
    expect(frac((v) => v.noJaw)).toBeGreaterThan(0.06); expect(frac((v) => v.noJaw)).toBeLessThan(0.14)
    expect(frac((v) => v.ribs)).toBeGreaterThan(0.09); expect(frac((v) => v.ribs)).toBeLessThan(0.19)
    expect(frac((v) => v.limp !== 0)).toBeGreaterThan(0.13); expect(frac((v) => v.limp !== 0)).toBeLessThan(0.23)
    for (let i = 0; i < N; i++) {
      const b = getZombieVariant('boss', i)
      expect(b.noArm === 0 && !b.noJaw && !b.ribs && b.limp === 0).toBe(true)
      expect(getZombieVariant('crawler', i).limp).toBe(0)
      expect(getZombieVariant('screamer', i).ribs).toBe(false)
    }
  })

  it('limp shortens and delays the bad leg only', () => {
    const v = Array.from({ length: 500 }, (_, i) => getZombieVariant('walker', i)).find((x) => x.limp === -1)
    expect(v.gait.ampL).toBeLessThan(0.32 * 0.6); expect(v.gait.ampR).toBe(0.32)
    expect(v.gait.phL).toBeGreaterThan(0); expect(v.gait.phR).toBe(0)
  })

  it('resolves colours from a fixed shared set (cached object identity, bounded count)', () => {
    const seen = new Set()
    for (let id = 0; id < 3000; id++) {
      const v = getZombieVariant('walker', id)
      const c = getVariantColors('walker', v, BASE, false)
      expect(getVariantColors('walker', v, BASE, false)).toBe(c)
      seen.add(c.shirt)
    }
    expect(seen.size).toBeLessThanOrEqual(SHIRTS.walker.length)
    // Original look (index 0 everything) keeps the archetype's own colours
    const c0 = getVariantColors('walker', { shirt: 0, pants: 0, tone: 0 }, BASE, false)
    expect(c0.shirt).toBe('#252520'); expect(c0.skin).toBe(BASE.skin); expect(c0.pants).toBe('#18180f')
  })
})
