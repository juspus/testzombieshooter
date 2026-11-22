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

  // Phones: one small strip under the health bar (countdown + a SKIP hold target), so the
  // countdown never covers the view or the touch buttons.
  if (isMobile) {
    return (
      <div style={{ ...intermissionStyles.strip, borderColor: urgent ? 'rgba(255,50,0,0.6)' : 'rgba(255,200,0,0.3)' }} data-testid="intermission">
        <div style={intermissionStyles.stripRow}>
          <div style={intermissionStyles.stripText}>
            <div style={intermissionStyles.mobileTitle}>WAVE {wave} · {zombieCount} ZOMBIES</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ ...intermissionStyles.stripTimer, color: urgent ? '#ff3300' : '#ffe066' }}>{seconds}s</span>
              {wave > 1 && <span style={intermissionStyles.mobileReward}>+€15</span>}
            </div>
          </div>
          <SkipHoldButton progress={skipProgress} compact />
        </div>
        {modifier && MODIFIERS[modifier] && <ModifierCard mod={MODIFIERS[modifier]} compact />}
        {wave <= 1 && hintsActive() && <div style={intermissionStyles.mobileHint}>USE: board windows · €2.50</div>}
      </div>
    )
  }

  const S = intermissionStyles
  return (
    <div style={{
      ...S.panel,
      border: `1px solid ${urgent ? 'rgba(255,50,0,0.6)' : 'rgba(255,200,0,0.3)'}`,
    }}>
      <div style={S.title}>
        WAVE {wave} · {zombieCount} ZOMBIES
      </div>
      <div style={{
        ...S.timer,
        color: urgent ? '#ff3300' : '#ffe066',
        textShadow: urgent ? '0 0 20px rgba(255,50,0,0.8)' : '0 0 12px rgba(255,200,0,0.5)',
      }}>
        {seconds}s
      </div>
      {modifier && MODIFIERS[modifier] && <ModifierCard mod={MODIFIERS[modifier]} />}
      {wave > 1 && (
        <div style={S.reward}>
          +€15
        </div>
      )}
      {wave <= 1 && hintsActive() && (
        <div style={S.hint}>
          E: board windows · €2.50
        </div>
      )}
      <div style={S.skipWrap}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: skipProgress > 0 ? '#aaa' : '#444' }}>
          T — skip · P — menu
        </div>
        <div style={{ width: 140, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${skipProgress * 100}%`, background: '#aaa', borderRadius: 2, transition: 'width 0.05s linear' }} />
        </div>
      </div>
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
  strip: {
    position: 'absolute',
    top: 'calc(env(safe-area-inset-top) + 54px)',   // below the pause button / health bar row
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 7,   // above the touch look zone so SKIP gets taps
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 2,
    paddingLeft: 10,
    background: 'rgba(0,0,0,0.5)',
    border: '1px solid',
    borderRadius: 4,
    fontFamily: 'Courier New, monospace',
    pointerEvents: 'none',
    maxWidth: 'calc(var(--app-width, 100vw) - 24px)',
    transition: 'border-color 0.3s',
  },
  stripRow: { display: 'flex', alignItems: 'center', gap: 10 },
  stripText: { display: 'flex', flexDirection: 'column', lineHeight: 1.15 },
  stripTimer: { fontSize: 16, fontWeight: 'bold', transition: 'color 0.3s' },
  title: {
    fontSize: 11,
    letterSpacing: 6,
    color: '#888',
    fontWeight: 'bold',
  },
  mobileTitle: {
    fontSize: 11,
    color: '#999',
    fontWeight: 'bold',
    letterSpacing: 1.5,
    whiteSpace: 'nowrap',
  },
  timer: {
    fontSize: 48,
    fontWeight: 'bold',
    lineHeight: 1,
    transition: 'color 0.3s, text-shadow 0.3s',
  },
  reward: {
    fontSize: 12,
    letterSpacing: 3,
    color: '#88cc44',
    marginTop: 2,
  },
  mobileReward: {
    fontSize: 11,
    color: '#88cc44',
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
    color: '#777',
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
}
