import { useEffect, useMemo, useState, useCallback } from 'react'
import { useGameStore } from '../store'
import { createRunShareToken } from '../shareToken'
import { createRoom, joinRoom, disconnect, send, isConnected } from '../net'

function getIsMobileScreen() {
  if (typeof window === 'undefined') return false
  const coarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  const touchPoints = navigator.maxTouchPoints > 0
  const mobileSized = Math.min(window.innerWidth, window.innerHeight) <= 900
  return Boolean(coarsePointer || (touchPoints && mobileSized))
}

export default function Screens() {
  const phase = useGameStore((s) => s.phase)
  const wave = useGameStore((s) => s.wave)
  const kills = useGameStore((s) => s.kills)
  const waveKills = useGameStore((s) => s.waveKills)
  const startGame = useGameStore((s) => s.startGame)
  const nextWave = useGameStore((s) => s.nextWave)
  const intermissionLeft = useGameStore((s) => s.intermissionLeft)
  const getZombiesForWave = useGameStore((s) => s.getZombiesForWave)
  const skipProgress = useGameStore((s) => s.skipProgress)
  const lastWaveBonuses = useGameStore((s) => s.lastWaveBonuses)
  const money = useGameStore((s) => s.money)
  const weapon = useGameStore((s) => s.weapon)
  const perks = useGameStore((s) => s.perks)
  const mpRole = useGameStore((s) => s.mpRole)
  const paused = useGameStore((s) => s.paused)

  if (paused && mpRole === 'guest') {
    return <PausedOverlay />
  }

  if (phase === 'start') {
    return <StartScreen startGame={startGame} />
  }

  if (phase === 'wave_clear') {
    return <WaveClearScreen wave={wave} waveKills={waveKills} kills={kills} bonuses={lastWaveBonuses} nextWave={nextWave} />
  }

  if (phase === 'intermission') {
    const nextCount = getZombiesForWave()
    return <IntermissionScreen wave={wave} intermissionLeft={intermissionLeft} zombieCount={nextCount} money={money} skipProgress={skipProgress} />
  }

  if (phase === 'dead') {
    const handleRestart = () => {
      startGame()
      if (isConnected()) send('game_event', { event: 'start_game', data: {} })
    }
    return <YouDied onRestart={handleRestart} mpRole={mpRole} wave={wave} kills={kills} money={money} weapon={weapon} perks={perks} />
  }

  return null
}

