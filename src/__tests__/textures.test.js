import { describe, it, expect } from 'vitest'
import { getTexture, getTexBoxGeo, getTexMaterial, TEXTURE_KINDS, textureBytes } from '../textures'

describe('procedural textures', () => {
  it('generates each kind once, 64x64, and shares it', () => {
    for (const k of TEXTURE_KINDS) {
      const t = getTexture(k)
      expect(t.image.width).toBe(64)
      expect(getTexture(k)).toBe(t)
    }
    expect(textureBytes()).toBeLessThan(1024 * 1024)
  })

  it('shares geometry and material for identical requests', () => {
    expect(getTexBoxGeo([1, 2, 0.3], 'timber')).toBe(getTexBoxGeo([1, 2, 0.3], 'timber'))
    expect(getTexMaterial('wood', '#222', 1, 0)).toBe(getTexMaterial('wood', '#222', 1, 0))
  })

  it('scales box UVs to world size (metres per tile)', () => {
    const g = getTexBoxGeo([2.2, 1.1, 0.3], 'timber')   // timber tile = 1.1 m
    const uv = g.attributes.uv
    let maxU = 0
    for (let i = 16; i < 20; i++) maxU = Math.max(maxU, uv.getX(i))  // +z face, width 2.2
    expect(maxU).toBeCloseTo(2, 5)
  })
})
