// Android / Chrome: go fullscreen and lock landscape on the tap that starts a run.
// Both calls are best effort: no-ops on iPhone (no Fullscreen API on documentElement) and wherever
// the browser refuses. Must run inside a user gesture.
// Desktop: grab the mouse (if the click started a run) and go fullscreen (setting), desktopInput.js.
import { isIos } from './installHint'
import { getIsTouchScreen } from './menuTouch'
import { captureMouse } from './desktopInput'
import { useGameStore } from './store'

export function enterRunFullscreen() {
  try {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') return
    if (!getIsTouchScreen()) {
      // Automation (Playwright smoke scripts) clicks menus by position, which a held mouse would
      // turn into virtual-cursor clicks: no auto-capture there unless the URL asks (?capture=1).
      if (navigator.webdriver && new URLSearchParams(window.location.search).get('capture') !== '1') return
      // Callers start the run right after this call. A timeout keeps the click's user activation
      // (about 5 s) and lets us see whether a run really started (a lobby JOIN does not).
      setTimeout(() => {
        const ph = useGameStore.getState().phase
        captureMouse({ lock: ph === 'playing' || ph === 'intermission' }).catch(() => {})
      }, 0)
      return
    }
    if (isIos({ ua: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints })) return
    const el = document.documentElement
    let p
    try {
      if (!document.fullscreenElement && el.requestFullscreen) p = el.requestFullscreen()
    } catch { /* ignore */ }
    const lock = () => {
      try {
        const r = screen.orientation?.lock?.('landscape')
        r?.catch?.(() => {})
      } catch { /* ignore */ }
    }
    if (p && typeof p.then === 'function') p.then(lock, () => {})
    else lock()
  } catch { /* never block starting a run */ }
}
