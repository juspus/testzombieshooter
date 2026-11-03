// The Director wiring: incoming messages -> store actions, the defender's 8 Hz dir_state, the
// dir_turn report when a turn ends, and the host's turn changes (dir_next). Every message carries
// the run seed and is dropped on a mismatch; every store action is idempotent.
import { useGameStore } from './store'
import { isConnected } from './net'
import { sendVersus, onVersus } from './versus'
import { MSG, DIRECTOR } from './director'
import { turnAt, BETWEEN_S, buildDirectorState, activeIndices } from './directorFlow'
import { viewState } from './viewState'
import { getZombiePositions } from './components/Zombie'
import { getMap, getInitialMapId } from './maps'

const MAP = getMap(getInitialMapId())
const READY = 'dir_ready'

const st = () => useGameStore.getState()
const mine = (d) => !!d && typeof d === 'object' && d.seed === st().versus.seed && st().director.active

/** Local player pressed Ready on the between-turns card. */
export function readyUp() {
  const s = st()
  if (!s.director.active || s.director.stage !== 'between' || s.director.ready.me) return false
  s.setDirectorReady('me')
  if (isConnected()) sendVersus(READY, { seed: s.versus.seed })
  return true
}

function sendState() {
  const s = st()
  const d = s.director
  if (!d.active || d.role !== 'defender' || d.stage !== 'turn' || !isConnected()) return
  const all = MAP.SPAWN_CLUSTERS
  const active = activeIndices(all, MAP.activeSpawnClusters ? MAP.activeSpawnClusters(s.openDoors) : all)
  sendVersus(MSG.STATE, buildDirectorState(s, getZombiePositions(), viewState, active))
}

// Host: leave the between-turns card after BETWEEN_S, or as soon as both players are ready.
function hostAdvance() {
  const s = st()
  const d = s.director
  if (!d.active || d.side !== 'host' || d.stage !== 'between' || d.result || !isConnected()) return
  const due = Date.now() - d.betweenAt >= BETWEEN_S * 1000 || (d.ready.me && d.ready.rival)
  if (!due) return
  const next = turnAt(d.turn + 1)
  sendVersus(MSG.NEXT, { seed: s.versus.seed, ...next })
  s.directorNext(next)
}

/** Wire everything; returns an unsubscribe. Called once from VersusNet. */
export function installDirector() {
  const sentTurns = new Set()
  const offs = [
    onVersus(MSG.SPAWN, (d) => { if (mine(d)) st().directorSpawn(d) }),
    onVersus(MSG.MOD, (d) => { if (mine(d)) st().directorMod(d) }),
    onVersus(MSG.STATE, (d) => { if (mine(d)) st().setDirectorView(d) }),
    onVersus(MSG.TURN, (d) => { if (mine(d)) st().receiveDirectorTurn(d) }),
    onVersus(MSG.NEXT, (d) => { if (mine(d)) st().directorNext(d) }),
    onVersus(READY, (d) => { if (mine(d)) st().setDirectorReady('rival') }),
  ]
  // My own finished turn goes to the director once.
  const unsub = useGameStore.subscribe((s, prev) => {
    const d = s.director
    if (!d.active || d.turns === prev.director.turns) return
    for (const round of Object.keys(d.turns)) {
      const res = d.turns[round]?.[d.side]
      const key = `${s.versus.seed}:${round}`
      if (!res || sentTurns.has(key)) continue
      sentTurns.add(key)
      if (isConnected()) sendVersus(MSG.TURN, { seed: s.versus.seed, round: +round, ...res })
    }
  })
  const tState = setInterval(sendState, 1000 / DIRECTOR.STATE_HZ)
  const tHost = setInterval(hostAdvance, 250)
  return () => { offs.forEach((f) => f()); unsub(); clearInterval(tState); clearInterval(tHost) }
}
