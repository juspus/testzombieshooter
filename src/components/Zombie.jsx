import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameStore } from '../store'
import Player from './Player'
import { findPath, isBlocked, collidesWithWalls } from '../walls'
import { WINDOW_DEFS, CABIN_HW, CABIN_HD, cabinWallSegments, windowBlockSegment } from '../cabin'
import { playZombieFootstep, playPlankHit } from '../sounds'
import * as THREE from 'three'

const ZOMBIE_HEIGHT = 1.8
const ARENA_BOUND = 18.5
const ZOMBIE_R = 0.30             // physical collision radius
const KILL_DISTANCE = 1.2
const PATH_INTERVAL = 0.12        // seconds between A* recalculations
const WAYPOINT_REACH = 0.6        // distance to advance to next waypoint
const ATTACK_RANGE = 1.8          // distance to window face to start hitting
const ATTACK_INTERVAL = 1.0       // seconds between plank hits

// Module-level registry so Player can push holes into any zombie instance
const _holeAdders = {}
// Position registry so zombies can compare distances to windows
const _zombieGroups = {}
function Zombie() {}
Zombie.addBulletHole = (id, localPos, localNormal) => _holeAdders[id]?.(localPos, localNormal)

// Geometry-accurate line-of-sight: samples along the segment at half-radius
// intervals and checks the zombie's full circle against the real wall AABBs.
function hasDirectPath(x1, z1, x2, z2, walls) {
  const dx = x2 - x1, dz = z2 - z1
  const dist = Math.sqrt(dx * dx + dz * dz)
  if (dist < 0.01) return true
  const steps = Math.max(2, Math.ceil(dist / (ZOMBIE_R * 0.5)))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    if (collidesWithWalls(x1 + dx * t, z1 + dz * t, ZOMBIE_R, walls)) return false
  }
  return true
}

