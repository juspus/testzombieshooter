import { memo, useEffect, useRef } from 'react'
import { useGameStore } from '../store'
import { viewState } from '../viewState'
import {
  playHitTick, playHeadshotTink, playKillConfirm, playLastKillSting,
  startHeartbeat, stopHeartbeat, setHeartbeatIntensity, setDangerMuffle, setSlowMoMuffle,
} from '../sounds'

// Wave 1 "Feel" HUD pieces. Every piece is always mounted, subscribes to its own
// trigger value (never takes it as a prop from HUD, which re-renders constantly in
// combat) and animates via ref mutation / Web Animations — no React state per frame.

export const LOW_HP_FRACTION = 0.3
const DAMAGE_INDICATOR_MS = 1000
const INDICATOR_SLOTS = 4
const LAST_KILL_FX_MS = 1100

// ── Hit marker: diagonal ticks around the crosshair ─────────────────────────────
// kind -> [colour, scale, duration ms, opacity]
const MARKER_STYLE = {
  hit:      ['#ffffff', 1.0, 200, 0.9],
  head:     ['#ffe08a', 1.5, 260, 1],
  kill:     ['#ff2a2a', 1.7, 420, 1],
  headkill: ['#ff2a2a', 2.2, 480, 1],
  burn:     ['#ffb070', 0.8, 160, 0.55],
}

export const HitMarker = memo(function HitMarker() {
  const hitMarkerId = useGameStore((s) => s.hitMarkerId)
  const wrapRef = useRef(null)
  const barRefs = useRef([])
  const animRef = useRef(null)
  const prevId = useRef(hitMarkerId)

  useEffect(() => {
    if (prevId.current === hitMarkerId) return
    prevId.current = hitMarkerId
    const kind = useGameStore.getState().hitMarkerKind
    const [colour, scale, dur, opacity] = MARKER_STYLE[kind] ?? MARKER_STYLE.hit
    const el = wrapRef.current
    if (!el) return
    for (const b of barRefs.current) if (b) b.style.background = colour
    // Scale with the viewport so it reads on phones too
    const k = Math.max(1, Math.min(1.8, Math.min(window.innerWidth, window.innerHeight) / 500))
    const s = scale * k
    animRef.current?.cancel()
    animRef.current = el.animate([
      { opacity, transform: `translate(-50%, -50%) rotate(45deg) scale(${s * 1.3})` },
      { opacity, transform: `translate(-50%, -50%) rotate(45deg) scale(${s})`, offset: 0.2 },
      { opacity: 0, transform: `translate(-50%, -50%) rotate(45deg) scale(${s * 0.92})` },
    ], { duration: dur, easing: 'ease-out' })

    if (kind === 'head') playHeadshotTink()
    else if (kind === 'kill') playKillConfirm(false)
    else if (kind === 'headkill') { playKillConfirm(true); playHeadshotTink() }
    else if (kind === 'hit') playHitTick()
  }, [hitMarkerId])

  // Four ticks (up/down/left/right of a 45deg-rotated frame -> reads as an X around the crosshair)
  const len = 7, gap = 5, th = 2
  const bars = [
    { left: -th / 2, top: -(gap + len), width: th, height: len },
    { left: -th / 2, top: gap, width: th, height: len },
    { top: -th / 2, left: -(gap + len), height: th, width: len },
    { top: -th / 2, left: gap, height: th, width: len },
  ]
  return (
    <div ref={wrapRef} style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, opacity: 0, pointerEvents: 'none', zIndex: 6 }}>
      {bars.map((style, i) => (
        <div key={i} ref={(el) => { barRefs.current[i] = el }}
          style={{ position: 'absolute', background: '#fff', boxShadow: '0 0 2px rgba(0,0,0,0.9)', ...style }} />
      ))}
    </div>
  )
})

