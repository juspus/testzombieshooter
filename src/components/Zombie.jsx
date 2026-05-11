import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameStore } from '../store'
import Player from './Player'
import { findPath, hasLineOfSight, isBlocked, isBlockedRadius } from '../walls'
import { WINDOW_DEFS, CABIN_HW, CABIN_HD } from '../cabin'
import { playZombieFootstep, playPlankHit } from '../sounds'
import * as THREE from 'three'

const ZOMBIE_HEIGHT = 1.8
const ARENA_BOUND = 18.5
const KILL_DISTANCE = 1.2
const PATH_INTERVAL = 0.12   // seconds between A* recalculations
const WAYPOINT_REACH = 0.6   // distance to advance to next waypoint
const ATTACK_RANGE = 1.8     // distance to window center to start hitting
const ATTACK_INTERVAL = 1.0  // seconds between plank hits

// Module-level registry so Player can push holes into any zombie instance
const _holeAdders = {}
// Position registry so zombies can compare distances to windows
const _zombieGroups = {}
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
  const stepTimerRef     = useRef(Math.random() * 0.6)
  const isAggressorRef   = useRef(Math.random() < 0.2)  // rolled once at spawn

  useEffect(() => {
    if (ref.current) {
      ref.current.position.set(startX, ZOMBIE_HEIGHT / 2, startZ)
      Player.registerZombieRef(id, ref.current)
      _zombieGroups[id] = ref.current
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
      delete _zombieGroups[id]
    }
  }, [id, startX, startZ])

  useEffect(() => { windowPlanksRef.current = windowPlanks }, [windowPlanks])

  function followPath(pos, fallbackX, fallbackZ) {
    const path = pathRef.current
    if (path.length > 0 && wpIdxRef.current < path.length) {
      // LOS shortcut — skip waypoints we can already see directly
      while (
        wpIdxRef.current < path.length - 1 &&
        hasLineOfSight(pos.x, pos.z, path[wpIdxRef.current + 1].x, path[wpIdxRef.current + 1].z)
      ) { wpIdxRef.current++ }
      const wp = path[wpIdxRef.current]
      const dx = wp.x - pos.x, dz = wp.z - pos.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < WAYPOINT_REACH) { wpIdxRef.current++; return null }
      return new THREE.Vector3(dx / dist, 0, dz / dist)
    }
    const dx = fallbackX - pos.x, dz = fallbackZ - pos.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    return dist > 0.01 ? new THREE.Vector3(dx / dist, 0, dz / dist) : null
  }

  useFrame((_, delta) => {
    if (phase !== 'playing' || !ref.current) return
    const pos = ref.current.position
    const px = camera.position.x, pz = camera.position.z
    const planks = windowPlanksRef.current

    // Revert attack mode if the target plank was destroyed or zombie entered the cabin
    if (modeRef.current === 'attack_window' && targetWindowRef.current >= 0) {
      const insideCabin = Math.abs(pos.x) < CABIN_HW && Math.abs(pos.z) < CABIN_HD
      if ((planks[targetWindowRef.current] ?? 0) === 0 || insideCabin) {
        // Snap to window center axis so the zombie enters through the opening, not the corner
        if (!insideCabin) {
          const win = WINDOW_DEFS[targetWindowRef.current]
          if (win.wall === 'N' || win.wall === 'S') pos.x = win.winX
          else pos.z = win.winZ
        }
        modeRef.current = 'chase'
        targetWindowRef.current = -1
        pathRef.current = []
        pathTimer.current = 0  // force immediate A* recalculation instead of LOS beeline
      }
    }

    // Periodic pathfinding — recalculate toward player OR window attack position
    pathTimer.current -= delta
    if (pathTimer.current <= 0) {
      pathTimer.current = PATH_INTERVAL
      const boardedWins = WINDOW_DEFS.filter((w) => (planks[w.id] ?? 0) > 0)

      // Consider switching to attack_window mode
      if (modeRef.current !== 'attack_window' && boardedWins.length > 0) {
        let nearWin = boardedWins[0], nearDist = Infinity
        for (const win of boardedWins) {
          const dx = pos.x - win.ax, dz = pos.z - win.az
          const d = dx * dx + dz * dz
          if (d < nearDist) { nearDist = d; nearWin = win }
        }
        let isClosest = true
        for (const [otherId, otherGroup] of Object.entries(_zombieGroups)) {
          if (Number(otherId) === id || !otherGroup) continue
          const op = otherGroup.position
          const dx = op.x - nearWin.ax, dz = op.z - nearWin.az
          if (dx * dx + dz * dz < nearDist) { isClosest = false; break }
        }
        const insideCabin = Math.abs(pos.x) < CABIN_HW && Math.abs(pos.z) < CABIN_HD
        if (isClosest && isAggressorRef.current && !insideCabin) {
          modeRef.current = 'attack_window'
          targetWindowRef.current = nearWin.id
          pathRef.current = []
        }
      }

      // A* toward window attack position or player
      if (modeRef.current === 'attack_window' && targetWindowRef.current >= 0) {
        const win = WINDOW_DEFS[targetWindowRef.current]
        const newPath = findPath(pos.x, pos.z, win.ax, win.az)
        if (newPath && newPath.length > 1) {
          pathRef.current = newPath
          wpIdxRef.current = 1
        }
      } else {
        const newPath = findPath(pos.x, pos.z, px, pz)
        if (newPath && newPath.length > 1) {
          pathRef.current = newPath
          wpIdxRef.current = 1
        } else if (!isBlocked(px, pz)) {
          // Player unreachable — all entries blocked, force nearest window attack
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
    }

    // Determine movement target
    let moveDir = null
    const isAttackMode = modeRef.current === 'attack_window' && targetWindowRef.current >= 0
    const targetX = isAttackMode ? WINDOW_DEFS[targetWindowRef.current].ax : px
    const targetZ = isAttackMode ? WINDOW_DEFS[targetWindowRef.current].az : pz

    // Check if attack zombie has reached its strike position
    if (isAttackMode) {
      const win = WINDOW_DEFS[targetWindowRef.current]
      const dx = win.winX - pos.x, dz = win.winZ - pos.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist <= ATTACK_RANGE) {
        attackTimerRef.current -= delta
        if (attackTimerRef.current <= 0) {
          attackTimerRef.current = ATTACK_INTERVAL
          hitPlank(win.id)
          playPlankHit()
        }
        ref.current.lookAt(win.winX, pos.y, win.winZ)
        // No moveDir — zombie stays put and attacks
      } else {
        // Not yet in range — fall through to path-follow below
        const tdx = targetX - pos.x, tdz = targetZ - pos.z
        const tdist = Math.sqrt(tdx * tdx + tdz * tdz)
        if (hasLineOfSight(pos.x, pos.z, targetX, targetZ)) {
          if (tdist > 0.01) moveDir = new THREE.Vector3(tdx / tdist, 0, tdz / tdist)
        } else {
          moveDir = followPath(pos, targetX, targetZ)
        }
        ref.current.lookAt(win.winX, pos.y, win.winZ)
      }
    } else if (hasLineOfSight(pos.x, pos.z, px, pz)) {
      const dx = px - pos.x, dz = pz - pos.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > 0.01) moveDir = new THREE.Vector3(dx / dist, 0, dz / dist)
    } else {
      moveDir = followPath(pos, px, pz)
    }

    if (moveDir) {
      const step = speed * delta
      const nx = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.x + moveDir.x * step))
      const nz = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.z + moveDir.z * step))

      const R = 0.20
      // When zombie's center is already in a blocked cell (window crossing or interior
      // corner where thin walls mark adjacent cells blocked), let it move freely so it
      // can escape — otherwise all probes return blocked and it freezes.
      if (isBlocked(pos.x, pos.z)) {
        pos.x = nx
        pos.z = nz
      } else if (!isBlockedRadius(nx, nz, R)) {
        pos.x = nx
        pos.z = nz
      } else if (!isBlockedRadius(nx, pos.z, R)) {
        pos.x = nx
      } else if (!isBlockedRadius(pos.x, nz, R)) {
        pos.z = nz
      } else {
        // Corner-stuck: push away from whichever walls are blocking
        let pushX = 0, pushZ = 0
        if (isBlocked(pos.x - R, pos.z)) pushX += 1
        if (isBlocked(pos.x + R, pos.z)) pushX -= 1
        if (isBlocked(pos.x, pos.z - R)) pushZ += 1
        if (isBlocked(pos.x, pos.z + R)) pushZ -= 1
        if (pushX !== 0 || pushZ !== 0) {
          const len = Math.sqrt(pushX * pushX + pushZ * pushZ)
          pos.x += (pushX / len) * step * 0.8
          pos.z += (pushZ / len) * step * 0.8
        }
      }

      // Footstep sound — only when close enough for player to hear
      const sdx = px - pos.x, sdz = pz - pos.z
      if (sdx * sdx + sdz * sdz < 144) {  // within 12 units
        stepTimerRef.current -= delta
        if (stepTimerRef.current <= 0) {
          stepTimerRef.current = 0.55 + Math.random() * 0.1
          playZombieFootstep()
        }
      }
    }

    if (modeRef.current !== 'attack_window') {
      ref.current.lookAt(px, pos.y, pz)
    }

    const dx = px - pos.x, dz = pz - pos.z
    if (dx * dx + dz * dz < KILL_DISTANCE * KILL_DISTANCE) die()
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
