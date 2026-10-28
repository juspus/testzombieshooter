// Android / Chrome: go fullscreen and lock landscape on the tap that starts a run.
// Both calls are best effort: no-ops on iPhone (no Fullscreen API on documentElement), on desktop
// (never forced there) and wherever the browser refuses. Must run inside a user gesture.
import { isIos } from './installHint'
import { getIsTouchScreen } from './menuTouch'

export function enterRunFullscreen() {
  try {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') return
    if (!getIsTouchScreen()) return
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
