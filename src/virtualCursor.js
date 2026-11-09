// Desktop virtual cursor. Once the game holds the mouse (pointer lock) it never hands it back for a
// menu: while a screen that needs clicking is up (pause, shop, death, start menu, versus and
// Director cards), the game draws its own arrow, moves it with the locked mouse's movementX/Y and
// turns the real button and wheel input into synthetic DOM events on the element under the arrow.
// Only the browser can still free the mouse (Esc outside Chrome/Edge fullscreen, holding Esc,
// Alt+Tab); the real cursor takes over then and pause.js opens the pause menu mid-run.
//
// While the arrow is up, trusted mouse events are stopped at window capture, so nothing behind the
// menu (Player look/shoot/weapon wheel, R3F) sees them. The synthetic events are untrusted and pass.
// The trusted click still gives the page its user activation, so fullscreen, clipboard and popups
// started from a virtual click work.
import { useEffect } from 'react'
import { usesPointerLock } from './desktopInput'

const HOVERABLE = 'button, a[href], [role="button"], input, label, select, textarea, .menu-item, .dv-unit, .ui-option, .ui-tab, .ui-level'
const TEXT_INPUT = 'input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable="true"]'

let _holders = 0
let _active = false
let _x = 0
let _y = 0
let _el = null       // the arrow
let _hover = null    // element carrying data-vhover
let _down = null     // element the button went down on
let _drag = null     // range input being dragged
let _hoverQueued = false
const _listeners = new Set()

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export const isCursorActive = () => _active
export const getCursorPos = () => ({ x: _x, y: _y })
export function onCursorActive(fn) { _listeners.add(fn); return () => { _listeners.delete(fn) } }

// A screen with clickable UI calls this while it is open.
export function useVirtualCursor(open) {
  useEffect(() => {
    if (!open) return undefined
    _holders += 1
    refresh()
    return () => { _holders -= 1; refresh() }
  }, [open])
}

export function refresh() {
  if (typeof document === 'undefined') return
  const next = _holders > 0 && !!document.pointerLockElement && usesPointerLock()
  if (next === _active) return
  _active = next
  if (_active) { _x = Math.round(window.innerWidth / 2); _y = Math.round(window.innerHeight / 2) }
  else { setHover(null); _drag = null; _down = null }
  paint()
  if (_active) queueHover()
  for (const fn of _listeners) fn(_active)
}

function paint() {
  if (!_el) return
  _el.style.display = _active ? 'block' : 'none'
  _el.style.transform = `translate3d(${_x}px, ${_y}px, 0)`
}

// The element under the arrow; the locked canvas (the 3D view itself) counts as nothing.
function elementAt() {
  const t = document.elementFromPoint(_x, _y)
  return t && t !== document.pointerLockElement ? t : null
}

function setHover(el) {
  if (_hover === el) return
  _hover?.removeAttribute?.('data-vhover')
  _hover = el
  _hover?.setAttribute?.('data-vhover', '')
}

function queueHover() {
  if (_hoverQueued) return
  _hoverQueued = true
  requestAnimationFrame(() => {
    _hoverQueued = false
    if (!_active) return
    const t = elementAt()
    setHover(t?.closest?.(HOVERABLE) ?? null)
  })
}

function fire(t, type, src) {
  const down = type === 'pointerdown' || type === 'mousedown'
  const init = {
    bubbles: true, cancelable: true, composed: true, view: window, detail: 1,
    clientX: _x, clientY: _y, screenX: _x, screenY: _y, button: 0, buttons: down ? 1 : 0,
    ctrlKey: !!src?.ctrlKey, shiftKey: !!src?.shiftKey, altKey: !!src?.altKey, metaKey: !!src?.metaKey,
  }
  const ev = type.startsWith('pointer') && typeof PointerEvent === 'function'
    ? new PointerEvent(type, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1, pressure: down ? 0.5 : 0 })
    : new MouseEvent(type, init)
  t.dispatchEvent(ev)
}

// Nearest element holding both the press and release targets (where a real click lands).
export function clickTargetOf(down, up) {
  if (!down || !up) return null
  for (let n = up; n; n = n.parentElement) if (n === down || n.contains(down)) return n
  return null
}

// Slider value under the arrow, snapped to step.
export function rangeValueAt({ min, max, step }, left, width, x) {
  const f = width > 0 ? clamp((x - left) / width, 0, 1) : 0
  let v = min + f * (max - min)
  if (step > 0) v = min + Math.round((v - min) / step) * step
  return clamp(+v.toFixed(6), min, max)
}

const valueSetter = typeof HTMLInputElement !== 'undefined'
  ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  : null

