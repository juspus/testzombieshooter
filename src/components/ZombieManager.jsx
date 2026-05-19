import { useGameStore } from '../store'
import { useFrame } from '@react-three/fiber'
import ZombieComponent from './Zombie'

export default function ZombieManager() {
  const zombies = useGameStore((s) => s.zombies)
  const tick = useGameStore((s) => s.tick)
  const mpRole = useGameStore((s) => s.mpRole)

  useFrame((_, rawDelta) => {
    tick(Math.min(rawDelta, 0.05), mpRole === 'guest')
  })

  return (
    <>
      {/* Warmer: always in scene so zombie shader programs are never fully
          dereferenced and deleted. Prevents recompile stall on spawn and
          on the final kill (when all live zombies unmount simultaneously). */}
      <ZombieComponent key="warmer" id={-1} startX={0} startZ={0} hidden />
      {zombies.map((z) => (
        <ZombieComponent key={z.id} id={z.id} startX={z.x} startZ={z.z} type={z.type} />
      ))}
    </>
  )
}
