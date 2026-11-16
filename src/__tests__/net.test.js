import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A fake PeerJS: just enough of Peer / DataConnection to drive net.js through a real handshake.
const fake = vi.hoisted(() => {
  class Emitter {
    constructor() { this.h = {} }
    on(ev, fn) { (this.h[ev] ||= []).push(fn); return this }
    emit(ev, ...a) { for (const fn of this.h[ev] || []) fn(...a) }
  }
  class FakeConn extends Emitter {
    constructor(peer) { super(); this.peer = peer; this.open = false; this.sent = []; this.closed = false }
    send(m) { this.sent.push(m) }
    close() { this.closed = true }
  }
  class FakePeer extends Emitter {
    constructor(id) { super(); this.id = id; fake.peers.push(this) }
    connect(code) { const c = new FakeConn(code); fake.conns.push(c); return c }
    destroy() {}
  }
  return { peers: [], conns: [], FakePeer, FakeConn }
})
vi.mock('peerjs', () => ({ default: fake.FakePeer }))

import {
  createRoom, joinRoom, disconnect, send, onMessage, offMessage, getVersionStatus, onVersionStatus,
  getNetLog, _receiveForTests,
} from '../net'
import { PROTOCOL_VERSION, HELLO_TIMEOUT_MS } from '../netProtocol'

const hello = (v) => ({ type: 'hello', data: { v } })

