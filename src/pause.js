// Game lifecycle: pause / resume (with 3-2-1), auto-pause on app switch, partner-away flag.
//
// The freeze itself is the store's existing `paused` flag (the co-op host-tab pause): the
// store tick, zombies, power-ups, grenades, bolts, crate spawns and the player already
// honour it. This module only decides WHEN to set it and owns the pause-menu UI state.
import { create } from 'zustand'
import { useGameStore } from './store'
import { send } from './net'
import { setAudioHold } from './sounds'
import { resetMobileInput } from './mobileInput'

// Touch-only inputs that Player.jsx reads (kept out of mobileInput.js: another agent owns it).
export const lifecycleInput = { skipHeld: false }

export const RESUME_SECONDS = 3

// menu: null | 'pause' | 'settings' | 'countdown'
export const usePauseUi = create(() => ({
  menu: null,
  count: 0,
  partnerAway: false,   // co-op: the other player's tab is hidden
  glLost: false,        // WebGL context lost, waiting for restore
  glFailed: false,      // restore did not come back in time -> offer reload
  settingsFrom: 'pause', // where Back goes: 'pause' | 'game'
}))
const ui = (p) => usePauseUi.setState(p)

const isActivePhase = (ph) => ph === 'playing' || ph === 'intermission'
const coopLive = (st) => !!st.mpRole && st.mpConnected

let _timer = null
let _pausedAt = 0

function clearTimer() { if (_timer) { clearInterval(_timer); _timer = null } }

function dropInputs() {
  lifecycleInput.skipHeld = false
  resetMobileInput()
  useGameStore.getState().setSkipProgress?.(0)
}

// Pause the world. Co-op guests cannot pause the host's world (returns false).
// `local` lets a guest freeze only its own client (used while its GL context is gone).
export function pauseGame(local = false) {
  const st = useGameStore.getState()
  if (!isActivePhase(st.phase)) return false
  const guest = coopLive(st) && st.mpRole === 'guest'
  if (guest && !local) return false
  clearTimer()
  if (!st.paused) {
    useGameStore.setState({ paused: true })
    if (coopLive(st) && !guest) send('game_event', { event: 'pause', data: {} })
  }
  dropInputs()
  try { document.exitPointerLock?.() } catch { /* ignore */ }
  ui({ menu: 'pause', count: 0 })
  return true
}

function finishResume() {
  clearTimer()
  const st = useGameStore.getState()
  ui({ menu: null, count: 0 })
  if (st.paused) {
    useGameStore.setState({ paused: false })
    if (coopLive(st) && st.mpRole === 'host') send('game_event', { event: 'resume', data: {} })
  }
}

// Resume with a 3-2-1 countdown (world stays frozen until it ends).
export function resumeGame() {
  if (usePauseUi.getState().menu === 'countdown') return
  clearTimer()
  let n = RESUME_SECONDS
  ui({ menu: 'countdown', count: n })
  _timer = setInterval(() => {
    n -= 1
    if (n <= 0) finishResume()
    else ui({ count: n })
  }, 1000)
}

export function openSettings(from = 'pause') { ui({ menu: 'settings', settingsFrom: from }) }
export function closeSettings() {
  const { settingsFrom } = usePauseUi.getState()
  ui({ menu: settingsFrom === 'game' ? null : 'pause' })
}

// Backgrounded / locked / switched app.
export function autoPause() {
  const st = useGameStore.getState()
  if (!isActivePhase(st.phase)) return
  if (coopLive(st)) {
    // Co-op: the host's hidden tab already pauses the shared world (NetManager). A guest only
    // tells the host it is away; nobody else's world stops.
    send('game_event', { event: 'away', data: { away: true } })
    return
  }
  pauseGame()
}

export function onReturn() {
  const st = useGameStore.getState()
  if (coopLive(st)) send('game_event', { event: 'away', data: { away: false } })
}

const isTouchDevice = () => {
  try {
    return !!(window.matchMedia?.('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 0)
  } catch { return false }
}

let _installed = false
export function installLifecycle() {
  if (_installed || typeof document === 'undefined') return () => {}
  _installed = true
  const onVis = () => { if (document.visibilityState === 'hidden' || document.hidden) autoPause(); else onReturn() }
  const onHide = () => autoPause()
  const onBlur = () => { if (isTouchDevice()) autoPause() }   // desktop blur is not a pause
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('pagehide', onHide)
  window.addEventListener('blur', onBlur)

  // Keep audio, box timers and the menu consistent with the store's `paused` flag, whoever set it
  // (this module, the co-op host's tab, or a 'pause' event from the host).
  const unsub = useGameStore.subscribe((st, prev) => {
    if (st.paused !== prev.paused) {
      setAudioHold(st.paused)
      if (st.paused) _pausedAt = performance.now()
      else if (_pausedAt) {
        // Mystery Box phases run on wall-clock `at`: push them forward by the time spent paused.
        const dur = performance.now() - _pausedAt
        _pausedAt = 0
        const box = st.box
        if (box && box.phase !== 'idle' && Number.isFinite(box.at)) {
          useGameStore.setState({ box: { ...box, at: box.at + dur } })
        }
      }
      if (!st.paused && usePauseUi.getState().menu) { clearTimer(); ui({ menu: null, count: 0 }) }
    }
    // A run that ends/moves on (death, restart) must never leave a stale pause behind.
    if (st.phase !== prev.phase && !isActivePhase(st.phase)) {
      clearTimer()
      if (usePauseUi.getState().menu) ui({ menu: null, count: 0 })
      if (st.paused && st.phase !== 'start') useGameStore.setState({ paused: false })
    }
    if (st.mpConnected !== prev.mpConnected && !st.mpConnected) ui({ partnerAway: false })
  })
  return () => {
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pagehide', onHide)
    window.removeEventListener('blur', onBlur)
    unsub()
    _installed = false
  }
}

// ── WebGL context loss ─────────────────────────────────────────────────────────
// Browsers (iOS especially) reclaim the GL context of a backgrounded tab. We keep the run:
// preventDefault() on the loss lets three.js re-create its GPU resources on restore.
const GL_RESTORE_TIMEOUT_MS = 5000
let _glTimer = null

export function handleContextLost() {
  clearTimeout(_glTimer)
  ui({ glLost: true, glFailed: false })
  const st = useGameStore.getState()
  if (isActivePhase(st.phase)) pauseGame(true)
  _glTimer = setTimeout(() => ui({ glFailed: true }), GL_RESTORE_TIMEOUT_MS)
}

export function handleContextRestored(scene) {
  clearTimeout(_glTimer)
  ui({ glLost: false, glFailed: false })
  // three.js re-uploads on the next use; re-flag every texture so canvas textures can't stay blank.
  try {
    scene?.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of mats) {
        for (const k of TEX_KEYS) if (m[k]?.isTexture) m[k].needsUpdate = true
      }
    })
  } catch { /* best effort */ }
}
const TEX_KEYS = ['map', 'emissiveMap', 'alphaMap', 'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'lightMap']
