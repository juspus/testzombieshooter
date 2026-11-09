import { describe, it, expect } from 'vitest'
import {
  GUN_SOUND_WEAPONS, shippedPreset, validatePreset, normalizePreset, presetDiff, presetHash,
} from '../sfx/gunSynth'
import { ALL_WEAPONS } from '../store'

describe('gun sound presets', () => {
  it('every preset weapon is a real weapon', () => {
    for (const w of GUN_SOUND_WEAPONS) expect(ALL_WEAPONS).toContain(w)
  })

  it('shipped presets are valid and in range', () => {
    for (const w of GUN_SOUND_WEAPONS) expect(validatePreset(shippedPreset(w)), w).toEqual([])
  })

  it('layer names are unique per weapon (the diff matches layers by name)', () => {
    for (const w of GUN_SOUND_WEAPONS) {
      const names = shippedPreset(w).layers.map((L) => L.name)
      expect(new Set(names).size, w).toBe(names.length)
    }
  })

  it('normalize fills gaps and clamps a pasted preset', () => {
    const p = normalizePreset({ master: { out: 99 }, layers: [{ name: 'x', gain: -5, src: 'kazoo' }] })
    expect(validatePreset(p)).toEqual([])
    expect(p.master.out).toBe(2)
    expect(p.layers[0].gain).toBe(0)
    expect(p.layers[0].src).toBe('noise')
  })

  it('diff lists changed, added and removed layers', () => {
    const base = shippedPreset('ak47')
    const next = JSON.parse(JSON.stringify(base))
    next.master.out = 0.5
    next.layers[0].gain = 1
    next.layers.splice(1, 1)
    next.layers.push({ ...next.layers[0], name: 'Extra' })
    const d = presetDiff(base, next)
    expect(d).toContain(`master.out: ${base.master.out} -> 0.5`)
    expect(d.some((l) => l.startsWith(`layer "${base.layers[0].name}".gain`))).toBe(true)
    expect(d).toContain(`- layer "${base.layers[1].name}" removed`)
    expect(d.some((l) => l.startsWith('+ layer "Extra"'))).toBe(true)
    expect(presetDiff(base, base)).toEqual([])
  })

  it('hash changes when the preset changes', () => {
    const a = shippedPreset('pistol')
    expect(presetHash(a)).toBe(presetHash(JSON.parse(JSON.stringify(a))))
    expect(presetHash(a)).not.toBe(presetHash({ ...a, master: { ...a.master, out: 0.3 } }))
  })
})
