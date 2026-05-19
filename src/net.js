import Peer from 'peerjs'

let _peer = null
let _conn = null
let _role = null
const _listeners = new Map()

export function getRole() { return _role }
export function isConnected() { return _conn?.open === true }

export function onMessage(type, fn) { _listeners.set(type, fn) }
export function offMessage(type) { _listeners.delete(type) }

export function send(type, data) {
  if (!_conn?.open) return
  _conn.send({ type, data })
}

export function createRoom(onCode, onConnected, onDisconnected) {
  _teardown()
  _role = 'host'
  _peer = new Peer()
  _peer.on('error', (err) => console.error('[net]', err))
  _peer.on('open', (id) => {
    onCode(id)
    _peer.on('connection', (conn) => {
      _conn = conn
      _setupConn(onConnected, onDisconnected)
    })
  })
}

export function joinRoom(roomCode, onConnected, onError, onDisconnected) {
  _teardown()
  _role = 'guest'
  _peer = new Peer()
  _peer.on('error', onError)
  _peer.on('open', () => {
    _conn = _peer.connect(roomCode.trim().toLowerCase())
    _setupConn(onConnected, onDisconnected)
    _conn.on('error', onError)
  })
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
  try { _conn?.close() } catch {}
  try { _peer?.destroy() } catch {}
  _conn = null
  _peer = null
  _role = null
  _listeners.clear()
}
