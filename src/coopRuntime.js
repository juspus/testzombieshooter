// Wave 5 co-op "Down, not out": glue between the pure state machine (coopDown.js), the store
// and the network. The HOST owns the machine and broadcasts; the GUEST sends requests
// (`player_down`, `revive_progress`) and mirrors host snapshots. Each client applies the local
// side effects (HP, weapon lock) for events that concern its own player.
//
// Net messages (all over the existing `game_event` channel):
//   guest -> host : player_down {}                      my HP hit 0
//                   revive_progress { p }               I'm holding revive on you (0 = released, 1 = done)
//   host  -> guest: player_down | player_revived | player_bled_out  { ev, coop }
//                   coop_sync { coop }                  periodic snapshot (bleed timers / revive ring)
// A wipe (both players not standing) ends the run through the existing `die` flow.
import { useGameStore, setSelfZeroHook } from './store'
import { send, isConnected } from './net'
import { track } from './analytics'
import * as C from './coopDown'

const NET_NAME = { down: 'player_down', revived: 'player_revived', bled_out: 'player_bled_out' }
const SIDEARM_MIN_RESERVE = 20   // a downed player always has something to shoot with

const getS = () => useGameStore.getState()
const relay = (event, data) => { if (isConnected()) send('game_event', { event, data }) }

// Local consequences of one machine event for THIS client.
export function applyEvent(ev) {
  const st = getS()
  const me = st.mpRole
  if (ev.type === 'wipe') { st.die(); return }
  if (ev.role !== me) {
    // partner events: only the reviver's progression hook cares
    if (ev.type === 'revived' && ev.by === me) {
      useGameStore.setState({ revivedPartnerEventId: st.revivedPartnerEventId + 1, coopReviveProgress: 0 })
      track('revive', { wave: st.wave })
    }
    return
  }
  if (ev.type === 'down') {
    // Limited to the sidearm: pistol if carried (upgrade flag stays on the weapon), else what's in hand.
    st.switchWeapon(C.sidearmFor(st.ownedWeapons, st.weapon), { force: true })
    const s2 = getS()
    const patch = { hp: 0, activeItem: 'gun', shopOpen: false, isReloading: false, coopReviveProgress: 0 }
    if (s2.reserveBullets < SIDEARM_MIN_RESERVE && s2.weapon === 'pistol') patch.reserveBullets = SIDEARM_MIN_RESERVE
    useGameStore.setState(patch)
  } else if (ev.type === 'revived') {
    useGameStore.setState({
      hp: C.reviveHp(st.maxHp),
      ...(ev.by ? { revivedByPartnerEventId: st.revivedByPartnerEventId + 1 } : {}),
    })
  }
}

// Store the new snapshot, run local effects, and (host only) tell the guest.
function commit(res, broadcast) {
  const prev = getS().coop
  if (res.coop !== prev) useGameStore.setState({ coop: res.coop })
  for (const ev of res.events) {
    applyEvent(ev)
    if (broadcast && NET_NAME[ev.type]) relay(NET_NAME[ev.type], { ev, coop: res.coop })
  }
  // Revive-ring changes with no event still need to reach the downed guest right away
  if (broadcast && !res.events.length && res.coop !== prev) relay('coop_sync', { coop: res.coop })
}

// ── Local player hit 0 HP (registered as the store's self-zero hook) ──────────────────────
function onSelfZero() {
  const st = getS()
  const res = C.goDown(st.coop, st.mpRole)
  if (st.mpRole === 'host') commit(res, true)
  else { commit(res, false); relay('player_down', {}) }
}
setSelfZeroHook(onSelfZero)

// ── Reviver side (Player.jsx): report my hold progress on the partner ─────────────────────
export function reportRevive(p) {
  const st = getS()
  if (!C.coopActive(st)) return
  if (st.mpRole === 'host') commit(C.setRevive(st.coop, 'guest', p), true)
  else relay('revive_progress', { p })
}

// ── Per-frame timers (NetManager useFrame) ──────────────────────────────────────────────
let acc = 0
let syncAcc = 0
export function tickCoop(delta) {
  const st = getS()
  if (!C.coopActive(st) || st.phase !== 'playing' || st.paused) return
  const anyDown = st.coop.host.status === 'down' || st.coop.guest.status === 'down'
  if (!anyDown) { acc = 0; syncAcc = 0; return }
  acc += delta
  if (acc < 0.1) return
  const dt = acc
  acc = 0
  if (st.mpRole === 'host') {
    commit(C.tick(st.coop, dt, true), true)
    syncAcc += dt
    if (syncAcc >= 0.25) { syncAcc = 0; relay('coop_sync', { coop: getS().coop }) }
  } else {
    commit(C.tick(st.coop, dt, false), false)   // display-only countdown between host snapshots
  }
}

// Host: wave over -> downed players stand, dead players respawn (50% HP, weapons kept).
export function coopWaveEnd() {
  const st = getS()
  if (st.mpRole !== 'host' || !C.coopActive(st)) return
  commit(C.waveEnd(st.coop), true)
}

// Partner left (or we reset): nobody can revive anyone any more.
export function coopDisconnected() {
  const st = getS()
  const wasDowned = !!st.mpRole && st.coop[st.mpRole].status !== 'alive'
  useGameStore.setState({ coop: C.createCoop(), coopReviveProgress: 0 })
  if (wasDowned && st.phase === 'playing') st.die()
}

// ── Incoming net events (called from NetManager.applyRemoteEvent) ────────────────────────
export function handleCoopEvent(event, data) {
  const st = getS()
  if (st.mpRole === 'host') {
    if (event === 'player_down') commit(C.goDown(st.coop, 'guest'), true)
    else if (event === 'revive_progress') commit(C.setRevive(st.coop, 'host', data?.p), true)
    return true
  }
  if (event === 'player_down' || event === 'player_revived' || event === 'player_bled_out') {
    if (data?.coop) useGameStore.setState({ coop: data.coop })
    if (data?.ev) applyEvent(data.ev)
    return true
  }
  if (event === 'coop_sync') {
    if (data?.coop) useGameStore.setState({ coop: data.coop })
    return true
  }
  return false
}

export const COOP_EVENTS = ['player_down', 'revive_progress', 'player_revived', 'player_bled_out', 'coop_sync']
