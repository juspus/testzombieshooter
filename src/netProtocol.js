// The network protocol in one place: every message kind, the shape of its payload and a small
// validator for it. Pure (no store, no net, no three), so it is trivially unit-testable.
//
// Three layers ride the one PeerJS data channel (net.js):
//   1. top-level messages   { type, data }                     NET_TYPES
//   2. co-op game events    { type: 'game_event', data: { event, data } }   GAME_EVENTS
//   3. versus kinds         { type: 'versus', data: { kind, data } }        VERSUS_KINDS
//
// Validators only reject what would crash a receiver or corrupt its state (a missing id, a wrong
// type, a non-object where a field is read). They are deliberately lenient about extra fields and
// about optional ones, because old and new builds of the same protocol version must keep talking.
// An invalid inbound message is dropped by net.js (and logged in dev); it never throws.
//
// Bump PROTOCOL_VERSION when a message changes in a way an older build cannot understand.

/** Protocol version, exchanged in the `hello` handshake on every new link. */
export const PROTOCOL_VERSION = 1

/** How long a new link may stay silent about its version before it counts as a pre-handshake build. */
export const HELLO_TIMEOUT_MS = 2500

/** Shown to both players when the two builds cannot talk. */
export const VERSION_MISMATCH_TEXT = 'Your partner is on a different version. Reload to update.'

// ── Tiny shape helpers ───────────────────────────────────────────────────────────────────
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isStr = (v) => typeof v === 'string'
const isInt = (v) => Number.isInteger(v)
const isId = (v) => (isNum(v) || (isStr(v) && v !== ''))
const optNum = (v) => v === undefined || typeof v === 'number'
const optStr = (v) => v === undefined || v === null || isStr(v)
const optObj = (v) => v === undefined || v === null || isObj(v)
const optBool = (v) => v === undefined || typeof v === 'boolean'
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
const all = (...checks) => (d) => isObj(d) && checks.every((c) => c(d))
const empty = (d) => d === undefined || d === null || isObj(d)   // `{}` payloads: anything harmless

/** A co-op snapshot { host: { status }, guest: { status } } (coopDown.js). */
const isCoop = (c) => isObj(c) && isObj(c.host) && isObj(c.guest) && isStr(c.host.status) && isStr(c.guest.status)
const isCoopEv = (e) => isObj(e) && isStr(e.type)

// ── Layer 2: game_event sub-kinds (co-op) ────────────────────────────────────────────────
// Each entry is the validator for the inner `data`.
export const GAME_EVENTS = {
  // lobby / run flow
  map_hello:        all((d) => isStr(d.map)),
  start_game:       empty,
  versus_mode:      all((d) => isStr(d.mode)),
  versus_start:     all((d) => isStr(d.mode), (d) => isStr(d.seed)),
  next_wave:        all((d) => optStr(d.modifier)),
  wave_start:       all(
    (d) => Array.isArray(d.zombies) && d.zombies.every(isObj),
    (d) => Array.isArray(d.pendingSpawns),
    (d) => isNum(d.nextId), (d) => isNum(d.wave),
    (d) => optNum(d.waveStartPlanks), (d) => optObj(d.openDoors), (d) => optStr(d.modifier), (d) => optObj(d.box),
  ),
  wave_clear:       all((d) => optObj(d.bonuses)),
  last_kill:        empty,
  die:              empty,
  skip_intermission: empty,
  // combat
  hit_zombie:       all((d) => isId(d.id), (d) => optBool(d.isHeadshot), (d) => optStr(d.source), (d) => optStr(d.weapon), (d) => optNum(d.dist), (d) => optNum(d.mult)),
  hit_zombie_flame: all((d) => isId(d.id), (d) => isNum(d.damage)),
  hit_plank:        all((d) => isId(d.windowId)),
  add_plank:        all((d) => isId(d.windowId)),
  // Wave 3 doors and Mystery Box (host-authoritative)
  door_request:     all((d) => isId(d.id)),
  door_open:        all((d) => isId(d.id), (d) => optStr(d.by)),
  door_sync:        all((d) => isObj(d.openDoors)),
  box_request:      all((d) => d.held === undefined || (Array.isArray(d.held) && d.held.every(isStr))),
  box_roll:         all((d) => isObj(d.box)),
  box_take:         empty,
  box_move:         all((d) => isObj(d.box)),
  box_sync:         all((d) => isObj(d.box)),
  // pause / presence
  away:             all((d) => optBool(d.away)),
  pause:            empty,
  resume:           empty,
  // W5 down, not out (coopRuntime.js)
  player_down:      all((d) => d.coop === undefined || isCoop(d.coop), (d) => d.ev === undefined || isCoopEv(d.ev)),
  player_revived:   all((d) => d.coop === undefined || isCoop(d.coop), (d) => d.ev === undefined || isCoopEv(d.ev)),
  player_bled_out:  all((d) => d.coop === undefined || isCoop(d.coop), (d) => d.ev === undefined || isCoopEv(d.ev)),
  revive_progress:  all((d) => optNum(d.p)),
  coop_sync:        all((d) => d.coop === undefined || isCoop(d.coop)),
}

