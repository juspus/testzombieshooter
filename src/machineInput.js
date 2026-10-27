// Wave 3: hold-E interaction with the Mystery Box and the Upgrade Bench.
// Called once per frame from Player.jsx; module state (hold timer) is kept here so
// Player.jsx only needs a single call. Prompt text comes from machineAction().
import { useGameStore } from './store'
import { getMap, getInitialMapId } from './maps'
import * as WR from './weaponRules'
import { send, isConnected } from './net'
import { playDoorDenied } from './sounds'

const ANCHORS = getMap(getInitialMapId()).ROOM_ANCHORS ?? {}
const REACH_SQ = 1.9 * 1.9
const HOLD = { buy: 0.6, take: 0.35, upgrade: 0.8 }

export const roleOf = (s) => (s.mpRole === 'guest' ? 'guest' : 'host')   // solo plays as host
export const boxSpot = (room) => ANCHORS[room]?.box ?? null
export const benchRoom = () => (ANCHORS[WR.BENCH_ROOM] ? WR.BENCH_ROOM : 'main')
export const benchSpot = () => ANCHORS[benchRoom()]?.bench ?? null

// What holding E at `kind` does right now. { action, cost, ok, name } | null (nothing to do/show)
//   action: 'buy' | 'take' | 'upgrade' | 'upgraded'(already) ; ok = affordable / allowed
export function machineAction(s, kind) {
  if (kind === 'box') {
    const b = s.box
    if (b.phase === 'idle') return { action: 'buy', cost: WR.BOX_COST, ok: s.money >= WR.BOX_COST }
    if (b.phase === 'ready' && b.payer === roleOf(s) && b.result && b.result !== 'teddy') {
      return { action: 'take', cost: 0, ok: true, name: WR.weaponName(b.result) }
    }
    return null
  }
  if (kind === 'bench') {
    if (s.benchBusy) return null
    if (s.activeItem === 'knife') return null
    if ((s.upgradedWeapons ?? {})[s.weapon]) return { action: 'upgraded', cost: 0, ok: false, name: WR.weaponName(s.weapon, true) }
    return { action: 'upgrade', cost: WR.BENCH_COST, ok: s.money >= WR.BENCH_COST, name: WR.weaponName(s.weapon) }
  }
  return null
}

let hold = 0
let holdKey = null
let denied = false
let cooldown = 0
let latched = false   // after an action, E must be released before the next one (no accidental re-buy)

function netSend(event, data) {
  if (isConnected()) send('game_event', { event, data })
}

export function updateMachines(delta, px, pz, eHeld, blocked) {
  const gs = useGameStore.getState()
  let near = null
  if (!blocked) {
    let best = REACH_SQ
    const b = boxSpot(gs.box.room)
    if (b) { const d = (px - b.x) ** 2 + (pz - b.z) ** 2; if (d < best) { best = d; near = 'box' } }
    const n = benchSpot()
    if (n) { const d = (px - n.x) ** 2 + (pz - n.z) ** 2; if (d < best) { best = d; near = 'bench' } }
  }
  gs.setNearMachine(near)
  if (cooldown > 0) cooldown -= delta

  const act = near ? machineAction(gs, near) : null
  if (!eHeld) latched = false
  const canHold = !!act && eHeld && !latched && cooldown <= 0 && act.action !== 'upgraded'
  if (!canHold) {
    if (!eHeld) denied = false
    if (hold > 0 || holdKey) { hold = 0; holdKey = null; gs.setMachineProgress(0) }
    return
  }
  if (!act.ok) {
    if (!denied) { denied = true; playDoorDenied() }
    return
  }
  const key = near + act.action
  if (holdKey !== key) { holdKey = key; hold = 0 }
  hold += delta
  gs.setMachineProgress(Math.min(hold / HOLD[act.action], 1))
  if (hold < HOLD[act.action]) return
  hold = 0
  holdKey = null
  gs.setMachineProgress(0)
  cooldown = 0.4
  latched = true

  const role = roleOf(gs)
  if (act.action === 'buy') {
    if (role === 'guest' && gs.mpConnected) {
      // Guest: ask the host to roll (authoritative); we pay when the host's box_roll ack arrives.
      netSend('box_request', { held: gs.ownedWeapons })
      cooldown = 1.5
    } else if (gs.buyBox()) {
      netSend('box_roll', { box: useGameStore.getState().box })
    }
  } else if (act.action === 'take') {
    if (gs.takeBox(role)) netSend('box_take', {})
  } else if (act.action === 'upgrade') {
    gs.startUpgrade()
  }
}
