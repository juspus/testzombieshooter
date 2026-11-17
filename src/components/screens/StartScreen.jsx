// Start menu: the list, its panels, and the room state the lobby panels share.
import { Suspense, useEffect, useState, useCallback, useSyncExternalStore } from 'react'
import { useGameStore } from '../../store'
import { createRoom, joinRoom, disconnect, send, isConnected, getVersionStatus, onVersionStatus } from '../../net'
import { consumeInvite } from '../../invite'
import { consumeDuel } from '../../duel'
import { preloadVersusUi } from '../../versusChunks'
import { signInWithGoogle } from '../../supabase'
import { LevelBadge, useChallengeSummary, ChallengesPanel, AchievementsPanel } from '../ProgressPanels'
import { useDailyEntry, LeaderboardTabs } from '../DailyPanels'
import StartPicker, { useLoadoutSummary } from '../StartPicker'
import { hintsActive } from '../../hints'
import { Button, Panel, Tabs, Option } from '../ui'
import { VERSUS_MODES } from '../../versus'
import { newRunSeed } from '../../rng'
import InstallHint from '../InstallHint'
import { ChevronIcon } from '../Icons'
import { enterRunFullscreen } from '../../fullscreen'
import { LobbyBody } from './Lobby'
import { LockerPanel } from './Locker'
import { SettingsPanel, UsernamePickerView } from './SettingsPanel'
import { DuelPanel } from './lazyUi'
import { GoogleIcon, getIsMobileScreen } from './shared'

