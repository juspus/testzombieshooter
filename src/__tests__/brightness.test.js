import { describe, it, expect } from 'vitest'
import { clampBrightness, setBrightness, getBrightness, onBrightness, BRIGHTNESS_MIN, BRIGHTNESS_MAX } from '../brightness'

describe('brightness setting', () => {
  it('clamps to range', () => {
    expect(clampBrightness(0)).toBe(BRIGHTNESS_MIN)
    expect(clampBrightness(9)).toBe(BRIGHTNESS_MAX)
  })
  it('persists and notifies', () => {
    let seen = null
    const off = onBrightness((v) => { seen = v })
    setBrightness(1.4)
    expect(getBrightness()).toBe(1.4)
    expect(seen).toBe(1.4)
    expect(localStorage.getItem('cabin_brightness')).toBe('1.4')
    off()
  })
})
