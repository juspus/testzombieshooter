import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  PROTOCOL_VERSION, NET_TYPES, GAME_EVENTS, VERSUS_KINDS, ALL_KINDS, validateMessage, makeHello, versionStatus,
} from '../netProtocol'
import { MSG } from '../director'

const ge = (event, data) => ({ type: 'game_event', data: { event, data } })
const vs = (kind, data) => ({ type: 'versus', data: { kind, data } })

describe('netProtocol: the list', () => {
  it('lists every kind (about 45+) with a validator function', () => {
    expect(ALL_KINDS.length).toBeGreaterThanOrEqual(45)
    for (const t of [NET_TYPES, GAME_EVENTS, VERSUS_KINDS]) for (const v of Object.values(t)) expect(typeof v).toBe('function')
  })

  it('knows every director message from director.js', () => {
    for (const k of Object.values(MSG)) expect(VERSUS_KINDS).toHaveProperty(k)
    expect(VERSUS_KINDS).toHaveProperty('dir_ready')
  })

  // Drift guard: a message added to the code without being registered here would be dropped by every
  // receiver, silently. Scan the sources for literal kinds and require each to be listed.
  const SRC = path.resolve(__dirname, '..')
  const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8')
  const FILES = [
    'components/NetManager.jsx', 'components/Player.jsx', 'player/usePlayerInput.js', 'player/usePlayerFiring.js',
    'player/usePlayerInteraction.js', 'player/usePlayerMovement.js', 'player/constants.js', 'player/fireContext.js',
    'components/Zombie.jsx', 'components/Grenades.jsx',
    'components/Bolts.jsx', 'components/Machines.jsx', 'components/PowerUps.jsx', 'components/Screens.jsx',
    'components/VersusNet.jsx', 'components/DirectorView.jsx', 'machineInput.js', 'pause.js', 'coopRuntime.js',
    'mailRuntime.js', 'directorRuntime.js', 'versusRematch.js',
  ]
  const found = (re) => FILES.flatMap((f) => [...read(f).matchAll(re)].map((m) => m[1]))

  it('every game_event the code sends or handles is registered', () => {
    const names = new Set([
      ...found(/send\('game_event',\s*\{\s*event:\s*'(\w+)'/g),
      ...found(/(?:netSend|netEvent|netEv|relay)\('(\w+)'/g),
    ])
    // the switch in NetManager.applyRemoteEvent
    const mgr = read('components/NetManager.jsx')
    const body = mgr.slice(mgr.indexOf('function applyRemoteEvent'))
    for (const m of body.matchAll(/case '(\w+)':/g)) names.add(m[1])
    expect(names.size).toBeGreaterThan(20)
    for (const n of names) expect(GAME_EVENTS, `game_event ${n}`).toHaveProperty(n)
  })

  it('every versus kind the code sends or listens for is registered', () => {
    const kinds = new Set([
      ...found(/sendVersus\('(\w+)'/g),
      ...found(/onVersus\('(\w+)'/g),
      ...found(/sendVersus\(READY/g).map(() => 'dir_ready'),
    ])
    for (const k of kinds) expect(VERSUS_KINDS, `versus kind ${k}`).toHaveProperty(k)
  })

  it('every top-level type the code sends or listens for is registered', () => {
    const types = new Set([
      ...found(/\bsend\('(\w+)'/g),
      ...found(/\bonMessage\('(\w+)'/g),
    ])
    expect(types.size).toBeGreaterThan(5)
    for (const t of types) expect(NET_TYPES, `type ${t}`).toHaveProperty(t)
  })
})

describe('validateMessage', () => {
  const pos = { x: 1, y: 1.6, z: -2, yaw: 0.5, pitch: 0, weapon: 'pistol' }
  it('accepts well-formed messages of every top-level type', () => {
    expect(validateMessage(makeHello())).toBeNull()
    expect(validateMessage({ type: 'pos', data: pos })).toBeNull()
    expect(validateMessage({ type: 'zombie_update', data: { 1: { x: 1, z: 2, health: 3, dying: false }, 2: { x: 0, z: 0, health: 0, dying: true } } })).toBeNull()
    expect(validateMessage({ type: 'grenade_throw', data: { x: 0, y: 1, z: 0, vx: 1, vy: 2, vz: 3, cook: 0.5 } })).toBeNull()
    expect(validateMessage({ type: 'remote_sound', data: { sound: 'gunshot', weapon: 'ak47', up: false, x: 0, y: 1, z: 0 } })).toBeNull()
    expect(validateMessage({ type: 'powerup_spawn', data: { id: 3, type: 'nuke', x: 1, z: 1 } })).toBeNull()
    expect(validateMessage({ type: 'powerup_apply', data: { id: 3, type: 'nuke' } })).toBeNull()
    expect(validateMessage({ type: 'powerup_collect', data: { id: 3 } })).toBeNull()
  })

  it('rejects non-objects, unknown types and malformed payloads with a reason', () => {
    for (const m of [undefined, null, 5, 'pos', [], {}, { type: 5 }, { type: 'toString', data: {} }, { type: '__proto__', data: {} }]) {
      expect(typeof validateMessage(m)).toBe('string')
    }
    expect(validateMessage({ type: 'pos', data: { ...pos, x: NaN } })).toMatch(/bad payload/)
    expect(validateMessage({ type: 'pos', data: { ...pos, y: '1' } })).toMatch(/bad payload/)
    expect(validateMessage({ type: 'pos' })).toMatch(/bad payload/)
    expect(validateMessage({ type: 'zombie_update', data: { 1: null } })).toMatch(/bad payload/)
    expect(validateMessage({ type: 'zombie_update', data: [] })).toMatch(/bad payload/)
    expect(validateMessage({ type: 'hello', data: { v: '1' } })).toMatch(/bad payload/)
    expect(validateMessage({ type: 'powerup_collect', data: {} })).toMatch(/bad payload/)
  })

  it('game_event: known events with their payload shape', () => {
    expect(validateMessage(ge('last_kill', {}))).toBeNull()
    expect(validateMessage(ge('hit_zombie', { id: 4, isHeadshot: true, source: 'gun', mult: 1, px: 1, weapon: 'deagle', dist: 3.2 }))).toBeNull()
    expect(validateMessage(ge('hit_plank', { windowId: 'w1' }))).toBeNull()
    expect(validateMessage(ge('door_open', { id: 'kitchen', by: 'guest' }))).toBeNull()
    expect(validateMessage(ge('box_request', { held: ['pistol'] }))).toBeNull()
    expect(validateMessage(ge('wave_start', { zombies: [{ id: 1 }], pendingSpawns: [], nextId: 2, wave: 1, modifier: null, openDoors: {}, box: {} }))).toBeNull()
    expect(validateMessage(ge('wave_clear', { bonuses: null }))).toBeNull()
    expect(validateMessage(ge('coop_sync', { coop: { host: { status: 'alive' }, guest: { status: 'down' } } }))).toBeNull()
    expect(validateMessage(ge('player_down', {}))).toBeNull()
    expect(validateMessage(ge('revive_progress', { p: 0.4 }))).toBeNull()
  })

  it('game_event: unknown events and bad payloads are rejected', () => {
    expect(validateMessage(ge('format_disk', {}))).toMatch(/unknown game_event/)
    expect(validateMessage(ge('constructor', {}))).toMatch(/unknown game_event/)
    expect(validateMessage({ type: 'game_event', data: { data: {} } })).toMatch(/bad payload/)
    expect(validateMessage(ge('hit_zombie', {}))).toMatch(/bad payload/)
    expect(validateMessage(ge('hit_zombie', undefined))).toMatch(/bad payload/)
    expect(validateMessage(ge('hit_zombie', { id: {} }))).toMatch(/bad payload/)
    expect(validateMessage(ge('wave_start', { zombies: 'x', pendingSpawns: [], nextId: 1, wave: 1 }))).toMatch(/bad payload/)
    expect(validateMessage(ge('door_sync', { openDoors: 'all' }))).toMatch(/bad payload/)
    expect(validateMessage(ge('box_roll', {}))).toMatch(/bad payload/)
    expect(validateMessage(ge('coop_sync', { coop: { host: {}, guest: {} } }))).toMatch(/bad payload/)
    expect(validateMessage(ge('player_down', { ev: 'down' }))).toMatch(/bad payload/)
    expect(validateMessage(ge('versus_start', { mode: 'mail' }))).toMatch(/bad payload/)
  })

  it('versus: known kinds carry a seed; unknown kinds and bad payloads are rejected', () => {
    expect(validateMessage(vs('status', { seed: 's', hp: 50, maxHp: 100, wave: 2, kills: 4, alive: true, mail: 1 }))).toBeNull()
    expect(validateMessage(vs('mail', { seed: 's', id: 'm1', item: 'horde' }))).toBeNull()
    expect(validateMessage(vs('leave', { seed: 's' }))).toBeNull()
    expect(validateMessage(vs('rematch', {}))).toBeNull()
    expect(validateMessage(vs('rematch_go', { mode: 'mail', seed: 's' }))).toBeNull()
    expect(validateMessage(vs('dir_spawn', { seed: 's', id: 's:1', type: 'walker', cluster: 3 }))).toBeNull()
    expect(validateMessage(vs('dir_mod', { seed: 's', id: 's:m1', mod: 'fog' }))).toBeNull()
    expect(validateMessage(vs('dir_turn', { seed: 's', round: 1, wavesCleared: 3, damageTaken: 10, died: false }))).toBeNull()
    expect(validateMessage(vs('dir_next', { seed: 's', round: 2, defender: 'guest' }))).toBeNull()
    expect(validateMessage(vs('dir_ready', { seed: 's' }))).toBeNull()
    expect(validateMessage(vs('dir_state', { seed: 's', round: 1, zombies: [], player: { x: 0, z: 0, yaw: 0 } }))).toBeNull()

    expect(validateMessage(vs('mail', { id: 'm1', item: 'horde' }))).toMatch(/bad payload/)        // no seed
    expect(validateMessage(vs('dir_next', { seed: 's', round: 1, defender: 'me' }))).toMatch(/bad payload/)
    expect(validateMessage(vs('dir_spawn', { seed: 's', type: 'walker', cluster: 3 }))).toMatch(/bad payload/)
    expect(validateMessage(vs('dir_turn', { seed: 's', round: 1.5 }))).toMatch(/bad payload/)
    expect(validateMessage(vs('hack', { seed: 's' }))).toMatch(/unknown versus kind/)
    expect(validateMessage({ type: 'versus', data: { data: {} } })).toMatch(/bad payload/)
  })
})

describe('handshake helpers', () => {
  it('hello carries the protocol version', () => {
    expect(makeHello()).toEqual({ type: 'hello', data: { v: PROTOCOL_VERSION } })
  })
  it('versionStatus: pending until heard, ok on a match, mismatch otherwise (0 = pre-handshake build)', () => {
    expect(versionStatus(null)).toBe('pending')
    expect(versionStatus(undefined)).toBe('pending')
    expect(versionStatus(PROTOCOL_VERSION)).toBe('ok')
    expect(versionStatus(PROTOCOL_VERSION + 1)).toBe('mismatch')
    expect(versionStatus(0)).toBe('mismatch')
  })
})
