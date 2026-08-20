import { useEffect, useMemo, useState, useCallback } from 'react'
import { useGameStore } from '../store'
import { createRunShareToken } from '../shareToken'
import { createRoom, joinRoom, disconnect, send, isConnected } from '../net'
import { submitScore, fetchLeaderboard, signInWithGoogle, signOut, onAuthStateChange, getUser, getProfile, setUsername as saveUsername } from '../supabase'

function useAuthUser() {
  const [user, setUser] = useState(null)
  useEffect(() => {
    getUser().then(setUser)
    return onAuthStateChange(setUser)
  }, [])
  return user
}

function useProfile(user) {
  const [username, setUsername] = useState(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!user) { setUsername(null); return }
    setLoading(true)
    getProfile().then((p) => { setUsername(p?.username ?? null); setLoading(false) })
  }, [user?.id])
  const refresh = () => getProfile().then((p) => setUsername(p?.username ?? null))
  return { username, loading, refresh }
}

function getIsMobileScreen() {
  if (typeof window === 'undefined') return false
  const coarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  const touchPoints = navigator.maxTouchPoints > 0
  const mobileSized = Math.min(window.innerWidth, window.innerHeight) <= 900
  return Boolean(coarsePointer || (touchPoints && mobileSized))
}

export default function Screens() {
  const phase = useGameStore((s) => s.phase)
  useEffect(() => { if (phase === 'dead') navigator.vibrate?.([80, 60, 180]) }, [phase])
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

  const authUser = useAuthUser()
  const { username, refresh: refreshProfile } = useProfile(authUser)

  if (paused && mpRole === 'guest') {
    return <PausedOverlay />
  }

  if (phase === 'start') {
    return <StartScreen startGame={startGame} user={authUser} username={username} onUsernameSet={refreshProfile} />
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
    return <YouDied onRestart={handleRestart} mpRole={mpRole} wave={wave} kills={kills} money={money} weapon={weapon} perks={perks} username={username} />
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

function StartScreen({ startGame, user, username, onUsernameSet }) {
  const [view, setView] = useState('main') // 'main' | 'host' | 'join' | 'leaderboard' | 'setusername'
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [status, setStatus] = useState('')
  const [connected, setConnected] = useState(false)
  const [mpRole, setMpRoleLocal] = useState(null)

  // Auto-prompt username picker after first Google login
  useEffect(() => {
    if (user && username === null && view === 'main') setView('setusername')
    if (user && username !== null && view === 'setusername') setView('main')
  }, [user, username])

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

      <div style={{
        position: 'absolute',
        bottom: 'clamp(10px, 2vmin, 20px)',
        color: '#333',
        fontSize: 'clamp(8px, 1.4vmin, 11px)',
        letterSpacing: 2,
        fontFamily: 'Courier New, monospace',
        userSelect: 'none',
      }}>
        v{__APP_VERSION__}
      </div>

      {view === 'main' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <AuthPanel user={user} username={username} onRename={() => setView('setusername')} />
          <Btn onClick={startGame}>SOLO</Btn>
          <div style={{ color: '#444', fontSize: 12, letterSpacing: 4 }}>── OR ──</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Btn onClick={handleHost}>HOST GAME</Btn>
            <Btn onClick={() => setView('join')}>JOIN GAME</Btn>
          </div>
          <button
            onClick={() => setView('leaderboard')}
            style={{
              marginTop: 6,
              background: 'transparent',
              border: 'none',
              color: '#555',
              fontSize: 'clamp(9px, 1.8vmin, 12px)',
              letterSpacing: 3,
              fontFamily: 'Courier New, monospace',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            Leaderboard
          </button>
        </div>
      )}

      {view === 'leaderboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
          <LeaderboardPanel />
          <BackBtn onClick={() => setView('main')} />
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

      {view === 'setusername' && (
        <UsernamePickerView onDone={() => { onUsernameSet?.(); setView('main') }} />
      )}
    </Overlay>
  )
}

const smallBtnStyle = {
  background: 'transparent',
  border: '1px solid #444',
  color: '#666',
  fontSize: 10,
  fontFamily: 'Courier New, monospace',
  letterSpacing: 2,
  padding: '3px 8px',
  cursor: 'pointer',
  textTransform: 'uppercase',
}

function AuthPanel({ user, username, onRename }) {
  if (user) {
    const avatar = user.user_metadata?.avatar_url
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {avatar && (
          <img
            src={avatar}
            alt=""
            style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #555' }}
          />
        )}
        <span style={{ color: '#ffe066', fontSize: 12, fontFamily: 'Courier New, monospace', letterSpacing: 1 }}>
          {username ?? '…'}
        </span>
        {username && <button onClick={onRename} style={smallBtnStyle}>Rename</button>}
        <button onClick={() => signOut()} style={smallBtnStyle}>Sign out</button>
      </div>
    )
  }
  return (
    <button
      onClick={() => signInWithGoogle()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid #444',
        color: '#ccc',
        fontSize: 12,
        fontFamily: 'Courier New, monospace',
        letterSpacing: 2,
        padding: '8px 16px',
        cursor: 'pointer',
        textTransform: 'uppercase',
        marginBottom: 6,
      }}
    >
      <GoogleIcon />
      Sign in with Google
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  )
}

function UsernamePickerView({ onDone }) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'saving' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  const handleSave = async () => {
    if (value.trim().length < 2 || status === 'saving') return
    setStatus('saving')
    try {
      await saveUsername(value)
      onDone()
    } catch (err) {
      setErrorMsg(err?.message?.includes('unique') ? 'Name taken — try another.' : 'Something went wrong.')
      setStatus('error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 8 }}>
      <Sub>Choose a username to save your scores:</Sub>
      <input
        value={value}
        onChange={(e) => { setValue(e.target.value.slice(0, 24)); setStatus('idle'); setErrorMsg('') }}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        placeholder="YourName"
        maxLength={24}
        autoFocus
        style={{
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid #555',
          color: '#ffe066',
          padding: '10px 16px',
          fontSize: 16,
          letterSpacing: 3,
          fontFamily: 'Courier New, monospace',
          textAlign: 'center',
          outline: 'none',
          width: 280,
        }}
      />
      {errorMsg && <div style={{ color: '#cc4444', fontSize: 12, fontFamily: 'Courier New, monospace', letterSpacing: 1 }}>{errorMsg}</div>}
      <Btn onClick={handleSave} disabled={value.trim().length < 2 || status === 'saving'}>
        {status === 'saving' ? '…' : 'SAVE'}
      </Btn>
    </div>
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
    fontSize: 7,
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
    fontSize: 8,
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
    fontSize: 7,
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

function YouDied({ onRestart, mpRole, wave, kills, money, weapon, perks, username }) {
  const [opacity, setOpacity] = useState(0)
  const [btnVisible, setBtnVisible] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [scoreStatus, setScoreStatus] = useState('idle') // 'idle' | 'submitting' | 'done' | 'error'
  const [showLeaderboard, setShowLeaderboard] = useState(false)

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

  // Auto-submit for logged-in users with a username
  useEffect(() => {
    if (!btnVisible || !username || scoreStatus !== 'idle') return
    setScoreStatus('submitting')
    submitScore({ name: username, wave, kills })
      .then(() => setScoreStatus('done'))
      .catch(() => setScoreStatus('error'))
  }, [btnVisible, username])

  const handleSubmitScore = async () => {
    if (!playerName.trim() || scoreStatus !== 'idle') return
    setScoreStatus('submitting')
    try {
      await submitScore({ name: playerName, wave, kills })
      setScoreStatus('done')
    } catch {
      setScoreStatus('error')
    }
  }

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

        {username ? (
          scoreStatus === 'done' ? (
            <div style={{ color: '#88cc44', fontSize: 'clamp(10px, 2vmin, 13px)', letterSpacing: 3, fontFamily: 'Courier New, monospace', marginBottom: 4 }}>
              SCORE SAVED ✓
            </div>
          ) : scoreStatus === 'submitting' ? (
            <div style={{ color: '#888', fontSize: 'clamp(10px, 2vmin, 13px)', letterSpacing: 3, fontFamily: 'Courier New, monospace', marginBottom: 4 }}>
              saving…
            </div>
          ) : null
        ) : scoreStatus !== 'done' ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 24))}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitScore()}
              placeholder="Enter name…"
              maxLength={24}
              disabled={scoreStatus === 'submitting'}
              style={{
                background: 'rgba(0,0,0,0.55)',
                border: '1px solid rgba(180,0,0,0.5)',
                color: '#ddd',
                padding: 'clamp(5px, 1.2vmin, 10px) clamp(8px, 2vmin, 14px)',
                fontSize: 'clamp(11px, 2vmin, 14px)',
                letterSpacing: 2,
                fontFamily: 'Courier New, monospace',
                outline: 'none',
                width: 'clamp(140px, 30vmin, 200px)',
              }}
            />
            <button
              onClick={handleSubmitScore}
              disabled={!playerName.trim() || scoreStatus === 'submitting'}
              style={{
                background: 'transparent',
                border: '1px solid rgba(180,0,0,0.6)',
                color: playerName.trim() ? 'rgba(200,200,200,0.9)' : '#555',
                padding: 'clamp(5px, 1.2vmin, 10px) clamp(10px, 2.5vmin, 18px)',
                fontSize: 'clamp(9px, 1.8vmin, 12px)',
                letterSpacing: 3,
                fontFamily: 'Courier New, monospace',
                cursor: playerName.trim() ? 'pointer' : 'default',
                textTransform: 'uppercase',
                transition: 'all 0.2s',
              }}
            >
              {scoreStatus === 'submitting' ? '…' : 'Submit Score'}
            </button>
          </div>
        ) : (
          <div style={{ color: '#88cc44', fontSize: 'clamp(10px, 2vmin, 13px)', letterSpacing: 3, fontFamily: 'Courier New, monospace', marginBottom: 4 }}>
            SCORE SAVED ✓
          </div>
        )}
        {scoreStatus === 'error' && (
          <div style={{ color: '#ff6644', fontSize: 11, letterSpacing: 2, fontFamily: 'Courier New, monospace' }}>
            FAILED TO SAVE — TRY AGAIN
          </div>
        )}

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

        <button
          onClick={() => setShowLeaderboard((v) => !v)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#555',
            fontSize: 'clamp(9px, 1.8vmin, 12px)',
            letterSpacing: 3,
            fontFamily: 'Courier New, monospace',
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          {showLeaderboard ? '▲ Hide Leaderboard' : '▼ View Leaderboard'}
        </button>
        {showLeaderboard && <LeaderboardPanel highlightWave={wave} highlightKills={kills} />}
      </div>
    </div>
  )
}

