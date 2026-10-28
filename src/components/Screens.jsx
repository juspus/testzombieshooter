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
import { LevelBadge, useChallengeSummary, ChallengesPanel, AchievementsPanel, DeathXpPanel } from './ProgressPanels'
import { MODIFIERS, MOD_BONUS } from '../modifiers'
import { useDailyEntry, LeaderboardTabs } from './DailyPanels'
import { writeLocalDaily } from '../daily'
import StartPicker, { useLoadoutSummary } from './StartPicker'
import { hintsActive } from '../hints'
import BrightnessSlider from './BrightnessSlider'
import { Button, Panel, Tabs, Option, SectionLabel, LockIcon } from './ui'
import { VERSUS_MODES, scoreSubmittable } from '../versus'
import { newRunSeed } from '../rng'
import VersusResult from './VersusResult'
import { SkipHoldButton, ControlSettings } from './PauseMenu'
import useMenuEnv from '../menuTouch'
import InstallHint from './InstallHint'
import { CheckIcon, StarIcon } from './Icons'
import { enterRunFullscreen } from '../fullscreen'

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
      const wasVersus = useGameStore.getState().runMode === 'versus'
      enterRunFullscreen()
      startGame()
      if (isConnected() && !wasVersus) send('game_event', { event: 'start_game', data: {} })
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
          {mod.name} <span style={{ color: '#88cc44', letterSpacing: 1, fontSize: compact ? 'max(var(--ui-fs-min), 10px)' : 12 }}>+€{MOD_BONUS}</span>
        </div>
        <div style={{ color: '#ccc', fontSize: compact ? 'max(var(--ui-fs-min), 10px)' : 13, letterSpacing: 1 }}>{mod.desc}</div>
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
      ...(isMobile ? { zIndex: 7 } : null),   // above the touch look zone so the skip button gets taps
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
      {isMobile && <SkipHoldButton progress={skipProgress} />}
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
      <div className="ui-section-label" style={{ justifyContent: 'center' }}>Room code</div>
      <div
        onClick={handleCopy}
        title="Click to copy"
        style={{
          display: 'inline-block',
          color: copied ? '#88cc44' : '#ffe066',
          fontSize: 'clamp(24px, 6vmin, 36px)',
          fontFamily: 'Courier New, monospace',
          letterSpacing: 10,
          textShadow: copied
            ? '0 0 20px rgba(136,204,68,0.6)'
            : '0 0 20px rgba(255,224,102,0.5)',
          cursor: 'pointer',
          userSelect: 'all',
          padding: '4px 4px 4px 14px',
          border: `1px solid ${copied ? 'rgba(136,204,68,0.4)' : 'rgba(255,224,102,0.2)'}`,
          borderRadius: 2,
          transition: 'color 0.2s, text-shadow 0.2s, border-color 0.2s',
        }}
      >
        {code}
      </div>
      <div style={{ color: copied ? '#88cc44' : '#555', fontSize: 11, letterSpacing: 3, marginTop: 6, transition: 'color 0.2s' }}>
        {copied ? 'COPIED' : 'CLICK TO COPY'}
      </div>
    </div>
  )
}

const ROOM_CODE_CHARS = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g
const statusIsError = (s) => s.startsWith('Room not') || s.startsWith('Failed')

