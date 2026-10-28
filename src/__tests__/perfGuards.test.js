import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Source-text guards for perf regressions that have happened silently before
// (see CLAUDE.md "Performance - zombie spawn/kill freeze"). They read the JSX as text.
const read = (f) => readFileSync(resolve(__dirname, '../components', f), 'utf8')
const ARENAS = ['Arena.jsx', 'DinerArena.jsx']

describe.each(ARENAS)('%s perf guards', (file) => {
  const src = read(file)

  it('keeps the moonlight shadow map at 512 or less', () => {
    const w = [...src.matchAll(/shadow-mapSize-width=\{(\d+)\}/g)].map((m) => +m[1])
    const h = [...src.matchAll(/shadow-mapSize-height=\{(\d+)\}/g)].map((m) => +m[1])
    expect(w.length).toBeGreaterThan(0)
    for (const v of [...w, ...h]) expect(v).toBeLessThanOrEqual(512)
  })

  it('keeps the shadow frustum tight (at most +-18)', () => {
    const ext = [...src.matchAll(/shadow-camera-(?:left|right|top|bottom)=\{(-?\d+)\}/g)].map((m) => Math.abs(+m[1]))
    expect(ext.length).toBe(4)
    for (const v of ext) expect(v).toBeLessThanOrEqual(18)
  })

  it('never lets a point or spot light cast shadows', () => {
    const lights = [...src.matchAll(/<(?:pointLight|spotLight)\b[^>]*>/g)].map((m) => m[0])
    for (const l of lights) expect(l).not.toMatch(/castShadow/)
  })
})

describe('shadow caster budget', () => {
  it('Arena Box helper does not cast shadows by default', () => {
    expect(read('Arena.jsx')).toMatch(/function Box\([^)]*castShadow = false/)
  })

  it('no runtime light casts shadows', () => {
    for (const f of ['Arena.jsx', 'DinerArena.jsx', 'Gun.jsx', 'ModifierFx.jsx', 'BulletPickups.jsx']) {
      expect(read(f)).not.toMatch(/<(?:pointLight|spotLight)\b[^>]*castShadow/)
    }
  })
})
