import { useRef, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameStore } from '../store'
import * as THREE from 'three'

const SPAWN_INTERVAL = 10   // seconds between spawns
const PICKUP_AMOUNT = 10
const PICKUP_RADIUS = 1.8   // collection distance
// Inside the cabin at the four interior corners
const CORNERS = [
  new THREE.Vector3(-5.5, 0, -7.5),
  new THREE.Vector3( 5.5, 0, -7.5),
  new THREE.Vector3(-5.5, 0,  7.5),
  new THREE.Vector3( 5.5, 0,  7.5),
]

let _nextId = 0

function PickupMesh({ position, onCollect }) {
  const ref = useRef()
  const { camera } = useThree()

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    ref.current.position.y = position.y + 0.8 + Math.sin(t * 2) * 0.15
    ref.current.rotation.y = t * 1.5

    // proximity check
    const dx = camera.position.x - position.x
    const dz = camera.position.z - position.z
    if (Math.sqrt(dx * dx + dz * dz) < PICKUP_RADIUS) {
      onCollect()
    }
  })

  return (
    <group ref={ref} position={[position.x, position.y + 0.8, position.z]}>
      {/* Ammo crate body */}
      <mesh castShadow>
        <boxGeometry args={[0.45, 0.32, 0.32]} />
        <meshStandardMaterial color="#c8a830" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Cross stripe */}
      <mesh position={[0, 0, 0.162]}>
        <boxGeometry args={[0.44, 0.06, 0.01]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.162]}>
        <boxGeometry args={[0.06, 0.31, 0.01]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
      </mesh>
      {/* Glow */}
      <pointLight color="#ffe066" intensity={1.2} distance={3} />
    </group>
  )
}

export default function BulletPickups() {
  const phase = useGameStore((s) => s.phase)
  const timeLeft = useGameStore((s) => s.timeLeft)
  const addBullets = useGameStore((s) => s.addBullets)

  const [pickups, setPickups] = useState([])
  const spawnTimer = useRef(SPAWN_INTERVAL)
  const prevTimeLeft = useRef(timeLeft)

  // Reset pickups when a new game/wave starts
  useEffect(() => {
    if (phase === 'playing') {
      setPickups([])
      spawnTimer.current = SPAWN_INTERVAL
    }
  }, [phase])

  useFrame((_, delta) => {
    if (phase !== 'playing') return

    spawnTimer.current -= delta
    if (spawnTimer.current <= 0) {
      spawnTimer.current = SPAWN_INTERVAL

      // Pick a corner that doesn't already have a pickup
      const occupied = new Set(pickups.map((p) => p.cornerIdx))
      const free = CORNERS.map((_, i) => i).filter((i) => !occupied.has(i))
      if (free.length > 0) {
        const cornerIdx = free[Math.floor(Math.random() * free.length)]
        const pos = CORNERS[cornerIdx].clone()
        setPickups((prev) => [...prev, { id: _nextId++, cornerIdx, position: pos }])
      }
    }
  })

  const collect = (id) => {
    addBullets(PICKUP_AMOUNT)
    setPickups((prev) => prev.filter((p) => p.id !== id))
  }

  if (phase !== 'playing') return null

  return (
    <>
      {pickups.map((p) => (
        <PickupMesh
          key={p.id}
          position={p.position}
          onCollect={() => collect(p.id)}
        />
      ))}
    </>
  )
}
