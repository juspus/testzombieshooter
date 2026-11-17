import { useGameStore } from '../store'
import { useFrame } from '@react-three/fiber'
import { time } from '../timeScale'
import { zombieSystem } from '../zombieLive'
import ZombieComponent from './Zombie'
import SpecialFX from './SpecialFX'

export default function ZombieManager() {
  const zombies = useGameStore((s) => s.zombies)
  const tick = useGameStore((s) => s.tick)
  const mpRole = useGameStore((s) => s.mpRole)

  // The one zombie frame: store tick, then the AI for every zombie (ZombieSystem, src/zombieAI),
  // then each zombie's pose (Zombie.jsx). Raw delta is clamped first, then slow-mo applies.
  useFrame((state, rawDelta) => {
    if (useGameStore.getState().paused) return
    const delta = Math.min(rawDelta, 0.05)
    tick(delta, mpRole === 'guest')
    const cam = state.camera.position
    zombieSystem.player.x = cam.x
    zombieSystem.player.z = cam.z
    const dt = delta * time.scale
    zombieSystem.tick(dt)
    zombieSystem.poseAll(dt)
  })

  return (
    <>
      {/* Warmer: always in scene so zombie shader programs are never fully
          dereferenced and deleted. Prevents recompile stall on spawn and
          on the final kill (when all live zombies unmount simultaneously). */}
      <ZombieComponent key="warmer" id={-1} startX={0} startZ={0} hidden />
      {/* Exploder flash, spitter globs + puddles (pooled, always mounted) */}
      <SpecialFX />
      {zombies.map((z) => (
        <ZombieComponent key={z.id} id={z.id} startX={z.x} startZ={z.z} type={z.type} />
      ))}
    </>
  )
}