// Move a zombie: full move → axis-split for wall-threading → push-out.
// The axis-split is needed so zombies can thread through narrow window
// openings when following A* paths at a slight angle.
function applyMove(pos, vx, vz, walls) {
  const R = ZOMBIE_R
  const nx = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.x + vx))
  const nz = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.z + vz))

  if (!collidesWithWalls(nx, nz, R, walls)) {
    pos.x = nx; pos.z = nz; return
  }
  if (!collidesWithWalls(nx, pos.z, R, walls)) {
    pos.x = nx; return
  }
  if (!collidesWithWalls(pos.x, nz, R, walls)) {
    pos.z = nz; return
  }

  // Fully blocked — push out of penetrating walls.
  let pushX = 0, pushZ = 0
  for (const w of walls) {
    const nearX = Math.max(w.x - w.halfW, Math.min(pos.x, w.x + w.halfW))
    const nearZ = Math.max(w.z - w.halfD, Math.min(pos.z, w.z + w.halfD))
    const dx = pos.x - nearX, dz = pos.z - nearZ
    const d2 = dx * dx + dz * dz
    if (d2 < R * R) {
      const d = Math.sqrt(d2) || 0.001
      pushX += (dx / d) * (R - d)
      pushZ += (dz / d) * (R - d)
    }
  }
  pos.x = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.x + pushX))
  pos.z = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.z + pushZ))
}

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
  const pathRef         = useRef([])
  const wpIdxRef        = useRef(0)
  const pathTimer       = useRef(Math.random() * PATH_INTERVAL)
  const modeRef         = useRef('chase')   // 'chase' | 'attack_window'
  const targetWindowRef = useRef(-1)
  const attackTimerRef  = useRef(0)
  const windowPlanksRef = useRef(windowPlanks)
  const zombieWallsRef  = useRef(cabinWallSegments())
  const stepTimerRef    = useRef(Math.random() * 0.6)
  const isAggressorRef  = useRef(Math.random() < 0.2)

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

  // Keep collision wall list in sync with plank state.
  // Zombies collide with cabin walls (window gaps open) + any boarded window faces.
  useEffect(() => {
    windowPlanksRef.current = windowPlanks
    const segs = [...cabinWallSegments()]
    for (const [wid, count] of Object.entries(windowPlanks)) {
      if (count > 0) segs.push(windowBlockSegment(Number(wid)))
    }
    zombieWallsRef.current = segs
  }, [windowPlanks])

  function followPath(pos, fallbackX, fallbackZ) {
    const path = pathRef.current
    if (path.length > 0 && wpIdxRef.current < path.length) {
      // LOS shortcut — skip waypoints we can already see directly
      while (
        wpIdxRef.current < path.length - 1 &&
        hasDirectPath(pos.x, pos.z, path[wpIdxRef.current + 1].x, path[wpIdxRef.current + 1].z, zombieWallsRef.current)
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
        if (!insideCabin) {
          const win = WINDOW_DEFS[targetWindowRef.current]
          if (win.wall === 'N' || win.wall === 'S') pos.x = win.winX
          else pos.z = win.winZ
        }
        modeRef.current = 'chase'
        targetWindowRef.current = -1
        pathRef.current = []
        pathTimer.current = 0
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
          // Player unreachable via open path — force nearest window attack
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

    // Determine movement direction
    let moveDir = null
    const isAttackMode = modeRef.current === 'attack_window' && targetWindowRef.current >= 0

    if (isAttackMode) {
      const win = WINDOW_DEFS[targetWindowRef.current]
      const dx = win.winX - pos.x, dz = win.winZ - pos.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      ref.current.lookAt(win.winX, pos.y, win.winZ)
      if (dist <= ATTACK_RANGE) {
        attackTimerRef.current -= delta
        if (attackTimerRef.current <= 0) {
          attackTimerRef.current = ATTACK_INTERVAL
          hitPlank(win.id)
          playPlankHit()
        }
        // Stay put while attacking
      } else {
        const tx = win.ax, tz = win.az
        const tdx = tx - pos.x, tdz = tz - pos.z
        const tdist = Math.sqrt(tdx * tdx + tdz * tdz)
        if (hasDirectPath(pos.x, pos.z, tx, tz, zombieWallsRef.current)) {
          if (tdist > 0.01) moveDir = new THREE.Vector3(tdx / tdist, 0, tdz / tdist)
        } else {
          moveDir = followPath(pos, tx, tz)
        }
      }
    } else {
      ref.current.lookAt(px, pos.y, pz)
      if (hasDirectPath(pos.x, pos.z, px, pz, zombieWallsRef.current)) {
        const dx = px - pos.x, dz = pz - pos.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > 0.01) moveDir = new THREE.Vector3(dx / dist, 0, dz / dist)
      } else {
        moveDir = followPath(pos, px, pz)
      }
    }

    if (moveDir) {
      const step = speed * delta
      applyMove(pos, moveDir.x * step, moveDir.z * step, zombieWallsRef.current)

      // Footstep sound — only when close enough for player to hear
      const sdx = px - pos.x, sdz = pz - pos.z
      if (sdx * sdx + sdz * sdz < 144) {
        stepTimerRef.current -= delta
        if (stepTimerRef.current <= 0) {
          stepTimerRef.current = 0.55 + Math.random() * 0.1
          playZombieFootstep()
        }
      }
    }

    const dx = px - pos.x, dz = pz - pos.z
    if (dx * dx + dz * dz < KILL_DISTANCE * KILL_DISTANCE) die()
  })

  const damaged = health === 1
  const skin     = damaged ? '#6b7355' : '#7d8c65'
  const skinDark = damaged ? '#4e5840' : '#5c6e4e'
  const shirt    = damaged ? '#1e1e18' : '#252520'
  const pants    = '#18180f'
  const boot     = '#0e0c08'
  const blood    = '#3a0b0a'

  return (
    <group ref={ref}>
      {/* ── HEAD ── */}
      {/* Skull */}
      <mesh position={[0, 0.73, 0]} castShadow userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.32, 0.34, 0.27]} />
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>
      {/* Jaw — slightly narrower and forward */}
      <mesh position={[0, 0.58, 0.02]} castShadow userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.25, 0.13, 0.22]} />
        <meshStandardMaterial color={skinDark} roughness={0.9} />
      </mesh>
      {/* Brow ridge */}
      <mesh position={[0, 0.80, 0.12]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.28, 0.05, 0.06]} />
        <meshStandardMaterial color={skinDark} roughness={0.9} />
      </mesh>
      {/* Eye sockets */}
      <mesh position={[-0.085, 0.76, 0.13]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.075, 0.065, 0.02]} />
        <meshStandardMaterial color="#080806" roughness={1} />
      </mesh>
      <mesh position={[0.085, 0.76, 0.13]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.075, 0.065, 0.02]} />
        <meshStandardMaterial color="#080806" roughness={1} />
      </mesh>
      {/* Glowing pupils */}
      <mesh position={[-0.085, 0.76, 0.14]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.036, 0.036, 0.01]} />
        <meshStandardMaterial color="#ff1800" emissive="#ff1800" emissiveIntensity={2} />
      </mesh>
      <mesh position={[0.085, 0.76, 0.14]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.036, 0.036, 0.01]} />
        <meshStandardMaterial color="#ff1800" emissive="#ff1800" emissiveIntensity={2} />
      </mesh>
      {/* Mouth slit */}
      <mesh position={[0, 0.60, 0.12]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.14, 0.025, 0.02]} />
        <meshStandardMaterial color="#1a0808" roughness={1} />
      </mesh>

      {/* ── NECK ── */}
      <mesh position={[0, 0.53, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.15, 0.11, 0.14]} />
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>

      {/* ── TORSO ── */}
      {/* Chest */}
      <mesh position={[0, 0.28, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.44, 0.38, 0.22]} />
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      {/* Abdomen — slightly narrower */}
      <mesh position={[0, 0.01, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.36, 0.22, 0.20]} />
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      {/* Blood stain on shirt */}
      <mesh position={[0.07, 0.26, 0.112]} userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.10, 0.13, 0.01]} />
        <meshStandardMaterial color={blood} roughness={1} />
      </mesh>
      {/* Hips */}
      <mesh position={[0, -0.17, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.38, 0.16, 0.21]} />
        <meshStandardMaterial color={pants} roughness={0.95} />
      </mesh>

      {/* ── LEFT ARM ── */}
      {/* Upper arm — angled forward and slightly out */}
      <mesh position={[-0.30, 0.21, 0.09]} rotation={[-0.55, 0, -0.12]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.13, 0.36, 0.12]} />
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      {/* Forearm — reaching further forward */}
      <mesh position={[-0.32, 0.02, 0.30]} rotation={[-1.05, 0, -0.08]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.11, 0.32, 0.10]} />
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>
      {/* Left hand */}
      <mesh position={[-0.33, -0.04, 0.46]} rotation={[-1.05, 0, -0.05]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.10, 0.10, 0.09]} />
        <meshStandardMaterial color={skinDark} roughness={0.9} />
      </mesh>

      {/* ── RIGHT ARM ── (slightly different angle for asymmetry) */}
      <mesh position={[0.30, 0.21, 0.09]} rotation={[-0.45, 0, 0.12]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.13, 0.36, 0.12]} />
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      <mesh position={[0.32, 0.04, 0.28]} rotation={[-0.95, 0, 0.08]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.11, 0.32, 0.10]} />
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>
      <mesh position={[0.33, -0.01, 0.43]} rotation={[-0.95, 0, 0.05]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.10, 0.10, 0.09]} />
        <meshStandardMaterial color={skinDark} roughness={0.9} />
      </mesh>

      {/* ── LEFT LEG ── */}
      <mesh position={[-0.12, -0.38, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.16, 0.36, 0.17]} />
        <meshStandardMaterial color={pants} roughness={0.95} />
      </mesh>
      <mesh position={[-0.12, -0.67, 0.01]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.14, 0.30, 0.15]} />
        <meshStandardMaterial color={pants} roughness={0.95} />
      </mesh>
      {/* Left boot */}
      <mesh position={[-0.12, -0.85, 0.05]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.13, 0.09, 0.23]} />
        <meshStandardMaterial color={boot} roughness={0.8} />
      </mesh>

      {/* ── RIGHT LEG ── */}
      <mesh position={[0.12, -0.38, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.16, 0.36, 0.17]} />
        <meshStandardMaterial color={pants} roughness={0.95} />
      </mesh>
      <mesh position={[0.12, -0.67, 0.01]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.14, 0.30, 0.15]} />
        <meshStandardMaterial color={pants} roughness={0.95} />
      </mesh>
      {/* Right boot */}
      <mesh position={[0.12, -0.85, 0.05]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.13, 0.09, 0.23]} />
        <meshStandardMaterial color={boot} roughness={0.8} />
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
