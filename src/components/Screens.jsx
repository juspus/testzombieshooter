import { useGameStore } from '../store'

export default function Screens() {
  const phase = useGameStore((s) => s.phase)
  const wave = useGameStore((s) => s.wave)
  const kills = useGameStore((s) => s.kills)
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
        <Sub>Kills this wave: {kills}</Sub>
        <Sub style={{ marginTop: 8, color: '#aaa' }}>
          Next wave: <strong style={{ color: '#fff' }}>{nextCount} zombies</strong>
        </Sub>
        <Btn onClick={nextWave}>NEXT WAVE →</Btn>
      </Overlay>
    )
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
