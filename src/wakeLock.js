// Screen Wake Lock while a run is live, so the phone does not dim in a long intermission or
// shop visit. Feature-detected; every failure is swallowed.
//   request: a run starts (or resumes / the page becomes visible again while a run is active)
//   release: paused, run over (start / dead), page hidden
import { useGameStore } from './store'

export const RUN_PHASES = ['playing', 'intermission', 'wave_clear']

export function wantsWakeLock({ phase, paused, hidden }) {
  return RUN_PHASES.includes(phase) && !paused && !hidden
}

let sentinel = null
let pending = false

const supported = () => typeof navigator !== 'undefined' && !!navigator.wakeLock?.request
const isHidden = () => typeof document !== 'undefined' && (document.visibilityState === 'hidden' || document.hidden === true)
const wanted = () => {
  const { phase, paused } = useGameStore.getState?.() ?? {}
  return wantsWakeLock({ phase, paused, hidden: isHidden() })
}

async function acquire() {
  if (!supported() || sentinel || pending) return
  pending = true
  try {
    const s = await navigator.wakeLock.request('screen')
    if (!wanted()) { try { await s.release() } catch { /* ignore */ } return }
    sentinel = s
    s.addEventListener?.('release', () => { if (sentinel === s) sentinel = null })
  } catch { /* denied (battery saver, ...): keep playing */ } finally { pending = false }
}

function release() {
  const s = sentinel
  sentinel = null
  if (!s) return
  try { Promise.resolve(s.release()).catch(() => {}) } catch { /* ignore */ }
}

export function syncWakeLock() {
  if (wanted()) acquire()
  else release()
}

let installed = false
export function installWakeLock() {
  if (installed || typeof document === 'undefined') return () => {}
  installed = true
  const unsub = useGameStore.subscribe?.((st, prev) => {
    if (st.phase !== prev.phase || st.paused !== prev.paused) syncWakeLock()
  }) ?? (() => {})
  document.addEventListener('visibilitychange', syncWakeLock)
  window.addEventListener('pagehide', release)
  syncWakeLock()
  return () => {
    unsub()
    document.removeEventListener('visibilitychange', syncWakeLock)
    window.removeEventListener('pagehide', release)
    release()
    installed = false
  }
}
