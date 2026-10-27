import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store'
import { GRENADE } from '../grenades'
import { cookState } from './Grenades'

// Wave 3 grenade HUD: carried count next to the ammo box, a throw hint, and a cook bar
// under the crosshair. The count/cooking flag come from the store; the bar itself is
// animated by ref mutation in a rAF loop that only runs while cooking.

const isMobileHud = () => {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  return Boolean(coarse || (navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) <= 900))
}

export default function GrenadeHud() {
  const grenades = useGameStore((s) => s.grenades)
  const cooking = useGameStore((s) => s.grenadeCooking)
  const phase = useGameStore((s) => s.phase)
  const [isMobile, setIsMobile] = useState(isMobileHud)
  const barRef = useRef(null)

  useEffect(() => {
    const update = () => setIsMobile(isMobileHud())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!cooking) return
    let raf = 0
    const loop = () => {
      const k = Math.min(1, cookState.t / GRENADE.FUSE)
      const el = barRef.current
      if (el) {
        el.style.width = `${k * 100}%`
        el.style.background = k > 0.7 ? '#ff3b1a' : k > 0.4 ? '#ffb020' : '#c8e060'
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [cooking])

  if (phase !== 'playing' && phase !== 'intermission') return null

  const pips = []
  for (let i = 0; i < GRENADE.MAX; i++) {
    pips.push(<span key={i} style={{ ...S.pip, background: i < grenades ? '#9fbf4a' : '#2c2c2c', borderColor: i < grenades ? '#d6f08a' : '#444' }} />)
  }

  return (
    <>
      {!isMobile && (
        <div data-grenade-hud style={S.box}>
          <div style={S.row}><span style={S.icon}>💣</span><span style={S.pips}>{pips}</span></div>
          <div style={S.hint}>{grenades > 0 ? 'G — grenade · hold to cook' : 'No grenades'}</div>
        </div>
      )}
      {cooking && (
        <div data-grenade-cook style={{ ...S.cook, top: isMobile ? '60%' : '58%' }}>
          <div ref={barRef} style={S.cookFill} />
        </div>
      )}
    </>
  )
}

const S = {
  box: {
    position: 'absolute', bottom: 40, right: 210, display: 'flex', flexDirection: 'column',
    alignItems: 'flex-end', gap: 3, fontFamily: 'Courier New, monospace', pointerEvents: 'none',
  },
  row: { display: 'flex', alignItems: 'center', gap: 6 },
  icon: { fontSize: 18, filter: 'drop-shadow(0 1px 2px #000)' },
  pips: { display: 'flex', gap: 4 },
  pip: { width: 10, height: 14, borderRadius: 3, border: '1px solid', boxSizing: 'border-box' },
  hint: { color: '#8a8a8a', fontSize: 11, letterSpacing: 1 },
  cook: {
    position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: 120, height: 6,
    background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 3,
    overflow: 'hidden', pointerEvents: 'none',
  },
  cookFill: { width: '0%', height: '100%', background: '#c8e060' },
}
