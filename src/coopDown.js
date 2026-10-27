// Wave 5 co-op "Down, not out": pure state machine (no store / net / three imports).
//
// Two players, 'host' and 'guest'. Each is 'alive' | 'down' | 'dead'.
//   alive -> down  when HP hits 0 while the partner is still standing
//   down  -> alive when the partner holds interact in range for REVIVE_TIME (back at 50% HP)
//   down  -> dead  when the BLEED_TIME timer runs out
//   both players not alive (down/dead) -> wipe -> normal game over
// A downed/dead player is healed back to standing when the wave ends (dead = respawn, keeps weapons).
// The host runs this authoritatively and broadcasts snapshots + events (see coopRuntime.js).
// Every function is immutable: returns { coop, events } and never mutates its input.

export const BLEED_TIME = 30          // seconds a downed player has before bleeding out
export const REVIVE_TIME = 3          // seconds the partner must hold interact
export const REVIVE_RANGE = 1.5       // metres (XZ) the reviver must be within
export const REVIVE_HP_FRACTION = 0.5 // revived / up-at-wave-end players return at this fraction of max HP
export const DOWN_SPEED_MULT = 0.3    // crawl speed
export const DOWN_EYE_HEIGHT = 0.5    // camera height while downed

export const ROLES = ['host', 'guest']
export const otherRole = (r) => (r === 'host' ? 'guest' : 'host')

const fresh = () => ({ status: 'alive', bleed: 0, revive: 0 })
export const createCoop = () => ({ host: fresh(), guest: fresh() })

const isUp = (p) => p.status === 'alive'
export const isWipe = (coop) => !isUp(coop.host) && !isUp(coop.guest)

// Solo / unconnected play never goes down: only a connected two-player session does.
export const coopActive = (s) => !!s.mpRole && !!s.mpConnected

// HP hit 0 for `role`. Goes down if the partner is standing; otherwise it is a wipe.
export function goDown(coop, role) {
  if (!coop[role] || coop[role].status !== 'alive') return { coop, events: [] }
  const o = otherRole(role)
  const c = {
    ...coop,
    [role]: { status: 'down', bleed: BLEED_TIME, revive: 0 },
    // whoever this player was reviving loses the progress
    [o]: coop[o].revive ? { ...coop[o], revive: 0 } : coop[o],
  }
  const events = [{ type: 'down', role }]
  if (isWipe(c)) events.push({ type: 'wipe' })
  return { coop: c, events }
}

// The partner of `target` reports revive-hold progress p in 0..1 (0 = released / out of range).
// p >= 1 completes the revive. Ignored unless `target` is down and the reviver is standing.
export function setRevive(coop, target, p) {
  const t = coop[target]
  if (!t || t.status !== 'down') return { coop, events: [] }
  const reviver = coop[otherRole(target)]
  if (!isUp(reviver)) {
    return t.revive ? { coop: { ...coop, [target]: { ...t, revive: 0 } }, events: [] } : { coop, events: [] }
  }
  const prog = Math.max(0, Math.min(1, Number(p) || 0))
  if (prog >= 1) {
    return {
      coop: { ...coop, [target]: fresh() },
      events: [{ type: 'revived', role: target, by: otherRole(target) }],
    }
  }
  if (prog === t.revive) return { coop, events: [] }
  return { coop: { ...coop, [target]: { ...t, revive: prog } }, events: [] }
}

// Advance bleed-out timers. `authoritative:false` (guest display) never kills, it just counts down.
export function tick(coop, dt, authoritative = true) {
  let c = coop
  const events = []
  for (const role of ROLES) {
    const p = c[role]
    if (p.status !== 'down') continue
    const bleed = p.bleed - dt
    if (bleed <= 0 && authoritative) {
      c = { ...c, [role]: { status: 'dead', bleed: 0, revive: 0 } }
      events.push({ type: 'bled_out', role })
    } else {
      c = { ...c, [role]: { ...p, bleed: Math.max(authoritative ? 0 : 0.01, bleed) } }
    }
  }
  if (events.length && isWipe(c)) events.push({ type: 'wipe' })
  return { coop: c, events }
}

// Wave ended: downed players get up (50% HP), dead players respawn (50% HP, keep weapons).
export function waveEnd(coop) {
  const events = []
  let c = coop
  for (const role of ROLES) {
    const p = c[role]
    if (p.status === 'alive') continue
    events.push({ type: 'revived', role, by: null, respawn: p.status === 'dead' })
    c = { ...c, [role]: fresh() }
  }
  return { coop: c, events }
}

export const reviveHp = (maxHp) => Math.max(1, Math.ceil(maxHp * REVIVE_HP_FRACTION))

// The gun a downed player is limited to: the pistol if still carried, else whatever is in hand.
export const sidearmFor = (ownedWeapons, current) => (ownedWeapons.includes('pistol') ? 'pistol' : current)

// Reviver-side hold timer: resets to 0 the moment the hold is interrupted or out of range.
export function stepRevive(progress, holding, inRange, dt) {
  if (!holding || !inRange) return 0
  return Math.min(1, progress + dt / REVIVE_TIME)
}

export const inReviveRange = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2 <= REVIVE_RANGE * REVIVE_RANGE

// Signed angle (rad) of target relative to where the camera looks: 0 = dead ahead, +right.
// Camera forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw).
export function relativeBearing(px, pz, yaw, tx, tz) {
  const dx = tx - px, dz = tz - pz
  const fwd = dx * -Math.sin(yaw) + dz * -Math.cos(yaw)
  const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw)
  return Math.atan2(right, fwd)
}

// ── Invite links ──────────────────────────────────────────────────────────────
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/
export const isValidRoomCode = (c) => typeof c === 'string' && CODE_RE.test(c)
export const buildInviteLink = (origin, code) => `${origin}/?join=${code}`
// Returns { code } (normalised, may be invalid) or null when there is no ?join= param.
export function parseInviteParam(search) {
  const raw = new URLSearchParams(search || '').get('join')
  if (raw == null) return null
  return { code: raw.trim().toUpperCase().slice(0, 12) }
}
