import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameStore } from '../store'
import Player from './Player'
import { findPath } from '../walls'
import * as THREE from 'three'

const ZOMBIE_HEIGHT = 1.8
const ARENA_BOUND = 18.5
const KILL_DISTANCE = 1.2
const PATH_INTERVAL = 0.45   // seconds between A* recalculations
const WAYPOINT_REACH = 0.6   // distance to advance to next waypoint

// Module-level registry so Player can push holes into any zombie instance
const _holeAdders = {}
function Zombie() {}
Zombie.addBulletHole = (id, localPos, localNormal) => _holeAdders[id]?.(localPos, localNormal)

export default function ZombieComponent({ id, startX, startZ }) {
  const ref = useRef()
  const { camera } = useThree()
  const speed = useGameStore((s) => s.getZombieSpeed())
  const phase = useGameStore((s) => s.phase)
  const die = useGameStore((s) => s.die)
  const health = useGameStore((s) => s.zombies.find((z) => z.id === id)?.health ?? 2)

  const [holes, setHoles] = useState([])

  // Pathfinding state
  const pathRef     = useRef([])
  const wpIdxRef    = useRef(0)
  const pathTimer   = useRef(Math.random() * PATH_INTERVAL) // stagger initial calc

  useEffect(() => {
    if (ref.current) {
      ref.current.position.set(startX, ZOMBIE_HEIGHT / 2, startZ)
      Player.registerZombieRef(id, ref.current)
    }
    _holeAdders[id] = (localPos, localNormal) => {
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        localNormal.clone().normalize()
      )
      setHoles((prev) => [...prev, { pos: localPos.clone(), quat }])
    }
    return () => {
      Player.unregisterZombieRef(id)
      delete _holeAdders[id]
    }
  }, [id, startX, startZ])

  useFrame((_, delta) => {
    if (phase !== 'playing' || !ref.current) return
    const pos = ref.current.position

    // ── Recompute A* path periodically ──────────────────────────────────────
    pathTimer.current -= delta
    if (pathTimer.current <= 0) {
      pathTimer.current = PATH_INTERVAL
      const newPath = findPath(pos.x, pos.z, camera.position.x, camera.position.z)
      if (newPath && newPath.length > 1) {
        pathRef.current = newPath
        wpIdxRef.current = 1   // index 0 is the zombie's current cell
      }
    }

    // ── Follow path waypoints ────────────────────────────────────────────────
    const path = pathRef.current
    let moveDir = null

    if (path.length > 0 && wpIdxRef.current < path.length) {
      const wp = path[wpIdxRef.current]
      const dx = wp.x - pos.x
      const dz = wp.z - pos.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < WAYPOINT_REACH) {
        wpIdxRef.current++
      } else {
        moveDir = new THREE.Vector3(dx / dist, 0, dz / dist)
      }
    }

    // Fallback: head directly toward player if no path
    if (!moveDir) {
      const dx = camera.position.x - pos.x
      const dz = camera.position.z - pos.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > 0.01) moveDir = new THREE.Vector3(dx / dist, 0, dz / dist)
    }

    if (moveDir) {
      pos.addScaledVector(moveDir, speed * delta)
      pos.x = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.x))
      pos.z = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.z))
    }

    ref.current.lookAt(camera.position.x, pos.y, camera.position.z)

    const dx = camera.position.x - pos.x
    const dz = camera.position.z - pos.z
    if (Math.sqrt(dx * dx + dz * dz) < KILL_DISTANCE) die()
  })

  const damaged = health === 1
  const bodyColor = damaged ? '#1a3a0a' : '#2d5a1b'
  const headColor = damaged ? '#2e5020' : '#4a7c2f'

  return (
    <group ref={ref}>
      {/* Body */}
      <mesh position={[0, 0, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.6, 1.2, 0.3]} />
        <meshStandardMaterial color={bodyColor} roughness={0.8} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.85, 0]} castShadow userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color={headColor} roughness={0.7} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.12, 0.88, 0.26]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.1, 0.08, 0.02]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={1} />
      </mesh>
      <mesh position={[0.12, 0.88, 0.26]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.1, 0.08, 0.02]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={1} />
      </mesh>

      {/* Arms */}
      <mesh position={[-0.45, 0.1, 0.1]} rotation={[0.4, 0, -0.3]} castShadow>
        <boxGeometry args={[0.2, 0.8, 0.2]} />
        <meshStandardMaterial color={bodyColor} roughness={0.8} />
      </mesh>
      <mesh position={[0.45, 0.1, 0.1]} rotation={[0.4, 0, 0.3]} castShadow>
        <boxGeometry args={[0.2, 0.8, 0.2]} />
        <meshStandardMaterial color={bodyColor} roughness={0.8} />
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

      {/* Bullet holes */}
      {holes.map((h, i) => (
        <mesh key={i} position={h.pos} quaternion={h.quat} renderOrder={1}>
          <circleGeometry args={[0.045, 8]} />
          <meshBasicMaterial color="#0a0a0a" depthWrite={false} />
        </mesh>
      ))}

      <pointLight position={[0, -0.5, 0]} intensity={0.5} color="#ff2200" distance={2} />
    </group>
  )
}

export { Zombie }
