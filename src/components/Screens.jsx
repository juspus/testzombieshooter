import { useEffect, useState } from 'react'
import { useGameStore } from '../store'

export default function Screens() {
  const phase = useGameStore((s) => s.phase)
  const wave = useGameStore((s) => s.wave)
  const kills = useGameStore((s) => s.kills)
  const waveKills = useGameStore((s) => s.waveKills)
  const startGame = useGameStore((s) => s.startGame)
  const nextWave = useGameStore((s) => s.nextWave)
  const zombies = useGameStore((s) => s.zombies)
  const total = useGameStore((s) => s.getZombiesForWave())

  if (phase === 'start') {
    return (
      <Overlay>
        <Title>ZOMBIE SHOOTER</Title>
        <Sub>Survive the waves. 30 seconds per wave.</Sub>
        <Sub style={{ marginTop: 4 }}>Shoot all zombies before time runs out.</Sub>
        <Controls>
          WASD — Move &nbsp;|&nbsp; Mouse — Aim &nbsp;|&nbsp; Click — Shoot
        </Controls>
        <Btn onClick={startGame}>START GAME</Btn>
      </Overlay>
    )
  }

  if (phase === 'wave_clear') {
    const nextCount = 5 + wave * 3
    return (
      <Overlay>
        <Badge style={{ color: '#00ff88' }}>WAVE {wave} CLEARED</Badge>
        <Title style={{ fontSize: 48 }}>NICE SHOT!</Title>
        <Sub>Kills this wave: {waveKills}</Sub>
        <Sub style={{ marginTop: 4, color: '#888' }}>Total kills: {kills}</Sub>
        <Sub style={{ marginTop: 8, color: '#aaa' }}>
          Next wave: <strong style={{ color: '#fff' }}>{nextCount} zombies</strong>
        </Sub>
        <Btn onClick={nextWave}>NEXT WAVE →</Btn>
      </Overlay>
    )
  }

  if (phase === 'dead') {
    return <YouDied onRestart={startGame} wave={wave} kills={kills} />
  }

  if (phase === 'game_over') {
    return (
      <Overlay>
        <Badge style={{ color: '#ff3300' }}>TIME'S UP</Badge>
        <Title>GAME OVER</Title>
        <Sub>You reached wave <strong style={{ color: '#fff' }}>{wave}</strong></Sub>
        <Sub>Total kills: <strong style={{ color: '#00ff88' }}>{kills}</strong></Sub>
        <Sub style={{ color: '#666', marginTop: 4 }}>
          {zombies.length} zombie{zombies.length !== 1 ? 's' : ''} remained
        </Sub>
        <Btn onClick={startGame}>PLAY AGAIN</Btn>
      </Overlay>
    )
  }

  return null
}

function Overlay({ children }) {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.78)',
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
    // Fade in text over 1.5s, then show button
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
