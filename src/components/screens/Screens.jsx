// Picks the screen for the current phase. The entry point is src/components/Screens.jsx, which re-exports this.
import { useEffect, useRef } from 'react'
import { useGameStore } from '../../store'
import { hydrateStoreFromLocal, syncProfileWithCloud } from '../../profilePersistence'
import { send, isConnected } from '../../net'
import { enterRunFullscreen } from '../../fullscreen'
import { YouDied } from './Death'
import { IntermissionScreen } from './Intermission'
import { PausedOverlay } from './PausedOverlay'
import { StartScreen } from './StartScreen'
import { WaveClearScreen } from './WaveClear'
import { useAuthUser, useCheckoutReturn, useProfile } from './hooks'

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
  const dirFrozen = useGameStore((s) => s.director?.active && s.director.role !== 'defender')   // The Director: directing / between turns / over

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id])

  if (dirFrozen) return null   // DirectorView / DirectorFlow own the screen

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
