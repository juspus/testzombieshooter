import { useEffect, useLayoutEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useGameStore } from '../store'
import { startEerieMusic, stopEerieMusic, setMusicIntensity } from '../sounds'
import Arena from './Arena'
import DoorBarricades from './DoorBarricades'
import DinerArena from './DinerArena'
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
import VoiceChat from './VoiceChat'
import useMobileViewport from '../useMobileViewport'
import { initAnalytics } from '../analytics'
import { initProgression } from '../progressTracker'
import ProgressToasts from './ProgressToasts'
import PerfOverlay, { PERF_ON, BENCH_ON } from './PerfOverlay'
import LofiPass, { LOFI_ON, LOFI_EXPOSURE, renderLofiNow } from './LofiPass'

// Blocks iOS address-bar-triggered resize events (small height-only changes < 15%)
// at the ResizeObserver level so R3F never calls setSize for spurious viewport shifts.
class FilteredResizeObserver {
  constructor(cb) {
    this._cb = cb
    this._lastW = 0
    this._lastH = 0
    this._inner = new ResizeObserver((entries) => {
      const pass = entries.filter((e) => {
        const w = e.contentRect.width
        const h = e.contentRect.height
        const dw = Math.abs(w - this._lastW)
        const dh = Math.abs(h - this._lastH)
        if (this._lastH > 0 && dw < 1 && dh / this._lastH < 0.15) return false
        this._lastW = w
        this._lastH = h
        return true
      })
      if (pass.length > 0) this._cb(pass)
    })
  }
  observe(el) { this._inner.observe(el) }
  unobserve(el) { this._inner.unobserve(el) }
  disconnect() { this._inner.disconnect() }
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
  const isPlaying = phase === 'playing'
  const isActive = phase === 'playing' || phase === 'intermission'
  const inGame = phase === 'playing' || phase === 'wave_clear' || phase === 'intermission'

  // Release pointer lock only when leaving active gameplay entirely
  useEffect(() => {
    if (!isActive && document.pointerLockElement) {
      document.exitPointerLock?.()
    }
  }, [isActive])

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
        // Lo-fi pass: the scene renders at ~300px tall, so MSAA and hi-dpi are wasted work.
        gl={{ preserveDrawingBuffer: true, antialias: !LOFI_ON }}
        dpr={LOFI_ON ? 1 : [1, 2]}
        camera={{ fov: 75, near: 0.1, far: 200 }}
        style={{ width: '100%', height: '100%' }}
        resize={{ polyfill: FilteredResizeObserver }}
        onCreated={({ gl }) => {
          // iOS rarely restores WebGL contexts — reload is better than a permanent black screen.
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            console.error('[WebGL] context LOST — reloading')
            e.preventDefault()
            setTimeout(() => window.location.reload(), 100)
          })
          gl.domElement.addEventListener('webglcontextrestored', () => {
            console.log('[WebGL] context restored')
          })

          // Secondary guard: block setSize() calls that aren't genuine resizes.
          const _setSize = gl.setSize.bind(gl)
          gl.setSize = (w, h, updateStyle) => {
            const dpr = gl.getPixelRatio()
            const cw = gl.domElement.width / dpr
            const ch = gl.domElement.height / dpr
            const blocked = (Math.abs(w - cw) < 1 && Math.abs(h - ch) < 1) ||
                            (Math.abs(w - cw) < 1 && Math.abs(h - ch) / ch < 0.15)
            console.log(`[setSize] ${cw}x${ch} → ${w}x${h} ${blocked ? 'BLOCKED' : 'ALLOWED'}`)
            if (blocked) return
            _setSize(w, h, updateStyle)
          }
        }}
      >
        <fog attach="fog" args={['#0b1118', 7, 34]} />
        {mapId === 'diner' ? <GasStationSkybox /> : <ForestSkybox />}
        {mapId === 'diner' ? <DinerArena /> : <Arena />}
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
        {(PERF_ON || BENCH_ON) && <PerfOverlay />}
        <Storm />
      </Canvas>

      {isActive && <HUD />}
      <VoiceChat />
      <MobileControls />
      <Shop />
      <Screens />
      <ProgressToasts />
    </div>
  )
}
