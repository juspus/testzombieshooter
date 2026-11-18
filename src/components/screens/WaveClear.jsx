// Wave cleared screen and its bonus breakdown.
import { useEffect } from 'react'
import { useGameStore } from '../../store'
import { send, isConnected } from '../../net'
import { MODIFIERS } from '../../modifiers'
import { Badge, Overlay, Sub } from './shared'

export function WaveClearScreen({ wave, waveKills, kills, bonuses, nextWave }) {
  const mpRole = useGameStore((s) => s.mpRole)
  useEffect(() => {
    // Only host drives the wave transition; guest waits for host's game_event
    if (mpRole === 'guest') return
    const id = setTimeout(() => {
      nextWave()
      if (isConnected()) send('game_event', { event: 'next_wave', data: { modifier: useGameStore.getState().waveModifier } })
    }, 3200)
    return () => clearTimeout(id)
  }, [nextWave, mpRole])

  return (
    <Overlay>
      <Badge style={{ color: '#00ff88' }}>WAVE {wave} CLEARED</Badge>
      <Sub>{waveKills} kills · {kills} total</Sub>
      {bonuses && <BonusBreakdown bonuses={bonuses} />}
    </Overlay>
  )
}

function BonusBreakdown({ bonuses }) {
  const rows = [
    ['Wave', bonuses.base],
    [`Kills ×${Math.round(bonuses.kills)}`, bonuses.kills],
    bonuses.headshots > 0 && [`Headshots ×${bonuses.headshotsCount}`, bonuses.headshots],
    bonuses.knifeKills > 0 && [`Knife ×${bonuses.knifeKillsCount}`, bonuses.knifeKills],
    bonuses.noPlanksLost > 0 && ['Planks intact', bonuses.noPlanksLost],
    bonuses.modifierBonus > 0 && [MODIFIERS[bonuses.modifier]?.name ?? 'Modifier', bonuses.modifierBonus],
    bonuses.fastClear > 0 && [`Fast ${formatSeconds(bonuses.elapsed)}`, bonuses.fastClear],
  ].filter(Boolean)
  // Whole wave's earnings. Kill rows were already paid on each kill; nextWave pays base + total.
  const payout = bonuses.base + bonuses.kills + bonuses.headshots + bonuses.knifeKills + bonuses.total

  return (
    <div style={styles.bonusPanel}>
      {rows.map(([label, value]) => (
        <div key={label} style={styles.bonusRow}>
          <span>{label}</span>
          <span style={styles.bonusValue}>+€{value.toFixed(2)}</span>
        </div>
      ))}
      <div style={styles.bonusDivider} />
      <div style={{ ...styles.bonusRow, color: '#ffe066', fontWeight: 'bold' }}>
        <span>Total</span>
        <span>+€{payout.toFixed(2)}</span>
      </div>
    </div>
  )
}

function formatSeconds(value) {
  return `${Math.max(0, value).toFixed(1)}s`
}

const styles = {
  bonusPanel: {
    width: 'min(360px, 92vw)',
    marginTop: 'clamp(4px, 1.5vmin, 12px)',
    padding: 'clamp(7px, 1.5vmin, 12px) clamp(10px, 2vmin, 16px)',
    background: 'rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,224,102,0.3)',
    borderRadius: 6,
    color: '#bbb',
    fontFamily: 'Courier New, monospace',
    fontSize: 'max(var(--ui-fs-min), clamp(9px, 2vmin, 13px))',
    letterSpacing: 1,
  },
  bonusTitle: {
    color: '#ffe066',
    fontSize: 'max(var(--ui-fs-min), clamp(8px, 1.5vmin, 11px))',
    letterSpacing: 4,
    fontWeight: 'bold',
    marginBottom: 'clamp(4px, 1vmin, 8px)',
    textAlign: 'center',
  },
  bonusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 'clamp(8px, 2vmin, 16px)',
    marginTop: 'clamp(2px, 0.8vmin, 4px)',
  },
  bonusValue: {
    color: '#88cc44',
    whiteSpace: 'nowrap',
  },
  bonusDivider: {
    height: 1,
    background: 'rgba(255,255,255,0.12)',
    margin: 'clamp(4px, 1vmin, 8px) 0',
  },
}
