import { Canvas } from '@react-three/fiber'
import { useGameStore } from '../store'
import Arena from './Arena'
import Player from './Player'
import ZombieManager from './ZombieManager'
import HUD from './HUD'
import Screens from './Screens'

export default function Game() {
  const phase = useGameStore((s) => s.phase)
  const isPlaying = phase === 'playing'

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 200 }}
        style={{ width: '100%', height: '100%' }}
      >
        <fog attach="fog" args={['#0a0a0a', 10, 40]} />
        <Arena />
        {isPlaying && <Player />}
        <ZombieManager />
      </Canvas>

      {isPlaying && <HUD />}
      <Screens />
    </div>
  )
}
