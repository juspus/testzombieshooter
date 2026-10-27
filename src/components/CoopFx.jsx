import { memo, useEffect, useRef } from 'react'
import { useGameStore } from '../store'
import { viewState } from '../viewState'
import { getRemotePlayerPos } from './RemotePlayer'
import { relativeBearing, otherRole, BLEED_TIME } from '../coopDown'
import { startHeartbeat, stopHeartbeat, setDangerMuffle } from '../sounds'

// Wave 5 co-op "Down, not out" HUD. Always mounted from HUD; each piece subscribes to the
// primitive it needs, so nothing re-renders in solo play (statuses never leave 'alive').

const selfStatus = (s) => (s.mpRole && s.mpConnected ? s.coop[s.mpRole].status : 'alive')
const partnerStatus = (s) => (s.mpRole && s.mpConnected ? s.coop[otherRole(s.mpRole)].status : 'alive')
const coarse = () => { try { return window.matchMedia('(pointer: coarse)').matches } catch { return false } }

const wrap = { position: 'absolute', inset: 0, pointerEvents: 'none' }

// ── My own downed / bled-out view: desaturation, red edges, heartbeat, big bleed-out timer ──
const DownedView = memo(function DownedView() {
  const status = useGameStore(selfStatus)
  const bleedSecs = useGameStore((s) => (s.mpRole && s.mpConnected ? Math.ceil(s.coop[s.mpRole].bleed) : 0))
  const beingRevived = useGameStore((s) => (s.mpRole && s.mpConnected ? s.coop[s.mpRole].revive : 0))
  const down = status === 'down'

  useEffect(() => {
    if (!down) return
    startHeartbeat(1)
    setDangerMuffle(0.7)
    return () => { stopHeartbeat(); setDangerMuffle(0) }
  }, [down])

  if (status === 'alive') return null
  const mobile = coarse()
  const frac = Math.max(0, Math.min(1, bleedSecs / BLEED_TIME))
  return (
    <>
      <div style={{
        ...wrap, zIndex: 4,
        // backdrop-filter is skipped on phones: a flat grey wash is nearly free
        ...(mobile ? { background: 'rgba(70,70,70,0.4)' } : { backdropFilter: 'grayscale(0.85) contrast(1.05)', WebkitBackdropFilter: 'grayscale(0.85) contrast(1.05)' }),
      }} />
      <div style={{
        ...wrap, zIndex: 4,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(170,0,0,0.5) 72%, rgba(120,0,0,0.9) 100%)',
        animation: down ? 'coopPulse 1.1s ease-in-out infinite' : 'none',
      }} />
      <style>{'@keyframes coopPulse{0%,100%{opacity:.55}15%{opacity:1}30%{opacity:.7}45%{opacity:.95}}'}</style>
      <div data-testid="coop-self" style={{
        ...wrap, zIndex: 7, display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 'max(92px, 14vh)', fontFamily: 'Courier New, monospace', textAlign: 'center',
      }}>
        {down ? (
          <>
            <div style={{ color: '#ff5555', fontSize: 'clamp(14px,2.4vw,22px)', letterSpacing: 6, textShadow: '0 0 8px #000' }}>YOU ARE DOWN</div>
            <div data-testid="coop-bleed" style={{
              color: bleedSecs <= 10 ? '#ff2a2a' : '#ffe9e0', fontSize: 'clamp(44px,13vh,120px)', fontWeight: 'bold',
              lineHeight: 1, textShadow: '0 0 18px rgba(255,0,0,0.7), 0 3px 0 #000',
            }}>{bleedSecs}</div>
            <div style={{ width: 'min(60vw,320px)', height: 6, background: 'rgba(0,0,0,0.6)', marginTop: 8, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${frac * 100}%`, height: '100%', background: '#cc2222', transition: 'width 1s linear' }} />
            </div>
            <div style={{ color: '#ddd', fontSize: 'clamp(11px,1.6vw,15px)', letterSpacing: 3, marginTop: 10, textShadow: '0 2px 4px #000' }}>
              {beingRevived > 0 ? 'REVIVING…' : 'CRAWL TO PARTNER'}
            </div>
            {beingRevived > 0 && (
              <div style={{ width: 'min(50vw,260px)', height: 8, background: 'rgba(0,0,0,0.6)', marginTop: 6, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${beingRevived * 100}%`, height: '100%', background: '#66dd66' }} />
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ color: '#ff5555', fontSize: 'clamp(18px,3vw,30px)', letterSpacing: 6, textShadow: '0 0 8px #000' }}>YOU BLED OUT</div>
            <div data-testid="coop-waiting" style={{ color: '#ddd', fontSize: 'clamp(12px,1.8vw,16px)', letterSpacing: 3, marginTop: 10, textShadow: '0 2px 4px #000' }}>
              WAITING…
            </div>
          </>
        )}
      </div>
    </>
  )
})

