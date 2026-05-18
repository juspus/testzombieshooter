import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGameStore } from '../store'
import { startEerieMusic, stopEerieMusic } from '../sounds'
import Arena from './Arena'
import Player from './Player'
import Gun from './Gun'
import Knife from './Knife'
import ZombieManager from './ZombieManager'
import BulletTrails from './BulletTrails'
import ShellCasings from './ShellCasings'
import HUD from './HUD'
import Screens from './Screens'
import Shop from './Shop'
import ForestSkybox from './ForestSkybox'
import RemotePlayer from './RemotePlayer'
import NetManager from './NetManager'
import MobileControls from './MobileControls'
import useMobileViewport from '../useMobileViewport'

export default function Game() {
  useMobileViewport()
  const phase = useGameStore((s) => s.phase)
  const isPlaying = phase === 'playing'
  const isActive = phase === 'playing' || phase === 'intermission'
  const inGame = phase === 'playing' || phase === 'wave_clear' || phase === 'intermission'

  // Release pointer lock only when leaving active gameplay entirely
  useEffect(() => {
    if (!isActive && document.pointerLockElement) {
      document.exitPointerLock()
    }
  }, [isActive])

  useEffect(() => {
    if (inGame) {
      startEerieMusic()
    } else {
      stopEerieMusic()
    }
  }, [inGame])

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: 'var(--app-width, 100vw)', height: 'var(--app-height, 100dvh)', background: '#000', overflow: 'hidden' }}>
      <Canvas
        shadows
        gl={{ preserveDrawingBuffer: true }}
        camera={{ fov: 75, near: 0.1, far: 200 }}
        style={{ width: '100%', height: '100%', willChange: 'transform' }}
        onCreated={({ gl }) => {
          // iOS Safari fires spurious ResizeObserver events when the address bar
          // shows/hides. WebGL clears the canvas whenever canvas.width is assigned —
          // even to the same value — making the screen go black. Block setSize()
          // calls that aren't genuine size changes (same dimensions) or are only a
          // small height delta caused by the address bar (~4% of viewport height).
          const _setSize = gl.setSize.bind(gl)
          gl.setSize = (w, h, updateStyle) => {
            const dpr = gl.getPixelRatio()
            const cw = gl.domElement.width / dpr
            const ch = gl.domElement.height / dpr
            if (Math.abs(w - cw) < 1 && Math.abs(h - ch) < 1) return
            if (Math.abs(w - cw) < 1 && Math.abs(h - ch) / ch < 0.15) return
            _setSize(w, h, updateStyle)
          }
        }}
      >
        <fog attach="fog" args={['#0a0a0a', 10, 40]} />
        <ForestSkybox />
        <Arena />
        <Player />
        <Gun />
        <Knife />
        <ZombieManager />
        <BulletTrails />
        <ShellCasings />
        <RemotePlayer />
        <NetManager />
      </Canvas>

      {isActive && <HUD />}
      <MobileControls />
      <Shop />
      <Screens />
    </div>
  )
}
