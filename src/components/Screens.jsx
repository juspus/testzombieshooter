import { useEffect, useState } from 'react'
import { useGameStore } from '../store'

export default function Screens() {
  const phase = useGameStore((s) => s.phase)
  const wave = useGameStore((s) => s.wave)
  const kills = useGameStore((s) => s.kills)
  const waveKills = useGameStore((s) => s.waveKills)
  const startGame = useGameStore((s) => s.startGame)
  const nextWave = useGameStore((s) => s.nextWave)
  const intermissionLeft = useGameStore((s) => s.intermissionLeft)
  const getZombiesForWave = useGameStore((s) => s.getZombiesForWave)
  const money = useGameStore((s) => s.money)
  const skipProgress = useGameStore((s) => s.skipProgress)
  const lastWaveBonuses = useGameStore((s) => s.lastWaveBonuses)

  if (phase === 'start') {
    return (
      <Overlay>
        <Title>ZOMBIE SHOOTER</Title>
        <Sub>Survive the waves. Kill all zombies to advance.</Sub>
        <Controls>
          WASD — Move &nbsp;|&nbsp; Mouse — Aim &nbsp;|&nbsp; Click — Shoot
        </Controls>
        <Btn onClick={startGame}>START GAME</Btn>
      </Overlay>
    )
  }

  if (phase === 'wave_clear') {
    return <WaveClearScreen wave={wave} waveKills={waveKills} kills={kills} bonuses={lastWaveBonuses} nextWave={nextWave} />
  }

  if (phase === 'intermission') {
    const nextCount = getZombiesForWave()
    return <IntermissionScreen wave={wave} intermissionLeft={intermissionLeft} zombieCount={nextCount} money={money} skipProgress={skipProgress} />
  }

  if (phase === 'dead') {
    return <YouDied onRestart={startGame} wave={wave} kills={kills} />
  }

  return null
}

function WaveClearScreen({ wave, waveKills, kills, bonuses, nextWave }) {
  useEffect(() => {
    const id = setTimeout(nextWave, 3200)
    return () => clearTimeout(id)
  }, [nextWave])

  return (
    <Overlay>
      <Badge style={{ color: '#00ff88' }}>WAVE {wave} CLEARED</Badge>
      <Title style={{ fontSize: 48 }}>NICE SHOT!</Title>
      <Sub>Kills this wave: {waveKills}</Sub>
      <Sub style={{ marginTop: 4, color: '#888' }}>Total kills: {kills}</Sub>
      {bonuses && <BonusBreakdown bonuses={bonuses} />}
    </Overlay>
  )
}

function BonusBreakdown({ bonuses }) {
  const rows = [
    ['Wave reward', bonuses.base],
    [`Kill reward (${Math.round(bonuses.kills)} kills)`, bonuses.kills],
    bonuses.headshots > 0 && [`Headshot kills (${bonuses.headshotsCount})`, bonuses.headshots],
    bonuses.knifeKills > 0 && [`Knife kills (${bonuses.knifeKillsCount})`, bonuses.knifeKills],
    bonuses.noPlanksLost > 0 && ['No planks lost', bonuses.noPlanksLost],
    bonuses.fastClear > 0 && [`Fast clear (${formatSeconds(bonuses.elapsed)} / ${formatSeconds(bonuses.fastClearPar)})`, bonuses.fastClear],
  ].filter(Boolean)
  const payout = bonuses.base + bonuses.kills + bonuses.total

  return (
    <div style={styles.bonusPanel}>
      <div style={styles.bonusTitle}>PERFORMANCE PAYOUT</div>
      {rows.map(([label, value]) => (
        <div key={label} style={styles.bonusRow}>
          <span>{label}</span>
          <span style={styles.bonusValue}>+€{value.toFixed(2)}</span>
        </div>
      ))}
      <div style={styles.bonusDivider} />
      <div style={{ ...styles.bonusRow, color: '#ffe066', fontWeight: 'bold' }}>
        <span>Total banked next wave</span>
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
    width: 360,
    marginTop: 12,
    padding: '12px 16px',
    background: 'rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,224,102,0.3)',
    borderRadius: 6,
    color: '#bbb',
    fontFamily: 'Courier New, monospace',
    fontSize: 13,
    letterSpacing: 1,
  },
  bonusTitle: {
    color: '#ffe066',
    fontSize: 11,
    letterSpacing: 4,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  bonusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 4,
  },
  bonusValue: {
    color: '#88cc44',
    whiteSpace: 'nowrap',
  },
  bonusDivider: {
    height: 1,
    background: 'rgba(255,255,255,0.12)',
    margin: '8px 0',
  },
}

