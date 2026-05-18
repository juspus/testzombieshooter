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
        resize={{ polyfill: FilteredResizeObserver }}
        onCreated={({ gl }) => {
          // Promote the actual <canvas> element to its own GPU compositing layer
          // so iOS doesn't blank it when new fixed-position overlays are added.
          gl.domElement.style.willChange = 'transform'

          // Secondary guard: block setSize() calls that aren't genuine resizes.
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
