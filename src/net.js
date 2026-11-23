import { validateMessage, makeHello, versionStatus, HELLO_TIMEOUT_MS, PROTOCOL_VERSION } from './netProtocol'

// PeerJS is a dynamic import: it is only fetched when someone hosts or joins.
// The Peer is created asynchronously, so each call carries a generation token and a stale
// (torn-down or superseded) creation is discarded.
const STUN_DEFAULT = { urls: 'stun:stun.l.google.com:19302' }
const TURN_TIMEOUT_MS = 1500

/**
 * Pure: merge the /api/turn response into PeerJS peer options.
 * Returns undefined (use PeerJS defaults, today's behaviour) unless there is at least
 * one usable entry. STUN stays first so direct paths are still preferred.
 */
export function buildPeerOptions(turn) {
  const list = Array.isArray(turn?.iceServers) ? turn.iceServers : []
  const extra = list.filter((s) => s && (typeof s.urls === 'string' || (Array.isArray(s.urls) && s.urls.length)))
  if (!extra.length) return undefined
  return { config: { iceServers: [STUN_DEFAULT, ...extra] } }
}

let _optsPromise = null
/** Fetch /api/turn once per page load; never rejects; silent on failure. */
export function getPeerOptions() {
  if (_optsPromise) return _optsPromise
  _optsPromise = (async () => {
    let timer
    try {
      const ctl = new AbortController()
      timer = setTimeout(() => ctl.abort(), TURN_TIMEOUT_MS)
      const res = await fetch('/api/turn', { signal: ctl.signal })
      if (!res.ok) return undefined
      return buildPeerOptions(await res.json())
    } catch { return undefined } finally { clearTimeout(timer) }
  })()
  return _optsPromise
}

// Dev/preview only: ?peer=local signals through a PeerJS server on 127.0.0.1:9000
// (`npx peerjs --port 9000 --host 127.0.0.1`), for two-browser tests where the public PeerJS cloud is unreachable.
function localPeerOptions() {
  if (typeof window === 'undefined' || import.meta.env.VITE_VERCEL_ENV === 'production') return null
  if (new URLSearchParams(window.location.search).get('peer') !== 'local') return null
  return { host: '127.0.0.1', port: 9000, path: '/', secure: false, config: { iceServers: [] } }
}

let _gen = 0
async function _makePeer(id) {
  const [{ default: Peer }, turnOpts] = await Promise.all([import('peerjs'), getPeerOptions()])
  const opts = localPeerOptions() ?? turnOpts
  return opts ? (id ? new Peer(id, opts) : new Peer(opts)) : (id ? new Peer(id) : new Peer())
}

let _peer = null
let _conn = null
let _role = null
const _listeners = new Map()   // type -> Set<fn>: several listeners per kind are allowed

// ── Handshake state (netProtocol.js) ─────────────────────────────────────────────────
// null = partner's version not heard yet; a number = what it announced; 0 = it never said
// (a build from before the handshake, e.g. an old service-worker cache).
let _peerVersion = null
let _helloTimer = null
// Dev / preview only: ?protocol=N pretends this build speaks protocol N (to test the mismatch message).
const MY_VERSION = (() => {
  try {
    if (import.meta.env.VITE_VERCEL_ENV === 'production' || typeof window === 'undefined') return PROTOCOL_VERSION
    const n = Number(new URLSearchParams(window.location.search).get('protocol'))
    return Number.isInteger(n) && n > 0 ? n : PROTOCOL_VERSION
  } catch { return PROTOCOL_VERSION }
})()
const _statusFns = new Set()

/** 'pending' | 'ok' | 'mismatch' for the current link. */
export function getVersionStatus() { return versionStatus(_peerVersion, MY_VERSION) }
/** Subscribe to version status changes (shaped for useSyncExternalStore). Returns an unsubscribe. */
export function onVersionStatus(fn) {
  _statusFns.add(fn)
  return () => { _statusFns.delete(fn) }
}
function _setPeerVersion(v) {
  const before = getVersionStatus()
  _peerVersion = v
  if (getVersionStatus() !== before) for (const fn of [..._statusFns]) { try { fn() } catch { /* ignore */ } }
}

// ── Dev-only message log: window.__netlog (never in production builds) ───────────────
// The constant is replaced at build time, so the whole block is dropped from production.
const LOG_ON = import.meta.env.VITE_VERCEL_ENV !== 'production'
const NETLOG_MAX = 200
const _netlog = []
let _warned = 0
if (LOG_ON && typeof window !== 'undefined') window.__netlog = _netlog
function _log(dir, msg, note) {
  if (!LOG_ON) return
  const e = { t: Math.round(performance.now()), dir, type: msg?.type }
  if (msg?.type === 'game_event') e.kind = msg.data?.event
  else if (msg?.type === 'versus') e.kind = msg.data?.kind
  const hot = msg?.type === 'pos' || msg?.type === 'zombie_update' || e.kind === 'dir_state' || e.kind === 'coop_sync'
  if (!hot) e.data = msg?.type === 'game_event' || msg?.type === 'versus' ? msg.data?.data : msg?.data
  if (note) e.note = note
  _netlog.push(e)
  if (_netlog.length > NETLOG_MAX) _netlog.shift()
}
function _warn(what, reason) {
  if (!LOG_ON || _warned >= 20) return
  _warned++
  try { console.warn(`[net] ${what}: ${reason}${_warned === 20 ? ' (further warnings muted)' : ''}`) } catch { /* ignore */ }
}
/** Dev only: the recent message ring buffer ([] in production). */
export function getNetLog() { return _netlog }

