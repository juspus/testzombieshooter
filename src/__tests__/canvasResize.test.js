import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The canvas once ignored height-only resizes under 15% (a custom ResizeObserver plus a
// gl.setSize override), so a bookmarks bar or URL bar vanishing after load left a black
// strip at the bottom until the window width changed. Coalesce resizes, never drop them.
const src = readFileSync(resolve(__dirname, '../components/Game.jsx'), 'utf8')

describe('Game canvas resize', () => {
  it('does not override gl.setSize', () => {
    expect(src).not.toMatch(/gl\.setSize\s*=/)
  })

  it('does not swap in a filtering ResizeObserver', () => {
    expect(src).not.toMatch(/polyfill\s*:/)
  })
})
