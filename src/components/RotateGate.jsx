import { useEffect, useRef } from 'react'
import { useGameStore } from '../store'
import { usePauseUi, pauseGame, autoPause, resumeGame, onReturn } from '../pause'
import useMenuEnv from '../menuTouch'

// Upright phones get the menus (start, locker, leaderboard, invite lobby, death). Play is
// landscape only, so this "rotate" wall appears only while a run is live, and it pauses the run.
// Turning the phone back resumes through the normal 3-2-1.
const RUN_PHASES = ['playing', 'intermission', 'wave_clear']

export function rotateGateVisible({ touch, portrait, phase, shopOpen }) {
  return !!touch && !!portrait && (RUN_PHASES.includes(phase) || !!shopOpen)
}

export default function RotateGate() {
  const { touch, portrait } = useMenuEnv()
  const phase = useGameStore((s) => s.phase)
  const shopOpen = useGameStore((s) => s.shopOpen)
  const visible = rotateGateVisible({ touch, portrait, phase, shopOpen })
  const heldRef = useRef(null)   // 'pause' (we froze the world) | 'away' (co-op guest: told the host)

  // Pause when the wall appears (and again if the run moves from wave clear into the next
  // intermission while still upright). Resume when it goes away.
  useEffect(() => {
    if (visible) {
      if (heldRef.current) return
      if (phase !== 'playing' && phase !== 'intermission') return
      const st = useGameStore.getState()
      if (st.paused) return   // already paused by someone else: leave it alone
      const guest = !!st.mpRole && st.mpConnected && st.mpRole === 'guest'
      if (guest) { autoPause(); heldRef.current = 'away' }
      else if (pauseGame()) heldRef.current = 'pause'
    } else if (heldRef.current) {
      const held = heldRef.current
      heldRef.current = null
      if (held === 'away') onReturn()
      else if (useGameStore.getState().paused && usePauseUi.getState().menu === 'pause') resumeGame()
    }
  }, [visible, phase])

  // A run that ends while the wall is up must not leave a stale hold behind.
  useEffect(() => { if (!RUN_PHASES.includes(phase)) heldRef.current = null }, [phase])

  if (!visible) return null
  return (
    <div data-testid="rotate-gate" style={S.root}>
      <div style={S.icon}>↻</div>
      <div style={S.title}>ROTATE</div>
      <div style={S.text}>Landscape only</div>
    </div>
  )
}

const S = {
  root: {
    position: 'fixed', inset: 0, zIndex: 100, background: '#020202', color: '#f4efe4',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 14, textAlign: 'center', fontFamily: 'Courier New, monospace', padding: 28,
    touchAction: 'none',
  },
  icon: { fontSize: 64, lineHeight: 1, color: '#c8801a' },
  title: { fontSize: 18, letterSpacing: 6, fontWeight: 'bold', color: '#c8801a' },
  text: { maxWidth: 280, color: '#aaa', fontSize: 13, lineHeight: 1.5 },
}