function LeaderboardPanel({ highlightWave, highlightKills } = {}) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setRows(null)
    setError(false)
    fetchLeaderboard().then(setRows).catch(() => setError(true))
  }, [])

  return (
    <div style={{
      width: 'min(420px, 92vw)',
      background: 'rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,50,0,0.25)',
      borderRadius: 6,
      fontFamily: 'Courier New, monospace',
      fontSize: 'clamp(9px, 1.9vmin, 13px)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        color: '#ff3300',
        letterSpacing: 5,
        fontSize: 'clamp(8px, 1.6vmin, 11px)',
        fontWeight: 'bold',
        textAlign: 'center',
      }}>
        LEADERBOARD
      </div>
      {error && (
        <div style={{ color: '#ff6644', textAlign: 'center', padding: 12, letterSpacing: 2 }}>Failed to load</div>
      )}
      {!error && !rows && (
        <div style={{ color: '#555', textAlign: 'center', padding: 12, letterSpacing: 2 }}>Loading…</div>
      )}
      {rows && rows.length === 0 && (
        <div style={{ color: '#555', textAlign: 'center', padding: 12, letterSpacing: 2 }}>No scores yet</div>
      )}
      {rows && rows.length > 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px 54px', gap: '0 10px', padding: '5px 14px', color: '#555', fontSize: 'clamp(7px, 1.4vmin, 10px)', letterSpacing: 2, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span>#</span><span>NAME</span><span style={{ textAlign: 'right' }}>WAVE</span><span style={{ textAlign: 'right' }}>KILLS</span>
          </div>
          {rows.map((row, i) => {
            const isHighlight = highlightWave != null && row.wave === highlightWave && row.kills === highlightKills
            return (
              <div key={row.id} style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr 60px 54px',
                gap: '0 10px',
                padding: 'clamp(3px, 0.8vmin, 5px) 14px',
                color: isHighlight ? '#ffe066' : i === 0 ? '#fff' : '#aaa',
                background: isHighlight ? 'rgba(255,224,102,0.06)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
              }}>
                <span style={{ color: i === 0 ? '#ff3300' : '#555' }}>{i + 1}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                <span style={{ textAlign: 'right' }}>{row.wave}</span>
                <span style={{ textAlign: 'right', color: '#888' }}>{row.kills}</span>
              </div>
            )
          })}
        </div>
      )}
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
