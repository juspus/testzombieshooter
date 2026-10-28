import { describe, it, expect } from 'vitest'
import { isIos, isIosSafari, shouldShowInstallHint } from '../installHint'
import { wantsWakeLock } from '../wakeLock'
import { rotateGateVisible } from '../components/RotateGate'

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1'
const IPHONE_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
const DESKTOP_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'

describe('install hint', () => {
  it('shows only on iOS Safari, not standalone, not dismissed', () => {
    expect(shouldShowInstallHint({ ua: IPHONE_SAFARI, platform: 'iPhone', maxTouchPoints: 5, standalone: false, dismissed: false })).toBe(true)
    expect(shouldShowInstallHint({ ua: IPHONE_SAFARI, standalone: true, dismissed: false })).toBe(false)
    expect(shouldShowInstallHint({ ua: IPHONE_SAFARI, standalone: false, dismissed: true })).toBe(false)
  })
  it('never on Android, desktop, iOS Chrome or in-app browsers', () => {
    for (const ua of [ANDROID, IPHONE_CHROME, IPHONE_INSTAGRAM]) {
      expect(isIosSafari({ ua, platform: '', maxTouchPoints: 5 })).toBe(false)
    }
    expect(isIosSafari({ ua: DESKTOP_MAC, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
  })
  it('iPadOS (Mac UA with touch) counts as iOS', () => {
    expect(isIos({ ua: DESKTOP_MAC, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
    expect(isIosSafari({ ua: DESKTOP_MAC, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
  })
})

describe('wake lock', () => {
  it('wanted only while a run is live, unpaused and visible', () => {
    for (const phase of ['playing', 'intermission', 'wave_clear']) {
      expect(wantsWakeLock({ phase, paused: false, hidden: false })).toBe(true)
      expect(wantsWakeLock({ phase, paused: true, hidden: false })).toBe(false)
      expect(wantsWakeLock({ phase, paused: false, hidden: true })).toBe(false)
    }
    for (const phase of ['start', 'dead']) expect(wantsWakeLock({ phase, paused: false, hidden: false })).toBe(false)
  })
})

describe('rotate gate', () => {
  const base = { touch: true, portrait: true, phase: 'playing', shopOpen: false }
  it('shows upright on a phone while a run is live', () => {
    for (const phase of ['playing', 'intermission', 'wave_clear']) expect(rotateGateVisible({ ...base, phase })).toBe(true)
    expect(rotateGateVisible({ ...base, phase: 'start', shopOpen: true })).toBe(true)
  })
  it('never on menus, death, desktop or landscape', () => {
    expect(rotateGateVisible({ ...base, phase: 'start' })).toBe(false)
    expect(rotateGateVisible({ ...base, phase: 'dead' })).toBe(false)
    expect(rotateGateVisible({ ...base, touch: false })).toBe(false)
    expect(rotateGateVisible({ ...base, portrait: false })).toBe(false)
  })
})
