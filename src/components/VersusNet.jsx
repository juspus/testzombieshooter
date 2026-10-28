import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store'
import { isConnected, disconnect } from '../net'
import { sendVersus, onVersus, ensureVersusListener, compareResult } from '../versus'
import { installRematch, resetRematch } from '../versusRematch'
import { Button } from './ui'
import { RematchButton, RESULT_TITLES, reasonText } from './VersusResult'

const FONT = 'Courier New, monospace'
const STATUS_MS = 1000
const LOST_MS = 10000       // net link down this long while I am alive -> forfeit win
const SILENT_MS = 30000     // no status from the rival this long -> forfeit win (a phone in the
                            // background stops sending; a short app switch must not lose the match)
const LIVE_PHASES = new Set(['playing', 'intermission', 'wave_clear'])

const selfStatus = () => {
  const s = useGameStore.getState()
  // seed tags the run so a late status from the previous match never counts in a rematch
  return { hp: s.hp, maxHp: s.maxHp, wave: s.wave, kills: s.kills, alive: s.phase !== 'dead', seed: s.versus.seed }
}

// Mounted once for the whole app (outside the Canvas, no useFrame). While a versus run is
// active it exchanges 1 Hz status with the rival and decides win / lose / forfeit.
export default function VersusNet() {
  const active = useGameStore((s) => s.versus.active)
  const linked = useGameStore((s) => s.versus.linked)
  const seed = useGameStore((s) => s.versus.seed)
  const startedAt = useRef(0)

  // Rematch handshake lives for the whole app.
  useEffect(() => { ensureVersusListener(); return installRematch() }, [])

  // A new run (first start or rematch) resets the per-run clocks.
  useEffect(() => { startedAt.current = Date.now(); resetRematch() }, [seed])

  // Status in / out while the run is active (stays on after a result so the rival keeps seeing us).
  useEffect(() => {
    if (!active) return undefined
    const send = () => { if (isConnected()) sendVersus('status', selfStatus()) }
    send()
    const t = setInterval(send, STATUS_MS)
    const unsubPhase = useGameStore.subscribe((s, prev) => {
      if (s.phase !== prev.phase && s.phase === 'dead') {
        send()
        // I died: the rival still alive means I lost; otherwise compare the two runs.
        const st = useGameStore.getState()
        const rival = st.versus.opponent
        const me = { wave: st.wave, kills: st.kills, alive: false }
        const result = !rival || rival.alive ? 'lose' : compareResult(me, rival)
        st.finishVersus(result, 'death')
      }
    })
    const off = onVersus('status', (d) => {
      if (!d || typeof d !== 'object') return
      const st = useGameStore.getState()
      if (d.seed !== st.versus.seed) return
      st.setVersusOpponent({
        hp: +d.hp || 0, maxHp: +d.maxHp || 0, wave: +d.wave || 0, kills: +d.kills || 0, alive: !!d.alive, at: Date.now(),
      })
      // Rival down while I am still standing.
      if (!d.alive && st.phase !== 'dead' && st.versus.linked) st.finishVersus('win', 'death')
    })
    // Closing the tab or the app says so right away; PeerJS often never reports the dropped link.
    const leave = () => { if (isConnected()) sendVersus('leave', { seed: useGameStore.getState().versus.seed }) }
    window.addEventListener('pagehide', leave)
    const offLeave = onVersus('leave', (d) => {
      const st = useGameStore.getState()
      if (d?.seed !== st.versus.seed || !st.versus.linked || st.versus.result || st.phase === 'dead') return
      st.finishVersus('win', 'forfeit')
    })
    return () => { clearInterval(t); unsubPhase(); off(); offLeave(); window.removeEventListener('pagehide', leave) }
  }, [active, seed])

  // Forfeit watchdog (fallback when no 'leave' arrives): link down for LOST_MS, or the rival
  // silent for SILENT_MS, while I am alive.
  useEffect(() => {
    if (!linked) return undefined
    let lostSince = 0
    const t = setInterval(() => {
      const st = useGameStore.getState()
      if (!st.versus.linked || st.versus.result || !LIVE_PHASES.has(st.phase)) return
      const now = Date.now()
      if (isConnected()) lostSince = 0
      else if (!lostSince) lostSince = now
      const last = Math.max(st.versus.opponent?.at ?? 0, startedAt.current)
      if ((lostSince && now - lostSince >= LOST_MS) || now - last >= SILENT_MS) st.finishVersus('win', 'forfeit')
    }, 500)
    return () => clearInterval(t)
  }, [linked, seed])

  return (
    <>
      <RivalStrip />
      <WinOverlay />
    </>
  )
}