// Start menu: one primary action (PLAY), more ways to start (Daily, Co-op, Versus), then the
// meta screens. Everything else opens as a panel beside the list (replaces it on narrow
// portrait screens), so the first screen stays short.
export function StartScreen({ startGame, user, username, onUsernameSet, checkoutReturn }) {
  // W5: opening `/?join=CODE` lands on the CO-OP panel with a one-tap join (the tap also satisfies the audio-unlock gesture)
  const [invite] = useState(() => (checkoutReturn?.openLocker ? null : consumeInvite()))
  // Seed Duel: opening `/?duel=TOKEN` shows the challenge card (null for none / a bad token)
  const [challenge, setChallenge] = useState(() => (checkoutReturn?.openLocker || invite ? null : consumeDuel()))
  const [panel, setPanel] = useState(checkoutReturn?.openLocker ? 'locker' : invite ? 'coop' : challenge ? 'versus' : null) // null | 'versus' | 'coop' | 'loadout' | 'progress' | 'locker' | 'settings' | 'username'
  // Versus panel: the mode list (null) or one mode's screen ('mail' lobby, 'duel').
  const [versusView, setVersusView] = useState(challenge ? 'duel' : null)
  useEffect(() => { if (panel === 'versus') preloadVersusUi() }, [panel])   // chunks ready before the tap that needs them
  const [coop, setCoop] = useState(invite ? 'invite' : 'idle') // room state: 'idle' | 'host' | 'guest' | 'invite'
  // Which menu owns the open room: the Co-op panel or Versus > Zombie Mail.
  const [lobbyKind, setLobbyKind] = useState('coop')
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, username])

  const partnerMapId = useGameStore((s) => s.partnerMapId)
  const ownMapId = useGameStore((s) => s.mapId)
  const mapMismatch = !!partnerMapId && partnerMapId !== ownMapId   // co-op: host waits for a matching guest
  const versionMismatch = useSyncExternalStore(onVersionStatus, getVersionStatus) === 'mismatch'   // partner runs another build
  const setMpRole = useGameStore((s) => s.setMpRole)
  const setMpConnected = useGameStore((s) => s.setMpConnected)
  // Lobby mode (host sets it from the menu it hosts from, guest mirrors): 'coop' or a VERSUS_MODES id.
  const lobbyMode = useGameStore((s) => s.versusLobbyMode)
  const setLobbyMode = useGameStore((s) => s.setVersusLobbyMode)

  // A room is open (hosting, joining or invited): only the panel that owns it (Co-op or Versus) stays usable,
  // since solo starts and map reloads would drop the connection.
  const roomOpen = coop !== 'idle'

  const onDisconnected = useCallback(() => {
    setConnected(false)
    setStatus('')
    setMpConnected(false)
    useGameStore.getState().clearMp()
  }, [setMpConnected])

  // mode: 'coop' from the Co-op panel, a VERSUS_MODES id from Versus.
  const handleHost = useCallback((mode = 'coop') => {
    setLobbyMode(mode)
    setLobbyKind(mode === 'coop' ? 'coop' : 'versus')
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
  }, [setMpRole, setMpConnected, onDisconnected, setLobbyMode])

  const handleJoin = useCallback((override) => {
    const code = (typeof override === 'string' ? override : joinCode).trim()
    if (!code) return
    enterRunFullscreen()   // the guest's run starts without another tap, so this is its gesture
    const from = typeof override === 'string' ? 'invite' : 'idle'
    if (from === 'idle') setCoop('guest')
    setLobbyKind(panel === 'versus' ? 'versus' : 'coop')
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
  }, [joinCode, panel, setMpRole, setMpConnected, onDisconnected])

  // Host: tell the guest the mode on every change and, repeatedly, while it may not be listening yet.
  useEffect(() => {
    if (coop !== 'host' || !connected) return undefined
    const tell = () => send('game_event', { event: 'versus_mode', data: { mode: lobbyMode } })
    tell()
    const t = setInterval(tell, 1500)
    return () => clearInterval(t)
  }, [coop, connected, lobbyMode])

  // Guest (joined by code or invite from either menu): a versus host moves us to its lobby.
  useEffect(() => {
    if (coop === 'host' || coop === 'idle' || !connected || lobbyMode === 'coop' || !VERSUS_MODES[lobbyMode]) return
    setLobbyKind('versus')
    setPanel('versus')
    setVersusView(lobbyMode)
  }, [coop, connected, lobbyMode])

  const handleStartGame = useCallback(() => {
    if (mapMismatch || versionMismatch) return
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
  }, [startGame, mapMismatch, versionMismatch, lobbyMode])

  const handleLeave = useCallback(() => {
    disconnect()
    setCoop('idle')
    setRoomCode('')
    setJoinCode('')
    setStatus('')
    setConnected(false)
    useGameStore.getState().clearMp()
    setLobbyMode('coop')
    setLobbyKind('coop')
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

  const roomMeta = coop === 'host' ? (connected ? 'Partner in' : roomCode || '…')
    : coop === 'guest' ? (connected ? 'Joined' : '…')
    : coop === 'invite' ? 'Invited' : null
  const coopMeta = lobbyKind === 'coop' ? roomMeta : null
  const versusMeta = roomOpen && lobbyKind === 'versus' ? roomMeta : challenge ? 'Challenge' : null
  const openVersus = () => {
    if (panel === 'versus') { setPanel(null); return }
    setVersusView(roomOpen && lobbyKind === 'versus' ? lobbyMode : challenge ? 'duel' : null)
    setPanel('versus')
  }

  const backAction = <Button variant="ghost" size="sm" onClick={closePanel}>Back</Button>
  // A lobby panel: Leave while its room is open, else Back (onBack).
  const lobbyAction = (kind, onBack) => (roomOpen && lobbyKind === kind
    ? <Button variant="ghost" size="sm" onClick={handleLeave}>Leave</Button>
    : <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>)

  // Room state handed to <LobbyBody> (the host / join body shared by Co-op and Versus > Zombie Mail).
  const lobbyProps = { coop, joinCode, setJoinCode, handleHost, handleJoin, status, roomCode, connected, mapMismatch, partnerMapId, versionMismatch, handleStartGame, lobbyMode, invite }

  let detail = null
  if (panel === 'versus' && versusView === 'duel') {
    detail = (
      <Suspense fallback={<Panel title="Seed Duel" testid="duel-panel-loading" />}>
        <DuelPanel challenge={challenge} onBack={() => setVersusView(null)} onDecline={() => { setChallenge(null); setVersusView(null) }} />
      </Suspense>
    )
  } else if (panel === 'versus' && VERSUS_MODES[versusView]) {
    detail = (
      <Panel title={VERSUS_MODES[versusView].label} action={lobbyAction('versus', () => setVersusView(null))} testid="mail-panel">
        <LobbyBody mode={versusView} {...lobbyProps} />
      </Panel>
    )
  } else if (panel === 'versus') {
    detail = (
      <Panel title="Versus" action={backAction} testid="versus-panel">
        <div className="ui-stack">
          <Option label="Zombie Mail" sub="Live, 2 players. Your kills send zombies to your rival." side={<ChevronIcon dir="right" />} onClick={() => setVersusView('mail')} testid="versus-mail" />
          <Option label="The Director" sub="Build your rival's waves, then defend yours. Best of 3." side={<ChevronIcon dir="right" />} onClick={() => setVersusView('director')} testid="versus-director" />
          <Option label="Seed Duel" sub="Play a seed and send it. A friend plays the same waves any time." side={<ChevronIcon dir="right" />} onClick={() => setVersusView('duel')} testid="versus-duel" />
        </div>
      </Panel>
    )
  } else if (panel === 'coop') {
    detail = (
      <Panel title="Co-op" action={lobbyAction('coop', closePanel)} testid="coop-panel">
        <LobbyBody mode="coop" {...lobbyProps} />
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
          <MenuItem label="Co-op" meta={coopMeta} active={panel === 'coop'} onClick={() => togglePanel('coop')} disabled={roomOpen && lobbyKind !== 'coop'} testid="menu-coop" />
          <MenuItem label="Versus" meta={versusMeta} tone={challenge && !roomOpen ? 'warm' : null} active={panel === 'versus'} onClick={openVersus} disabled={roomOpen && lobbyKind !== 'versus'} testid="menu-versus" />
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
