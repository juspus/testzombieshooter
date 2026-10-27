// Tiny gameplay event bus for Wave 4 progression (challenges, achievements, XP).
// The store calls emitGameEvent() at a handful of choke points; nothing else in the
// game needs to know about progression. No imports -> safe from any module.

const subs = new Set()
let remote = false

export function onGameEvent(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

/** evt.name: kill | plank | door_open | powerup | box_take | upgrade | run_start (+ derived ones in the tracker). */
export function emitGameEvent(name, data) {
  const evt = data ? { ...data, name, remote } : { name, remote }
  for (const fn of subs) {
    try { fn(evt) } catch (err) { console.warn('[progress] listener failed', err) }
  }
}

/** Run `fn` marking emitted events as coming from the co-op partner (the tracker ignores them). */
export function withRemoteSource(fn) {
  remote = true
  try { return fn() } finally { remote = false }
}

// ── Toasts (challenge / achievement / level) ────────────────────────────────
const toastSubs = new Set()
export const onToast = (fn) => { toastSubs.add(fn); return () => toastSubs.delete(fn) }
/** kind: 'challenge' | 'achievement' | 'level' */
export function pushToast(kind, title, sub = '') {
  for (const fn of toastSubs) {
    try { fn({ kind, title, sub }) } catch { /* ignore */ }
  }
}
