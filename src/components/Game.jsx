import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useGameStore } from '../store'
import { startEerieMusic, stopEerieMusic, setMusicIntensity } from '../sounds'
import DoorBarricades from './DoorBarricades'
import Player from './Player'
import Gun from './Gun'
import Knife from './Knife'
import ZombieManager from './ZombieManager'
import BulletTrails from './BulletTrails'
import ImpactFX from './ImpactFX'
import Grenades from './Grenades'
import ShellCasings from './ShellCasings'
import FlameSpray from './FlameSpray'
import BloodFX from './BloodFX'
import HUD from './HUD'
import Screens from './Screens'
import Shop from './Shop'
import ForestSkybox from './ForestSkybox'
import GasStationSkybox from './GasStationSkybox'
import RemotePlayer from './RemotePlayer'
import PowerUps from './PowerUps'
import Machines from './Machines'
import NetManager from './NetManager'
import MobileControls from './MobileControls'
import Storm from './Storm'
import ModifierFx from './ModifierFx'
import FrameGovernor from './FrameGovernor'
import VoiceChat from './VoiceChat'
import useMobileViewport from '../useMobileViewport'
import { getInitialMapId } from '../maps'
import { initAnalytics } from '../analytics'
import { initProgression } from '../progressTracker'
import ProgressToasts from './ProgressToasts'
import PauseLayer from './PauseMenu'
import RotateGate from './RotateGate'
import { installWakeLock } from '../wakeLock'
import { handleContextLost, handleContextRestored } from '../pause'
import PerfOverlay, { PERF_ON, BENCH_ON } from './PerfOverlay'
import LofiPass, { LOFI_ON, LOFI_EXPOSURE, renderLofiNow } from './LofiPass'

// The map is fixed per page load (mapSelect.js reloads to change it), so only the arena that will be
// used is downloaded, and its import starts right now, in parallel with the rest of startup.
const Arena = lazy(() => import('./Arena'))
const DinerArena = lazy(() => import('./DinerArena'))
if (typeof window !== 'undefined') (getInitialMapId() === 'diner' ? import('./DinerArena') : import('./Arena')).catch(() => {})

// Versus-only UI (rival link, mail HUD, Director screens) is its own chunk. It mounts the first time a
// room is hosted or joined, a versus run starts or a Director match exists, then stays (like it always did).
const VersusLayer = lazy(() => import('./VersusLayer'))
function VersusMount() {
  const needed = useGameStore((s) => Boolean(s.roomCode || s.mpRole || s.runMode === 'versus' || s.versus?.active || s.director?.active))
  const [seen, setSeen] = useState(false)
  if (needed && !seen) setSeen(true)
  return seen ? <Suspense fallback={null}><VersusLayer /></Suspense> : null
}

function ForceRenderOnShopOpen() {
  const shopOpen = useGameStore((s) => s.shopOpen)
  const { gl, scene, camera } = useThree()
  useLayoutEffect(() => {
    if (shopOpen) {
      console.log('[ForceRender] shopOpen=true → calling gl.render at', performance.now().toFixed(1))
      renderLofiNow(gl, scene, camera)
      console.log('[ForceRender] gl.render done at', performance.now().toFixed(1))
    }
  }, [shopOpen, gl, scene, camera])
  return null
}

export default function Game() {
  useMobileViewport()
  useEffect(() => { initAnalytics(); initProgression() }, [])
  const phase = useGameStore((s) => s.phase)
  const mapId = useGameStore((s) => s.mapId)
  // The Director: while directing / between turns / over, this world is frozen and covered; the 3D loop stops.
  const dirFrozen = useGameStore((s) => s.director?.active && s.director.role !== 'defender')
  const isPlaying = phase === 'playing'
  const isActive = phase === 'playing' || phase === 'intermission'
  const inGame = phase === 'playing' || phase === 'wave_clear' || phase === 'intermission'

  // Release pointer lock only when leaving active gameplay entirely
  useEffect(() => {
    if (!isActive && document.pointerLockElement) {
      document.exitPointerLock?.()
    }
  }, [isActive])

  useEffect(() => installWakeLock(), [])

  useEffect(() => {
    if (inGame) startEerieMusic()
    else stopEerieMusic()
  }, [inGame])

  useEffect(() => {
    if (!inGame) return
    setMusicIntensity(isPlaying ? 1 : 0)
  }, [inGame, isPlaying])

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: 'var(--app-width, 100vw)', height: 'var(--app-height, 100dvh)', background: '#000', overflow: 'hidden' }}>
      <Canvas
        shadows
        frameloop={dirFrozen ? 'never' : 'always'}
        // Lo-fi pass: the scene renders at ~300px tall, so MSAA and hi-dpi are wasted work.
        gl={{ preserveDrawingBuffer: true, antialias: !LOFI_ON }}
        dpr={LOFI_ON ? 1 : [1, 2]}
        camera={{ fov: 75, near: 0.1, far: 200 }}
        style={{ width: '100%', height: '100%' }}
        // Never drop a resize: an ignored height-only change (bookmarks bar, URL bar, PWA launch)
        // left a black strip under the canvas until the next width change. The debounce only
        // coalesces a burst (toolbar animation, window drag) into one setSize at the final size.
        resize={{ debounce: { scroll: 50, resize: 100 } }}
        onCreated={({ gl, scene }) => {
          // Context loss (iOS reclaims memory from background tabs): keep the run. preventDefault lets
          // three.js rebuild its GPU resources on restore; the game pauses meanwhile (pause.js).
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault()
            handleContextLost()
          })
          gl.domElement.addEventListener('webglcontextrestored', () => handleContextRestored(scene))
        }}
      >
        <fog attach="fog" args={['#0b1118', 7, 34]} />
        {mapId === 'diner' ? <GasStationSkybox /> : <ForestSkybox />}
        <Suspense fallback={null}>{mapId === 'diner' ? <DinerArena /> : <Arena />}</Suspense>
        <DoorBarricades />
        <Machines />
        <Player />
        <ModifierFx />
        <Gun />
        <Knife />
        <ZombieManager />
        <BulletTrails />
        <ImpactFX />
        <Grenades />
        <ShellCasings />
        <FlameSpray />
        <BloodFX />
        <RemotePlayer />
        <PowerUps />
        <NetManager />
        <ForceRenderOnShopOpen />
        {LOFI_ON && <LofiPass exposure={LOFI_EXPOSURE[mapId] ?? 1.5} />}
        <FrameGovernor />
        {(PERF_ON || BENCH_ON) && <PerfOverlay />}
        <Storm />
      </Canvas>

      {isActive && !dirFrozen && <HUD />}
      <VoiceChat />
      {!dirFrozen && <MobileControls />}
      {!dirFrozen && <Shop />}
      <Screens />
      <ProgressToasts />
      <PauseLayer />
      <VersusMount />
      <RotateGate />
    </div>
  )
}