function IntermissionScreen({ wave, intermissionLeft, zombieCount, money, skipProgress }) {
  const seconds = Math.ceil(intermissionLeft)
  const urgent = seconds <= 3

  return (
    <div style={{
      position: 'absolute',
      top: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      background: 'rgba(0,0,0,0.65)',
      border: `1px solid ${urgent ? 'rgba(255,50,0,0.6)' : 'rgba(255,200,0,0.3)'}`,
      borderRadius: 6,
      padding: '10px 28px 14px',
      fontFamily: 'Courier New, monospace',
      pointerEvents: 'none',
      transition: 'border-color 0.3s',
    }}>
      <div style={{ fontSize: 11, letterSpacing: 6, color: '#888', fontWeight: 'bold' }}>
        WAVE {wave} INCOMING — {zombieCount} ZOMBIES
      </div>
      <div style={{
        fontSize: 48,
        fontWeight: 'bold',
        color: urgent ? '#ff3300' : '#ffe066',
        textShadow: urgent ? '0 0 20px rgba(255,50,0,0.8)' : '0 0 12px rgba(255,200,0,0.5)',
        lineHeight: 1,
        transition: 'color 0.3s, text-shadow 0.3s',
      }}>
        {seconds}s
      </div>
      {wave > 1 && (
        <div style={{ fontSize: 12, letterSpacing: 3, color: '#88cc44', marginTop: 2 }}>
          +€15.00 WAVE REWARD
        </div>
      )}
      <div style={{ fontSize: 11, letterSpacing: 2, color: '#555', marginTop: 2 }}>
        HOLD E NEAR WINDOWS TO BOARD · €2.50 PER PLANK
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: skipProgress > 0 ? '#aaa' : '#444' }}>
          HOLD T TO SKIP
        </div>
        <div style={{ width: 140, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${skipProgress * 100}%`, background: '#aaa', borderRadius: 2, transition: 'width 0.05s linear' }} />
        </div>
      </div>
    </div>
  )
}

function Overlay({ children, dim = 0.78 }) {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: `rgba(0,0,0,${dim})`,
      gap: 12,
      fontFamily: 'Courier New, monospace',
    }}>
      {children}
    </div>
  )
}

function Title({ children, style }) {
  return (
    <h1 style={{
      color: '#fff',
      fontSize: 64,
      fontWeight: 'bold',
      letterSpacing: 8,
      textShadow: '0 0 30px rgba(255,50,0,0.8)',
      margin: 0,
      ...style,
    }}>{children}</h1>
  )
}

function Badge({ children, style }) {
  return (
    <div style={{
      fontSize: 14,
      letterSpacing: 6,
      fontWeight: 'bold',
      ...style,
    }}>{children}</div>
  )
}

function Sub({ children, style }) {
  return (
    <p style={{
      color: '#aaa',
      fontSize: 16,
      margin: 0,
      letterSpacing: 1,
      ...style,
    }}>{children}</p>
  )
}

function Controls({ children }) {
  return (
    <p style={{
      color: '#666',
      fontSize: 13,
      margin: '8px 0',
      letterSpacing: 1,
    }}>{children}</p>
  )
}

function YouDied({ onRestart, wave, kills }) {
  const [opacity, setOpacity] = useState(0)
  const [btnVisible, setBtnVisible] = useState(false)

  useEffect(() => {
    let start = null
    const fade = (ts) => {
      if (!start) start = ts
      const t = Math.min((ts - start) / 1500, 1)
      setOpacity(t)
      if (t < 1) requestAnimationFrame(fade)
      else setTimeout(() => setBtnVisible(true), 400)
    }
    const raf = requestAnimationFrame(fade)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: `rgba(0,0,0,${0.3 + opacity * 0.55})`,
      gap: 0,
      fontFamily: 'Garamond, Georgia, serif',
      transition: 'background 0.1s',
    }}>
      <h1 style={{
        color: `rgba(180,0,0,${opacity})`,
        fontSize: 'clamp(60px, 12vw, 120px)',
        fontWeight: 'bold',
        letterSpacing: '0.15em',
        margin: 0,
        textShadow: `0 0 60px rgba(200,0,0,${opacity * 0.9}), 0 0 120px rgba(140,0,0,${opacity * 0.5})`,
        userSelect: 'none',
      }}>
        YOU DIED
      </h1>

      <div style={{
        opacity: opacity * 0.6,
        color: '#888',
        fontSize: 14,
        letterSpacing: 4,
        marginTop: 16,
        fontFamily: 'Courier New, monospace',
        textTransform: 'uppercase',
      }}>
        Wave {wave} &nbsp;·&nbsp; {kills} kill{kills !== 1 ? 's' : ''}
      </div>

      <div style={{
        marginTop: 56,
        opacity: btnVisible ? 1 : 0,
        transition: 'opacity 0.8s ease',
      }}>
        <button
          onClick={onRestart}
          style={{
            padding: '14px 52px',
            background: 'transparent',
            border: '1px solid rgba(180,0,0,0.7)',
            color: 'rgba(200,200,200,0.9)',
            fontSize: 15,
            letterSpacing: 5,
            fontFamily: 'Courier New, monospace',
            cursor: 'pointer',
            textTransform: 'uppercase',
            transition: 'all 0.3s',
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(140,0,0,0.4)'
            e.target.style.borderColor = 'rgba(200,0,0,1)'
            e.target.style.color = '#fff'
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent'
            e.target.style.borderColor = 'rgba(180,0,0,0.7)'
            e.target.style.color = 'rgba(200,200,200,0.9)'
          }}
        >
          Start New Game
        </button>
      </div>
    </div>
  )
}

function Btn({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: 24,
        padding: '14px 48px',
        background: 'transparent',
        border: '2px solid #ff3300',
        color: '#ff3300',
        fontSize: 18,
        letterSpacing: 4,
        fontFamily: 'Courier New, monospace',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.target.style.background = '#ff3300'
        e.target.style.color = '#000'
      }}
      onMouseLeave={(e) => {
        e.target.style.background = 'transparent'
        e.target.style.color = '#ff3300'
      }}
    >
      {children}
    </button>
  )
}
