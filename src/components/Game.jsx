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

export default function Game() {
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
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 200 }}
        style={{ width: '100%', height: '100%' }}
      >
        <fog attach="fog" args={['#0a0a0a', 10, 40]} />
        <Arena />
        <Player />
        <Gun />
        <Knife />
        <ZombieManager />
        <BulletTrails />
        <ShellCasings />
      </Canvas>

      {isActive && <HUD />}
      <Shop />
      <Screens />
    </div>
  )
}
