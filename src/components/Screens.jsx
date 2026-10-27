import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useGameStore } from '../store'
import { track } from '../analytics'
import { CROSSHAIR_COLORS, SUPPORTER_SKU, describeUnlock, isUnlocked, itemsOfKind, unlockText } from '../cosmetics'
import { hydrateStoreFromLocal, syncProfileWithCloud } from '../profilePersistence'
import { createRunShareToken } from '../shareToken'
import { createRoom, joinRoom, disconnect, send, isConnected } from '../net'
import { consumeInvite, isValidRoomCode } from '../invite'   // W5 one-tap invite
import InviteShare from './InviteShare'
import { submitScore, fetchLeaderboard, signInWithGoogle, signOut, onAuthStateChange, getUser, getProfile, setUsername as saveUsername, fetchEntitlements, fetchStoreConfig, startCheckout } from '../supabase'
import { getReduceMotion, setReduceMotion } from '../cameraFeel'
import { LevelBadge, ChallengeTeaser, ChallengesPanel, AchievementsPanel, DeathXpPanel } from './ProgressPanels'
import { MODIFIERS, MOD_BONUS } from '../modifiers'
import { DailyEntry, LeaderboardTabs } from './DailyPanels'
import { writeLocalDaily } from '../daily'
import StartPicker from './StartPicker'
import { hintsActive } from '../hints'
import BrightnessSlider from './BrightnessSlider'

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

// ── Stripe return (?checkout=success|cancel) ───────────────────────────────

function readCheckoutParam() {
  if (typeof window === 'undefined') return null
  try {
    const c = new URLSearchParams(window.location.search).get('checkout')
    return c === 'success' || c === 'cancel' ? c : null
  } catch {
    return null
  }
}

function stripCheckoutParams() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('checkout')
    url.searchParams.delete('session_id')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  } catch { /* cosmetic only */ }
}

let checkoutHandled = false  // module-level so React StrictMode's double effect doesn't double-track
const POLL_EVERY_MS = 1500
const POLL_MAX_ATTEMPTS = 8

/**
 * On return from Stripe: poll entitlements (the webhook may lag the redirect)
 * until the supporter pack shows up. Returns the locker notice (or null).
 * The initial value comes from the URL, so StartScreen can open the locker on first render.
 */
