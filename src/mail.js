// Zombie Mail (versus mode): pure rules. Kills fill a meter, the meter buys deliveries that are
// sent to the rival's world. No store / three.js imports so everything here is unit-testable.

export const METER_MAX = 30
export const MAIL_WARN_S = 5      // warning shown this long before a delivery lands
export const MAIL_GAP_S = 4       // at most one delivery per this many seconds

// types: zombie archetype ids from ZOMBIE_ARCHETYPES (store.js); blackout forces the BLACKOUT
// wave modifier (modifiers.js) on the receiver's next wave instead of spawning anything.
export const MAIL_ITEMS = [
  { id: 'brute',     label: 'Brute',     cost: 6,  key: 1, types: ['brute'] },
  { id: 'exploders', label: 'Exploders', cost: 8,  key: 2, types: ['exploder', 'exploder', 'exploder'] },
  { id: 'spitters',  label: 'Spitters',  cost: 10, key: 3, types: ['spitter', 'spitter'] },
  { id: 'horde',     label: 'Horde',     cost: 12, key: 4, types: Array(8).fill('runner') },
  { id: 'blackout',  label: 'Blackout',  cost: 15, key: 5, types: [], modifier: 'blackout' },
]
export const MAIL_IDS = MAIL_ITEMS.map((i) => i.id)

export const mailItem = (id) => MAIL_ITEMS.find((i) => i.id === id) ?? null

// ── Meter ────────────────────────────────────────────────────────────────────
/** Meter gained by one kill: knife 2, headshot 1.5, anything else 1. */
export function meterForKill({ source = 'gun', headshot = false } = {}) {
  if (source === 'knife') return 2
  if (headshot) return 1.5
  return 1
}

export const addMeter = (meter, amount) => Math.min(METER_MAX, Math.max(0, meter + amount))

export function canSend(meter, item) {
  const it = typeof item === 'string' ? mailItem(item) : item
  return !!it && meter >= it.cost
}

/** Meter after paying for `item` (unchanged when it cannot be afforded). */
export function spend(meter, item) {
  const it = typeof item === 'string' ? mailItem(item) : item
  return it && meter >= it.cost ? meter - it.cost : meter
}

// ── Delivery queue (receiving side) ──────────────────────────────────────────
// A queue is a plain array of { id, item, edge, cluster, landAt } plus the time of the last
// landing, kept as { list, lastLandAt }. `now` is the mail clock (seconds, only advances while the
// receiver is live and unpaused). Every entry lands at least MAIL_WARN_S after it arrives and at
// least MAIL_GAP_S after the previous delivery.
export const emptyQueue = () => ({ list: [], lastLandAt: -Infinity })

export function enqueue(q, entry, now) {
  const lastScheduled = q.list.reduce((m, e) => Math.max(m, e.landAt), q.lastLandAt)
  const landAt = Math.max(now + MAIL_WARN_S, lastScheduled + MAIL_GAP_S)
  return { ...q, list: [...q.list, { ...entry, landAt }] }
}

/** The earliest entry whose time has come, or null. */
export function nextDue(q, now) {
  let best = null
  for (const e of q.list) if (e.landAt <= now && (!best || e.landAt < best.landAt)) best = e
  return best
}

/** Remove a landed entry and stamp the landing time. */
export function land(q, id, now) {
  return { list: q.list.filter((e) => e.id !== id), lastLandAt: now }
}

/** The entry to warn about: the earliest not yet landed one inside the warning window. */
export function warning(q, now) {
  let best = null
  for (const e of q.list) if (e.landAt - now <= MAIL_WARN_S && (!best || e.landAt < best.landAt)) best = e
  return best
}

export const EDGE_NAMES = { N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST' }
export const edgeName = (edge) => EDGE_NAMES[edge] ?? 'OUTSIDE'

/** "MAIL: BRUTE · NORTH" (Blackout has no direction). */
export function warningText(entry) {
  const it = mailItem(entry.item)
  if (!it) return ''
  return it.modifier ? `MAIL: ${it.label.toUpperCase()}` : `MAIL: ${it.label.toUpperCase()} · ${edgeName(entry.edge)}`
}
