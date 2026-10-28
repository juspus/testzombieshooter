import { describe, it, expect, beforeEach } from 'vitest'
import { sanitize, DEFAULTS, useSettings, SENS_MIN, SENS_MAX, OPACITY_MIN } from '../settings'

describe('settings', () => {
  beforeEach(() => { try { localStorage.clear() } catch { /* ignore */ } })

  it('sanitizes junk to defaults', () => {
    expect(sanitize(null)).toEqual(DEFAULTS)
    expect(sanitize({ lookSensitivity: 'x', aimAssist: 'yes', buttonSize: 'huge' })).toEqual(DEFAULTS)
  })

  it('clamps ranges', () => {
    expect(sanitize({ lookSensitivity: 9 }).lookSensitivity).toBe(SENS_MAX)
    expect(sanitize({ lookSensitivity: 0 }).lookSensitivity).toBe(SENS_MIN)
    expect(sanitize({ buttonOpacity: 0 }).buttonOpacity).toBe(OPACITY_MIN)
    expect(sanitize({ volume: 5 }).volume).toBe(1)
  })

  it('defaults keep auto-shoot and aim assist on', () => {
    expect(DEFAULTS.autoShoot).toBe(true)
    expect(DEFAULTS.aimAssist).toBe(true)
    expect(DEFAULTS.lookSensitivity).toBe(1)
  })

  it('persists changes', () => {
    useSettings.getState().setSetting('lookSensitivity', 1.5)
    useSettings.getState().setSetting('leftHanded', true)
    const saved = JSON.parse(localStorage.getItem('cabin_settings'))
    expect(saved.lookSensitivity).toBe(1.5)
    expect(saved.leftHanded).toBe(true)
    useSettings.getState().setSetting('nope', 1)
    expect(useSettings.getState().nope).toBeUndefined()
  })
})