function useCheckoutReturn() {
  const [checkout] = useState(readCheckoutParam)
  const [notice, setNotice] = useState(checkout === 'success' ? 'Confirming your purchase…' : null)
  useEffect(() => {
    if (!checkout || checkoutHandled) return
    checkoutHandled = true
    if (checkout === 'cancel') {
      track('checkout_cancel')
      stripCheckoutParams()
      return
    }
    track('checkout_success')
    ;(async () => {
      for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        try {
          const list = await fetchEntitlements()
          if (list.includes(SUPPORTER_SKU)) {
            useGameStore.getState().setEntitlements(list)
            setNotice('Supporter Pack unlocked')
            stripCheckoutParams()
            return
          }
        } catch (err) {
          console.warn('[checkout] entitlement poll failed', err)
        }
        await new Promise((r) => setTimeout(r, POLL_EVERY_MS))
      }
      setNotice('Payment received — your Supporter Pack can take a minute to appear. Reopen the locker shortly.')
      stripCheckoutParams()
    })()
  }, [checkout])
  return { openLocker: checkout === 'success', notice }
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
  const waveModifier = useGameStore((s) => s.waveModifier)
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
  const checkoutReturn = useCheckoutReturn()

  // Anonymous profile (stats + equipped cosmetics) from localStorage.
  useEffect(() => { hydrateStoreFromLocal() }, [])
  // Signed in: merge with the cloud profile + load entitlements. Signed out: drop entitlements.
  const prevUserId = useRef(null)
  useEffect(() => {
    const id = authUser?.id ?? null
    if (id) {
      syncProfileWithCloud(authUser)
    } else if (prevUserId.current) {
      const st = useGameStore.getState()
      st.setEntitlements([])
      st.revalidateCosmetics()
    }
    prevUserId.current = id
  }, [authUser?.id])

  if (paused && mpRole === 'guest') {
    return <PausedOverlay />
  }

  if (phase === 'start') {
    return <StartScreen startGame={startGame} user={authUser} username={username} onUsernameSet={refreshProfile} checkoutReturn={checkoutReturn} />
  }

  if (phase === 'wave_clear') {
    return <WaveClearScreen wave={wave} waveKills={waveKills} kills={kills} bonuses={lastWaveBonuses} nextWave={nextWave} />
  }

  if (phase === 'intermission') {
    const nextCount = getZombiesForWave()
    return <IntermissionScreen wave={wave} intermissionLeft={intermissionLeft} zombieCount={nextCount} money={money} skipProgress={skipProgress} modifier={waveModifier} />
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
  const payout = bonuses.base + bonuses.kills + bonuses.total

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
          {mod.name} <span style={{ color: '#88cc44', letterSpacing: 1, fontSize: compact ? 10 : 12 }}>+€{MOD_BONUS}</span>
        </div>
        <div style={{ color: '#ccc', fontSize: compact ? 10 : 13, letterSpacing: 1 }}>{mod.desc}</div>
      </span>
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

function IntermissionScreen({ wave, intermissionLeft, zombieCount, money, skipProgress, modifier }) {
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

function StartScreen({ startGame, user, username, onUsernameSet, checkoutReturn }) {
  // W5: opening `/?join=CODE` lands on a one-tap 'invite' view (the tap also satisfies the audio-unlock gesture)
  const [invite] = useState(() => (checkoutReturn?.openLocker ? null : consumeInvite()))
  const [view, setView] = useState(checkoutReturn?.openLocker ? 'locker' : invite ? 'invite' : 'main') // 'main' | 'host' | 'join' | 'invite' | 'leaderboard' | 'locker' | 'setusername'
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

  const partnerMapId = useGameStore((s) => s.partnerMapId)
  const ownMapId = useGameStore((s) => s.mapId)
  const mapMismatch = !!partnerMapId && partnerMapId !== ownMapId   // co-op: host waits for a matching guest
  const setMpRole = useGameStore((s) => s.setMpRole)
  const setMpConnected = useGameStore((s) => s.setMpConnected)

  const onDisconnected = useCallback(() => {
    setConnected(false)
    setStatus('')
    setMpConnected(false)
    useGameStore.getState().clearMp()
  }, [setMpConnected])

  const handleHost = useCallback(() => {
    setView('host')
    setStatus('…')
    setMpRoleLocal('host')
    setMpRole('host')
    createRoom(
      (code) => {
        setRoomCode(code)
        navigator.clipboard?.writeText(code).catch(() => {})
        setStatus('Code copied')
      },
      () => {
        setConnected(true)
        setStatus('Connected')
        setMpConnected(true)
      },
      onDisconnected,
    )
  }, [setMpRole, setMpConnected, onDisconnected])

  const handleJoin = useCallback((override) => {
    const code = (typeof override === 'string' ? override : joinCode).trim()
    if (!code) return
    setStatus('…')
    setMpRoleLocal('guest')
    setMpRole('guest')
    joinRoom(
      code,
      () => {
        setConnected(true)
        setStatus('Connected')
        setMpConnected(true)
        // Guests don't call startGame — they wait for the host's start_game event
      },
      (err) => {
        setStatus(err?.type === 'peer-unavailable'
          ? 'Room not found'
          : `Failed: ${err?.type ?? 'connection error'}`)
        setMpRoleLocal(null)
        useGameStore.getState().clearMp()
      },
      onDisconnected,
    )
  }, [joinCode, setMpRole, setMpConnected, onDisconnected])

  const handleStartGame = useCallback(() => {
    if (mapMismatch) return
    startGame()
    if (isConnected()) send('game_event', { event: 'start_game', data: {} })
  }, [startGame, mapMismatch])

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

  // Locker / challenge / achievement panels replace the title block so they fit short screens.
  const compactView = view === 'locker' || view === 'challenges' || view === 'achievements'

  return (
    <Overlay scroll>
      {!compactView && <Title>CABIN</Title>}
      {!compactView && hintsActive() && <Controls>WASD · Mouse · Click</Controls>}

      {view === 'main' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <AuthPanel user={user} username={username} onRename={() => setView('setusername')} />
          <LevelBadge onClick={() => setView('achievements')} />
          <StartPicker />
          <div style={{ display: 'flex', gap: 'clamp(6px, 1.6vmin, 12px)', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
            <Btn onClick={startGame}>SOLO</Btn>
            <DailyEntry Btn={Btn} />
            <Btn onClick={handleHost}>HOST</Btn>
            <Btn onClick={() => setView('join')}>JOIN</Btn>
          </div>
          <div style={{ display: 'flex', gap: 'clamp(14px, 4vmin, 28px)', marginTop: 6 }}>
            <button onClick={() => setView('leaderboard')} style={textLinkStyle}>
              Leaderboard
            </button>
            <button onClick={() => setView('locker')} style={textLinkStyle}>
              Locker
            </button>
            <button onClick={() => setView('achievements')} style={textLinkStyle}>
              Achievements
            </button>
          </div>
          <ChallengeTeaser onClick={() => setView('challenges')} />
          <div style={{ display: 'flex', gap: 'clamp(10px, 3vmin, 20px)', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <ReduceMotionToggle />
            <BrightnessSlider />
          </div>
        </div>
      )}

      {view === 'locker' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
          <LockerPanel user={user} notice={checkoutReturn?.notice} />
          <BackBtn onClick={() => setView('main')} />
        </div>
      )}

      {view === 'challenges' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
          <ChallengesPanel />
          <BackBtn onClick={() => setView('main')} />
        </div>
      )}

      {view === 'achievements' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
          <AchievementsPanel />
          <BackBtn onClick={() => setView('main')} />
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
          {roomCode && !connected ? <InviteShare code={roomCode} /> : null}
          <div style={{ color: '#888', fontSize: 13, letterSpacing: 2 }}>{status}</div>
          {connected && mapMismatch && (
            <div style={{ color: '#cc9944', fontSize: 12, letterSpacing: 1, textAlign: 'center', maxWidth: 320 }}>
              Partner is on {partnerMapId === 'diner' ? 'Diner' : 'Cabin'} — pick the same map
            </div>
          )}
          {connected && <Btn onClick={handleStartGame} disabled={mapMismatch}>START GAME</Btn>}
          <BackBtn onClick={handleBack} />
        </div>
      )}

      {view === 'invite' && invite && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 8 }}>
          {!isValidRoomCode(invite.code) ? (
            <div data-testid="invite-error" style={{ color: '#ff6666', fontSize: 14, letterSpacing: 2, textAlign: 'center', maxWidth: 320 }}>
              Invalid invite
            </div>
          ) : (
            <>
              <div style={{ color: '#888', fontSize: 13, letterSpacing: 3 }}>INVITED</div>
              {!connected && !status && <Btn onClick={() => handleJoin(invite.code)}>{`JOIN ${invite.code}`}</Btn>}
              {status && (
                <div data-testid="invite-status" style={{ color: status.startsWith('Room not') || status.startsWith('Failed') ? '#ff6666' : '#888', fontSize: 13, letterSpacing: 2, textAlign: 'center', maxWidth: 320 }}>{status}</div>
              )}
            </>
          )}
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

// Tiny accessibility option: turns off head bob + fire kick (weapon sway stays, subtler).
function ReduceMotionToggle() {
  const [on, setOn] = useState(getReduceMotion())
  return (
    <button
      onClick={() => { setReduceMotion(!on); setOn(!on) }}
      aria-pressed={on}
      style={{ ...textLinkStyle, marginTop: 2 }}
    >
      Reduce motion: {on ? 'on' : 'off'}
    </button>
  )
}

const textLinkStyle = {
  background: 'transparent',
  border: 'none',
  color: '#555',
  fontSize: 'clamp(9px, 1.8vmin, 12px)',
  letterSpacing: 3,
  fontFamily: 'Courier New, monospace',
  cursor: 'pointer',
  textTransform: 'uppercase',
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
      setErrorMsg(err?.message?.includes('unique') ? 'Name taken' : 'Error')
      setStatus('error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 8 }}>
      <Sub>Pick a username</Sub>
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

function Overlay({ children, dim = 0.78, scroll = false }) {
  const gap = 'clamp(5px, 1.5vmin, 12px)'
  if (scroll) {
    // Short landscape phones: content taller than the screen scrolls instead of clipping.
    return (
      <div style={{
        position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        background: `rgba(0,0,0,${dim})`, fontFamily: 'Courier New, monospace',
      }}>
        <div style={{ margin: 'auto 0', padding: '10px 0', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap }}>
          {children}
        </div>
      </div>
    )
  }
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
  const lastRunUnlocks = useGameStore((s) => s.lastRunUnlocks)
  const [opacity, setOpacity] = useState(0)
  const [btnVisible, setBtnVisible] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [scoreStatus, setScoreStatus] = useState('idle') // 'idle' | 'submitting' | 'done' | 'error'
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  // Daily Run: only the first run of the UTC day is ranked; the rest are practice (never submitted).
  const dailyMode = useGameStore((s) => s.runMode === 'daily')
  const dailyRanked = useGameStore((s) => s.dailyRanked)
  const dailyDateStr = useGameStore((s) => s.dailyDate)
  const isPractice = (dailyMode && !dailyRanked) || scoreStatus === 'practice'
  const sendScore = async (name) => {
    if (dailyMode && !dailyRanked) { setScoreStatus('practice'); return }
    try {
      await submitScore({ name, wave, kills, mode: dailyMode ? 'daily' : 'normal', seedDate: dailyDateStr })
      if (dailyMode) writeLocalDaily({ wave, kills, name: name.trim().slice(0, 24) })
      setScoreStatus('done')
    } catch (e) {
      setScoreStatus(e?.message === 'daily_already_ranked' ? 'practice' : 'error')
    }
  }

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
    sendScore(username)
  }, [btnVisible, username])

  const handleSubmitScore = async () => {
    if (!playerName.trim() || scoreStatus !== 'idle') return
    setScoreStatus('submitting')
    await sendScore(playerName)
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
        setShareStatus('Shared')
      } else {
        await copyGameLink(shareUrl)
        setShareStatus('Link copied')
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        setShareStatus('')
        return
      }
      console.error('Unable to share run', error)
      await copyGameLink(shareUrl)
      setShareStatus('Link copied')
    }
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      overflowY: 'auto',            // short landscape phones: the breakdown scrolls
      WebkitOverflowScrolling: 'touch',
      background: `rgba(0,0,0,${0.3 + opacity * 0.55})`,
      gap: 0,
      fontFamily: 'Garamond, Georgia, serif',
      transition: 'background 0.1s',
    }}>
      <div style={{ margin: 'auto 0', padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
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

      <div style={{ opacity }}><DeathXpPanel /></div>

      {lastRunUnlocks?.length > 0 && (
        <div style={{
          opacity,
          marginTop: 'clamp(6px, 1.5vmin, 14px)',
          color: '#ffd166',
          fontSize: 'clamp(10px, 2vmin, 13px)',
          letterSpacing: 3,
          fontFamily: 'Courier New, monospace',
          textTransform: 'uppercase',
          textAlign: 'center',
          maxWidth: '88vw',
        }}>
          UNLOCK: {lastRunUnlocks.map(describeUnlock).join(', ')}
        </div>
      )}

      <div style={{
        marginTop: 'clamp(10px, 3.5vmin, 56px)',
        opacity: btnVisible ? 1 : 0,
        transition: 'opacity 0.8s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'clamp(6px, 1.5vmin, 12px)',
      }}>

        {isPractice ? (
          <div style={{ color: '#aaa', fontSize: 'clamp(10px, 2vmin, 13px)', letterSpacing: 3, fontFamily: 'Courier New, monospace', marginBottom: 4, textAlign: 'center' }}>
            PRACTICE
          </div>
        ) : username ? (
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
              {scoreStatus === 'submitting' ? '…' : 'Submit'}
            </button>
          </div>
        ) : (
          <div style={{ color: '#88cc44', fontSize: 'clamp(10px, 2vmin, 13px)', letterSpacing: 3, fontFamily: 'Courier New, monospace', marginBottom: 4 }}>
            SCORE SAVED ✓
          </div>
        )}
        {scoreStatus === 'error' && (
          <div style={{ color: '#ff6644', fontSize: 11, letterSpacing: 2, fontFamily: 'Courier New, monospace' }}>
            SAVE FAILED
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <DeathButton onClick={handleShare} accent="rgba(220,220,220,0.78)">
            Share
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
              Waiting…
            </div>
          ) : (
            <DeathButton onClick={onRestart}>
              Retry
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
          {showLeaderboard ? '▲ Leaderboard' : '▼ Leaderboard'}
        </button>
        {showLeaderboard && <LeaderboardPanel highlightWave={wave} highlightKills={kills} initialTab={dailyMode ? 'daily' : 'all'} />}
      </div>
      </div>
    </div>
  )
}

function LeaderboardPanel({ highlightWave, highlightKills, initialTab = 'all' } = {}) {
  return <LeaderboardTabs highlightWave={highlightWave} highlightKills={highlightKills} initialTab={initialTab} />
}

// ── Locker (cosmetics) ──────────────────────────────────────────────────────
// Cosmetics only: nothing here changes a gameplay number. Paid items sit next
// to a free sibling earned by playing. No timers, no scarcity copy, no popups.

const CROSSHAIR_GLYPHS = { cross: '+', dot: '●', chevron: '⌃', circle: '◎' }

const CHECKOUT_ERRORS = {
  already_owned: 'Already owned',
  checkout_unavailable: 'Checkout unavailable',
  unauthorized: 'Sign in again',
}

function LockIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" aria-label="Locked" style={{ flexShrink: 0 }}>
      <rect x="0.5" y="5" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" />
      <path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" />
    </svg>
  )
}

function LockerTile({ kind, item, selected, unlocked, onEquip }) {
  const swatchColor = item.swatch ?? item.hex
  const isCrosshair = kind === 'crosshair'
  return (
    <button
      type="button"
      data-testid={`locker-${kind}-${item.id}`}
      aria-pressed={selected}
      aria-disabled={!unlocked}
      onClick={() => unlocked && onEquip(kind, item.id)}
      title={unlocked ? item.blurb ?? item.label : `Locked — ${unlockText(item)}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        minWidth: 'clamp(62px, 15vmin, 90px)',
        minHeight: 44,  // >= 40px tap target on phones
        padding: 'clamp(5px, 1.2vmin, 9px) clamp(4px, 1vmin, 8px)',
        background: selected ? 'rgba(255,51,0,0.12)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? '#ff3300' : 'rgba(255,255,255,0.14)'}`,
        borderRadius: 4,
        color: unlocked ? (selected ? '#fff' : '#bbb') : '#555',
        fontFamily: 'Courier New, monospace',
        fontSize: 'clamp(9px, 1.8vmin, 12px)',
        letterSpacing: 1,
        textTransform: 'uppercase',
        cursor: unlocked ? 'pointer' : 'not-allowed',
      }}
    >
      <span style={{ height: 'clamp(12px, 2.6vmin, 18px)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: unlocked ? 1 : 0.4 }}>
        {isCrosshair ? (
          <span style={{ fontSize: 'clamp(12px, 2.6vmin, 18px)', lineHeight: 1 }}>{CROSSHAIR_GLYPHS[item.id]}</span>
        ) : swatchColor ? (
          <span style={{
            width: 'clamp(12px, 2.6vmin, 18px)',
            height: 'clamp(12px, 2.6vmin, 18px)',
            borderRadius: kind === 'crosshairColor' ? '50%' : 3,
            background: swatchColor,
            border: '1px solid rgba(255,255,255,0.35)',
            boxShadow: kind === 'knifeSkin' && (item.id === 'ember' || item.id === 'bloodied') ? `0 0 6px ${item.swatch}` : 'none',
          }} />
        ) : null}
      </span>
      <span>{item.label}{selected ? ' ✓' : ''}</span>
      {!unlocked && (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: 'clamp(7px, 1.3vmin, 9px)', color: '#777', letterSpacing: 0, textAlign: 'center', lineHeight: 1.2 }}>
          <LockIcon /> {unlockText(item)}
        </span>
      )}
    </button>
  )
}