// ── Low-HP danger: pulsing red vignette + heartbeat + muffled audio ─────────────
export const DangerFx = memo(function DangerFx() {
  const phase = useGameStore((s) => s.phase)
  const hp = useGameStore((s) => s.hp)
  const maxHp = useGameStore((s) => s.maxHp)
  const vigRef = useRef(null)
  const animRef = useRef(null)

  const ratio = maxHp > 0 ? hp / maxHp : 1
  const low = phase === 'playing' && hp > 0 && ratio <= LOW_HP_FRACTION
  // 0 at the threshold -> 1 near death
  const intensity = low ? Math.max(0, Math.min(1, 1 - ratio / LOW_HP_FRACTION)) : 0
  const period = 1050 - 400 * intensity

  useEffect(() => {
    if (!low) return
    startHeartbeat(intensity)
    setDangerMuffle(0.55)
    const el = vigRef.current
    if (el) {
      // "lub-dub" pulse, loops for as long as HP stays low
      animRef.current = el.animate([
        { opacity: 0.3 }, { opacity: 0.95, offset: 0.12 }, { opacity: 0.45, offset: 0.24 },
        { opacity: 0.8, offset: 0.36 }, { opacity: 0.3 },
      ], { duration: period, iterations: Infinity })
    }
    return () => {
      stopHeartbeat()
      setDangerMuffle(0)
      animRef.current?.cancel()
      animRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [low])

  useEffect(() => {
    if (!low) return
    setHeartbeatIntensity(intensity)
    animRef.current?.effect?.updateTiming({ duration: period })
  }, [low, intensity, period])

  return (
    <div ref={vigRef} style={{
      position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none', zIndex: 4,
      background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 42%, rgba(150,0,0,0.4) 78%, rgba(110,0,0,0.75) 100%)',
    }} />
  )
})

// ── Directional damage indicator ────────────────────────────────────────────────
// Fixed pool of red chevrons on a ring around screen centre, rotated toward the
// attacker relative to camera yaw and re-aimed every frame while fading (~1 s).
export const DamageIndicator = memo(function DamageIndicator() {
  const hitEventId = useGameStore((s) => s.hitEventId)
  const wrapRefs = useRef([])
  const slots = useRef(Array.from({ length: INDICATOR_SLOTS }, () => ({ active: false, x: 0, z: 0, start: 0 })))
  const next = useRef(0)
  const raf = useRef(0)
  const prevId = useRef(hitEventId)
  const tick = useRef(null)

  tick.current = () => {
    const now = performance.now()
    let any = false
    // camera forward = (-sin yaw, -cos yaw); right = (cos yaw, -sin yaw)
    const fx = -Math.sin(viewState.yaw), fz = -Math.cos(viewState.yaw)
    const rx = Math.cos(viewState.yaw), rz = -Math.sin(viewState.yaw)
    for (let i = 0; i < INDICATOR_SLOTS; i++) {
      const sl = slots.current[i]
      const el = wrapRefs.current[i]
      if (!sl.active || !el) continue
      const t = (now - sl.start) / DAMAGE_INDICATOR_MS
      if (t >= 1) { sl.active = false; el.style.opacity = '0'; continue }
      any = true
      const dx = sl.x - viewState.x, dz = sl.z - viewState.z
      const angle = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz)  // clockwise from screen-up
      el.style.transform = `rotate(${angle}rad)`
      el.style.opacity = String(Math.min(1, (1 - t) * 1.6))
    }
    raf.current = any ? requestAnimationFrame(tick.current) : 0
  }

  useEffect(() => {
    if (prevId.current === hitEventId) return
    prevId.current = hitEventId
    if (hitEventId === 0) return
    const { lastHitX, lastHitZ } = useGameStore.getState()
    const sl = slots.current[next.current]
    next.current = (next.current + 1) % INDICATOR_SLOTS
    sl.active = true
    sl.x = lastHitX
    sl.z = lastHitZ
    sl.start = performance.now()
    if (!raf.current) raf.current = requestAnimationFrame(tick.current)
  }, [hitEventId])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  return (
    <>
      {Array.from({ length: INDICATOR_SLOTS }, (_, i) => (
        <div key={i} ref={(el) => { wrapRefs.current[i] = el }}
          style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, opacity: 0, pointerEvents: 'none', zIndex: 5 }}>
          <div style={{
            position: 'absolute', left: '-5vmin', top: '-41vmin', width: '10vmin', height: '7vmin',
            background: 'linear-gradient(to bottom, #ff3030, #a00000)',
            clipPath: 'polygon(50% 0%, 100% 100%, 50% 62%, 0% 100%)',
            filter: 'drop-shadow(0 0 6px rgba(255,0,0,0.8))',
          }} />
        </div>
      ))}
    </>
  )
})

// ── Last kill: sting, brief audio muffle, darkened-edge pulse ───────────────────
export const LastKillFx = memo(function LastKillFx() {
  const lastKillId = useGameStore((s) => s.lastKillId)
  const vigRef = useRef(null)
  const prevId = useRef(lastKillId)
  const timer = useRef(0)

  useEffect(() => {
    if (prevId.current === lastKillId) return
    prevId.current = lastKillId
    playLastKillSting()
    setSlowMoMuffle(0.4)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setSlowMoMuffle(0), LAST_KILL_FX_MS)
    vigRef.current?.animate(
      [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0.8, offset: 0.7 }, { opacity: 0 }],
      { duration: LAST_KILL_FX_MS },
    )
  }, [lastKillId])

  useEffect(() => () => { clearTimeout(timer.current); setSlowMoMuffle(0) }, [])

  return (
    <div ref={vigRef} style={{
      position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none', zIndex: 4,
      background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(0,0,0,0.65) 100%)',
    }} />
  )
})
