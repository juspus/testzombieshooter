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
const _listeners = new Map()

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

export function onMessage(type, fn) { _listeners.set(type, fn) }
export function offMessage(type) { _listeners.delete(type) }

export function send(type, data) {
  if (!_conn?.open) return
  _conn.send({ type, data })
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

function _setupConn(onConnected, onDisconnected) {
  _conn.on('open', () => onConnected?.())
  _conn.on('data', (msg) => {
    if (!msg?.type) return
    _listeners.get(msg.type)?.(msg.data)
  })
  _conn.on('close', () => onDisconnected?.())
}

function _teardown() {
  _gen++
  try { _conn?.close() } catch {}
  try { _peer?.destroy() } catch {}
  _conn = null
  _peer = null
  _role = null
  _listeners.clear()
}