function LockerRow({ title, children }) {
  return (
    <div style={{ padding: 'clamp(6px, 1.4vmin, 10px) clamp(10px, 2vmin, 16px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ color: '#666', fontSize: 'clamp(7px, 1.4vmin, 10px)', letterSpacing: 3, marginBottom: 'clamp(4px, 1vmin, 7px)', textTransform: 'uppercase' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(4px, 1vmin, 8px)', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  )
}

function LockerPanel({ user, notice }) {
  const cosmetics = useGameStore((s) => s.cosmetics)
  const stats = useGameStore((s) => s.stats)
  const entitlements = useGameStore((s) => s.entitlements)
  const setCosmetic = useGameStore((s) => s.setCosmetic)
  const [config, setConfig] = useState(null)   // { checkoutEnabled, priceLabel } once loaded
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const viewTracked = useRef(false)

  useEffect(() => {
    if (viewTracked.current) return
    viewTracked.current = true
    track('locker_open')
    if (!useGameStore.getState().entitlements.includes(SUPPORTER_SKU)) track('supporter_cta_view')
  }, [])

  useEffect(() => {
    let alive = true
    fetchStoreConfig().then((c) => { if (alive) setConfig(c) })
    return () => { alive = false }
  }, [])

  const ctx = { entitlements, stats }
  const owned = entitlements.includes(SUPPORTER_SKU)
  const priceLabel = config?.priceLabel ?? '€4.99'

  const equip = (kind, id) => {
    if (setCosmetic(kind, id)) track('cosmetic_equip', { kind, id })
  }

  const renderTiles = (kind, items) =>
    items.map((item) => (
      <LockerTile
        key={item.id}
        kind={kind}
        item={item}
        selected={cosmetics[kind] === item.id}
        unlocked={isUnlocked(item, ctx)}
        onEquip={equip}
      />
    ))

  const handleSupport = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    track('checkout_start')
    try {
      await startCheckout()  // redirects the page on success
    } catch (err) {
      const code = err?.message ?? ''
      if (code === 'already_owned') fetchEntitlements().then((l) => useGameStore.getState().setEntitlements(l)).catch(() => {})
      setError(CHECKOUT_ERRORS[code] ?? (code.includes(' ') ? code : 'Try again'))
      setBusy(false)
    }
  }

  let button
  if (owned) {
    button = <Btn disabled style={supporterBtnStyle}>★ Supporter</Btn>
  } else if (!config) {
    button = <Btn disabled style={supporterBtnStyle}>…</Btn>
  } else if (!config.checkoutEnabled) {
    button = <Btn disabled style={supporterBtnStyle}>Coming soon</Btn>
  } else if (!user) {
    button = <Btn onClick={() => signInWithGoogle()} style={supporterBtnStyle}>Sign in to support</Btn>
  } else {
    button = <Btn onClick={handleSupport} disabled={busy} style={supporterBtnStyle}>{busy ? '…' : `Support ${priceLabel}`}</Btn>
  }

  return (
    <div data-testid="locker-panel" style={{
      width: 'min(560px, 94vw)',
      maxHeight: '80vh',
      overflowY: 'auto',
      background: 'rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,50,0,0.25)',
      borderRadius: 6,
      fontFamily: 'Courier New, monospace',
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
        LOCKER
      </div>
      {notice && (
        <div style={{ padding: '8px 14px', color: '#88cc44', fontSize: 'clamp(9px, 1.9vmin, 13px)', letterSpacing: 1, textAlign: 'center' }}>
          {notice}
        </div>
      )}

      <LockerRow title="Weapon finish">{renderTiles('skin', itemsOfKind('skin'))}</LockerRow>
      <LockerRow title="Crosshair">{renderTiles('crosshair', itemsOfKind('crosshair'))}</LockerRow>
      <LockerRow title="Crosshair colour">{renderTiles('crosshairColor', CROSSHAIR_COLORS)}</LockerRow>
      <LockerRow title="Knife">{renderTiles('knifeSkin', itemsOfKind('knifeSkin'))}</LockerRow>

      <div style={{ padding: 'clamp(8px, 1.8vmin, 14px) clamp(10px, 2vmin, 16px)', textAlign: 'center' }}>
        <div style={{ color: '#ffd166', fontSize: 'clamp(9px, 1.9vmin, 13px)', letterSpacing: 3, fontWeight: 'bold' }}>
          SUPPORT THE DEV — {priceLabel} · one-time
        </div>
        <div style={{ color: '#888', fontSize: 'clamp(8px, 1.6vmin, 11px)', letterSpacing: 1, lineHeight: 1.6, marginTop: 4 }}>
          Gold &amp; Obsidian finishes · Dot, Chevron &amp; Circle crosshairs · Red &amp; Cyan colours · Ember knife · ★ leaderboard badge
        </div>
        <div style={{ color: '#666', fontSize: 'clamp(8px, 1.5vmin, 10px)', letterSpacing: 1, marginTop: 2 }}>
          Cosmetics only — the whole game stays free.
        </div>
        {button}
        {error && (
          <div role="alert" style={{ color: '#ff6644', fontSize: 'clamp(9px, 1.7vmin, 12px)', letterSpacing: 1, marginTop: 6 }}>{error}</div>
        )}
      </div>
    </div>
  )
}

const supporterBtnStyle = {
  marginTop: 'clamp(6px, 1.5vmin, 12px)',
  padding: 'clamp(6px, 1.2vmin, 10px) clamp(14px, 3vmin, 28px)',
  fontSize: 'clamp(10px, 2vmin, 14px)',
  letterSpacing: 2,
  color: '#ffd166',
  border: '2px solid #ffd166',
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

function Btn({ children, onClick, disabled = false, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        marginTop: 'clamp(4px, 1.5vmin, 24px)',
        padding: 'clamp(7px, 1.5vmin, 14px) clamp(14px, 4vmin, 48px)',
        background: 'transparent',
        border: '2px solid #ff3300',
        color: '#ff3300',
        fontSize: 'clamp(11px, 2.5vmin, 18px)',
        letterSpacing: 4,
        fontFamily: 'Courier New, monospace',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.2s',
        ...(disabled ? { opacity: 0.45 } : null),
        ...style,
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.target.style.background = style?.color ?? '#ff3300'
        e.target.style.color = '#000'
      }}
      onMouseLeave={(e) => {
        e.target.style.background = 'transparent'
        e.target.style.color = style?.color ?? '#ff3300'
      }}
    >
      {children}
    </button>
  )
}
