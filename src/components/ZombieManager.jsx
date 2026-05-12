import { useGameStore } from '../store'
import { useFrame } from '@react-three/fiber'
import ZombieComponent from './Zombie'

const MAX_SLOTS = 26  // 25 active cap + 1 shader-warmer slot

export default function ZombieManager() {
  const zombies = useGameStore((s) => s.zombies)
  const tick = useGameStore((s) => s.tick)

  useFrame((_, rawDelta) => {
    tick(Math.min(rawDelta, 0.05))
  })

  // Fixed pool of slots — components never mount/unmount.
  // Slot 0 is a permanent hidden warmer that keeps shader programs compiled.
  // Slots 1-25 map to live zombies by position in the array; unused slots get
  // zombieData=null which sets their group visible=false so traverseVisible()
  // bails immediately, costing 1 traversal step instead of 200.
  return Array.from({ length: MAX_SLOTS }, (_, i) => (
    <ZombieComponent
      key={i}
      zombieData={i === 0 ? null : (zombies[i - 1] ?? null)}
      hidden={i === 0}
    />
  ))
}
