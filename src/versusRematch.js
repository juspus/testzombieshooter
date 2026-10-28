// Versus rematch handshake. Both players press Rematch while the net link is still up; once both
// have, the HOST starts a new versus run with a fresh seed and tells the guest to do the same.
// Messages ride the versus channel ('rematch', 'rematch_go'), not game_event, because the co-op
// NetManager listeners are gone once a run is detached from the co-op world.
import { create } from 'zustand'
import { useGameStore } from './store'
import { getRole, isConnected } from './net'
import { sendVersus, onVersus } from './versus'
import { newRunSeed } from './rng'

export const useRematch = create(() => ({ me: false, rival: false }))

export function resetRematch() { useRematch.setState({ me: false, rival: false }) }

function hostMaybeStart() {
  const { me, rival } = useRematch.getState()
  if (!me || !rival || getRole() !== 'host' || !isConnected()) return
  const mode = useGameStore.getState().versus.mode
  if (!mode) return
  const seed = newRunSeed()
  sendVersus('rematch_go', { mode, seed })
  resetRematch()
  useGameStore.getState().startVersusRun(mode, seed)
}

/** Local player pressed Rematch (no-op when the link is gone). */
export function requestRematch() {
  if (!isConnected() || useRematch.getState().me) return false
  useRematch.setState({ me: true })
  sendVersus('rematch', {})
  hostMaybeStart()
  return true
}

/** Wire the incoming side; returns an unsubscribe. Called once from VersusNet. */
export function installRematch() {
  const offAsk = onVersus('rematch', () => { useRematch.setState({ rival: true }); hostMaybeStart() })
  const offGo = onVersus('rematch_go', (d) => {
    if (!d || typeof d.seed !== 'string' || typeof d.mode !== 'string') return
    resetRematch()
    useGameStore.getState().startVersusRun(d.mode, d.seed)
  })
  return () => { offAsk(); offGo() }
}