// ── Rival strip: HP bar, wave, kills (or OUT). Top-right so it never meets the top-centre stats
// or the top-left pause / HP on phones. ─────────────────────────────────────────────────────
function RivalStrip() {
  const show = useGameStore((s) => s.versus.active && s.runMode === 'versus' && (s.phase === 'playing' || s.phase === 'intermission' || s.phase === 'wave_clear'))
  const rival = useGameStore((s) => s.versus.opponent)
  if (!show) return null
  const out = !!rival && !rival.alive
  const pct = rival && rival.maxHp > 0 ? Math.max(0, Math.min(1, rival.hp / rival.maxHp)) : 1
  const color = out ? '#ff3300' : pct <= 0.25 ? '#ff3300' : pct <= 0.5 ? '#ffaa00' : '#00ff88'
  return (
    <div data-testid="rival-strip" style={{
      position: 'absolute', zIndex: 7, pointerEvents: 'none',
      top: 'max(6px, env(safe-area-inset-top))', right: 'max(8px, env(safe-area-inset-right))',
      display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 8px', boxSizing: 'border-box',
      background: 'rgba(0,0,0,0.55)', border: '1px solid #333', borderRadius: 6,
      fontFamily: FONT, fontSize: 14, color: '#ddd', whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 11, letterSpacing: 2, color: '#888' }}>RIVAL</span>
      {out ? (
        <span data-testid="rival-out" style={{ color: '#ff3300', fontWeight: 'bold', letterSpacing: 2 }}>OUT</span>
      ) : (
        <span style={{ width: 54, height: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 4, overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: `${Math.round(pct * 100)}%`, background: color, transition: 'width 0.2s' }} />
        </span>
      )}
      <span data-testid="rival-wave">W{rival ? rival.wave : '–'}</span>
      <span data-testid="rival-kills">{rival ? rival.kills : '–'}K</span>
    </div>
  )
}

// ── Win while still alive: freeze the world, show the result, Keep playing (solo) or Menu. ──
function WinOverlay() {
  const result = useGameStore((s) => s.versus.result)
  const reason = useGameStore((s) => s.versus.reason)
  const phase = useGameStore((s) => s.phase)
  const seed = useGameStore((s) => s.versus.seed)
  const [dismissed, setDismissed] = useState(null)   // seed whose overlay was dismissed
  const open = result === 'win' && LIVE_PHASES.has(phase) && dismissed !== seed

  useEffect(() => {
    if (!open) return undefined
    try { document.exitPointerLock?.() } catch { /* ignore */ }
    useGameStore.setState({ paused: true })
    return () => useGameStore.setState({ paused: false })
  }, [open])

  if (!open) return null
  return (
    <div data-testid="versus-win" style={{
      position: 'absolute', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.78)', boxSizing: 'border-box',
      padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, fontFamily: FONT }}>
        <div style={{ color: '#88cc44', fontSize: 'clamp(26px, 8vmin, 56px)', letterSpacing: 8, textTransform: 'uppercase', fontWeight: 'bold' }}>{RESULT_TITLES.win}</div>
        <div style={{ color: '#aaa', fontSize: 14, letterSpacing: 3 }}>{reasonText('win', reason)}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
          <Button variant="primary" size="lg" onClick={() => setDismissed(seed)} data-testid="versus-keep">Keep playing</Button>
          <RematchButton />
          <Button size="lg" onClick={() => { disconnect(); window.location.reload() }} data-testid="versus-menu">Menu</Button>
        </div>
      </div>
    </div>
  )
}
