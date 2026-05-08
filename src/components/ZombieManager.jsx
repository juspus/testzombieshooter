import { useGameStore } from '../store'
import { useFrame } from '@react-three/fiber'
import Zombie from './Zombie'

export default function ZombieManager() {
  const zombies = useGameStore((s) => s.zombies)
  const tick = useGameStore((s) => s.tick)

  useFrame((_, delta) => {
    tick(delta)
  })

  return (
    <>
      {zombies.map((z) => (
        <Zombie key={z.id} id={z.id} startX={z.x} startZ={z.z} />
      ))}
    </>
  )
}