function WaveClearScreen({ wave, waveKills, kills, bonuses, nextWave }) {
  const mpRole = useGameStore((s) => s.mpRole)
  useEffect(() => {
    // Only host drives the wave transition; guest waits for host's game_event
    if (mpRole === 'guest') return
    const id = setTimeout(() => {
      nextWave()
      if (isConnected()) send('game_event', { event: 'next_wave', data: {} })
    }, 3200)
    return () => clearTimeout(id)
  }, [nextWave, mpRole])

  return (
    <Overlay>
      <Badge style={{ color: '#00ff88' }}>WAVE {wave} CLEARED</Badge>
      <Title style={{ fontSize: 'clamp(20px, 6vmin, 48px)' }}>NICE SHOT!</Title>
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
    width: 'min(360px, 92vw)',
    marginTop: 'clamp(4px, 1.5vmin, 12px)',
    padding: 'clamp(7px, 1.5vmin, 12px) clamp(10px, 2vmin, 16px)',
    background: 'rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,224,102,0.3)',
    borderRadius: 6,
    color: '#bbb',
    fontFamily: 'Courier New, monospace',
    fontSize: 'clamp(9px, 2vmin, 13px)',
    letterSpacing: 1,
  },
  bonusTitle: {
    color: '#ffe066',
    fontSize: 'clamp(8px, 1.5vmin, 11px)',
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

function IntermissionScreen({ wave, intermissionLeft, zombieCount, money, skipProgress }) {
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
      border: `1px solid ${urgent ? 'rgba(255,50,0,0.6)' : 'rgba(255,200,0,0.3)'}`,
    }}>
      <div style={titleStyle}>
        WAVE {wave} INCOMING — {zombieCount} ZOMBIES
      </div>
      <div style={{
        ...timerStyle,
        color: urgent ? '#ff3300' : '#ffe066',
        textShadow: urgent ? '0 0 20px rgba(255,50,0,0.8)' : '0 0 12px rgba(255,200,0,0.5)',
      }}>
        {seconds}s
      </div>
      {wave > 1 && (
        <div style={rewardStyle}>
          +€15.00 WAVE REWARD
        </div>
      )}
      <div style={hintStyle}>
        {isMobile ? 'HOLD USE NEAR WINDOWS · €2.50/PLANK' : 'HOLD E NEAR WINDOWS TO BOARD · €2.50 PER PLANK'}
      </div>
      {!isMobile && (
        <div style={skipStyle}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: skipProgress > 0 ? '#aaa' : '#444' }}>
            HOLD T TO SKIP
          </div>
          <div style={{ width: 140, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${skipProgress * 100}%`, background: '#aaa', borderRadius: 2, transition: 'width 0.05s linear' }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Multiplayer lobby ──────────────────────────────────────────────────────

function RoomCodeDisplay({ code }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard?.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: '#666', fontSize: 11, letterSpacing: 4, marginBottom: 6 }}>ROOM CODE</div>
      <div
        onClick={handleCopy}
        title="Click to copy"
        style={{
          color: copied ? '#88cc44' : '#ffe066',
          fontSize: 36,
          fontFamily: 'Courier New, monospace',
          letterSpacing: 10,
          textShadow: copied
            ? '0 0 20px rgba(136,204,68,0.6)'
            : '0 0 20px rgba(255,224,102,0.5)',
          cursor: 'pointer',
          userSelect: 'all',
          padding: '6px 14px',
          border: `1px solid ${copied ? 'rgba(136,204,68,0.4)' : 'rgba(255,224,102,0.2)'}`,
          borderRadius: 4,
          transition: 'color 0.2s, text-shadow 0.2s, border-color 0.2s',
        }}
      >
        {code}
      </div>
      <div style={{ color: copied ? '#88cc44' : '#555', fontSize: 11, letterSpacing: 3, marginTop: 6, transition: 'color 0.2s' }}>
        {copied ? 'COPIED!' : 'CLICK TO COPY'}
      </div>
    </div>
  )
}

function StartScreen({ startGame }) {
  const [view, setView] = useState('main') // 'main' | 'host' | 'join'
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [status, setStatus] = useState('')
  const [connected, setConnected] = useState(false)
  const [mpRole, setMpRoleLocal] = useState(null)

  const setMpRole = useGameStore((s) => s.setMpRole)
  const setMpConnected = useGameStore((s) => s.setMpConnected)

  const onDisconnected = useCallback(() => {
    setConnected(false)
    setStatus('Disconnected.')
    setMpConnected(false)
    useGameStore.getState().clearMp()
  }, [setMpConnected])

  const handleHost = useCallback(() => {
    setView('host')
    setStatus('Generating room code…')
    setMpRoleLocal('host')
    setMpRole('host')
    createRoom(
      (code) => {
        setRoomCode(code)
        navigator.clipboard?.writeText(code).catch(() => {})
        setStatus('Code copied to clipboard — share with Player 2')
      },
      () => {
        setConnected(true)
        setStatus('Player 2 connected!')
        setMpConnected(true)
      },
      onDisconnected,
    )
  }, [setMpRole, setMpConnected, onDisconnected])

  const handleJoin = useCallback(() => {
    if (!joinCode.trim()) return
    setStatus('Connecting…')
    setMpRoleLocal('guest')
    setMpRole('guest')
    joinRoom(
      joinCode.trim(),
      () => {
        setConnected(true)
        setStatus('Connected! Host will start the game.')
        setMpConnected(true)
        // Guests don't call startGame — they wait for the host's start_game event
      },
      (err) => {
        setStatus(`Failed: ${err?.type ?? 'connection error'}`)
        useGameStore.getState().clearMp()
      },
      onDisconnected,
    )
  }, [joinCode, setMpRole, setMpConnected, onDisconnected])

  const handleStartGame = useCallback(() => {
    startGame()
    if (isConnected()) send('game_event', { event: 'start_game', data: {} })
  }, [startGame])

  const handleBack = useCallback(() => {
    disconnect()
    setView('main')
    setRoomCode('')
    setJoinCode('')
    setStatus('')
    setConnected(false)
    setMpRoleLocal(null)
    useGameStore.getState().clearMp()
  }, [])

  return (
    <Overlay>
      <Title>CABIN</Title>
      <Sub>Survive the waves. Kill all zombies to advance.</Sub>
      <Controls>WASD — Move &nbsp;|&nbsp; Mouse — Aim &nbsp;|&nbsp; Click — Shoot</Controls>

      {view === 'main' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <Btn onClick={startGame}>SOLO</Btn>
          <div style={{ color: '#444', fontSize: 12, letterSpacing: 4 }}>── OR ──</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Btn onClick={handleHost}>HOST GAME</Btn>
            <Btn onClick={() => setView('join')}>JOIN GAME</Btn>
          </div>
        </div>
      )}

      {view === 'host' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 8 }}>
          {roomCode ? <RoomCodeDisplay code={roomCode} /> : null}
          <div style={{ color: '#888', fontSize: 13, letterSpacing: 2 }}>{status}</div>
          {connected && <Btn onClick={handleStartGame}>START GAME</Btn>}
          <BackBtn onClick={handleBack} />
        </div>
      )}

      {view === 'join' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g, '').slice(0, 5))}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="XXXXX"
            maxLength={5}
            style={{
              background: 'rgba(0,0,0,0.6)',
              border: '1px solid #555',
              color: '#ffe066',
              padding: '10px 16px',
              fontSize: 20,
              letterSpacing: 6,
              fontFamily: 'Courier New, monospace',
              textAlign: 'center',
              outline: 'none',
              width: 280,
            }}
          />
          {status && <div style={{ color: '#888', fontSize: 13, letterSpacing: 2 }}>{status}</div>}
          {!connected && <Btn onClick={handleJoin}>CONNECT</Btn>}
          <BackBtn onClick={handleBack} />
        </div>
      )}
    </Overlay>
  )
}

function BackBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        color: '#555',
        fontSize: 'clamp(9px, 1.8vmin, 12px)',
        letterSpacing: 3,
        fontFamily: 'Courier New, monospace',
        cursor: 'pointer',
        marginTop: 'clamp(2px, 0.8vmin, 4px)',
      }}
    >
      ← BACK
    </button>
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
    top: 'max(38px, calc(env(safe-area-inset-top) + 28px))',
    gap: 1,
    padding: '5px 12px 7px',
    borderRadius: 5,
    background: 'rgba(0,0,0,0.48)',
    maxWidth: 'calc(var(--app-width, 100vw) - 220px)',
    minWidth: 220,
  },
  title: {
    fontSize: 11,
    letterSpacing: 6,
    color: '#888',
    fontWeight: 'bold',
  },
  mobileTitle: {
    fontSize: 8,
    letterSpacing: 2,
    whiteSpace: 'nowrap',
  },
  timer: {
    fontSize: 48,
    fontWeight: 'bold',
    lineHeight: 1,
    transition: 'color 0.3s, text-shadow 0.3s',
  },
  mobileTimer: {
    fontSize: 20,
  },
  reward: {
    fontSize: 12,
    letterSpacing: 3,
    color: '#88cc44',
    marginTop: 2,
  },
  mobileReward: {
    fontSize: 9,
    letterSpacing: 1.5,
    marginTop: 0,
  },
  hint: {
    fontSize: 11,
    letterSpacing: 2,
    color: '#555',
    marginTop: 2,
  },
  mobileHint: {
    fontSize: 8,
    letterSpacing: 1,
    marginTop: 1,
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
      gap: 'clamp(5px, 1.5vmin, 12px)',
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
      fontSize: 'clamp(26px, 8vmin, 64px)',
      fontWeight: 'bold',
      letterSpacing: 'max(3px, 1.5vmin)',
      textShadow: '0 0 30px rgba(255,50,0,0.8)',
      margin: 0,
      ...style,
    }}>{children}</h1>
  )
}

function Badge({ children, style }) {
  return (
    <div style={{
      fontSize: 'clamp(9px, 2.2vmin, 14px)',
      letterSpacing: 'max(2px, 1vmin)',
      fontWeight: 'bold',
      ...style,
    }}>{children}</div>
  )
}

function Sub({ children, style }) {
  return (
    <p style={{
      color: '#aaa',
      fontSize: 'clamp(10px, 2.2vmin, 16px)',
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
      fontSize: 'clamp(8px, 1.7vmin, 13px)',
      margin: 'clamp(4px, 1vmin, 8px) 0',
      letterSpacing: 1,
    }}>{children}</p>
  )
}

function YouDied({ onRestart, mpRole, wave, kills, money, weapon, perks }) {
  const [opacity, setOpacity] = useState(0)
  const [btnVisible, setBtnVisible] = useState(false)
  const [shareStatus, setShareStatus] = useState('')

  const runSummary = useMemo(() => ({
    wave,
    kills,
    money,
    weapon: formatWeaponName(weapon),
    perks: Object.keys(perks ?? {}).filter((key) => perks[key]).map(formatPerkName),
    gameUrl: getGameUrl(),
  }), [wave, kills, money, weapon, perks])

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

  const handleShare = async () => {
    const shareUrl = getRunShareUrl(runSummary)
    const shareData = {
      title: 'Cabin run results',
      text: `I reached wave ${runSummary.wave} with ${runSummary.kills} kill${runSummary.kills !== 1 ? 's' : ''} in Cabin.`,
      url: shareUrl,
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        setShareStatus('Shared run link with preview image!')
      } else {
        await copyGameLink(shareUrl)
        setShareStatus('Share link copied with OG preview image.')
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        setShareStatus('Share canceled.')
        return
      }
      console.error('Unable to share run', error)
      await copyGameLink(shareUrl)
      setShareStatus('Share failed. Link copied instead.')
    }
  }

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
        fontSize: 'clamp(38px, 11vmin, 120px)',
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
        fontSize: 'clamp(10px, 2vmin, 14px)',
        letterSpacing: 4,
        marginTop: 'clamp(6px, 1.5vmin, 16px)',
        fontFamily: 'Courier New, monospace',
        textTransform: 'uppercase',
      }}>
        Wave {wave} &nbsp;·&nbsp; {kills} kill{kills !== 1 ? 's' : ''}
      </div>

      <div style={{
        opacity: opacity * 0.7,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(80px, 1fr))',
        gap: 'clamp(5px, 1.5vmin, 12px)',
        width: 'min(480px, 88vw)',
        marginTop: 'clamp(8px, 2.5vmin, 28px)',
        fontFamily: 'Courier New, monospace',
      }}>
        <DeathStat label="Cash" value={`€${money.toFixed(2)}`} />
        <DeathStat label="Weapon" value={runSummary.weapon} />
        <DeathStat label="Perks" value={runSummary.perks.length || 'None'} />
      </div>

      <div style={{
        marginTop: 'clamp(10px, 3.5vmin, 56px)',
        opacity: btnVisible ? 1 : 0,
        transition: 'opacity 0.8s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'clamp(6px, 1.5vmin, 12px)',
      }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <DeathButton onClick={handleShare} accent="rgba(220,220,220,0.78)">
            Share Run
          </DeathButton>
          {mpRole === 'guest' ? (
            <div style={{
              padding: 'clamp(7px, 1.5vmin, 14px) clamp(16px, 4vmin, 36px)',
              minWidth: 'clamp(120px, 25vmin, 210px)',
              border: '1px solid rgba(180,0,0,0.3)',
              color: 'rgba(150,150,150,0.6)',
              fontSize: 'clamp(10px, 2vmin, 13px)',
              letterSpacing: 3,
              fontFamily: 'Courier New, monospace',
              textAlign: 'center',
              textTransform: 'uppercase',
            }}>
              Waiting for host…
            </div>
          ) : (
            <DeathButton onClick={onRestart}>
              Start New Game
            </DeathButton>
          )}
        </div>
        <div style={{
          minHeight: 18,
          color: '#777',
          fontSize: 12,
          letterSpacing: 2,
          fontFamily: 'Courier New, monospace',
          textTransform: 'uppercase',
        }}>
          {shareStatus}
        </div>
      </div>
    </div>
  )
}

function DeathStat({ label, value }) {
  return (
    <div style={{
      border: '1px solid rgba(180,0,0,0.35)',
      background: 'rgba(0,0,0,0.35)',
      padding: 'clamp(5px, 1.2vmin, 10px) clamp(6px, 1.5vmin, 12px)',
      textAlign: 'center',
      textTransform: 'uppercase',
    }}>
      <div style={{ color: '#666', fontSize: 'clamp(8px, 1.4vmin, 10px)', letterSpacing: 2 }}>{label}</div>
      <div style={{ color: '#ccc', fontSize: 'clamp(11px, 2.5vmin, 16px)', letterSpacing: 2, marginTop: 'clamp(2px, 0.5vmin, 4px)' }}>{value}</div>
    </div>
  )
}

function DeathButton({ children, onClick, accent = 'rgba(180,0,0,0.7)' }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: 'clamp(7px, 1.5vmin, 14px) clamp(16px, 4vmin, 36px)',
        minWidth: 'clamp(120px, 25vmin, 210px)',
        background: 'transparent',
        border: `1px solid ${accent}`,
        color: 'rgba(200,200,200,0.9)',
        fontSize: 'clamp(10px, 2vmin, 15px)',
        letterSpacing: 'clamp(2px, 0.8vmin, 5px)',
        fontFamily: 'Courier New, monospace',
        cursor: 'pointer',
        textTransform: 'uppercase',
        transition: 'all 0.3s',
      }}
      onMouseEnter={(e) => {
        e.target.style.background = accent === 'rgba(180,0,0,0.7)' ? 'rgba(140,0,0,0.4)' : 'rgba(255,255,255,0.12)'
        e.target.style.borderColor = accent === 'rgba(180,0,0,0.7)' ? 'rgba(200,0,0,1)' : '#fff'
        e.target.style.color = '#fff'
      }}
      onMouseLeave={(e) => {
        e.target.style.background = 'transparent'
        e.target.style.borderColor = accent
        e.target.style.color = 'rgba(200,200,200,0.9)'
      }}
    >
      {children}
    </button>
  )
}

function getGameUrl() {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${window.location.pathname}`
}

function getRunShareUrl(summary) {
  if (typeof window === 'undefined') return ''

  const url = new URL('/api/share', window.location.origin)
  url.searchParams.set('r', createRunShareToken(summary))
  return url.toString()
}

function formatWeaponName(weapon) {
  const names = { pistol: 'Pistol', ak47: 'AK-47', deagle: 'Deagle', shotgun: 'Shotgun' }
  return names[weapon] ?? weapon
}

function formatPerkName(perk) {
  return perk.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

async function copyGameLink(gameUrl) {
  if (!gameUrl) return
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(gameUrl)
    return
  }

  const input = document.createElement('textarea')
  input.value = gameUrl
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  input.remove()
}

function PausedOverlay() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.72)',
      gap: 12,
      fontFamily: 'Courier New, monospace',
      pointerEvents: 'none',
    }}>
      <div style={{
        fontSize: 52,
        fontWeight: 'bold',
        letterSpacing: 12,
        color: '#ffe066',
        textShadow: '0 0 30px rgba(255,224,102,0.5)',
      }}>
        PAUSED
      </div>
      <div style={{ color: '#888', fontSize: 13, letterSpacing: 4 }}>
        HOST SWITCHED TABS
      </div>
    </div>
  )
}

function Btn({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: 'clamp(8px, 2.5vmin, 24px)',
        padding: 'clamp(7px, 1.5vmin, 14px) clamp(20px, 5vmin, 48px)',
        background: 'transparent',
        border: '2px solid #ff3300',
        color: '#ff3300',
        fontSize: 'clamp(11px, 2.5vmin, 18px)',
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