function setRange(input) {
  const r = input.getBoundingClientRect()
  const num = (s, d) => { const n = parseFloat(s); return Number.isFinite(n) ? n : d }
  const v = rangeValueAt({ min: num(input.min, 0), max: num(input.max, 100), step: input.step === 'any' ? 0 : num(input.step, 1) }, r.left, r.width, _x)
  const str = String(v)
  if (input.value === str) return
  // Native setter so React's value tracker sees the change and calls onChange.
  if (valueSetter) valueSetter.call(input, str); else input.value = str
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

// Nearest scrollable box at or above `t`.
export function scrollableFrom(t) {
  for (let n = t; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n
  }
  return null
}

// ── Trusted input while the arrow is up ─────────────────────────────────────────────────────────
const mine = (e) => _active && e.isTrusted

function onMove(e) {
  if (!mine(e)) return
  e.stopImmediatePropagation()
  _x = clamp(_x + (e.movementX || 0), 0, window.innerWidth - 1)
  _y = clamp(_y + (e.movementY || 0), 0, window.innerHeight - 1)
  paint()
  if (_drag) setRange(_drag)
  queueHover()
}

function onDown(e) {
  if (!mine(e)) return
  e.stopImmediatePropagation()
  e.preventDefault()
  if (e.button !== 0) return
  const t = elementAt()
  _down = t
  const focusable = t?.closest?.(TEXT_INPUT)
  if (focusable) focusable.focus({ preventScroll: true })
  else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur?.()
  if (!t) return
  fire(t, 'pointerdown', e)
  fire(t, 'mousedown', e)
  const range = t.closest?.('input[type=range]')
  if (range && !range.disabled) { _drag = range; setRange(range) }
}

function onUp(e) {
  if (!mine(e)) return
  e.stopImmediatePropagation()
  e.preventDefault()
  if (e.button !== 0) return
  const t = elementAt()
  const down = _down
  const dragged = !!_drag
  _down = null
  _drag = null
  if (t) { fire(t, 'pointerup', e); fire(t, 'mouseup', e) }
  const target = dragged ? null : clickTargetOf(down, t)
  if (target) fire(target, 'click', e)
}

function onWheel(e) {
  if (!mine(e)) return
  e.stopImmediatePropagation()
  const box = scrollableFrom(elementAt())
  if (!box) return
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? box.clientHeight : 1
  box.scrollBy({ top: e.deltaY * unit, left: e.deltaX * unit })
}

// Swallow the rest (pointer twins, clicks the browser fires on the locked canvas).
function onOther(e) {
  if (!mine(e)) return
  e.stopImmediatePropagation()
  if (e.type === 'click' || e.type === 'auxclick' || e.type === 'dblclick') e.preventDefault()
}

const ARROW = '<svg width="18" height="26" viewBox="0 0 18 26" xmlns="http://www.w3.org/2000/svg">'
  + '<path d="M1 1 L1 21 L6 16.5 L9.6 24.6 L12.9 23.1 L9.4 15.3 L16 15.3 Z" fill="#f2efe6" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>'

let _installed = false
export function installVirtualCursor() {
  if (_installed || typeof document === 'undefined') return
  _installed = true
  _el = document.createElement('div')
  _el.setAttribute('aria-hidden', 'true')
  _el.dataset.testid = 'virtual-cursor'
  Object.assign(_el.style, {
    position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none',
    display: 'none', willChange: 'transform', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))',
  })
  _el.innerHTML = ARROW
  document.body.appendChild(_el)

  const cap = { capture: true }
  window.addEventListener('mousemove', onMove, cap)
  window.addEventListener('mousedown', onDown, cap)
  window.addEventListener('mouseup', onUp, cap)
  window.addEventListener('wheel', onWheel, { capture: true, passive: true })
  for (const type of ['pointermove', 'pointerdown', 'pointerup', 'click', 'auxclick', 'dblclick']) {
    window.addEventListener(type, onOther, cap)
  }
  document.addEventListener('pointerlockchange', refresh)
  window.addEventListener('resize', () => {
    if (!_active) return
    _x = clamp(_x, 0, window.innerWidth - 1)
    _y = clamp(_y, 0, window.innerHeight - 1)
    paint()
  })
}

// Dev/tests only. Headless Chromium fakes pointer-lock movement (each move is undone by a re-centre
// move), so browser tests place the arrow with moveTo and press real buttons.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__vcursor = {
    isActive: isCursorActive,
    pos: getCursorPos,
    moveTo: (x, y) => { _x = x; _y = y; paint(); if (_drag) setRange(_drag); queueHover() },
  }
}