// Start menu: one primary action (PLAY), two more ways to start (Daily, Co-op), then the
// meta screens. Everything else opens as a panel beside the list (replaces it on narrow
// portrait screens), so the first screen stays short.
function StartScreen({ startGame, user, username, onUsernameSet, checkoutReturn }) {
  // W5: opening `/?join=CODE` lands on the CO-OP panel with a one-tap join (the tap also satisfies the audio-unlock gesture)
  const [invite] = useState(() => (checkoutReturn?.openLocker ? null : consumeInvite()))
  const [panel, setPanel] = useState(checkoutReturn?.openLocker ? 'locker' : invite ? 'coop' : null) // null | 'coop' | 'loadout' | 'progress' | 'locker' | 'settings' | 'username'
  const [coop, setCoop] = useState(invite ? 'invite' : 'idle') // 'idle' | 'host' | 'guest' | 'invite'
  const [progressTab, setProgressTab] = useState('challenges')
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [status, setStatus] = useState('')
  const [connected, setConnected] = useState(false)
  const [isMobile] = useState(getIsMobileScreen)

  const daily = useDailyEntry()
  const challenges = useChallengeSummary()
  const loadoutSummary = useLoadoutSummary()

  // Auto-prompt username picker after first Google login
  useEffect(() => {
    if (user && username === null && panel === null) setPanel('username')
    if (user && username !== null && panel === 'username') setPanel(null)
  }, [user, username])

  const partnerMapId = useGameStore((s) => s.partnerMapId)
  const ownMapId = useGameStore((s) => s.mapId)
  const mapMismatch = !!partnerMapId && partnerMapId !== ownMapId   // co-op: host waits for a matching guest
  const setMpRole = useGameStore((s) => s.setMpRole)
  const setMpConnected = useGameStore((s) => s.setMpConnected)

  // A room is open (hosting, joining or invited): only the CO-OP panel stays usable,
  // since solo starts and map reloads would drop the connection.
  const roomOpen = coop !== 'idle'

  const onDisconnected = useCallback(() => {
    setConnected(false)
    setStatus('')
    setMpConnected(false)
    useGameStore.getState().clearMp()
  }, [setMpConnected])

  const handleHost = useCallback(() => {
    setCoop('host')
    setStatus('…')
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
    enterRunFullscreen()   // the guest's run starts without another tap, so this is its gesture
    const from = typeof override === 'string' ? 'invite' : 'idle'
    if (from === 'idle') setCoop('guest')
    setStatus('…')
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
        setCoop(from)
        useGameStore.getState().clearMp()
      },
      onDisconnected,
    )
  }, [joinCode, setMpRole, setMpConnected, onDisconnected])

  // Lobby mode (host picks, guest mirrors): 'coop' or a VERSUS_MODES id.
  const lobbyMode = useGameStore((s) => s.versusLobbyMode)
  const setLobbyMode = useGameStore((s) => s.setVersusLobbyMode)
  // Host: tell the guest the mode on every change and, repeatedly, while it may not be listening yet.
  useEffect(() => {
    if (coop !== 'host' || !connected) return undefined
    const tell = () => send('game_event', { event: 'versus_mode', data: { mode: lobbyMode } })
    tell()
    const t = setInterval(tell, 1500)
    return () => clearInterval(t)
  }, [coop, connected, lobbyMode])

  const handleStartGame = useCallback(() => {
    if (mapMismatch) return
    enterRunFullscreen()
    if (lobbyMode !== 'coop' && VERSUS_MODES[lobbyMode] && isConnected()) {
      // Versus: same seed on both sides, each in their own world (the store detaches from co-op).
      const seed = newRunSeed()
      send('game_event', { event: 'versus_start', data: { mode: lobbyMode, seed } })
      useGameStore.getState().startVersusRun(lobbyMode, seed)
      return
    }
    startGame()
    if (isConnected()) send('game_event', { event: 'start_game', data: {} })
  }, [startGame, mapMismatch, lobbyMode])

  const handleLeave = useCallback(() => {
    disconnect()
    setCoop('idle')
    setRoomCode('')
    setJoinCode('')
    setStatus('')
    setConnected(false)
    useGameStore.getState().clearMp()
    setLobbyMode('coop')
  }, [setLobbyMode])

  const togglePanel = (id) => setPanel((p) => (p === id ? null : id))
  const openProgress = (tab) => { if (roomOpen) return; setProgressTab(tab); setPanel('progress') }
  const closePanel = useCallback(() => setPanel(null), [])

  // Esc closes the open panel (not while a room is open: that needs an explicit LEAVE).
  useEffect(() => {
    if (!panel || roomOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape' && document.activeElement?.tagName !== 'INPUT') closePanel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel, roomOpen, closePanel])

  const coopMeta = coop === 'host' ? (connected ? 'Partner in' : roomCode || '…')
    : coop === 'guest' ? (connected ? 'Joined' : '…')
    : coop === 'invite' ? 'Invited' : null

  const backAction = roomOpen && panel === 'coop'
    ? <Button variant="ghost" size="sm" onClick={handleLeave}>Leave</Button>
    : <Button variant="ghost" size="sm" onClick={closePanel}>Back</Button>

  let detail = null
  if (panel === 'coop') {
    detail = (
      <Panel title="Co-op" action={backAction} testid="coop-panel">
        {coop === 'idle' && (
          <div className="ui-stack">
            <SectionLabel>Host</SectionLabel>
            <Button block onClick={handleHost}>Host game</Button>
            <div className="ui-note">You get a code and an invite link to send.</div>
            <SectionLabel>Join</SectionLabel>
            <div className="ui-field">
              <input
                className="ui-input"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(ROOM_CODE_CHARS, '').slice(0, 5))}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                placeholder="CODE"
                maxLength={5}
                aria-label="Room code"
                style={{ textAlign: 'center', letterSpacing: 6 }}
              />
              <Button onClick={handleJoin} disabled={!joinCode.trim()}>Join</Button>
            </div>
            {status && <div className="ui-note" style={{ color: statusIsError(status) ? '#ff6666' : undefined }}>{status}</div>}
          </div>
        )}

        {coop === 'host' && (
          <div className="ui-stack" style={{ alignItems: 'center' }}>
            {roomCode ? <RoomCodeDisplay code={roomCode} /> : null}
            {roomCode && !connected ? <InviteShare code={roomCode} /> : null}
            <div className="ui-note">{connected ? 'Partner connected' : roomCode ? 'Waiting for partner…' : status}</div>
            {connected && mapMismatch && (
              <div className="ui-note" style={{ color: '#cc9944', textAlign: 'center' }}>
                Partner is on {partnerMapId === 'diner' ? 'Diner' : 'Cabin'} — pick the same map
              </div>
            )}
            {connected && (
              <div className="ui-stack" style={{ alignSelf: 'stretch' }}>
                <SectionLabel>Mode</SectionLabel>
                <Option label="Co-op" sub="One shared world" checked={lobbyMode === 'coop'} onClick={() => setLobbyMode('coop')} testid="mode-coop" />
                {Object.entries(VERSUS_MODES).map(([id, m]) => (
                  <Option key={id} label={m.label} sub="Versus, own world each" checked={lobbyMode === id} onClick={() => setLobbyMode(id)} testid={`mode-${id}`} />
                ))}
              </div>
            )}
            {connected && <Button variant="primary" size="lg" block onClick={handleStartGame} disabled={mapMismatch}>Start game</Button>}
          </div>
        )}

        {coop === 'guest' && (
          <div className="ui-stack" style={{ alignItems: 'center' }}>
            <div className="ui-note">{connected ? 'Connected — waiting for host to start' : status === '…' ? 'Connecting…' : 'Disconnected'}</div>
            {connected && <div className="ui-note" data-testid="lobby-mode">Mode: {VERSUS_MODES[lobbyMode]?.label ?? 'Co-op'}</div>}
          </div>
        )}

        {coop === 'invite' && invite && (
          <div className="ui-stack" style={{ alignItems: 'center' }}>
            {!isValidRoomCode(invite.code) ? (
              <div data-testid="invite-error" className="ui-note" style={{ color: '#ff6666' }}>Invalid invite</div>
            ) : (
              <>
                <div className="ui-section-label" style={{ justifyContent: 'center' }}>Invited</div>
                {!connected && status !== '…' && (
                  <Button variant="primary" size="lg" block onClick={() => handleJoin(invite.code)}>{`Join ${invite.code}`}</Button>
                )}
                {status && (
                  <div data-testid="invite-status" className="ui-note" style={{ color: statusIsError(status) ? '#ff6666' : undefined, textAlign: 'center' }}>
                    {status === 'Connected' ? 'Connected — waiting for host to start' : status}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Panel>
    )
  } else if (panel === 'loadout') {
    detail = <Panel title="Loadout" action={backAction}><StartPicker /></Panel>
  } else if (panel === 'progress') {
    detail = (
      <Panel
        title="Progress"
        action={backAction}
        tabs={<Tabs value={progressTab} onChange={setProgressTab} tabs={[
          { id: 'challenges', label: 'Challenges' },
          { id: 'achievements', label: 'Achievements' },
          { id: 'leaderboard', label: 'Leaderboard' },
        ]} />}
        bodyStyle={progressTab === 'leaderboard' ? { paddingTop: 0 } : undefined}
      >
        {progressTab === 'challenges' && <ChallengesPanel />}
        {progressTab === 'achievements' && <AchievementsPanel />}
        {progressTab === 'leaderboard' && <LeaderboardTabs bare />}
      </Panel>
    )
  } else if (panel === 'locker') {
    detail = <Panel title="Locker" action={backAction} testid="locker-panel"><LockerPanel user={user} notice={checkoutReturn?.notice} /></Panel>
  } else if (panel === 'settings') {
    detail = (
      <Panel title="Settings" action={backAction}>
        <SettingsPanel user={user} username={username} onRename={() => setPanel('username')} />
      </Panel>
    )
  } else if (panel === 'username') {
    detail = (
      <Panel title="Username" action={backAction}>
        <UsernamePickerView onDone={() => { onUsernameSet?.(); setPanel(null) }} />
      </Panel>
    )
  }

  return (
    <div className={`menu-screen${panel ? ' has-panel' : ''}`}>
      <div className="menu-top">
        <LevelBadge onClick={() => openProgress('achievements')} />
        {user ? (
          <Button size="sm" onClick={() => !roomOpen && setPanel('settings')} title="Account settings" style={{ color: '#ffe066', letterSpacing: 1, textTransform: 'none' }}>
            {user.user_metadata?.avatar_url && <img src={user.user_metadata.avatar_url} alt="" className="ui-avatar" />}
            {username ?? '…'}
          </Button>
        ) : (
          <Button size="sm" onClick={() => signInWithGoogle()}><GoogleIcon /> Sign in</Button>
        )}
      </div>

      <div className="menu-side">
        <div>
          <h1 className="menu-title">CABIN</h1>
          {!isMobile && hintsActive() && <div className="menu-hint">WASD · Mouse · Click</div>}
        </div>
        <nav className="menu-nav" aria-label="Main menu">
          <Button variant="primary" size="lg" block onClick={() => { enterRunFullscreen(); startGame() }} disabled={roomOpen} data-testid="menu-play">Play</Button>
          <MenuItem label="Daily Run" meta={daily.meta} tone={daily.used ? null : 'warm'} onClick={daily.start} disabled={roomOpen} testid="menu-daily" />
          <MenuItem label="Co-op" meta={coopMeta} active={panel === 'coop'} onClick={() => togglePanel('coop')} testid="menu-coop" />
          <div className="menu-sep" />
          <MenuItem label="Loadout" meta={loadoutSummary} active={panel === 'loadout'} onClick={() => togglePanel('loadout')} disabled={roomOpen} testid="menu-loadout" />
          <MenuItem label="Progress" meta={`${challenges.done}/${challenges.total}`} tone={challenges.done === challenges.total ? 'ok' : null}
            active={panel === 'progress'} onClick={() => (panel === 'progress' ? closePanel() : openProgress('challenges'))} disabled={roomOpen} testid="menu-progress" />
          <MenuItem label="Locker" active={panel === 'locker'} onClick={() => togglePanel('locker')} disabled={roomOpen} testid="menu-locker" />
          <MenuItem label="Settings" active={panel === 'settings' || panel === 'username'} onClick={() => togglePanel('settings')} disabled={roomOpen} testid="menu-settings" />
        </nav>
      </div>

      {detail && <div className="menu-detail">{detail}</div>}
      {/* iOS Safari tip: always mounted (so it is shown once per device), hidden while a panel is open */}
      <div className={`menu-install${panel ? ' is-hidden' : ''}`}><InstallHint /></div>
    </div>
  )
}

function MenuItem({ label, meta, tone, active, onClick, disabled, testid }) {
  return (
    <button type="button" className="menu-item" aria-current={active ? 'true' : undefined} onClick={onClick} disabled={disabled} data-testid={testid}>
      <span>{label}</span>
      {meta && <span className={`menu-item__meta${tone ? ` menu-item__meta--${tone}` : ''}`}>{meta}</span>}
    </button>
  )
}

function SettingsPanel({ user, username, onRename }) {
  const { touch } = useMenuEnv()
  return (
    <div>
      {touch && (
        <>
          <SectionLabel>Controls</SectionLabel>
          <ControlSettings brightness={false} />
        </>
      )}
      <SectionLabel style={touch ? { marginTop: 18 } : undefined}>Display</SectionLabel>
      <BrightnessSlider />
      <ReduceMotionToggle />
      <SectionLabel style={{ marginTop: 18 }}>Account</SectionLabel>
      {user ? (
        <div className="ui-setting">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ffe066', textTransform: 'none', letterSpacing: 1, minWidth: 0 }}>
            {user.user_metadata?.avatar_url && <img src={user.user_metadata.avatar_url} alt="" className="ui-avatar" />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{username ?? '…'}</span>
          </span>
          <span className="ui-row" style={{ flexWrap: 'nowrap' }}>
            {username && <Button size="sm" onClick={onRename}>Rename</Button>}
            <Button size="sm" onClick={() => signOut()}>Sign out</Button>
          </span>
        </div>
      ) : (
        <div className="ui-stack">
          <Button block onClick={() => signInWithGoogle()}><GoogleIcon /> Sign in with Google</Button>
          <div className="ui-note">Keeps your progress across devices and your name on the leaderboard.</div>
        </div>
      )}
    </div>
  )
}

// Tiny accessibility option: turns off head bob + fire kick (weapon sway stays, subtler).
function ReduceMotionToggle() {
  const [on, setOn] = useState(getReduceMotion())
  return (
    <div className="ui-setting">
      Reduce motion
      <Button size="sm" aria-pressed={on} onClick={() => { setReduceMotion(!on); setOn(!on) }} style={{ minWidth: 64 }}>
        {on ? 'On' : 'Off'}
      </Button>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
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
    <div className="ui-stack">
      <div className="ui-note">Shown on the leaderboard.</div>
      <div className="ui-field">
        <input
          className="ui-input"
          value={value}
          onChange={(e) => { setValue(e.target.value.slice(0, 24)); setStatus('idle'); setErrorMsg('') }}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="YourName"
          maxLength={24}
          autoFocus
        />
        <Button variant="primary" onClick={handleSave} disabled={value.trim().length < 2 || status === 'saving'}>
          {status === 'saving' ? '…' : 'Save'}
        </Button>
      </div>
      {errorMsg && <div className="ui-note" style={{ color: '#cc4444' }}>{errorMsg}</div>}
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
    fontSize: 11,
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
    fontSize: 11,
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

function Badge({ children, style }) {
  return (
    <div style={{
      fontSize: 'max(var(--ui-fs-min), clamp(9px, 2.2vmin, 14px))',
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
      fontSize: 'max(var(--ui-fs-min), clamp(10px, 2.2vmin, 16px))',
      margin: 0,
      letterSpacing: 1,
      ...style,
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
  const submittable = useGameStore((s) => scoreSubmittable(s.runMode))   // versus / duel runs never reach the leaderboard
  const versusRun = useGameStore((s) => s.runMode === 'versus')
  const sendScore = async (name) => {
    if (!scoreSubmittable(useGameStore.getState().runMode)) return
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
      boxSizing: 'border-box',
      padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
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
        fontSize: 'max(var(--ui-fs-min), clamp(10px, 2vmin, 14px))',
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

      {versusRun && <div style={{ opacity }}><VersusResult /></div>}
      <div style={{ opacity }}><DeathXpPanel /></div>

      {lastRunUnlocks?.length > 0 && (
        <div style={{
          opacity,
          marginTop: 'clamp(6px, 1.5vmin, 14px)',
          color: '#ffd166',
          fontSize: 'max(var(--ui-fs-min), clamp(10px, 2vmin, 13px))',
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

        {!submittable ? null : isPractice ? (
          <div style={deathNoteStyle}>PRACTICE</div>
        ) : username ? (
          scoreStatus === 'done' ? (
            <div style={{ ...deathNoteStyle, color: '#88cc44' }}>SCORE SAVED</div>
          ) : scoreStatus === 'submitting' ? (
            <div style={{ ...deathNoteStyle, color: '#888' }}>saving…</div>
          ) : null
        ) : scoreStatus !== 'done' ? (
          <div className="ui-field" style={{ width: 'min(360px, 88vw)' }}>
            <input
              className="ui-input"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 24))}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitScore()}
              placeholder="Name for leaderboard"
              maxLength={24}
              disabled={scoreStatus === 'submitting'}
              style={{ color: '#ddd', letterSpacing: 2, fontSize: 13 }}
            />
            <Button onClick={handleSubmitScore} disabled={!playerName.trim() || scoreStatus === 'submitting'}>
              {scoreStatus === 'submitting' ? '…' : 'Submit'}
            </Button>
          </div>
        ) : (
          <div style={{ ...deathNoteStyle, color: '#88cc44' }}>SCORE SAVED</div>
        )}
        {scoreStatus === 'error' && (
          <div style={{ ...deathNoteStyle, color: '#ff6644' }}>SAVE FAILED</div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 'clamp(4px, 1vmin, 8px)' }}>
          {mpRole === 'guest' ? (
            <Button size="lg" disabled style={deathBtnStyle}>Waiting…</Button>
          ) : (
            <Button variant="primary" size="lg" onClick={onRestart} style={deathBtnStyle}>Retry</Button>
          )}
          <Button size="lg" onClick={handleShare} style={deathBtnStyle}>Share</Button>
          {/* Solo only: in co-op a reload would drop the partner. The reload resets every system for the menu. */}
          {!mpRole && (
            <Button size="lg" onClick={() => window.location.reload()} disabled={scoreStatus === 'submitting'} style={deathBtnStyle}>Menu</Button>
          )}
        </div>
        <div style={{ ...deathNoteStyle, minHeight: 16, color: '#777', fontSize: 12 }}>
          {shareStatus}
        </div>

        {submittable && <Button variant="ghost" size="sm" onClick={() => setShowLeaderboard((v) => !v)}>
          {showLeaderboard ? 'Hide leaderboard' : 'Leaderboard'}
        </Button>}
        {submittable && showLeaderboard && <LeaderboardTabs highlightWave={wave} highlightKills={kills} initialTab={dailyMode ? 'daily' : 'all'} />}
      </div>
      </div>
    </div>
  )
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
        fontSize: 'max(var(--ui-fs-min), clamp(9px, 1.8vmin, 12px))',
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
      <span>{item.label}{selected ? <> <CheckIcon /></> : ''}</span>
      {!unlocked && (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: 'max(var(--ui-fs-min), clamp(7px, 1.3vmin, 9px))', color: '#777', letterSpacing: 0, textAlign: 'center', lineHeight: 1.2 }}>
          <LockIcon /> {unlockText(item)}
        </span>
      )}
    </button>
  )
}

function LockerRow({ title, children }) {
  return (
    <div style={{ marginBottom: 'clamp(8px, 1.8vmin, 14px)' }}>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(4px, 1vmin, 8px)' }}>
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

  const supportBtn = (props) => <Button variant="gold" style={{ marginTop: 'clamp(8px, 1.6vmin, 12px)' }} {...props} />
  let button
  if (owned) {
    button = supportBtn({ disabled: true, children: <><StarIcon /> Supporter</> })
  } else if (!config) {
    button = supportBtn({ disabled: true, children: '…' })
  } else if (!config.checkoutEnabled) {
    button = supportBtn({ disabled: true, children: 'Coming soon' })
  } else if (!user) {
    button = supportBtn({ onClick: () => signInWithGoogle(), children: 'Sign in to support' })
  } else {
    button = supportBtn({ onClick: handleSupport, disabled: busy, children: busy ? '…' : `Support ${priceLabel}` })
  }

  return (
    <div>
      {notice && (
        <div style={{ marginBottom: 10, color: '#88cc44', fontSize: 'max(var(--ui-fs-min), clamp(9px, 1.9vmin, 13px))', letterSpacing: 1, textAlign: 'center' }}>
          {notice}
        </div>
      )}

      <LockerRow title="Weapon finish">{renderTiles('skin', itemsOfKind('skin'))}</LockerRow>
      <LockerRow title="Crosshair">{renderTiles('crosshair', itemsOfKind('crosshair'))}</LockerRow>
      <LockerRow title="Crosshair colour">{renderTiles('crosshairColor', CROSSHAIR_COLORS)}</LockerRow>
      <LockerRow title="Knife">{renderTiles('knifeSkin', itemsOfKind('knifeSkin'))}</LockerRow>

      <div style={{ padding: 'clamp(8px, 1.8vmin, 14px) 0 0', borderTop: '1px solid var(--ui-line)', textAlign: 'center' }}>
        <div style={{ color: '#ffd166', fontSize: 'max(var(--ui-fs-min), clamp(9px, 1.9vmin, 13px))', letterSpacing: 3, fontWeight: 'bold' }}>
          SUPPORT THE DEV — {priceLabel} · one-time
        </div>
        <div style={{ color: '#888', fontSize: 'max(var(--ui-fs-min), clamp(8px, 1.6vmin, 11px))', letterSpacing: 1, lineHeight: 1.6, marginTop: 4 }}>
          Gold &amp; Obsidian finishes · Dot, Chevron &amp; Circle crosshairs · Red &amp; Cyan colours · Ember knife · leaderboard badge
        </div>
        <div style={{ color: '#666', fontSize: 'max(var(--ui-fs-min), clamp(8px, 1.5vmin, 10px))', letterSpacing: 1, marginTop: 2 }}>
          Cosmetics only — the whole game stays free.
        </div>
        {button}
        {error && (
          <div role="alert" style={{ color: '#ff6644', fontSize: 'max(var(--ui-fs-min), clamp(9px, 1.7vmin, 12px))', letterSpacing: 1, marginTop: 6 }}>{error}</div>
        )}
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
      <div style={{ color: '#666', fontSize: 'max(var(--ui-fs-min), clamp(8px, 1.4vmin, 10px))', letterSpacing: 2 }}>{label}</div>
      <div style={{ color: '#ccc', fontSize: 'clamp(11px, 2.5vmin, 16px)', letterSpacing: 2, marginTop: 'clamp(2px, 0.5vmin, 4px)' }}>{value}</div>
    </div>
  )
}

const deathBtnStyle = { minWidth: 'clamp(110px, 22vmin, 170px)' }
const deathNoteStyle = {
  color: '#aaa',
  fontSize: 'max(var(--ui-fs-min), clamp(10px, 2vmin, 13px))',
  letterSpacing: 3,
  fontFamily: 'Courier New, monospace',
  textAlign: 'center',
  textTransform: 'uppercase',
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
