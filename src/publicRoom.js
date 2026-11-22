// Host side of joining a run in progress (see lateJoin.js): open a solo run as a PeerJS room,
// keep it on the public list (openRuns.js) while nobody is in, and let a guest in at the next
// wave countdown. Loaded on demand from the pause menu (not in the main chunk).
import { useGameStore } from './store'
import { createRoom, disconnect, send, onMessage, isConnected } from './net'
import { PROTOCOL_VERSION } from './netProtocol'
import { publishOpenRun, closeOpenRun, OPEN_RUN_HEARTBEAT_MS } from './openRuns'
import { usePublicRoom, canOpenRoom, isActive } from './lateJoin'

const ui = (p) => usePublicRoom.setState(p)

/** Pure: the host's house at a wave countdown, as join_welcome carries it. */
export function welcomeSnapshot(s) {
  const b = s.box
  return {
    wave: s.wave,
    intermissionLeft: Math.max(1, s.intermissionLeft),
    modifier: s.waveModifier ?? null,
    openDoors: { ...s.openDoors },
    windowPlanks: { ...s.windowPlanks },
    windowPlankStrong: { ...s.windowPlankStrong },
    brokenWindows: { ...s.brokenWindows },
    box: b ? { room: b.room, uses: b.uses, maxUses: b.maxUses, phase: 'idle', result: null, payer: null } : null,
    nextId: s.nextId,
  }
}

let host = null   // { code, secret, beat, offs: [], unsubStore, pending }

function hostListing(on) {
  if (!host?.code) return
  if (on) {
    const s = useGameStore.getState()
    publishOpenRun({ code: host.code, secret: host.secret, map: s.mapId, wave: s.wave, proto: PROTOCOL_VERSION })
      .then((ok) => { if (host) ui({ listed: ok }) })
  } else {
    closeOpenRun(host.code, host.secret)
    ui({ listed: false })
  }
}

function welcomeGuest() {
  if (!host || !isConnected()) return
  host.pending = false
  send('game_event', { event: 'join_welcome', data: welcomeSnapshot(useGameStore.getState()) })
  useGameStore.getState().setMpConnected(true)
  hostListing(false)
  ui({ state: 'joined' })
}

function onHostEvent({ event, data }) {
  if (!host) return
  const s = useGameStore.getState()
  if (event !== 'map_hello' || s.mpConnected) return   // a guest's hello: it wants in
  if (data.map !== s.mapId) { send('game_event', { event: 'join_refuse', data: { reason: 'map' } }); return }
  if (!isActive(s.phase)) { send('game_event', { event: 'join_refuse', data: { reason: 'ended' } }); return }
  if (s.phase === 'intermission') { welcomeGuest(); return }
  if (!host.pending) hostListing(false)   // spoken for: off the list while they wait
  host.pending = true
  send('game_event', { event: 'join_wait', data: { wave: s.wave + 1 } })
  ui({ state: 'waiting' })
}

/** Open the current solo run to the public list. Returns false when this run can't be opened. */
export function openPublicRoom() {
  const s = useGameStore.getState()
  if (host || !canOpenRoom(s)) return false
  host = { code: null, secret: newSecret(), beat: null, offs: [], unsubStore: null, pending: false }
  s.setMpRole('host')
  ui({ state: 'opening', code: null, listed: false })
  createRoom(
    (code) => {
      if (!host) return
      host.code = code
      useGameStore.getState().setMpRole('host', code)
      ui({ state: 'open', code })
      hostListing(true)
      host.beat = setInterval(() => { if (host && usePublicRoom.getState().state === 'open') hostListing(true) }, OPEN_RUN_HEARTBEAT_MS)
    },
    () => { /* link open: wait for join_req */ },
    () => {
      // The partner (or a caller who never got in) left. Mid-run, the room goes back on the list.
      if (!host) return
      host.pending = false
      const st = useGameStore.getState()
      if (st.mpConnected) st.setMpConnected(false)
      if (isActive(st.phase)) { ui({ state: 'open' }); hostListing(true) } else closePublicRoom()
    },
  )
  // net.createRoom tears down old listeners first, so ours go on after it.
  host.offs.push(onMessage('game_event', onHostEvent))
  let prevPhase = s.phase
  host.unsubStore = useGameStore.subscribe((st) => {
    if (st.phase === prevPhase) return
    prevPhase = st.phase
    if (st.phase === 'intermission' && host?.pending) welcomeGuest()
    else if (st.phase === 'dead' || st.phase === 'start') {
      // The run is over: a joined partner carries on through the normal co-op flow; an empty room closes.
      if (st.mpConnected) { hostListing(false); return }
      if (host?.pending) send('game_event', { event: 'join_refuse', data: { reason: 'ended' } })
      closePublicRoom()
    }
  })
  return true
}

/** Close the room and the listing (host). A joined partner is dropped. */
export function closePublicRoom() {
  if (!host) return
  const h = host
  host = null
  clearInterval(h.beat)
  for (const off of h.offs) off()
  h.unsubStore?.()
  if (h.code) closeOpenRun(h.code, h.secret)
  disconnect()
  useGameStore.getState().clearMp()
  ui({ state: 'closed', code: null, listed: false })
}

function newSecret() {
  try { return crypto.randomUUID() } catch {
    return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16))
  }
}

if (import.meta.hot) import.meta.hot.dispose(() => { closePublicRoom() })
