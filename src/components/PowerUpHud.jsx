import { memo, useEffect, useRef } from 'react'
import { useGameStore } from '../store'
import { POWERUP_DEFS, effects, DROP_BLINK_START } from '../powerups'
import { playPowerupPickup } from '../sounds'

// Wave 3 power-up HUD: a pickup banner ("INSTA-KILL!") and a countdown chip per active
// timed effect. Subscribes to its own triggers (never props from HUD, which re-renders
// constantly) and animates through refs / Web Animations — no React state per frame.
// Layout: banner sits above the crosshair, chips just below it — clear of the top bar,
// ammo box and mobile thumb controls on 844x390 landscape.

const TIMED = ['insta_kill', 'double_money']
// Phone: the DOOR / BENCH / BOX / board prompt floats just under the crosshair, so the chips drop below it.
const isMobileHud = () => {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  return Boolean(coarse || (navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) <= 900))
}
const CHIP = {
  insta_kill:   { tag: 'IK', label: 'INSTA-KILL' },
  double_money: { tag: 'x2', label: 'DOUBLE $' },
}

const PowerUpBanner = memo(function PowerUpBanner() {
  const id = useGameStore((s) => s.powerupBannerId)
  const elRef = useRef(null)
  const prevId = useRef(id)

  useEffect(() => {
    if (prevId.current === id) return
    prevId.current = id
    const type = useGameStore.getState().powerupBannerType
    const def = POWERUP_DEFS[type]
    const el = elRef.current
    if (!def || !el) return
    el.textContent = def.label
    el.style.color = def.color
    el.style.textShadow = `0 0 14px ${def.color}, 0 2px 0 #000`
    el.animate([
      { opacity: 0, transform: 'translate(-50%, 0) scale(1.9)' },
      { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.14 },
      { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.7 },
      { opacity: 0, transform: 'translate(-50%, -14px) scale(0.96)' },
    ], { duration: 1700, easing: 'ease-out' })
    playPowerupPickup(type)
  }, [id])

  return <div ref={elRef} style={styles.banner} />
})

function Chip({ type }) {
  const textRef = useRef(null)
  const barRef = useRef(null)
  const wrapRef = useRef(null)
  const def = POWERUP_DEFS[type]

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const left = effects[type]
      if (textRef.current) textRef.current.textContent = Math.ceil(left)
      if (barRef.current) barRef.current.style.width = `${Math.max(0, Math.min(1, left / def.duration)) * 100}%`
      if (wrapRef.current) wrapRef.current.style.opacity = left <= DROP_BLINK_START && Math.floor(left * 4) % 2 === 0 ? '0.45' : '1'
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [type, def.duration])

  return (
    <div ref={wrapRef} style={{ ...styles.chip, borderColor: def.color }}>
      <span style={{ ...styles.tag, background: def.color }}>{CHIP[type].tag}</span>
      <span ref={textRef} style={{ ...styles.secs, color: def.color }} />
      <div ref={barRef} style={{ ...styles.bar, background: def.color }} />
    </div>
  )
}

export default function PowerUpHud() {
  const insta = useGameStore((s) => s.instaKillOn)
  const dbl = useGameStore((s) => s.doubleMoneyOn)
  const on = { insta_kill: insta, double_money: dbl }
  return (
    <>
      <PowerUpBanner />
      <div style={isMobileHud() ? { ...styles.row, top: 'calc(50% + 66px)' } : styles.row}>
        {TIMED.map((t) => (on[t] ? <Chip key={t} type={t} /> : null))}
      </div>
    </>
  )
}

const styles = {
  banner: {
    position: 'absolute',
    top: '26%',
    left: '50%',
    transform: 'translate(-50%, 0)',
    opacity: 0,
    fontFamily: 'Courier New, monospace',
    fontWeight: 'bold',
    fontSize: 'clamp(22px, 5.5vmin, 46px)',
    letterSpacing: 4,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
  row: {
    position: 'absolute',
    top: 'calc(50% + 34px)',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 8,
    pointerEvents: 'none',
  },
  chip: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 8px 6px',
    background: 'rgba(0,0,0,0.6)',
    border: '1px solid',
    borderRadius: 4,
    fontFamily: 'Courier New, monospace',
    fontSize: 'clamp(11px, 2.4vmin, 13px)',
    color: '#fff',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  tag: { color: '#000', fontWeight: 'bold', padding: '0 4px', borderRadius: 2 },
  chipLabel: { letterSpacing: 1 },
  secs: { fontWeight: 'bold', fontSize: 14, minWidth: '1.4em', textAlign: 'right' },
  bar: { position: 'absolute', left: 0, bottom: 0, height: 3 },
}
