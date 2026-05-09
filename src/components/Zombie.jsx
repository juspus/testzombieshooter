import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameStore } from '../store'
import Player from './Player'
import { findPath, hasLineOfSight, isBlocked } from '../walls'
import { WINDOW_DEFS } from '../cabin'
import * as THREE from 'three'

const ZOMBIE_HEIGHT = 1.8
const ARENA_BOUND = 18.5
const KILL_DISTANCE = 1.2
const PATH_INTERVAL = 0.12   // seconds between A* recalculations
const WAYPOINT_REACH = 0.6   // distance to advance to next waypoint
const ATTACK_RANGE = 1.0     // distance to window attack position to start hitting
const ATTACK_INTERVAL = 1.0  // seconds between plank hits

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
  const hitPlank = useGameStore((s) => s.hitPlank)
  const windowPlanks = useGameStore((s) => s.windowPlanks)

  const [holes, setHoles] = useState([])

  // Pathfinding state
  const pathRef          = useRef([])
  const wpIdxRef         = useRef(0)
  const pathTimer        = useRef(Math.random() * PATH_INTERVAL)
  const modeRef          = useRef('chase')   // 'chase' | 'attack_window'
  const targetWindowRef  = useRef(-1)
  const attackTimerRef   = useRef(0)
  const windowPlanksRef  = useRef(windowPlanks)

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

  useEffect(() => { windowPlanksRef.current = windowPlanks }, [windowPlanks])

  useFrame((_, delta) => {
    if (phase !== 'playing' || !ref.current) return
    const pos = ref.current.position
    const px = camera.position.x, pz = camera.position.z

    let moveDir = null

    if (hasLineOfSight(pos.x, pos.z, px, pz)) {
      // Clear line to player — chase directly
      pathRef.current = []
      wpIdxRef.current = 0
      modeRef.current = 'chase'
      targetWindowRef.current = -1
      const dx = px - pos.x, dz = pz - pos.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > 0.01) moveDir = new THREE.Vector3(dx / dist, 0, dz / dist)
    } else {
      // If current target window had its planks removed, revert to chase
      const planks = windowPlanksRef.current
      if (modeRef.current === 'attack_window' && targetWindowRef.current >= 0) {
        if ((planks[targetWindowRef.current] ?? 0) === 0) {
          modeRef.current = 'chase'
          targetWindowRef.current = -1
          pathRef.current = []
        }
      }

      // Periodic path recalculation
      pathTimer.current -= delta
      if (pathTimer.current <= 0) {
        pathTimer.current = PATH_INTERVAL
        const newPath = findPath(pos.x, pos.z, px, pz)
        if (newPath && newPath.length > 1) {
          pathRef.current = newPath
          wpIdxRef.current = 1
          modeRef.current = 'chase'
          targetWindowRef.current = -1
        } else if (modeRef.current !== 'attack_window' && !isBlocked(px, pz)) {
          // No path AND player cell is reachable → windows are genuinely all blocked
          let nearWin = -1, nearDist = Infinity
          for (const win of WINDOW_DEFS) {
            if ((planks[win.id] ?? 0) === 0) continue
            const dx = pos.x - win.ax, dz = pos.z - win.az
            const d = dx * dx + dz * dz
            if (d < nearDist) { nearDist = d; nearWin = win.id }
          }
          if (nearWin >= 0) {
            modeRef.current = 'attack_window'
            targetWindowRef.current = nearWin
            pathRef.current = []
          }
        }
      }

      if (modeRef.current === 'attack_window' && targetWindowRef.current >= 0) {
        const win = WINDOW_DEFS[targetWindowRef.current]
        const dx = win.ax - pos.x, dz = win.az - pos.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > ATTACK_RANGE) {
          moveDir = new THREE.Vector3(dx / dist, 0, dz / dist)
        } else {
          // In range — swing at the planks
          attackTimerRef.current -= delta
          if (attackTimerRef.current <= 0) {
            attackTimerRef.current = ATTACK_INTERVAL
            hitPlank(win.id)
          }
          ref.current.lookAt(win.winX, pos.y, win.winZ)
        }
      } else {
        // Follow A* path
        const path = pathRef.current
        if (path.length > 0 && wpIdxRef.current < path.length) {
          while (
            wpIdxRef.current < path.length - 1 &&
            hasLineOfSight(pos.x, pos.z, path[wpIdxRef.current + 1].x, path[wpIdxRef.current + 1].z)
          ) {
            wpIdxRef.current++
          }
          const wp = path[wpIdxRef.current]
          const dx = wp.x - pos.x, dz = wp.z - pos.z
          const dist = Math.sqrt(dx * dx + dz * dz)
          if (dist < WAYPOINT_REACH) {
            wpIdxRef.current++
          } else {
            moveDir = new THREE.Vector3(dx / dist, 0, dz / dist)
          }
        }
        // Fallback if path empty or exhausted
        if (!moveDir) {
          const dx = px - pos.x, dz = pz - pos.z
          const dist = Math.sqrt(dx * dx + dz * dz)
          if (dist > 0.01) moveDir = new THREE.Vector3(dx / dist, 0, dz / dist)
        }
      }
    }

    if (moveDir) {
      pos.addScaledVector(moveDir, speed * delta)
      pos.x = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.x))
      pos.z = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.z))
    }

    if (modeRef.current !== 'attack_window') {
      ref.current.lookAt(px, pos.y, pz)
    }

    const dx = px - pos.x, dz = pz - pos.z
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