// ── Layer 3: versus kinds ────────────────────────────────────────────────────────────────
// Every run-scoped kind carries the run `seed`; the receivers also drop a seed mismatch.
const seeded = (...checks) => all((d) => isStr(d.seed), ...checks)
export const VERSUS_KINDS = {
  status:     seeded((d) => optNum(d.hp), (d) => optNum(d.maxHp), (d) => optNum(d.wave), (d) => optNum(d.kills), (d) => optNum(d.mail)),
  leave:      seeded(),
  rematch:    empty,
  rematch_go: all((d) => isStr(d.mode), (d) => isStr(d.seed)),
  mail:       seeded((d) => isStr(d.id), (d) => isStr(d.item)),
  // The Director (director.js MSG + dir_ready in directorRuntime.js)
  dir_state:  seeded((d) => isNum(d.round), (d) => optObj(d.player), (d) => d.zombies === undefined || Array.isArray(d.zombies) || isObj(d.zombies)),
  dir_spawn:  seeded((d) => isId(d.id), (d) => isStr(d.type), (d) => isNum(d.cluster)),
  dir_mod:    seeded((d) => isId(d.id), (d) => isStr(d.mod)),
  dir_turn:   seeded((d) => isInt(d.round), (d) => optNum(d.wavesCleared), (d) => optNum(d.damageTaken), (d) => optBool(d.died)),
  dir_next:   seeded((d) => isInt(d.round), (d) => d.defender === 'host' || d.defender === 'guest'),
  dir_ready:  seeded(),
}

// ── Layer 1: top-level types ─────────────────────────────────────────────────────────────
// `game_event` and `versus` are checked in two steps by validateMessage (envelope, then payload).
const XYZ = [(d) => isNum(d.x), (d) => isNum(d.y), (d) => isNum(d.z)]
export const NET_TYPES = {
  hello:           all((d) => isInt(d.v)),
  pos:             all(...XYZ, (d) => isNum(d.yaw), (d) => isNum(d.pitch), (d) => optStr(d.weapon)),
  // { [zombieId]: { x, z, health, dying } }: every entry is read as an object (numbers may be NaN
  // for a zombie that has no position yet, as before).
  zombie_update:   (d) => isObj(d) && Object.values(d).every(isObj),
  game_event:      all((d) => isStr(d.event)),
  grenade_throw:   all(...XYZ, (d) => isNum(d.vx), (d) => isNum(d.vy), (d) => isNum(d.vz), (d) => optNum(d.cook)),
  remote_sound:    all((d) => isStr(d.sound), ...XYZ, (d) => optStr(d.weapon)),
  powerup_spawn:   all((d) => isId(d.id), (d) => isStr(d.type), (d) => isNum(d.x), (d) => isNum(d.z)),
  powerup_apply:   all((d) => isId(d.id), (d) => isStr(d.type)),
  powerup_collect: all((d) => isId(d.id)),
  versus:          all((d) => isStr(d.kind)),
}

/** Every message kind in one flat list: top-level types, game events, versus kinds. */
export const ALL_KINDS = [
  ...Object.keys(NET_TYPES),
  ...Object.keys(GAME_EVENTS).map((e) => `game_event:${e}`),
  ...Object.keys(VERSUS_KINDS).map((k) => `versus:${k}`),
]

const reg = (table, key) => (isStr(key) && has(table, key) ? table[key] : null)

/**
 * Validate one inbound message { type, data } (as received, before dispatch).
 * Returns null when it is fine, otherwise a short reason string (for the dev log).
 */
export function validateMessage(msg) {
  if (!isObj(msg)) return 'not an object'
  const check = reg(NET_TYPES, msg.type)
  if (!check) return `unknown type ${String(msg.type).slice(0, 40)}`
  if (!check(msg.data)) return `bad payload for ${msg.type}`
  if (msg.type === 'game_event') {
    const inner = reg(GAME_EVENTS, msg.data.event)
    if (!inner) return `unknown game_event ${String(msg.data.event).slice(0, 40)}`
    if (!inner(msg.data.data)) return `bad payload for game_event ${msg.data.event}`
  } else if (msg.type === 'versus') {
    const inner = reg(VERSUS_KINDS, msg.data.kind)
    if (!inner) return `unknown versus kind ${String(msg.data.kind).slice(0, 40)}`
    if (!inner(msg.data.data)) return `bad payload for versus ${msg.data.kind}`
  }
  return null
}

// ── Handshake ────────────────────────────────────────────────────────────────────────────
/** The first message each side sends on a new link. */
export const makeHello = (v = PROTOCOL_VERSION) => ({ type: 'hello', data: { v } })

/**
 * Pure version state machine. `peerVersion` is what the partner announced (number), or null while
 * we have not heard yet, or 0 when the hello timed out (a build from before the handshake, e.g.
 * an old service-worker cache).
 */
export function versionStatus(peerVersion, mine = PROTOCOL_VERSION) {
  if (peerVersion === null || peerVersion === undefined) return 'pending'
  return peerVersion === mine ? 'ok' : 'mismatch'
}
