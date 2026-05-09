import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGameStore } from '../store'
import { startEerieMusic, stopEerieMusic } from '../sounds'
import Arena from './Arena'
import Player from './Player'
import Gun from './Gun'
import ZombieManager from './ZombieManager'
import BulletTrails from './BulletTrails'
import BulletPickups from './BulletPickups'
import HUD from './HUD'
import Screens from './Screens'

export default function Game() {
  const phase = useGameStore((s) => s.phase)
  const isPlaying = phase === 'playing'

  // Player unmounts on phase change so we release the lock here instead
  useEffect(() => {
    if (!isPlaying && document.pointerLockElement) {
      document.exitPointerLock()
    }
  }, [isPlaying])

  useEffect(() => {
    if (phase === 'playing') {
      startEerieMusic()
    } else {
      stopEerieMusic()
    }
  }, [phase])

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
        <ZombieManager />
        <BulletTrails />
        <BulletPickups />
      </Canvas>

      {isPlaying && <HUD />}
      <Screens />
    </div>
  )
}
