// Desktop mouse and window feel. Touch devices never use any of this (they have their own
// controls and fullscreen.js's Android path).
//
// - lockPointer: pointer lock with raw input (unadjustedMovement: no OS mouse acceleration) when
//   the browser has it (Chrome/Edge on Windows/macOS), plain pointer lock otherwise.
// - captureMouse: pointer lock, THEN fullscreen (setting) with Esc kept by the game (Keyboard
//   Lock, Chrome/Edge: Esc reaches the page, holding it leaves fullscreen).
//   Order matters: requestFullscreen uses up the click's user activation, so pointer lock has to
//   be requested first, including the plain-lock retry after raw input is refused (Linux Chrome
//   refuses it with NotSupportedError). Checked in headless Chromium: fullscreen first -> "A user
//   gesture is required to request Pointer Lock".
import { getSettings } from './settings'
import { getIsTouchScreen } from './menuTouch'

let _target = null
let _rawRefused = false   // NotSupportedError once: don't ask for raw input again this page load

const noop = () => {}

export const setLockTarget = (el) => { _target = el }
// Player registers the R3F canvas; a PLAY click right after load can beat that mount, so fall back
// to the page's canvas (the R3F one is the only canvas in the DOM).
export const getLockTarget = () => _target || (typeof document !== 'undefined' ? document.querySelector('canvas') : null)
export const usesPointerLock = () => !getIsTouchScreen()

// Settles once the lock request is answered (the result itself arrives as pointerlockchange /
// pointerlockerror; old Safari returns undefined instead of a promise).
export function lockPointer(el = getLockTarget()) {
  if (!el?.requestPointerLock) return Promise.resolve()
  if (document.pointerLockElement === el) return Promise.resolve()
  const plain = () => {
    try { return Promise.resolve(el.requestPointerLock()).then(noop, noop) } catch { return Promise.resolve() }
  }
  if (!getSettings().rawMouse || _rawRefused) return plain()
  let p
  try { p = el.requestPointerLock({ unadjustedMovement: true }) } catch { return plain() }
  if (!p || typeof p.then !== 'function') return Promise.resolve()
  return p.then(noop, (err) => {
    if (err?.name !== 'NotSupportedError') return undefined
    _rawRefused = true
    return plain()
  })
}

const fullscreenEl = () => document.fullscreenElement || document.webkitFullscreenElement || null

// Chrome/Edge: in a fullscreen the page requested, a short Esc press goes to the game (pause menu)
// and holding Esc leaves fullscreen. Other browsers: no-op, Esc leaves fullscreen and the mouse.
function keepEsc() {
  try { navigator.keyboard?.lock?.(['Escape'])?.catch?.(noop) } catch { /* ignore */ }
}

export function enterFullscreen() {
  if (!usesPointerLock() || !getSettings().fullscreen) return Promise.resolve()
  if (fullscreenEl()) { keepEsc(); return Promise.resolve() }
  const root = document.documentElement
  const req = root.requestFullscreen || root.webkitRequestFullscreen
  if (!req) return Promise.resolve()
  try { return Promise.resolve(req.call(root, { navigationUI: 'hide' })).then(keepEsc, noop) } catch { return Promise.resolve() }
}

export function leaveFullscreen() {
  try { navigator.keyboard?.unlock?.() } catch { /* ignore */ }
  if (!fullscreenEl()) return
  try { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(noop) } catch { /* ignore */ }
}

// FULLSCREEN toggle (a click): store the preference and apply it now.
export function setFullscreenPref(on) {
  getSettings().setSetting('fullscreen', on)
  if (on) enterFullscreen()
  else leaveFullscreen()
}

// Call inside a click/key handler. `lock: false` only goes fullscreen (lobby join: no run yet).
export function captureMouse({ lock = true } = {}) {
  if (!usesPointerLock()) return Promise.resolve()
  const first = lock ? lockPointer() : Promise.resolve()
  return first.then(() => enterFullscreen())
}

// No browser right-click menu over the game (text fields keep theirs, for pasting room codes).
let _installed = false
export function installDesktopFeel() {
  if (_installed || typeof document === 'undefined') return
  _installed = true
  document.addEventListener('contextmenu', (e) => {
    const t = e.target
    if (t?.closest?.('input, textarea, [contenteditable="true"]')) return
    e.preventDefault()
  })
}

// Tests only.
export function _resetDesktopInput() { _target = null; _rawRefused = false }
