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

  const damaged   = health === 1
  const skin      = damaged ? '#6b7355' : '#7d8c65'
  const skinDark  = damaged ? '#4e5840' : '#5c6e4e'
  const skinVein  = damaged ? '#3a4530' : '#4a5c3a'
  const shirt     = damaged ? '#1e1e18' : '#252520'
  const shirtTear = damaged ? '#141410' : '#1a1a15'
  const pants     = '#18180f'
  const boot      = '#0e0c08'
  const bootSole  = '#080604'
  const blood     = '#3a0b0a'
  const skullBone = '#c2b090'
  const skullDark = '#a09070'
  const flesh     = '#5a3a28'
  const fleshDark = '#3a2018'
  const gum       = '#6a1c1c'
  const tooth     = '#d8cca8'
  const eyeGlow   = '#ffaa00'
  const bloodBrt = '#5a1210'
  const hair     = '#141008'
  const bone     = '#b8a882'

  return (
    <group ref={ref}>

      {/* ══ HEAD ══ */}

      {/* Main skull dome */}
      <mesh position={[0, 0.760, 0]} castShadow userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.30, 0.38, 0.28]} />
        <meshStandardMaterial color={skullBone} roughness={0.85} />
      </mesh>
      {/* Dome rings — 3 steps to round the crown */}
      <mesh position={[0, 0.963, -0.008]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.268, 0.026, 0.244]} />
        <meshStandardMaterial color={skullBone} roughness={0.84} />
      </mesh>
      <mesh position={[0, 0.989, -0.010]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.194, 0.024, 0.173]} />
        <meshStandardMaterial color={skullBone} roughness={0.83} />
      </mesh>
      <mesh position={[0, 1.013, -0.009]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.130, 0.022, 0.113]} />
        <meshStandardMaterial color={skullBone} roughness={0.83} />
      </mesh>
      {/* Occipital bump — back of skull */}
      <mesh position={[0, 0.730, -0.148]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.180, 0.120, 0.030]} />
        <meshStandardMaterial color={skullBone} roughness={0.84} />
      </mesh>

      {/* Decayed flesh — left side */}
      <mesh position={[-0.142, 0.808, 0.020]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.038, 0.190, 0.140]} />
        <meshStandardMaterial color={flesh} roughness={1} />
      </mesh>
      {/* Flesh — right patch */}
      <mesh position={[0.138, 0.745, 0.038]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.036, 0.130, 0.120]} />
        <meshStandardMaterial color={fleshDark} roughness={1} />
      </mesh>
      {/* Flesh — back/top */}
      <mesh position={[0, 0.830, -0.102]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.200, 0.100, 0.055]} />
        <meshStandardMaterial color={flesh} roughness={1} />
      </mesh>
      {/* Torn flesh strip — forehead left */}
      <mesh position={[-0.060, 0.870, 0.095]} rotation={[0, 0, 0.15]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.030, 0.060, 0.018]} />
        <meshStandardMaterial color={fleshDark} roughness={1} />
      </mesh>

      {/* Brow ridge — overhanging slab */}
      <mesh position={[0, 0.800, 0.142]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.290, 0.060, 0.075]} />
        <meshStandardMaterial color={skullDark} roughness={0.84} />
      </mesh>
      {/* Left brow knob */}
      <mesh position={[-0.080, 0.806, 0.150]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.075, 0.038, 0.042]} />
        <meshStandardMaterial color={skullDark} roughness={0.84} />
      </mesh>
      {/* Right brow knob */}
      <mesh position={[0.080, 0.806, 0.150]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.075, 0.038, 0.042]} />
        <meshStandardMaterial color={skullDark} roughness={0.84} />
      </mesh>
      {/* Glabella center dip */}
      <mesh position={[0, 0.796, 0.154]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.038, 0.025, 0.020]} />
        <meshStandardMaterial color="#130f08" roughness={1} />
      </mesh>
      {/* Brow underside shadow */}
      <mesh position={[0, 0.774, 0.150]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.270, 0.018, 0.048]} />
        <meshStandardMaterial color="#0d0a06" roughness={1} />
      </mesh>

      {/* Left eye socket — deep cavity */}
      <mesh position={[-0.082, 0.762, 0.132]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.096, 0.088, 0.042]} />
        <meshStandardMaterial color="#040201" roughness={1} />
      </mesh>
      {/* Left orbital rim — bone frame */}
      <mesh position={[-0.082, 0.762, 0.115]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.104, 0.096, 0.014]} />
        <meshStandardMaterial color={skullDark} roughness={0.84} />
      </mesh>
      {/* Left supraorbital notch (inner top edge) */}
      <mesh position={[-0.052, 0.802, 0.139]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.018, 0.010, 0.014]} />
        <meshStandardMaterial color="#0a0804" roughness={1} />
      </mesh>
      {/* Left glow — amber */}
      <mesh position={[-0.082, 0.762, 0.140]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.055, 0.055, 0.014]} />
        <meshStandardMaterial color={eyeGlow} emissive={eyeGlow} emissiveIntensity={3.5} />
      </mesh>
      {/* Left iris — hot orange */}
      <mesh position={[-0.082, 0.762, 0.144]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.030, 0.030, 0.008]} />
        <meshStandardMaterial color="#ff5500" emissive="#ff5500" emissiveIntensity={5} />
      </mesh>

      {/* Right eye socket */}
      <mesh position={[0.082, 0.762, 0.132]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.096, 0.088, 0.042]} />
        <meshStandardMaterial color="#040201" roughness={1} />
      </mesh>
      <mesh position={[0.082, 0.762, 0.115]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.104, 0.096, 0.014]} />
        <meshStandardMaterial color={skullDark} roughness={0.84} />
      </mesh>
      <mesh position={[0.052, 0.802, 0.139]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.018, 0.010, 0.014]} />
        <meshStandardMaterial color="#0a0804" roughness={1} />
      </mesh>
      <mesh position={[0.082, 0.762, 0.140]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.055, 0.055, 0.014]} />
        <meshStandardMaterial color={eyeGlow} emissive={eyeGlow} emissiveIntensity={3.5} />
      </mesh>
      <mesh position={[0.082, 0.762, 0.144]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.030, 0.030, 0.008]} />
        <meshStandardMaterial color="#ff5500" emissive="#ff5500" emissiveIntensity={5} />
      </mesh>

      {/* Nasal aperture — wide cavity, two pillars */}
      <mesh position={[0, 0.714, 0.150]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.072, 0.065, 0.025]} />
        <meshStandardMaterial color="#060302" roughness={1} />
      </mesh>
      {/* Left nasal pillar */}
      <mesh position={[-0.030, 0.720, 0.148]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.010, 0.048, 0.016]} />
        <meshStandardMaterial color={skullBone} roughness={0.80} />
      </mesh>
      {/* Right nasal pillar */}
      <mesh position={[0.030, 0.720, 0.148]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.010, 0.048, 0.016]} />
        <meshStandardMaterial color={skullBone} roughness={0.80} />
      </mesh>
      {/* Nasal spine (bottom bridge) */}
      <mesh position={[0, 0.694, 0.148]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.014, 0.012, 0.016]} />
        <meshStandardMaterial color={skullBone} roughness={0.80} />
      </mesh>

      {/* Left cheekbone — prominent slab */}
      <mesh position={[-0.150, 0.718, 0.106]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.040, 0.058, 0.115]} />
        <meshStandardMaterial color={skullBone} roughness={0.78} />
      </mesh>
      {/* Right cheekbone */}
      <mesh position={[0.150, 0.718, 0.106]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.040, 0.058, 0.115]} />
        <meshStandardMaterial color={skullBone} roughness={0.78} />
      </mesh>
      {/* Left cheek flesh — hanging strip */}
      <mesh position={[-0.154, 0.695, 0.122]} rotation={[0, 0, 0.22]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.025, 0.090, 0.018]} />
        <meshStandardMaterial color={flesh} roughness={1} />
      </mesh>
      {/* Right cheek flesh */}
      <mesh position={[0.154, 0.688, 0.118]} rotation={[0, 0, -0.18]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.022, 0.075, 0.016]} />
        <meshStandardMaterial color={fleshDark} roughness={1} />
      </mesh>

      {/* Upper jaw / maxilla */}
      <mesh position={[0, 0.650, 0.058]} castShadow userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.250, 0.072, 0.205]} />
        <meshStandardMaterial color={skullBone} roughness={0.85} />
      </mesh>
      {/* Upper gum — thick ridge */}
      <mesh position={[0, 0.620, 0.140]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.210, 0.026, 0.020]} />
        <meshStandardMaterial color={gum} roughness={1} />
      </mesh>
      {/* Upper teeth — 7 individual varying heights */}
      {[
        { x: -0.085, h: 0.030 }, { x: -0.051, h: 0.038 }, { x: -0.017, h: 0.034 },
        { x:  0.017, h: 0.042 }, { x:  0.051, h: 0.034 }, { x:  0.085, h: 0.030 },
        { x: -0.034, h: 0.028 },
      ].map(({ x, h }, i) => (
        <mesh key={`ut${i}`} position={[x, 0.604 - h / 2, 0.143]} userData={{ zombieId: id, isHead: true }}>
          <boxGeometry args={[0.020, h, 0.018]} />
          <meshStandardMaterial color={tooth} roughness={0.55} />
        </mesh>
      ))}

      {/* ── GAPING MOUTH ── */}

      {/* Mouth void — huge dark cavity between jaws */}
      <mesh position={[0, 0.562, 0.098]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.220, 0.115, 0.095]} />
        <meshStandardMaterial color="#030101" roughness={1} />
      </mesh>
      {/* Throat depth */}
      <mesh position={[0, 0.560, 0.040]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.160, 0.090, 0.060]} />
        <meshStandardMaterial color="#020101" roughness={1} />
      </mesh>

      {/* Tongue — lying on lower jaw, dark red */}
      <mesh position={[0, 0.528, 0.092]} rotation={[0.40, 0, 0]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.135, 0.024, 0.115]} />
        <meshStandardMaterial color="#7a1a1a" roughness={0.95} />
      </mesh>
      {/* Tongue center groove */}
      <mesh position={[0, 0.532, 0.102]} rotation={[0.40, 0, 0]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.008, 0.010, 0.100]} />
        <meshStandardMaterial color="#521010" roughness={1} />
      </mesh>
      {/* Tongue tip — slightly darker */}
      <mesh position={[0, 0.516, 0.140]} rotation={[0.40, 0, 0]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.085, 0.020, 0.030]} />
        <meshStandardMaterial color="#601414" roughness={0.95} />
      </mesh>

      {/* Lower jaw — dropped wide open */}
      <mesh position={[0, 0.540, 0.052]} rotation={[0.44, 0, 0]} castShadow userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.235, 0.065, 0.185]} />
        <meshStandardMaterial color={skullBone} roughness={0.85} />
      </mesh>
      {/* Lower gum */}
      <mesh position={[0, 0.508, 0.140]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.175, 0.022, 0.018]} />
        <meshStandardMaterial color={gum} roughness={1} />
      </mesh>
      {/* Lower teeth — 6 jagged, uneven heights */}
      {[
        { x: -0.070, h: 0.032 }, { x: -0.036, h: 0.042 }, { x: -0.004, h: 0.036 },
        { x:  0.028, h: 0.044 }, { x:  0.060, h: 0.032 }, { x: -0.052, h: 0.026 },
      ].map(({ x, h }, i) => (
        <mesh key={`lt${i}`} position={[x, 0.519 + h / 2, 0.143]} userData={{ zombieId: id, isHead: true }}>
          <boxGeometry args={[0.020, h, 0.016]} />
          <meshStandardMaterial color={tooth} roughness={0.55} />
        </mesh>
      ))}

      {/* Jaw corner — torn left */}
      <mesh position={[-0.108, 0.572, 0.130]} rotation={[0.10, 0, 0.50]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.026, 0.075, 0.015]} />
        <meshStandardMaterial color={flesh} roughness={1} />
      </mesh>
      <mesh position={[-0.118, 0.558, 0.126]} rotation={[0.20, 0, 0.65]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.018, 0.050, 0.012]} />
        <meshStandardMaterial color={fleshDark} roughness={1} />
      </mesh>
      {/* Jaw corner — torn right */}
      <mesh position={[0.108, 0.572, 0.130]} rotation={[0.10, 0, -0.50]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.026, 0.075, 0.015]} />
        <meshStandardMaterial color={fleshDark} roughness={1} />
      </mesh>
      <mesh position={[0.118, 0.558, 0.126]} rotation={[0.20, 0, -0.65]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.018, 0.050, 0.012]} />
        <meshStandardMaterial color={flesh} roughness={1} />
      </mesh>

      {/* Blood — pooled under lower lip */}
      <mesh position={[0, 0.506, 0.148]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.110, 0.016, 0.010]} />
        <meshStandardMaterial color={blood} roughness={1} />
      </mesh>
      {/* Blood drip — left */}
      <mesh position={[-0.030, 0.485, 0.145]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.010, 0.030, 0.008]} />
        <meshStandardMaterial color={blood} roughness={1} />
      </mesh>
      {/* Blood drip — right */}
      <mesh position={[0.025, 0.492, 0.147]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.008, 0.020, 0.007]} />
        <meshStandardMaterial color={blood} roughness={1} />
      </mesh>
      {/* Blood smear on upper jaw */}
      <mesh position={[0.042, 0.614, 0.150]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.044, 0.022, 0.008]} />
        <meshStandardMaterial color={blood} roughness={1} />
      </mesh>

      {/* Skull crack — main */}
      <mesh position={[0.060, 0.862, 0.060]} rotation={[0, 0, 0.60]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.008, 0.130, 0.005]} />
        <meshStandardMaterial color="#140e06" roughness={1} />
      </mesh>
      {/* Crack branch */}
      <mesh position={[0.085, 0.830, 0.065]} rotation={[0, 0, 1.10]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.006, 0.060, 0.004]} />
        <meshStandardMaterial color="#140e06" roughness={1} />
      </mesh>
      {/* Blood from crack */}
      <mesh position={[0.072, 0.822, 0.068]} rotation={[0, 0, 0.60]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.007, 0.070, 0.006]} />
        <meshStandardMaterial color={blood} roughness={1} />
      </mesh>
      {/* Hair wisps */}
      <mesh position={[-0.095, 0.918, -0.082]} rotation={[0.38, 0.28, 0.18]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.008, 0.080, 0.005]} />
        <meshStandardMaterial color={hair} roughness={1} />
      </mesh>
      <mesh position={[0.070, 0.924, -0.090]} rotation={[0.30, -0.20, -0.12]} userData={{ zombieId: id, isHead: true }}>
        <boxGeometry args={[0.006, 0.062, 0.005]} />
        <meshStandardMaterial color={hair} roughness={1} />
      </mesh>

      {/* ══ NECK ══ */}
      <mesh position={[0, 0.535, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.15, 0.11, 0.14]} />
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>
      {/* Collar / torn shirt edge */}
      <mesh position={[0, 0.480, 0.06]} userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.22, 0.03, 0.12]} />
        <meshStandardMaterial color={shirtTear} roughness={1} />
      </mesh>

      {/* ══ TORSO ══ */}
      {/* Chest */}
      <mesh position={[0, 0.285, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.44, 0.38, 0.22]} />
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      {/* Shirt crease / seam lines */}
      <mesh position={[0, 0.285, 0.112]}>
        <boxGeometry args={[0.006, 0.34, 0.004]} />
        <meshStandardMaterial color={shirtTear} roughness={1} />
      </mesh>
      {/* Torn shirt flap — left side */}
      <mesh position={[-0.17, 0.18, 0.115]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.08, 0.12, 0.01]} />
        <meshStandardMaterial color={shirtTear} roughness={1} />
      </mesh>
      {/* Blood stains — main splatter */}
      <mesh position={[0.07, 0.30, 0.113]}>
        <boxGeometry args={[0.12, 0.15, 0.008]} />
        <meshStandardMaterial color={blood} roughness={1} />
      </mesh>
      {/* Secondary blood drip */}
      <mesh position={[0.06, 0.14, 0.112]}>
        <boxGeometry args={[0.04, 0.08, 0.007]} />
        <meshStandardMaterial color={bloodBrt} roughness={1} />
      </mesh>
      {/* Shoulder caps / deltoids */}
      <mesh position={[-0.245, 0.365, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.09, 0.08, 0.17]} />
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      <mesh position={[0.245, 0.365, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.09, 0.08, 0.17]} />
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      {/* Abdomen */}
      <mesh position={[0, 0.015, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.36, 0.22, 0.20]} />
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      {/* Belt */}
      <mesh position={[0, -0.085, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.40, 0.055, 0.23]} />
        <meshStandardMaterial color="#0e0c08" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Belt buckle */}
      <mesh position={[0, -0.085, 0.120]}>
        <boxGeometry args={[0.06, 0.045, 0.012]} />
        <meshStandardMaterial color="#888060" roughness={0.4} metalness={0.7} />
      </mesh>
      {/* Hips */}
      <mesh position={[0, -0.175, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.38, 0.16, 0.21]} />
        <meshStandardMaterial color={pants} roughness={0.95} />
      </mesh>

      {/* ══ LEFT ARM ══ */}
      {/* Shoulder joint bump */}
      <mesh position={[-0.248, 0.305, 0.04]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.10, 0.10, 0.10]} />
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      {/* Upper arm */}
      <mesh position={[-0.305, 0.195, 0.095]} rotation={[-0.55, 0, -0.12]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.13, 0.36, 0.12]} />
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      {/* Elbow bump */}
      <mesh position={[-0.318, 0.035, 0.195]} userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.09, 0.09, 0.09]} />
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>
      {/* Forearm */}
      <mesh position={[-0.325, 0.018, 0.300]} rotation={[-1.05, 0, -0.08]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.11, 0.32, 0.10]} />
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>
      {/* Wrist vein detail */}
      <mesh position={[-0.326, -0.038, 0.408]} rotation={[-1.05, 0, -0.05]}>
        <boxGeometry args={[0.007, 0.07, 0.005]} />
        <meshStandardMaterial color={skinVein} roughness={1} />
      </mesh>
      {/* Left hand */}
      <mesh position={[-0.330, -0.045, 0.462]} rotation={[-1.05, 0, -0.05]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.105, 0.105, 0.09]} />
        <meshStandardMaterial color={skinDark} roughness={0.85} />
      </mesh>
      {/* Fingers — left (3 stubby boxes fanned out) */}
      <mesh position={[-0.345, -0.068, 0.510]} rotation={[-1.05, -0.15, -0.05]}>
        <boxGeometry args={[0.025, 0.07, 0.022]} />
        <meshStandardMaterial color={skinDark} roughness={0.85} />
      </mesh>
      <mesh position={[-0.320, -0.062, 0.512]} rotation={[-1.05, 0, -0.04]}>
        <boxGeometry args={[0.025, 0.075, 0.022]} />
        <meshStandardMaterial color={skinDark} roughness={0.85} />
      </mesh>
      <mesh position={[-0.296, -0.068, 0.508]} rotation={[-1.05, 0.14, -0.03]}>
        <boxGeometry args={[0.025, 0.068, 0.022]} />
        <meshStandardMaterial color={skinDark} roughness={0.85} />
      </mesh>

      {/* ══ RIGHT ARM ══ */}
      <mesh position={[0.248, 0.305, 0.04]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.10, 0.10, 0.10]} />
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      <mesh position={[0.305, 0.195, 0.095]} rotation={[-0.45, 0, 0.12]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.13, 0.36, 0.12]} />
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      {/* Elbow */}
      <mesh position={[0.316, 0.055, 0.185]} userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.09, 0.09, 0.09]} />
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>
      <mesh position={[0.322, 0.040, 0.285]} rotation={[-0.95, 0, 0.08]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.11, 0.32, 0.10]} />
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>
      <mesh position={[0.323, -0.022, 0.390]} rotation={[-0.95, 0, 0.05]}>
        <boxGeometry args={[0.007, 0.07, 0.005]} />
        <meshStandardMaterial color={skinVein} roughness={1} />
      </mesh>
      <mesh position={[0.328, -0.018, 0.435]} rotation={[-0.95, 0, 0.05]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.105, 0.105, 0.09]} />
        <meshStandardMaterial color={skinDark} roughness={0.85} />
      </mesh>
      {/* Fingers — right */}
      <mesh position={[0.344, -0.040, 0.483]} rotation={[-0.95, -0.15, 0.04]}>
        <boxGeometry args={[0.025, 0.07, 0.022]} />
        <meshStandardMaterial color={skinDark} roughness={0.85} />
      </mesh>
      <mesh position={[0.319, -0.036, 0.486]} rotation={[-0.95, 0, 0.03]}>
        <boxGeometry args={[0.025, 0.075, 0.022]} />
        <meshStandardMaterial color={skinDark} roughness={0.85} />
      </mesh>
      <mesh position={[0.295, -0.042, 0.481]} rotation={[-0.95, 0.14, 0.02]}>
        <boxGeometry args={[0.025, 0.068, 0.022]} />
        <meshStandardMaterial color={skinDark} roughness={0.85} />
      </mesh>

      {/* ══ LEFT LEG ══ */}
      <mesh position={[-0.12, -0.375, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.16, 0.36, 0.17]} />
        <meshStandardMaterial color={pants} roughness={0.95} />
      </mesh>
      {/* Kneecap */}
      <mesh position={[-0.12, -0.555, 0.09]} userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.08, 0.07, 0.04]} />
        <meshStandardMaterial color={pants} roughness={0.95} />
      </mesh>
      <mesh position={[-0.12, -0.670, 0.01]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.14, 0.30, 0.15]} />
        <meshStandardMaterial color={pants} roughness={0.95} />
      </mesh>
      {/* Left boot shaft */}
      <mesh position={[-0.12, -0.820, 0.01]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.145, 0.10, 0.165]} />
        <meshStandardMaterial color={boot} roughness={0.8} />
      </mesh>
      {/* Left boot foot */}
      <mesh position={[-0.12, -0.872, 0.055]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.135, 0.06, 0.235]} />
        <meshStandardMaterial color={boot} roughness={0.8} />
      </mesh>
      {/* Boot sole */}
      <mesh position={[-0.12, -0.903, 0.055]}>
        <boxGeometry args={[0.140, 0.015, 0.240]} />
        <meshStandardMaterial color={bootSole} roughness={0.6} />
      </mesh>

      {/* ══ RIGHT LEG ══ */}
      <mesh position={[0.12, -0.375, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.16, 0.36, 0.17]} />
        <meshStandardMaterial color={pants} roughness={0.95} />
      </mesh>
      {/* Kneecap */}
      <mesh position={[0.12, -0.555, 0.09]} userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.08, 0.07, 0.04]} />
        <meshStandardMaterial color={pants} roughness={0.95} />
      </mesh>
      <mesh position={[0.12, -0.670, 0.01]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.14, 0.30, 0.15]} />
        <meshStandardMaterial color={pants} roughness={0.95} />
      </mesh>
      {/* Right boot shaft */}
      <mesh position={[0.12, -0.820, 0.01]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.145, 0.10, 0.165]} />
        <meshStandardMaterial color={boot} roughness={0.8} />
      </mesh>
      {/* Right boot foot */}
      <mesh position={[0.12, -0.872, 0.055]} castShadow userData={{ zombieId: id, isHead: false }}>
        <boxGeometry args={[0.135, 0.06, 0.235]} />
        <meshStandardMaterial color={boot} roughness={0.8} />
      </mesh>
      {/* Boot sole */}
      <mesh position={[0.12, -0.903, 0.055]}>
        <boxGeometry args={[0.140, 0.015, 0.240]} />
        <meshStandardMaterial color={bootSole} roughness={0.6} />
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
