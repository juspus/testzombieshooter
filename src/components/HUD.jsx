import { useGameStore } from '../store'

export default function HUD() {
  const wave = useGameStore((s) => s.wave)
  const kills = useGameStore((s) => s.kills)
  const timeLeft = useGameStore((s) => s.timeLeft)
  const zombies = useGameStore((s) => s.zombies)
  const total = useGameStore((s) => s.getZombiesForWave())

  const time = Math.ceil(timeLeft)
  const danger = time <= 10

  return (
    <div style={styles.hud}>
      {/* Crosshair */}
      <div style={styles.crosshairH} />
      <div style={styles.crosshairV} />

      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.stat}>
          <span style={styles.label}>WAVE</span>
          <span style={styles.value}>{wave}</span>
        </div>
        <div style={{ ...styles.stat, ...styles.timer, color: danger ? '#ff3300' : '#00ff88' }}>
          <span style={styles.label}>TIME</span>
          <span style={{ ...styles.value, fontSize: 36 }}>{time}s</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.label}>KILLS</span>
          <span style={styles.value}>{kills} / {total}</span>
        </div>
      </div>

      {/* Bottom hint */}
      <div style={styles.hint}>WASD to move · Mouse to aim · Click to shoot</div>

      {/* Zombie count bar */}
      <div style={styles.barOuter}>
        <div
          style={{
            ...styles.barInner,
            width: `${((total - zombies.length) / total) * 100}%`,
          }}
        />
      </div>
    </div>
  )
}

const styles = {
  hud: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  crosshairH: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 20,
    height: 2,
    background: 'rgba(255,255,255,0.85)',
  },
  crosshairV: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 2,
    height: 20,
    background: 'rgba(255,255,255,0.85)',
  },
  topBar: {
    display: 'flex',
    gap: 60,
    marginTop: 20,
    background: 'rgba(0,0,0,0.55)',
    padding: '12px 40px',
    borderRadius: 8,
    border: '1px solid #333',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  label: {
    color: '#888',
    fontSize: 11,
    letterSpacing: 3,
    fontFamily: 'Courier New, monospace',
  },
  value: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: 'Courier New, monospace',
    letterSpacing: 2,
  },
  timer: {},
  hint: {
    position: 'absolute',
    bottom: 50,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'Courier New, monospace',
  },
  barOuter: {
    position: 'absolute',
    bottom: 30,
    width: 300,
    height: 6,
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barInner: {
    height: '100%',
    background: '#00ff88',
    transition: 'width 0.2s',
    borderRadius: 3,
  },
}
