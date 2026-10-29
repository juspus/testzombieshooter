// Player settings (in-run settings panel). Small Zustand store persisted per device in
// localStorage, same try/catch style as brightness.js. Brightness itself stays in
// brightness.js (LofiPass listens to it); the panel just reuses that module.
import { create } from 'zustand'

const STORAGE_KEY = 'cabin_settings'

export const SENS_MIN = 0.5
export const SENS_MAX = 2
export const OPACITY_MIN = 0.3
export const OPACITY_MAX = 1
export const DEFAULT_BUTTON_OPACITY = 0.55   // matches MobileControls' glass background today

export const DEFAULTS = {
  lookSensitivity: 1,       // multiplier on MOBILE_LOOK_SENSITIVITY (and desktop mouse look)
  aimAssist: true,          // 6-ray forgiveness cone on touch
  autoShoot: true,          // fire when a zombie is in the crosshair (touch)
  buttonSize: 'normal',     // 'normal' | 'large'  (wired by the controls agent)
  buttonOpacity: DEFAULT_BUTTON_OPACITY,
  leftHanded: false,        // mirror the layout (wired by the controls agent)
  volume: 1,                // master volume 0..1 (key kept as `volume` so saved values carry over)
  sfxVolume: 1,             // effects bus 0..1 (everything that isn't music)
  musicVolume: 1,           // music bus 0..1 (calm drone + wave layer)
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export function sanitize(raw) {
  const o = { ...DEFAULTS }
  if (!raw || typeof raw !== 'object') return o
  if (Number.isFinite(raw.lookSensitivity)) o.lookSensitivity = clamp(raw.lookSensitivity, SENS_MIN, SENS_MAX)
  if (typeof raw.aimAssist === 'boolean') o.aimAssist = raw.aimAssist
  if (typeof raw.autoShoot === 'boolean') o.autoShoot = raw.autoShoot
  if (raw.buttonSize === 'normal' || raw.buttonSize === 'large') o.buttonSize = raw.buttonSize
  if (Number.isFinite(raw.buttonOpacity)) o.buttonOpacity = clamp(raw.buttonOpacity, OPACITY_MIN, OPACITY_MAX)
  if (typeof raw.leftHanded === 'boolean') o.leftHanded = raw.leftHanded
  if (Number.isFinite(raw.volume)) o.volume = clamp(raw.volume, 0, 1)
  if (Number.isFinite(raw.sfxVolume)) o.sfxVolume = clamp(raw.sfxVolume, 0, 1)
  if (Number.isFinite(raw.musicVolume)) o.musicVolume = clamp(raw.musicVolume, 0, 1)
  return o
}

function load() {
  try { return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY))) } catch { return { ...DEFAULTS } }
}

function save(st) {
  const out = {}
  for (const k of Object.keys(DEFAULTS)) out[k] = st[k]
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(out)) } catch { /* private mode etc. */ }
}

export const useSettings = create((set, get) => ({
  ...load(),
  setSetting: (key, value) => {
    if (!(key in DEFAULTS)) return
    const next = sanitize({ ...get(), [key]: value })
    set({ [key]: next[key] })
    save(get())
  },
}))

// Non-React reads for frame loops (no subscription cost).
export const getSettings = () => useSettings.getState()

// Selectors for the controls agent.
export const selButtonSize = (s) => s.buttonSize
export const selButtonOpacity = (s) => s.buttonOpacity
export const selLeftHanded = (s) => s.leftHanded