/** Host a room and connect a fake guest conn; returns the conn (open, handshake sent by net.js). */
async function hostWithGuest(cbs = {}) {
  createRoom(() => {}, cbs.onConnected, cbs.onDisconnected)
  await vi.waitFor(() => expect(fake.peers.length).toBeGreaterThan(0))
  const peer = fake.peers.at(-1)
  peer.emit('open')
  const conn = new fake.FakeConn('guest')
  peer.emit('connection', conn)
  conn.open = true
  conn.emit('open')
  return conn
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no api'))))
  fake.peers.length = 0
  fake.conns.length = 0
})
afterEach(() => {
  disconnect()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('onMessage: several listeners per kind', () => {
  it('a second listener no longer replaces the first', async () => {
    const conn = await hostWithGuest()
    conn.emit('data', hello(PROTOCOL_VERSION))
    const a = vi.fn(); const b = vi.fn()
    onMessage('pos', a)
    onMessage('pos', b)
    const pos = { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }
    conn.emit('data', { type: 'pos', data: pos })
    expect(a).toHaveBeenCalledWith(pos)
    expect(b).toHaveBeenCalledWith(pos)
  })

  it('returns an unsubscribe that removes only its own listener', () => {
    const a = vi.fn(); const b = vi.fn()
    const offA = onMessage('powerup_collect', a)
    onMessage('powerup_collect', b)
    offA()
    _receiveForTests({ type: 'powerup_collect', data: { id: 1 } })
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('registering the same function twice is a single listener', () => {
    const a = vi.fn()
    onMessage('powerup_collect', a)
    onMessage('powerup_collect', a)
    _receiveForTests({ type: 'powerup_collect', data: { id: 1 } })
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('offMessage(type) still removes every listener; offMessage(type, fn) just one', () => {
    const a = vi.fn(); const b = vi.fn()
    onMessage('powerup_apply', a)
    onMessage('powerup_apply', b)
    offMessage('powerup_apply', a)
    _receiveForTests({ type: 'powerup_apply', data: { id: 1, type: 'nuke' } })
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
    offMessage('powerup_apply')
    _receiveForTests({ type: 'powerup_apply', data: { id: 1, type: 'nuke' } })
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('a throwing listener does not stop the others or the channel', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = vi.fn(() => { throw new Error('boom') })
    const good = vi.fn()
    onMessage('powerup_collect', bad)
    onMessage('powerup_collect', good)
    expect(() => _receiveForTests({ type: 'powerup_collect', data: { id: 1 } })).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('validation at the door', () => {
  it('drops invalid and unknown messages without throwing or dispatching', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pos = vi.fn(); const ge = vi.fn()
    onMessage('pos', pos)
    onMessage('game_event', ge)
    for (const bad of [
      null, 'x', 42, {}, { type: 'nope', data: {} }, { type: 'pos' }, { type: 'pos', data: { x: 'a' } },
      { type: 'game_event', data: { event: 'wave_start' } },           // missing payload
      { type: 'game_event', data: { event: 'nope', data: {} } },
      { type: 'game_event', data: { event: 'hit_zombie', data: null } },
    ]) expect(() => _receiveForTests(bad)).not.toThrow()
    expect(pos).not.toHaveBeenCalled()
    expect(ge).not.toHaveBeenCalled()
    _receiveForTests({ type: 'game_event', data: { event: 'last_kill', data: {} } })
    expect(ge).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })
})

describe('version handshake', () => {
  it('sends hello with the protocol version as soon as the link opens', async () => {
    const conn = await hostWithGuest()
    expect(conn.sent[0]).toEqual(hello(PROTOCOL_VERSION))
  })

  it('matching versions: status ok and messages flow both ways', async () => {
    const conn = await hostWithGuest()
    expect(getVersionStatus()).toBe('pending')
    conn.emit('data', hello(PROTOCOL_VERSION))
    expect(getVersionStatus()).toBe('ok')
    send('pos', { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 })
    expect(conn.sent.at(-1).type).toBe('pos')
  })

  it('a different version: status mismatch, inbound dropped, outbound blocked, subscribers told', async () => {
    const conn = await hostWithGuest()
    const changed = vi.fn()
    const off = onVersionStatus(changed)
    const got = vi.fn()
    onMessage('powerup_collect', got)
    conn.emit('data', hello(PROTOCOL_VERSION + 1))
    expect(getVersionStatus()).toBe('mismatch')
    expect(changed).toHaveBeenCalledTimes(1)
    conn.emit('data', { type: 'powerup_collect', data: { id: 1 } })
    expect(got).not.toHaveBeenCalled()
    const n = conn.sent.length
    send('pos', { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 })
    expect(conn.sent.length).toBe(n)
    off()
  })

  it('works from the guest side too', async () => {
    joinRoom('ABCDE', () => {}, () => {}, () => {})
    await vi.waitFor(() => expect(fake.peers.length).toBeGreaterThan(0))
    fake.peers.at(-1).emit('open')
    const conn = fake.conns.at(-1)
    conn.open = true
    conn.emit('open')
    expect(conn.sent[0]).toEqual(hello(PROTOCOL_VERSION))
    conn.emit('data', hello(0 + 99))
    expect(getVersionStatus()).toBe('mismatch')
  })

  it('a partner that never says hello (a build from before the handshake) counts as a mismatch', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await hostWithGuest()
    expect(getVersionStatus()).toBe('pending')
    vi.advanceTimersByTime(HELLO_TIMEOUT_MS + 10)
    expect(getVersionStatus()).toBe('mismatch')
  })

  it('a hello that arrives in time cancels the legacy timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const conn = await hostWithGuest()
    conn.emit('data', hello(PROTOCOL_VERSION))
    vi.advanceTimersByTime(HELLO_TIMEOUT_MS * 2)
    expect(getVersionStatus()).toBe('ok')
  })

  it('a new link starts over (pending), and teardown resets the status', async () => {
    const conn = await hostWithGuest()
    conn.emit('data', hello(PROTOCOL_VERSION + 1))
    expect(getVersionStatus()).toBe('mismatch')
    disconnect()
    expect(getVersionStatus()).toBe('pending')
  })
})

describe('dev message log', () => {
  it('records in / out / dropped messages in a bounded ring (window.__netlog in dev)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const conn = await hostWithGuest()
    conn.emit('data', hello(PROTOCOL_VERSION))
    send('game_event', { event: 'last_kill', data: {} })
    _receiveForTests({ type: 'bogus', data: {} })
    const log = getNetLog()
    expect(log.some((e) => e.dir === 'out' && e.type === 'game_event' && e.kind === 'last_kill')).toBe(true)
    expect(log.some((e) => e.dir === 'drop' && e.type === 'bogus')).toBe(true)
    expect(window.__netlog).toBe(log)
    for (let i = 0; i < 400; i++) send('game_event', { event: 'last_kill', data: {} })
    expect(log.length).toBeLessThanOrEqual(200)
    vi.restoreAllMocks()
  })
})
