import { useGameStore } from './store'

let peer = null
let conn = null
let role = null
let roomId = ''
let snapshotTimer = null
let inputTimer = null

function clearTimers() {
  if (snapshotTimer) clearInterval(snapshotTimer)
  if (inputTimer) clearInterval(inputTimer)
  snapshotTimer = null
  inputTimer = null
}

function send(msg) {
  if (conn?.open) conn.send(msg)
}

function handleData(data) {
  if (!data?.type) return
  const store = useGameStore.getState()
  if (data.type === 'input' && role === 'host') {
    store.setRemoteInput(data.payload)
  }
  if (data.type === 'snapshot' && role === 'guest') {
    store.applyHostSnapshot(data.payload)
  }
}

function startHostBroadcast() {
  clearTimers()
  snapshotTimer = setInterval(() => {
    const s = useGameStore.getState()
    send({ type: 'snapshot', payload: s.buildSnapshot() })
  }, 100)
}

function startGuestInput() {
  clearTimers()
  inputTimer = setInterval(() => {
    const s = useGameStore.getState()
    send({ type: 'input', payload: s.guestInput })
  }, 50)
}

export function hostRoom(id) {
  role = 'host'
  roomId = id
  const Peer = window.Peer
  peer = new Peer(id)
  useGameStore.getState().setNetStatus('hosting')
  peer.on('open', () => useGameStore.getState().setNetStatus(`Hosting room: ${id}`))
  peer.on('connection', (c) => {
    conn = c
    conn.on('open', () => {
      useGameStore.getState().setNetStatus('Guest connected')
      startHostBroadcast()
    })
    conn.on('data', handleData)
  })
}

export function joinRoom(id) {
  role = 'guest'
  roomId = id
  const Peer = window.Peer
  peer = new Peer()
  useGameStore.getState().setNetStatus('connecting')
  peer.on('open', () => {
    conn = peer.connect(id)
    conn.on('open', () => {
      useGameStore.getState().setNetStatus(`Connected to ${id}`)
      startGuestInput()
    })
    conn.on('data', handleData)
  })
}

export function disconnectRoom() {
  clearTimers()
  conn?.close()
  peer?.destroy()
  conn = null
  peer = null
  role = null
  roomId = ''
  useGameStore.getState().setNetStatus('offline')
}
