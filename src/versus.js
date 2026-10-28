// Versus foundation (2-player modes): registry, result rules and a tiny message multiplexer
// over net.js. Each player runs their OWN world with the same seed; this module only decides
// what counts as a win and routes `{ kind, data }` messages between the two clients.
import { send, onMessage } from './net'

/** Versus modes that sit beside the default co-op lobby choice. */
export const VERSUS_MODES = {
  mail: { label: 'Zombie Mail' },
}

export const isVersusMode = (id) => Object.prototype.hasOwnProperty.call(VERSUS_MODES, id)

/** Leaderboard rules: only plain and Daily runs submit scores. */
export function scoreSubmittable(runMode) {
  return runMode === 'normal' || runMode === 'daily'
}

/**
 * Two finished runs ({ wave, kills, alive }) -> 'win' | 'lose' | 'draw' for `me`.
 * The one still alive wins; both dead: higher wave, then more kills, else draw.
 */
export function compareResult(me, rival) {
  const meAlive = !!me?.alive
  const rivalAlive = !!rival?.alive
  if (meAlive !== rivalAlive) return meAlive ? 'win' : 'lose'
  if ((me?.wave ?? 0) !== (rival?.wave ?? 0)) return (me?.wave ?? 0) > (rival?.wave ?? 0) ? 'win' : 'lose'
  if ((me?.kills ?? 0) !== (rival?.kills ?? 0)) return (me?.kills ?? 0) > (rival?.kills ?? 0) ? 'win' : 'lose'
  return 'draw'
}

// ── Message multiplexer ──────────────────────────────────────────────────────
// One net listener for type 'versus' dispatches by `kind`. net.js clears its listeners when a
// room is torn down, so the listener is (re)installed idempotently by ensureVersusListener().
const _handlers = new Map()   // kind -> Set<fn>

function dispatch(msg) {
  if (!msg || typeof msg.kind !== 'string') return
  const set = _handlers.get(msg.kind)
  if (!set) return
  for (const fn of [...set]) {
    try { fn(msg.data) } catch (e) { console.error('[versus]', e) }
  }
}

export function ensureVersusListener() { onMessage('versus', dispatch) }

export function sendVersus(kind, data) { send('versus', { kind, data }) }

/** Register a handler for one kind. Returns an unsubscribe function. */
export function onVersus(kind, fn) {
  ensureVersusListener()
  let set = _handlers.get(kind)
  if (!set) { set = new Set(); _handlers.set(kind, set) }
  set.add(fn)
  return () => {
    set.delete(fn)
    if (!set.size) _handlers.delete(kind)
  }
}

/** Test helper. */
export function _resetVersusHandlers() { _handlers.clear() }