// Unambiguous alphabet: no 0/O, 1/I/L
const _CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function _roomCode() {
  let c = ''
  for (let i = 0; i < 5; i++) c += _CHARS[Math.floor(Math.random() * _CHARS.length)]
  return c
}

export function getRole() { return _role }
export function isConnected() { return _conn?.open === true }
export function getPeer() { return _peer }
export function getRemotePeerId() { return _conn?.peer ?? null }

/**
 * Listen for one message type. Any number of listeners per type; registering the same function
 * twice is a no-op. Returns an unsubscribe function.
 */
export function onMessage(type, fn) {
  let set = _listeners.get(type)
  if (!set) { set = new Set(); _listeners.set(type, set) }
  set.add(fn)
  return () => {
    set.delete(fn)
    if (!set.size && _listeners.get(type) === set) _listeners.delete(type)
  }
}
/** Remove one listener, or (no `fn`) every listener of the type. */
export function offMessage(type, fn) {
  if (!fn) { _listeners.delete(type); return }
  const set = _listeners.get(type)
  if (!set) return
  set.delete(fn)
  if (!set.size) _listeners.delete(type)
}

export function send(type, data) {
  if (!_conn?.open) return
  // Two builds that cannot talk must not half-talk: nothing but the handshake goes out.
  if (_peerVersion !== null && getVersionStatus() === 'mismatch') return
  const msg = { type, data }
  if (LOG_ON) {
    const bad = validateMessage(msg)
    if (bad) _warn('sending a message the partner will drop', bad)
    _log('out', msg)
  }
  _conn.send(msg)
}

export function createRoom(onCode, onConnected, onDisconnected) {
  _teardown()
  _role = 'host'
  const code = _roomCode()
  const gen = _gen
  _makePeer(code).then((peer) => {
    if (gen !== _gen) { try { peer.destroy() } catch {} return }
    _peer = peer
    peer.on('error', (err) => console.error('[net]', err))
    peer.on('open', () => {
      onCode(code)
      peer.on('connection', (conn) => {
        // Two players only: while a partner is linked, a second caller (a public room is listed
        // for anyone) is turned away instead of replacing the partner's link.
        if (_conn?.open) { try { conn.on('open', () => conn.close()) } catch { /* ignore */ } return }
        _conn = conn
        _setupConn(onConnected, onDisconnected)
      })
    })
  }, (err) => { if (gen === _gen) console.error('[net]', err) })
}

export function joinRoom(roomCode, onConnected, onError, onDisconnected) {
  _teardown()
  _role = 'guest'
  const gen = _gen
  _makePeer().then((peer) => {
    if (gen !== _gen) { try { peer.destroy() } catch {} return }
    _peer = peer
    peer.on('error', onError)
    peer.on('open', () => {
      _conn = peer.connect(roomCode.trim().toUpperCase())
      _setupConn(onConnected, onDisconnected)
      _conn.on('error', onError)
    })
  }, (err) => { if (gen === _gen) onError?.(err) })
}

export function disconnect() {
  _teardown()
}

/** One inbound message: validate, handle the handshake, then fan out to the listeners. */
function _receive(msg) {
  const bad = validateMessage(msg)
  if (bad) { _warn('dropped', bad); _log('drop', msg, bad); return }
  if (msg.type === 'hello') {
    _log('in', msg)
    _setPeerVersion(msg.data.v)
    return
  }
  if (getVersionStatus() === 'mismatch') return
  _log('in', msg)
  const set = _listeners.get(msg.type)
  if (!set) return
  for (const fn of set) {
    try { fn(msg.data) } catch (e) { console.error('[net]', msg.type, e) }
  }
}
/** Test hook: feed an inbound message as if the data channel had delivered it. */
export function _receiveForTests(msg) { _receive(msg) }

function _setupConn(onConnected, onDisconnected) {
  const conn = _conn
  clearTimeout(_helloTimer)
  _setPeerVersion(null)
  conn.on('open', () => {
    if (conn !== _conn) return
    const hi = makeHello(MY_VERSION)
    _log('out', hi)
    try { conn.send(hi) } catch { /* ignore */ }
    // No hello soon after the link opens: the partner runs a build from before the handshake.
    clearTimeout(_helloTimer)
    _helloTimer = setTimeout(() => { if (conn === _conn && _peerVersion === null) _setPeerVersion(0) }, HELLO_TIMEOUT_MS)
    onConnected?.()
  })
  conn.on('data', (msg) => { if (conn === _conn) _receive(msg) })
  conn.on('close', () => onDisconnected?.())
}

function _teardown() {
  _gen++
  clearTimeout(_helloTimer)
  _setPeerVersion(null)
  try { _conn?.close() } catch {}
  try { _peer?.destroy() } catch {}
  _conn = null
  _peer = null
  _role = null
  _listeners.clear()
}
