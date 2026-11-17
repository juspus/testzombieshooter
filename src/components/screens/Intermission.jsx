// Intermission countdown between waves and the next-wave modifier card.
import { useEffect, useState } from 'react'
import { MODIFIERS, MOD_BONUS } from '../../modifiers'
import { hintsActive } from '../../hints'
import { SkipHoldButton } from '../PauseMenu'
import { getIsMobileScreen } from './shared'

// Wave 3: announces the next wave's modifier under the intermission countdown.
function ModifierCard({ mod, compact }) {
  return (
    <div data-modifier-card={mod.id} style={{
      display: 'flex', alignItems: 'center', gap: compact ? 8 : 12, margin: compact ? '4px auto' : '8px auto',
      padding: compact ? '4px 10px' : '8px 16px', maxWidth: 'min(380px, 92vw)',
      background: 'rgba(0,0,0,0.5)', border: `1px solid ${mod.color}`, borderRadius: 6,
      boxShadow: `0 0 14px ${mod.color}55`, fontFamily: 'Courier New, monospace', textAlign: 'left',
    }}>
      <span>
        <div style={{ color: mod.color, fontWeight: 'bold', letterSpacing: 3, fontSize: compact ? 12 : 16 }}>
          {mod.name} <span style={{ color: '#88cc44', letterSpacing: 1, fontSize: compact ? 'max(var(--ui-fs-min), 10px)' : 12 }}>+€{MOD_BONUS}</span>
        </div>
        <div style={{ color: '#ccc', fontSize: compact ? 'max(var(--ui-fs-min), 10px)' : 13, letterSpacing: 1 }}>{mod.desc}</div>
      </span>
    </div>
  )
}

export function IntermissionScreen({ wave, intermissionLeft, zombieCount, skipProgress, modifier }) {
  const [isMobile, setIsMobile] = useState(getIsMobileScreen)
  const seconds = Math.ceil(intermissionLeft)
  const urgent = seconds <= 3

  useEffect(() => {
    const update = () => setIsMobile(getIsMobileScreen())
    const media = window.matchMedia?.('(hover: none) and (pointer: coarse)')
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    media?.addEventListener?.('change', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      media?.removeEventListener?.('change', update)
    }
  }, [])

  const panelStyle = isMobile ? { ...intermissionStyles.panel, ...intermissionStyles.mobilePanel } : intermissionStyles.panel
  const titleStyle = isMobile ? { ...intermissionStyles.title, ...intermissionStyles.mobileTitle } : intermissionStyles.title
  const timerStyle = isMobile ? { ...intermissionStyles.timer, ...intermissionStyles.mobileTimer } : intermissionStyles.timer
  const rewardStyle = isMobile ? { ...intermissionStyles.reward, ...intermissionStyles.mobileReward } : intermissionStyles.reward
  const hintStyle = isMobile ? { ...intermissionStyles.hint, ...intermissionStyles.mobileHint } : intermissionStyles.hint
  const skipStyle = isMobile ? { ...intermissionStyles.skipWrap, ...intermissionStyles.mobileSkipWrap } : intermissionStyles.skipWrap

  return (
    <div style={{
      ...panelStyle,
      ...(isMobile ? { zIndex: 7 } : null),   // above the touch look zone so the skip button gets taps
      border: `1px solid ${urgent ? 'rgba(255,50,0,0.6)' : 'rgba(255,200,0,0.3)'}`,
    }}>
      <div style={titleStyle}>
        WAVE {wave} · {zombieCount} ZOMBIES
      </div>
      <div style={{
        ...timerStyle,
        color: urgent ? '#ff3300' : '#ffe066',
        textShadow: urgent ? '0 0 20px rgba(255,50,0,0.8)' : '0 0 12px rgba(255,200,0,0.5)',
      }}>
        {seconds}s
      </div>
      {modifier && MODIFIERS[modifier] && <ModifierCard mod={MODIFIERS[modifier]} compact={isMobile} />}
      {wave > 1 && (
        <div style={rewardStyle}>
          +€15
        </div>
      )}
      {wave <= 1 && hintsActive() && (
        <div style={hintStyle}>
          {isMobile ? 'USE: board windows · €2.50' : 'E: board windows · €2.50'}
        </div>
      )}
      {isMobile && <SkipHoldButton progress={skipProgress} />}
      {!isMobile && (
        <div style={skipStyle}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: skipProgress > 0 ? '#aaa' : '#444' }}>
            T — skip
          </div>
          <div style={{ width: 140, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${skipProgress * 100}%`, background: '#aaa', borderRadius: 2, transition: 'width 0.05s linear' }} />
          </div>
        </div>
      )}
    </div>
  )
}

const intermissionStyles = {
  panel: {
    position: 'absolute',
    top: 80,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    background: 'rgba(0,0,0,0.65)',
    borderRadius: 6,
    padding: '10px 28px 14px',
    fontFamily: 'Courier New, monospace',
    pointerEvents: 'none',
    transition: 'border-color 0.3s',
  },
  mobilePanel: {
    top: 'max(28px, calc(env(safe-area-inset-top) + 18px))',
    gap: 0,
    padding: '3px 10px 4px',
    borderRadius: 4,
    background: 'rgba(0,0,0,0.52)',
    maxWidth: 'calc(var(--app-width, 100vw) - 200px)',
    minWidth: 160,
  },
  title: {
    fontSize: 11,
    letterSpacing: 6,
    color: '#888',
    fontWeight: 'bold',
  },
  mobileTitle: {
    fontSize: 11,
    letterSpacing: 1.5,
    whiteSpace: 'nowrap',
  },
  timer: {
    fontSize: 48,
    fontWeight: 'bold',
    lineHeight: 1,
    transition: 'color 0.3s, text-shadow 0.3s',
  },
  mobileTimer: {
    fontSize: 16,
    lineHeight: 1.1,
  },
  reward: {
    fontSize: 12,
    letterSpacing: 3,
    color: '#88cc44',
    marginTop: 2,
  },
  mobileReward: {
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 0,
  },
  hint: {
    fontSize: 11,
    letterSpacing: 2,
    color: '#555',
    marginTop: 2,
  },
  mobileHint: {
    fontSize: 11,
    letterSpacing: 0.8,
    marginTop: 0,
    whiteSpace: 'nowrap',
  },
  skipWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  mobileSkipWrap: {
    marginTop: 2,
  },
}
