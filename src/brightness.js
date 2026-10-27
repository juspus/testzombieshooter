// Player brightness setting (multiplies the render exposure). Persisted per
// device; listeners let the render pass pick up changes without React state.

const STORAGE_KEY = 'cabin_brightness'
export const BRIGHTNESS_MIN = 0.5
export const BRIGHTNESS_MAX = 2
const listeners = new Set()

let _value = null
export function getBrightness() {
  if (_value === null) {
    let v = 1
    try { v = parseFloat(localStorage.getItem(STORAGE_KEY)) } catch { /* private mode etc. */ }
    _value = Number.isFinite(v) ? clampBrightness(v) : 1
  }
  return _value
}

export function clampBrightness(v) {
  return Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, v))
}

export function setBrightness(v) {
  _value = clampBrightness(v)
  try { localStorage.setItem(STORAGE_KEY, String(_value)) } catch { /* private mode etc. */ }
  listeners.forEach((fn) => fn(_value))
}

export function onBrightness(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
