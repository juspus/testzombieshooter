import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameStore } from '../store'
import Player from './Player'
import { findPath, isBlocked, collidesWithWalls } from '../walls'
import { WINDOW_DEFS, CABIN_HW, CABIN_HD, cabinWallSegments, windowBlockSegment } from '../cabin'
import { playZombieFootstep, playPlankHit } from '../sounds'
import * as THREE from 'three'

const _geoCache = new Map()
function bg(x, y, z) {
  const k = `${x},${y},${z}`
  if (!_geoCache.has(k)) _geoCache.set(k, new THREE.BoxGeometry(x, y, z))
  return _geoCache.get(k)
}
function cg(rt, rb, h, segs = 6) {
  const k = `${rt},${rb},${h},${segs}`
  if (!_geoCache.has(k)) _geoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, segs))
  return _geoCache.get(k)
}

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

export default function ZombieComponent({ id, startX, startZ, hidden = false }) {
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
  const walkCycleRef    = useRef(Math.random() * Math.PI * 2)
  const isAttackingRef  = useRef(false)
  const leftLegRef      = useRef()
  const rightLegRef     = useRef()
  const leftArmRef      = useRef()
  const rightArmRef     = useRef()

  useEffect(() => {
    if (hidden) return
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
    if (hidden || phase !== 'playing' || !ref.current) return
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
        isAttackingRef.current = true
        attackTimerRef.current -= delta
        if (attackTimerRef.current <= 0) {
          attackTimerRef.current = ATTACK_INTERVAL
          hitPlank(win.id)
          playPlankHit()
        }
      } else {
        isAttackingRef.current = false
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

    // Animation
    if (isAttackingRef.current) {
      const phase = 1.0 - attackTimerRef.current / ATTACK_INTERVAL
      // Slow lift (72% of cycle), fast slam (28% of cycle)
      const HIGH = 0.28, LOW = -1.05, LIFT = 0.72
      const armX = phase < LIFT
        ? LOW + (HIGH - LOW) * (phase / LIFT)
        : HIGH + (LOW - HIGH) * ((phase - LIFT) / (1 - LIFT))
      if (leftArmRef.current)  leftArmRef.current.rotation.x  = armX
      if (rightArmRef.current) rightArmRef.current.rotation.x = armX
      if (leftLegRef.current)  leftLegRef.current.rotation.x  = 0
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0
    } else {
      isAttackingRef.current = false
      if (moveDir) walkCycleRef.current += delta * 4.0
      const t = walkCycleRef.current
      if (leftLegRef.current)  leftLegRef.current.rotation.x  =  Math.sin(t) * 0.32
      if (rightLegRef.current) rightLegRef.current.rotation.x = -Math.sin(t) * 0.32
      if (leftArmRef.current)  leftArmRef.current.rotation.x  = -Math.sin(t) * 0.20
      if (rightArmRef.current) rightArmRef.current.rotation.x  =  Math.sin(t) * 0.20
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
    <group ref={ref} scale={hidden ? 0.001 : 1}>

      {/* ══ HEAD ══ */}

      {/* Main skull dome */}
      <mesh geometry={bg(0.30, 0.38, 0.28)} position={[0, 0.760, 0]} castShadow userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullBone} roughness={0.85} />
      </mesh>
      {/* Dome rings — 3 steps to round the crown */}
      <mesh geometry={bg(0.268, 0.026, 0.244)} position={[0, 0.963, -0.008]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullBone} roughness={0.84} />
      </mesh>
      <mesh geometry={bg(0.194, 0.024, 0.173)} position={[0, 0.989, -0.010]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullBone} roughness={0.83} />
      </mesh>
      <mesh geometry={bg(0.130, 0.022, 0.113)} position={[0, 1.013, -0.009]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullBone} roughness={0.83} />
      </mesh>
      {/* Occipital bump — back of skull */}
      <mesh geometry={bg(0.180, 0.120, 0.030)} position={[0, 0.730, -0.148]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullBone} roughness={0.84} />
      </mesh>

      {/* Decayed flesh — left side */}
      <mesh geometry={bg(0.038, 0.190, 0.140)} position={[-0.142, 0.808, 0.020]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={flesh} roughness={1} />
      </mesh>
      {/* Flesh — right patch */}
      <mesh geometry={bg(0.036, 0.130, 0.120)} position={[0.138, 0.745, 0.038]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={fleshDark} roughness={1} />
      </mesh>
      {/* Flesh — back/top */}
      <mesh geometry={bg(0.200, 0.100, 0.055)} position={[0, 0.830, -0.102]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={flesh} roughness={1} />
      </mesh>
      {/* Torn flesh strip — forehead left */}
      <mesh geometry={bg(0.030, 0.060, 0.018)} position={[-0.060, 0.870, 0.095]} rotation={[0, 0, 0.15]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={fleshDark} roughness={1} />
      </mesh>

      {/* Brow ridge — overhanging slab */}
      <mesh geometry={bg(0.290, 0.060, 0.075)} position={[0, 0.800, 0.142]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullDark} roughness={0.84} />
      </mesh>
      {/* Left brow knob */}
      <mesh geometry={bg(0.075, 0.038, 0.042)} position={[-0.080, 0.806, 0.150]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullDark} roughness={0.84} />
      </mesh>
      {/* Right brow knob */}
      <mesh geometry={bg(0.075, 0.038, 0.042)} position={[0.080, 0.806, 0.150]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullDark} roughness={0.84} />
      </mesh>
      {/* Glabella center dip */}
      <mesh geometry={bg(0.038, 0.025, 0.020)} position={[0, 0.796, 0.154]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#130f08" roughness={1} />
      </mesh>
      {/* Brow underside shadow */}
      <mesh geometry={bg(0.270, 0.018, 0.048)} position={[0, 0.774, 0.150]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#0d0a06" roughness={1} />
      </mesh>

      {/* Left eye socket — deep cavity */}
      <mesh geometry={bg(0.096, 0.088, 0.042)} position={[-0.082, 0.762, 0.132]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#040201" roughness={1} />
      </mesh>
      {/* Left orbital rim — bone frame */}
      <mesh geometry={bg(0.104, 0.096, 0.014)} position={[-0.082, 0.762, 0.115]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullDark} roughness={0.84} />
      </mesh>
      {/* Left supraorbital notch (inner top edge) */}
      <mesh geometry={bg(0.018, 0.010, 0.014)} position={[-0.052, 0.802, 0.139]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#0a0804" roughness={1} />
      </mesh>
      {/* Left glow — amber */}
      <mesh geometry={bg(0.055, 0.055, 0.014)} position={[-0.082, 0.762, 0.140]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={eyeGlow} emissive={eyeGlow} emissiveIntensity={3.5} />
      </mesh>
      {/* Left iris — hot orange */}
      <mesh geometry={bg(0.030, 0.030, 0.008)} position={[-0.082, 0.762, 0.144]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#ff5500" emissive="#ff5500" emissiveIntensity={5} />
      </mesh>

      {/* Right eye socket */}
      <mesh geometry={bg(0.096, 0.088, 0.042)} position={[0.082, 0.762, 0.132]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#040201" roughness={1} />
      </mesh>
      <mesh geometry={bg(0.104, 0.096, 0.014)} position={[0.082, 0.762, 0.115]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullDark} roughness={0.84} />
      </mesh>
      <mesh geometry={bg(0.018, 0.010, 0.014)} position={[0.052, 0.802, 0.139]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#0a0804" roughness={1} />
      </mesh>
      <mesh geometry={bg(0.055, 0.055, 0.014)} position={[0.082, 0.762, 0.140]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={eyeGlow} emissive={eyeGlow} emissiveIntensity={3.5} />
      </mesh>
      <mesh geometry={bg(0.030, 0.030, 0.008)} position={[0.082, 0.762, 0.144]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#ff5500" emissive="#ff5500" emissiveIntensity={5} />
      </mesh>

      {/* Nasal aperture — wide cavity, two pillars */}
      <mesh geometry={bg(0.072, 0.065, 0.025)} position={[0, 0.714, 0.150]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#060302" roughness={1} />
      </mesh>
      {/* Left nasal pillar */}
      <mesh geometry={bg(0.010, 0.048, 0.016)} position={[-0.030, 0.720, 0.148]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullBone} roughness={0.80} />
      </mesh>
      {/* Right nasal pillar */}
      <mesh geometry={bg(0.010, 0.048, 0.016)} position={[0.030, 0.720, 0.148]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullBone} roughness={0.80} />
      </mesh>
      {/* Nasal spine (bottom bridge) */}
      <mesh geometry={bg(0.014, 0.012, 0.016)} position={[0, 0.694, 0.148]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullBone} roughness={0.80} />
      </mesh>

      {/* Left cheekbone — prominent slab */}
      <mesh geometry={bg(0.040, 0.058, 0.115)} position={[-0.150, 0.718, 0.106]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullBone} roughness={0.78} />
      </mesh>
      {/* Right cheekbone */}
      <mesh geometry={bg(0.040, 0.058, 0.115)} position={[0.150, 0.718, 0.106]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullBone} roughness={0.78} />
      </mesh>
      {/* Left cheek flesh — hanging strip */}
      <mesh geometry={bg(0.025, 0.090, 0.018)} position={[-0.154, 0.695, 0.122]} rotation={[0, 0, 0.22]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={flesh} roughness={1} />
      </mesh>
      {/* Right cheek flesh */}
      <mesh geometry={bg(0.022, 0.075, 0.016)} position={[0.154, 0.688, 0.118]} rotation={[0, 0, -0.18]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={fleshDark} roughness={1} />
      </mesh>

      {/* Upper jaw / maxilla */}
      <mesh geometry={bg(0.250, 0.072, 0.205)} position={[0, 0.650, 0.058]} castShadow userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullBone} roughness={0.85} />
      </mesh>
      {/* Upper gum — thick ridge */}
      <mesh geometry={bg(0.210, 0.026, 0.020)} position={[0, 0.620, 0.140]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={gum} roughness={1} />
      </mesh>
      {/* Upper teeth — 7 individual varying heights */}
      {[
        { x: -0.085, h: 0.030 }, { x: -0.051, h: 0.038 }, { x: -0.017, h: 0.034 },
        { x:  0.017, h: 0.042 }, { x:  0.051, h: 0.034 }, { x:  0.085, h: 0.030 },
        { x: -0.034, h: 0.028 },
      ].map(({ x, h }, i) => (
        <mesh geometry={bg(0.020, h, 0.018)} key={`ut${i}`} position={[x, 0.604 - h / 2, 0.143]} userData={{ zombieId: id, isHead: true }}>
          <meshStandardMaterial color={tooth} roughness={0.55} />
        </mesh>
      ))}

      {/* ── GAPING MOUTH ── */}

      {/* Mouth void — huge dark cavity between jaws */}
      <mesh geometry={bg(0.220, 0.115, 0.095)} position={[0, 0.562, 0.098]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#030101" roughness={1} />
      </mesh>
      {/* Throat depth */}
      <mesh geometry={bg(0.160, 0.090, 0.060)} position={[0, 0.560, 0.040]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#020101" roughness={1} />
      </mesh>

      {/* Tongue — lying on lower jaw, dark red */}
      <mesh geometry={bg(0.135, 0.024, 0.115)} position={[0, 0.528, 0.092]} rotation={[0.40, 0, 0]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#7a1a1a" roughness={0.95} />
      </mesh>
      {/* Tongue center groove */}
      <mesh geometry={bg(0.008, 0.010, 0.100)} position={[0, 0.532, 0.102]} rotation={[0.40, 0, 0]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#521010" roughness={1} />
      </mesh>
      {/* Tongue tip — slightly darker */}
      <mesh geometry={bg(0.085, 0.020, 0.030)} position={[0, 0.516, 0.140]} rotation={[0.40, 0, 0]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#601414" roughness={0.95} />
      </mesh>

      {/* Lower jaw — dropped wide open */}
      <mesh geometry={bg(0.235, 0.065, 0.185)} position={[0, 0.540, 0.052]} rotation={[0.44, 0, 0]} castShadow userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={skullBone} roughness={0.85} />
      </mesh>
      {/* Lower gum */}
      <mesh geometry={bg(0.175, 0.022, 0.018)} position={[0, 0.508, 0.140]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={gum} roughness={1} />
      </mesh>
      {/* Lower teeth — 6 jagged, uneven heights */}
      {[
        { x: -0.070, h: 0.032 }, { x: -0.036, h: 0.042 }, { x: -0.004, h: 0.036 },
        { x:  0.028, h: 0.044 }, { x:  0.060, h: 0.032 }, { x: -0.052, h: 0.026 },
      ].map(({ x, h }, i) => (
        <mesh geometry={bg(0.020, h, 0.016)} key={`lt${i}`} position={[x, 0.519 + h / 2, 0.143]} userData={{ zombieId: id, isHead: true }}>
          <meshStandardMaterial color={tooth} roughness={0.55} />
        </mesh>
      ))}

      {/* Jaw corner — torn left */}
      <mesh geometry={bg(0.026, 0.075, 0.015)} position={[-0.108, 0.572, 0.130]} rotation={[0.10, 0, 0.50]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={flesh} roughness={1} />
      </mesh>
      <mesh geometry={bg(0.018, 0.050, 0.012)} position={[-0.118, 0.558, 0.126]} rotation={[0.20, 0, 0.65]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={fleshDark} roughness={1} />
      </mesh>
      {/* Jaw corner — torn right */}
      <mesh geometry={bg(0.026, 0.075, 0.015)} position={[0.108, 0.572, 0.130]} rotation={[0.10, 0, -0.50]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={fleshDark} roughness={1} />
      </mesh>
      <mesh geometry={bg(0.018, 0.050, 0.012)} position={[0.118, 0.558, 0.126]} rotation={[0.20, 0, -0.65]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={flesh} roughness={1} />
      </mesh>

      {/* Blood — pooled under lower lip */}
      <mesh geometry={bg(0.110, 0.016, 0.010)} position={[0, 0.506, 0.148]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={blood} roughness={1} />
      </mesh>
      {/* Blood drip — left */}
      <mesh geometry={bg(0.010, 0.030, 0.008)} position={[-0.030, 0.485, 0.145]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={blood} roughness={1} />
      </mesh>
      {/* Blood drip — right */}
      <mesh geometry={bg(0.008, 0.020, 0.007)} position={[0.025, 0.492, 0.147]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={blood} roughness={1} />
      </mesh>
      {/* Blood smear on upper jaw */}
      <mesh geometry={bg(0.044, 0.022, 0.008)} position={[0.042, 0.614, 0.150]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={blood} roughness={1} />
      </mesh>

      {/* Skull crack — main */}
      <mesh geometry={bg(0.008, 0.130, 0.005)} position={[0.060, 0.862, 0.060]} rotation={[0, 0, 0.60]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#140e06" roughness={1} />
      </mesh>
      {/* Crack branch */}
      <mesh geometry={bg(0.006, 0.060, 0.004)} position={[0.085, 0.830, 0.065]} rotation={[0, 0, 1.10]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color="#140e06" roughness={1} />
      </mesh>
      {/* Blood from crack */}
      <mesh geometry={bg(0.007, 0.070, 0.006)} position={[0.072, 0.822, 0.068]} rotation={[0, 0, 0.60]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={blood} roughness={1} />
      </mesh>
      {/* Hair wisps */}
      <mesh geometry={bg(0.008, 0.080, 0.005)} position={[-0.095, 0.918, -0.082]} rotation={[0.38, 0.28, 0.18]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={hair} roughness={1} />
      </mesh>
      <mesh geometry={bg(0.006, 0.062, 0.005)} position={[0.070, 0.924, -0.090]} rotation={[0.30, -0.20, -0.12]} userData={{ zombieId: id, isHead: true }}>
        <meshStandardMaterial color={hair} roughness={1} />
      </mesh>

      {/* ══ NECK ══ */}
      <mesh geometry={bg(0.15, 0.11, 0.14)} position={[0, 0.535, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>
      {/* Collar / torn shirt edge */}
      <mesh geometry={bg(0.22, 0.03, 0.12)} position={[0, 0.480, 0.06]} userData={{ zombieId: id, isHead: false }}>
        <meshStandardMaterial color={shirtTear} roughness={1} />
      </mesh>

      {/* ══ TORSO ══ */}
      {/* Chest */}
      <mesh geometry={bg(0.44, 0.38, 0.22)} position={[0, 0.285, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      {/* Shirt crease / seam lines */}
      <mesh geometry={bg(0.006, 0.34, 0.004)} position={[0, 0.285, 0.112]}>
        <meshStandardMaterial color={shirtTear} roughness={1} />
      </mesh>
      {/* Torn shirt flap — left side */}
      <mesh geometry={bg(0.08, 0.12, 0.01)} position={[-0.17, 0.18, 0.115]} rotation={[0, 0, 0.3]}>
        <meshStandardMaterial color={shirtTear} roughness={1} />
      </mesh>
      {/* Blood stains — main splatter */}
      <mesh geometry={bg(0.12, 0.15, 0.008)} position={[0.07, 0.30, 0.113]}>
        <meshStandardMaterial color={blood} roughness={1} />
      </mesh>
      {/* Secondary blood drip */}
      <mesh geometry={bg(0.04, 0.08, 0.007)} position={[0.06, 0.14, 0.112]}>
        <meshStandardMaterial color={bloodBrt} roughness={1} />
      </mesh>
      {/* Shoulder caps / deltoids */}
      <mesh geometry={bg(0.09, 0.08, 0.17)} position={[-0.245, 0.365, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      <mesh geometry={bg(0.09, 0.08, 0.17)} position={[0.245, 0.365, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      {/* Abdomen */}
      <mesh geometry={bg(0.36, 0.22, 0.20)} position={[0, 0.015, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <meshStandardMaterial color={shirt} roughness={0.95} />
      </mesh>
      {/* Belt */}
      <mesh geometry={bg(0.40, 0.055, 0.23)} position={[0, -0.085, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <meshStandardMaterial color="#0e0c08" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Belt buckle */}
      <mesh geometry={bg(0.06, 0.045, 0.012)} position={[0, -0.085, 0.120]}>
        <meshStandardMaterial color="#888060" roughness={0.4} metalness={0.7} />
      </mesh>
      {/* Hips */}
      <mesh geometry={bg(0.38, 0.16, 0.21)} position={[0, -0.175, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
        <meshStandardMaterial color={pants} roughness={0.95} />
      </mesh>

      {/* ══ LEFT ARM — pivot at shoulder ══ */}
      <group ref={leftArmRef} position={[-0.248, 0.365, 0]}>
        <mesh geometry={bg(0.10, 0.10, 0.10)} position={[0, -0.060, 0.04]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={shirt} roughness={0.95} />
        </mesh>
        <mesh geometry={bg(0.13, 0.36, 0.12)} position={[-0.057, -0.170, 0.095]} rotation={[-0.55, 0, -0.12]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={shirt} roughness={0.95} />
        </mesh>
        <mesh geometry={bg(0.09, 0.09, 0.09)} position={[-0.070, -0.330, 0.195]} userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={skin} roughness={0.9} />
        </mesh>
        <mesh geometry={bg(0.11, 0.32, 0.10)} position={[-0.077, -0.347, 0.300]} rotation={[-1.05, 0, -0.08]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={skin} roughness={0.9} />
        </mesh>
        <mesh geometry={bg(0.007, 0.07, 0.005)} position={[-0.078, -0.403, 0.408]} rotation={[-1.05, 0, -0.05]}>
          <meshStandardMaterial color={skinVein} roughness={1} />
        </mesh>
        <mesh geometry={bg(0.105, 0.105, 0.09)} position={[-0.082, -0.410, 0.462]} rotation={[-1.05, 0, -0.05]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={skullBone} roughness={0.85} />
        </mesh>
        <mesh geometry={bg(0.025, 0.07, 0.022)} position={[-0.097, -0.433, 0.510]} rotation={[-1.05, -0.15, -0.05]}>
          <meshStandardMaterial color={skullBone} roughness={0.85} />
        </mesh>
        <mesh geometry={bg(0.025, 0.075, 0.022)} position={[-0.072, -0.427, 0.512]} rotation={[-1.05, 0, -0.04]}>
          <meshStandardMaterial color={skullBone} roughness={0.85} />
        </mesh>
        <mesh geometry={bg(0.025, 0.068, 0.022)} position={[-0.048, -0.433, 0.508]} rotation={[-1.05, 0.14, -0.03]}>
          <meshStandardMaterial color={skullBone} roughness={0.85} />
        </mesh>
      </group>

      {/* ══ RIGHT ARM — pivot at shoulder ══ */}
      <group ref={rightArmRef} position={[0.248, 0.365, 0]}>
        <mesh geometry={bg(0.10, 0.10, 0.10)} position={[0, -0.060, 0.04]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={shirt} roughness={0.95} />
        </mesh>
        <mesh geometry={bg(0.13, 0.36, 0.12)} position={[0.057, -0.170, 0.095]} rotation={[-0.45, 0, 0.12]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={shirt} roughness={0.95} />
        </mesh>
        <mesh geometry={bg(0.09, 0.09, 0.09)} position={[0.068, -0.310, 0.185]} userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={skin} roughness={0.9} />
        </mesh>
        <mesh geometry={bg(0.11, 0.32, 0.10)} position={[0.074, -0.325, 0.285]} rotation={[-0.95, 0, 0.08]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={skin} roughness={0.9} />
        </mesh>
        <mesh geometry={bg(0.007, 0.07, 0.005)} position={[0.075, -0.387, 0.390]} rotation={[-0.95, 0, 0.05]}>
          <meshStandardMaterial color={skinVein} roughness={1} />
        </mesh>
        <mesh geometry={bg(0.105, 0.105, 0.09)} position={[0.080, -0.383, 0.435]} rotation={[-0.95, 0, 0.05]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={skullBone} roughness={0.85} />
        </mesh>
        <mesh geometry={bg(0.025, 0.07, 0.022)} position={[0.096, -0.405, 0.483]} rotation={[-0.95, -0.15, 0.04]}>
          <meshStandardMaterial color={skullBone} roughness={0.85} />
        </mesh>
        <mesh geometry={bg(0.025, 0.075, 0.022)} position={[0.071, -0.401, 0.486]} rotation={[-0.95, 0, 0.03]}>
          <meshStandardMaterial color={skullBone} roughness={0.85} />
        </mesh>
        <mesh geometry={bg(0.025, 0.068, 0.022)} position={[0.047, -0.407, 0.481]} rotation={[-0.95, 0.14, 0.02]}>
          <meshStandardMaterial color={skullBone} roughness={0.85} />
        </mesh>
      </group>

      {/* ══ LEFT LEG — pivot at hip ══ */}
      <group ref={leftLegRef} position={[-0.12, -0.175, 0]}>
        <mesh geometry={bg(0.16, 0.36, 0.17)} position={[0, -0.200, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={pants} roughness={0.95} />
        </mesh>
        <mesh geometry={bg(0.08, 0.07, 0.04)} position={[0, -0.380, 0.09]} userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={pants} roughness={0.95} />
        </mesh>
        <mesh geometry={bg(0.14, 0.30, 0.15)} position={[0, -0.495, 0.01]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={pants} roughness={0.95} />
        </mesh>
        <mesh geometry={bg(0.145, 0.10, 0.165)} position={[0, -0.645, 0.01]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={boot} roughness={0.8} />
        </mesh>
        <mesh geometry={bg(0.135, 0.06, 0.235)} position={[0, -0.697, 0.055]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={boot} roughness={0.8} />
        </mesh>
        <mesh geometry={bg(0.140, 0.015, 0.240)} position={[0, -0.728, 0.055]}>
          <meshStandardMaterial color={bootSole} roughness={0.6} />
        </mesh>
      </group>

      {/* ══ RIGHT LEG — pivot at hip ══ */}
      <group ref={rightLegRef} position={[0.12, -0.175, 0]}>
        <mesh geometry={bg(0.16, 0.36, 0.17)} position={[0, -0.200, 0]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={pants} roughness={0.95} />
        </mesh>
        <mesh geometry={bg(0.08, 0.07, 0.04)} position={[0, -0.380, 0.09]} userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={pants} roughness={0.95} />
        </mesh>
        <mesh geometry={bg(0.14, 0.30, 0.15)} position={[0, -0.495, 0.01]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={pants} roughness={0.95} />
        </mesh>
        <mesh geometry={bg(0.145, 0.10, 0.165)} position={[0, -0.645, 0.01]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={boot} roughness={0.8} />
        </mesh>
        <mesh geometry={bg(0.135, 0.06, 0.235)} position={[0, -0.697, 0.055]} castShadow userData={{ zombieId: id, isHead: false }}>
          <meshStandardMaterial color={boot} roughness={0.8} />
        </mesh>
        <mesh geometry={bg(0.140, 0.015, 0.240)} position={[0, -0.728, 0.055]}>
          <meshStandardMaterial color={bootSole} roughness={0.6} />
        </mesh>
      </group>

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