// ── Standing next to a downed partner: hold-E prompt + progress bar ─────────────────────────
const RevivePrompt = memo(function RevivePrompt() {
  const near = useGameStore((s) => s.coopNearPartner)
  const progress = useGameStore((s) => s.coopReviveProgress)
  if (!near) return null
  const mobile = coarse()
  return (
    <div data-testid="coop-revive-prompt" style={{
      ...wrap, zIndex: 7, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      paddingTop: '18vh', fontFamily: 'Courier New, monospace',
    }}>
      <div style={{ color: '#ffe066', fontSize: 'clamp(13px,2vw,20px)', letterSpacing: 3, textShadow: '0 2px 4px #000' }}>
        {mobile ? 'REVIVE' : 'E  REVIVE'}
      </div>
      <div style={{ width: 'min(50vw,240px)', height: 10, background: 'rgba(0,0,0,0.65)', border: '1px solid #666', marginTop: 8, borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ width: `${progress * 100}%`, height: '100%', background: '#66dd66' }} />
      </div>
    </div>
  )
})

// ── Edge arrow toward a downed partner who is off-screen ────────────────────────────────────
const PartnerArrow = memo(function PartnerArrow() {
  const down = useGameStore((s) => partnerStatus(s) === 'down' && selfStatus(s) === 'alive')
  const arrowRef = useRef(null)
  const labelRef = useRef(null)

  useEffect(() => {
    if (!down) return
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const el = arrowRef.current
      const rp = getRemotePlayerPos()
      if (!el) return
      if (!rp) { el.style.opacity = '0'; return }
      const th = relativeBearing(viewState.x, viewState.z, viewState.yaw, rp.x, rp.z)
      if (Math.abs(th) < 0.5) { el.style.opacity = '0'; return }   // roughly on screen: the in-world marker is enough
      const w = window.innerWidth, h = window.innerHeight
      const x = w / 2 + Math.sin(th) * w * 0.42
      const y = h / 2 - Math.cos(th) * h * 0.36
      el.style.opacity = '1'
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${th}rad)`
      if (labelRef.current) {
        labelRef.current.textContent = `${Math.round(Math.hypot(rp.x - viewState.x, rp.z - viewState.z))}m`
        labelRef.current.style.transform = `rotate(${-th}rad)`   // keep the text upright
      }
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [down])

  if (!down) return null
  return (
    <div ref={arrowRef} data-testid="coop-arrow" style={{ position: 'absolute', left: 0, top: 0, opacity: 0, pointerEvents: 'none', zIndex: 6, textAlign: 'center', fontFamily: 'Courier New, monospace' }}>
      <div style={{ width: 0, height: 0, margin: '0 auto', borderLeft: '14px solid transparent', borderRight: '14px solid transparent', borderBottom: '26px solid #ff3b3b', filter: 'drop-shadow(0 0 4px #000)' }} />
      <div ref={labelRef} style={{ color: '#ff9a9a', fontSize: 12, textShadow: '0 1px 3px #000' }}>DOWN</div>
    </div>
  )
})

export default function CoopFx() {
  return (
    <>
      <DownedView />
      <RevivePrompt />
      <PartnerArrow />
    </>
  )
}
