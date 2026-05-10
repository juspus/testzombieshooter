import { useGameStore, CLIP_SIZE, AK_CLIP, PLANK_COST } from '../store'


export default function HUD() {
  const wave = useGameStore((s) => s.wave)
  const waveKills = useGameStore((s) => s.waveKills)
  const zombies = useGameStore((s) => s.zombies)
  const total = useGameStore((s) => s.getZombiesForWave())
  const bulletsInClip = useGameStore((s) => s.bulletsInClip)
  const reserveBullets = useGameStore((s) => s.reserveBullets)
  const isReloading = useGameStore((s) => s.isReloading)
  const nearWindowId = useGameStore((s) => s.nearWindowId)
  const windowPlanks = useGameStore((s) => s.windowPlanks)
  const boardingProgress = useGameStore((s) => s.boardingProgress)
  const money = useGameStore((s) => s.money)
  const weapon = useGameStore((s) => s.weapon)
  const nearChest = useGameStore((s) => s.nearChest)
  const clipSize = weapon === 'ak47' ? AK_CLIP : CLIP_SIZE
  const nearPlankCount = nearWindowId >= 0 ? (windowPlanks[nearWindowId] ?? 0) : 0
  const showBoardPrompt = nearWindowId >= 0 && nearPlankCount < 2 && !nearChest
  const canAfford = money >= PLANK_COST

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
        <div style={styles.stat}>
          <span style={styles.label}>KILLS</span>
          <span style={styles.value}>{waveKills} / {total}</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.label}>MONEY</span>
          <span style={{ ...styles.value, color: canAfford ? '#ffe066' : '#ff6644' }}>
            €{money.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Ammo — bottom right */}
      <div style={styles.ammoBox}>
        <div style={styles.weaponLabel}>{weapon === 'ak47' ? 'AK-47' : 'PISTOL'}</div>
        {isReloading ? (
          <div style={styles.reloading}>RELOADING…</div>
        ) : (
          <div style={{
            ...styles.ammoCount,
            color: bulletsInClip === 0 ? '#ff3300' : bulletsInClip <= 3 ? '#ffaa00' : '#fff',
          }}>
            {bulletsInClip}<span style={styles.ammoSep}>/</span>{bulletsInClip + reserveBullets}
          </div>
        )}
        <div style={styles.reloadHint}>R — reload</div>
        {/* Bullet pip row */}
        <div style={{ ...styles.pips, flexWrap: 'wrap', maxWidth: clipSize <= 10 ? 'auto' : 90 }}>
          {Array.from({ length: clipSize }).map((_, i) => (
            <div key={i} style={{
              ...styles.pip,
              background: i < bulletsInClip ? '#ffe066' : '#333',
            }} />
          ))}
        </div>
      </div>

      {/* Chest prompt */}
      {nearChest && !showBoardPrompt && (
        <div style={{ ...styles.boardPrompt, borderColor: '#5a3a10', bottom: 90 }}>
          <span style={{ color: '#c8801a' }}>E — open supply chest</span>
        </div>
      )}

      {/* Window board prompt */}
      {showBoardPrompt && (
        <div style={{ ...styles.boardPrompt, borderColor: canAfford ? '#554400' : '#552200' }}>
          <span style={{ color: canAfford ? '#ffe066' : '#ff6644' }}>
            {canAfford
              ? `HOLD E — board window (€${PLANK_COST.toFixed(2)}) [${nearPlankCount}/2]`
              : `NOT ENOUGH MONEY — €${PLANK_COST.toFixed(2)} needed`}
          </span>
          {canAfford && (
            <div style={styles.boardBar}>
              <div style={{ ...styles.boardBarFill, width: `${boardingProgress * 100}%` }} />
            </div>
          )}
        </div>
      )}

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
  ammoBox: {
    position: 'absolute',
    bottom: 40,
    right: 40,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
    fontFamily: 'Courier New, monospace',
  },
  weaponLabel: {
    color: '#888',
    fontSize: 11,
    letterSpacing: 3,
    marginBottom: 2,
  },
  ammoCount: {
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 2,
    lineHeight: 1,
  },
  ammoSep: {
    color: '#555',
    margin: '0 2px',
    fontSize: 24,
  },
  reserve: {
    color: '#888',
    fontSize: 13,
    letterSpacing: 1,
  },
  reloading: {
    color: '#ffaa00',
    fontSize: 18,
    letterSpacing: 4,
    fontWeight: 'bold',
    animation: 'none',
  },
  reloadHint: {
    color: '#444',
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 2,
  },
  boardPrompt: {
    position: 'absolute',
    bottom: 90,
    background: 'rgba(0,0,0,0.6)',
    color: '#ffe066',
    fontSize: 14,
    letterSpacing: 3,
    fontFamily: 'Courier New, monospace',
    padding: '8px 18px 10px',
    borderRadius: 4,
    border: '1px solid #554400',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 220,
  },
  boardBar: {
    width: '100%',
    height: 5,
    background: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  boardBarFill: {
    height: '100%',
    background: '#ffe066',
    borderRadius: 3,
    transition: 'width 0.05s linear',
  },
  pips: {
    display: 'flex',
    gap: 3,
    marginTop: 4,
  },
  pip: {
    width: 6,
    height: 14,
    borderRadius: 2,
    transition: 'background 0.1s',
  },
}
