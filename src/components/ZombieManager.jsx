import { useGameStore } from '../store'
import { useFrame } from '@react-three/fiber'
import ZombieComponent from './Zombie'

export default function ZombieManager() {
  const zombies = useGameStore((s) => s.zombies)
  const tick = useGameStore((s) => s.tick)

  useFrame((_, rawDelta) => {
    tick(Math.min(rawDelta, 0.05))
  })

  return (
    <>
      {/* Warmer: keeps one invisible zombie in scene so shaders are pre-compiled
          before the first wave, eliminating the spawn/kill stall. */}
      {zombies.length === 0 && (
        <ZombieComponent key="warmer" id={-1} startX={0} startZ={0} hidden />
      )}
      {zombies.map((z) => (
        <ZombieComponent key={z.id} id={z.id} startX={z.x} startZ={z.z} />
      ))}
    </>
  )
}
