import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameStore } from '../store'
import Player from './Player'
import * as THREE from 'three'

const ZOMBIE_HEIGHT = 1.8
const ARENA_BOUND = 18.5

export default function Zombie({ id, startX, startZ }) {
  const ref = useRef()
  const { camera } = useThree()
  const speed = useGameStore((s) => s.getZombieSpeed())
  const phase = useGameStore((s) => s.phase)

  useEffect(() => {
    if (ref.current) {
      ref.current.position.set(startX, ZOMBIE_HEIGHT / 2, startZ)
      Player.registerZombieRef(id, ref.current)
    }
    return () => Player.unregisterZombieRef(id)
  }, [id, startX, startZ])

  useFrame((_, delta) => {
    if (phase !== 'playing' || !ref.current) return

    const pos = ref.current.position
    const target = new THREE.Vector3(camera.position.x, pos.y, camera.position.z)
    const dir = target.clone().sub(pos).normalize()

    pos.addScaledVector(dir, speed * delta)
    pos.x = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.x))
    pos.z = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.z))

    // Face player
    ref.current.lookAt(camera.position.x, pos.y, camera.position.z)
  })

  return (
    <group ref={ref}>
      {/* Body */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.6, 1.2, 0.3]} />
        <meshStandardMaterial color="#2d5a1b" roughness={0.8} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#4a7c2f" roughness={0.7} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.12, 0.88, 0.26]}>
        <boxGeometry args={[0.1, 0.08, 0.02]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={1} />
      </mesh>
      <mesh position={[0.12, 0.88, 0.26]}>
        <boxGeometry args={[0.1, 0.08, 0.02]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={1} />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.45, 0.1, 0.1]} rotation={[0.4, 0, -0.3]} castShadow>
        <boxGeometry args={[0.2, 0.8, 0.2]} />
        <meshStandardMaterial color="#2d5a1b" roughness={0.8} />
      </mesh>
      <mesh position={[0.45, 0.1, 0.1]} rotation={[0.4, 0, 0.3]} castShadow>
        <boxGeometry args={[0.2, 0.8, 0.2]} />
        <meshStandardMaterial color="#2d5a1b" roughness={0.8} />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.18, -0.75, 0]} castShadow>
        <boxGeometry args={[0.22, 0.6, 0.22]} />
        <meshStandardMaterial color="#1a3a0e" roughness={0.9} />
      </mesh>
      <mesh position={[0.18, -0.75, 0]} castShadow>
        <boxGeometry args={[0.22, 0.6, 0.22]} />
        <meshStandardMaterial color="#1a3a0e" roughness={0.9} />
      </mesh>
      {/* Red glow point light under zombie */}
      <pointLight position={[0, -0.5, 0]} intensity={0.5} color="#ff2200" distance={2} />
    </group>
  )
}
