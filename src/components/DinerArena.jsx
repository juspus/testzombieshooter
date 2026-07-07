import { useMemo } from 'react'
import * as THREE from 'three'
import { useGameStore } from '../store'
import {
  HW, HD, WALL_H, WALL_T,
  WIN_Y0, WIN_Y1, WIN_HALF,
  DOOR_X, DOOR_HALF,
  WINDOW_DEFS,
  SPAWN_CLUSTERS,
  CHEST_POS,
} from '../maps/diner'

const WT = WALL_T
const WH = WALL_H
const DOOR_H = 2.2

// ─── Palette ─────────────────────────────────────────────────────────────────
const WALL_CLR   = '#8a7a5a'   // Grimy stucco
const WALL_TRIM  = '#4a4038'   // Dark trim band
const FLOOR_A    = '#8a1620'   // Checker tile — red
const FLOOR_B    = '#d8d2c0'   // Checker tile — off-white
const CEIL       = '#2a2620'
const COUNTER    = '#c8443a'   // Vinyl red counter face
const COUNTER_TOP= '#d8d4c8'   // Chrome-flecked formica top
const CHROME     = '#c8ccd0'
const BOOTH      = '#8a2028'   // Booth vinyl
const STEEL      = '#6a6e72'
const GLASS      = '#4a6a78'
const FORECOURT  = '#141414'   // Cracked asphalt
const SIGN_RED   = '#e0303a'
const SIGN_GLOW  = '#ff5560'
const CANOPY     = '#2a2e34'
const PUMP       = '#c0342e'
const PARKING_LINE = '#d8d8c8'

function Box({ position, args, color, roughness = 0.9, metalness = 0, castShadow = true, receiveShadow = true, rotation, emissive, emissiveIntensity = 0, transparent = false, opacity = 1 }) {
  return (
    <mesh position={position} castShadow={castShadow} receiveShadow={receiveShadow} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive} emissiveIntensity={emissiveIntensity} transparent={transparent} opacity={opacity} />
    </mesh>
  )
}

// ─── Checkerboard floor texture (procedural canvas, same pattern as ForestSkybox) ──

function makeCheckerTexture() {
  if (typeof document === 'undefined') return null
  const size = 256
  const tiles = 8
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  const cell = size / tiles
  for (let y = 0; y < tiles; y += 1) {
    for (let x = 0; x < tiles; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? FLOOR_B : FLOOR_A
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(HW * 2 / 2, HD * 2 / 2)
  texture.magFilter = THREE.NearestFilter
  texture.needsUpdate = true
  return texture
}

function DinerFloor() {
  const texture = useMemo(() => makeCheckerTexture(), [])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[HW * 2, HD * 2]} />
      <meshStandardMaterial map={texture} roughness={0.85} />
    </mesh>
  )
}

// ─── Windows: glass pane + steel frame + sill/lintel fill ──────────────────

function WindowGlass({ win }) {
  const isNS = win.wall === 'N' || win.wall === 'S'
  const openH = WIN_Y1 - WIN_Y0
  const cy = WIN_Y0 + openH / 2
  const w = WIN_HALF * 2
  const [sw, sd] = isNS ? [w, WT] : [WT, w]
  const [fw, fd] = isNS ? [w + 0.06, 0.05] : [0.05, w + 0.06]
  return (
    <group>
      {/* Sill + lintel fill the wall above/below the glass */}
      <Box position={[win.winX, WIN_Y0 / 2, win.winZ]} args={isNS ? [sw, WIN_Y0, sd] : [sd, WIN_Y0, sw]} color={WALL_CLR} />
      <Box position={[win.winX, WIN_Y1 + (WH - WIN_Y1) / 2, win.winZ]} args={isNS ? [sw, WH - WIN_Y1, sd] : [sd, WH - WIN_Y1, sw]} color={WALL_CLR} />
      {/* Glass pane */}
      <mesh position={[win.winX, cy, win.winZ]} castShadow={false} receiveShadow={false}>
        <boxGeometry args={isNS ? [w - 0.1, openH - 0.1, 0.04] : [0.04, openH - 0.1, w - 0.1]} />
        <meshStandardMaterial color={GLASS} roughness={0.05} metalness={0.2} transparent opacity={0.35} />
      </mesh>
      {/* Steel frame outline */}
      <Box position={[win.winX, cy, win.winZ]} args={isNS ? [fw, openH, fd] : [fd, openH, fw]} color={STEEL} metalness={0.6} roughness={0.4} castShadow={false} />
    </group>
  )
}

// ─── Back door (north wall) — solid, cosmetic, matches cabin's barricaded-door convention ──

function BackDoor() {
  const z = -HD
  const lintelH = WH - DOOR_H
  return (
    <group>
      <Box position={[DOOR_X, DOOR_H + lintelH / 2, z]} args={[DOOR_HALF * 2, lintelH, WT]} color={WALL_CLR} />
      <Box position={[DOOR_X, DOOR_H / 2, z + WT / 2 + 0.02]} args={[DOOR_HALF * 2 - 0.1, DOOR_H - 0.05, 0.05]} color={STEEL} metalness={0.4} roughness={0.6} />
      <Box position={[DOOR_X, DOOR_H * 0.5, z + WT / 2 + 0.05]} args={[0.06, 0.4, 0.06]} color={CHROME} metalness={0.7} roughness={0.3} castShadow={false} />
    </group>
  )
}

// ─── Walls, built from the same segment data the collision grid uses ───────

function SolidSegment({ seg }) {
  return <Box position={[seg.x, WH / 2, seg.z]} args={[seg.halfW * 2, WH, seg.halfD * 2]} color={WALL_CLR} />
}

function TrimBand() {
  // Waist-height trim band around the exterior walls, purely decorative.
  return (
    <group>
      <Box position={[0, 0.55, HD]} args={[HW * 2, 0.15, WT + 0.02]} color={WALL_TRIM} castShadow={false} />
      <Box position={[0, 0.55, -HD]} args={[HW * 2, 0.15, WT + 0.02]} color={WALL_TRIM} castShadow={false} />
      <Box position={[HW, 0.55, 0]} args={[WT + 0.02, 0.15, HD * 2]} color={WALL_TRIM} castShadow={false} />
      <Box position={[-HW, 0.55, 0]} args={[WT + 0.02, 0.15, HD * 2]} color={WALL_TRIM} castShadow={false} />
    </group>
  )
}

function Walls() {
  const southSolids = [
    { x: -7.5, z: HD, halfW: 0.5, halfD: WT / 2 },
    { x:   -4, z: HD, halfW:   1, halfD: WT / 2 },
    { x:    0, z: HD, halfW:   1, halfD: WT / 2 },
    { x:    4, z: HD, halfW:   1, halfD: WT / 2 },
    { x:  7.5, z: HD, halfW: 0.5, halfD: WT / 2 },
  ]
  const eastWestSolids = [
    { x:  HW, z: -3.5, halfW: WT / 2, halfD: 2.5 },
    { x:  HW, z:  3.5, halfW: WT / 2, halfD: 2.5 },
    { x: -HW, z: -3.5, halfW: WT / 2, halfD: 2.5 },
    { x: -HW, z:  3.5, halfW: WT / 2, halfD: 2.5 },
  ]

  return (
    <group>
      {southSolids.map((s, i) => <SolidSegment key={`s${i}`} seg={s} />)}
      {eastWestSolids.map((s, i) => <SolidSegment key={`ew${i}`} seg={s} />)}
      {/* North wall solid either side of the back door */}
      <SolidSegment seg={{ x: -4.6, z: -HD, halfW: 3.4, halfD: WT / 2 }} />
      <SolidSegment seg={{ x:  4.6, z: -HD, halfW: 3.4, halfD: WT / 2 }} />
      <BackDoor />
      {WINDOW_DEFS.map((win) => <WindowGlass key={win.id} win={win} />)}
      <TrimBand />
    </group>
  )
}

// ─── Window planks (boarding) — same visuals as the cabin, thinner/steel tone ──

const PLANK_CLR = '#4a3826'
const PLANK_W = WIN_HALF * 2
const PLANK_H = 0.13
const PLANK_D = 0.09
const STRIPE_CLR = '#6a7a8a'
const STRIPE_OFFSETS = [-0.62, 0, 0.62]

function WindowPlankMesh({ win, count, isStrong }) {
  const isNS = win.wall === 'N' || win.wall === 'S'
  const offset = WT / 2 + 0.01
  const px = win.wall === 'E' ? win.winX - offset : win.wall === 'W' ? win.winX + offset : win.winX
  const pz = win.wall === 'N' ? win.winZ + offset : win.wall === 'S' ? win.winZ - offset : win.winZ
  const args = isNS ? [PLANK_W, PLANK_H, PLANK_D] : [PLANK_D, PLANK_H, PLANK_W]
  const stripeArgs = isNS ? [0.045, PLANK_H + 0.002, PLANK_D + 0.005] : [PLANK_D + 0.005, PLANK_H + 0.002, 0.045]
  const ys = count === 1 ? [1.25] : [0.85, 1.65]
  return (
    <>
      {ys.map((y, i) => (
        <group key={i} position={[px, y, pz]}>
          <mesh castShadow>
            <boxGeometry args={args} />
            <meshStandardMaterial color={isStrong ? '#2a2018' : PLANK_CLR} roughness={0.95} />
          </mesh>
          {isStrong && STRIPE_OFFSETS.map((off, j) => (
            <mesh key={j} position={isNS ? [off, 0, 0] : [0, 0, off]}>
              <boxGeometry args={stripeArgs} />
              <meshStandardMaterial color={STRIPE_CLR} metalness={0.85} roughness={0.2} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}

function WindowPlanks() {
  const windowPlanks = useGameStore((s) => s.windowPlanks)
  const windowPlankStrong = useGameStore((s) => s.windowPlankStrong)
  return (
    <>
      {WINDOW_DEFS.map((win) => {
        const count = windowPlanks[win.id] ?? 0
        if (count === 0) return null
        return <WindowPlankMesh key={win.id} win={win} count={count} isStrong={windowPlankStrong[win.id] ?? false} />
      })}
    </>
  )
}

// ─── Counter — the diner's one interior obstacle, matches the collision segment ──

function Counter() {
  return (
    <group position={[0, 0, -1.5]}>
      <Box position={[0, 0.45, 0]} args={[12, 0.9, 0.6]} color={COUNTER} />
      <Box position={[0, 0.92, 0]} args={[12.1, 0.06, 0.65]} color={COUNTER_TOP} roughness={0.4} metalness={0.15} />
      {/* Stool row facing the counter */}
      {[-4.5, -2.5, -0.5, 1.5, 3.5].map((x) => (
        <group key={x} position={[x, 0, 0.75]}>
          <mesh position={[0, 0.45, 0]} castShadow={false}>
            <cylinderGeometry args={[0.03, 0.03, 0.9, 6]} />
            <meshStandardMaterial color={CHROME} metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.92, 0]} castShadow={false}>
            <cylinderGeometry args={[0.22, 0.22, 0.08, 10]} />
            <meshStandardMaterial color={BOOTH} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ─── Booths — decorative seating along the east/west walls, no collision ──

function Booth({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      <Box position={[0, 0.35, 0]} args={[1.3, 0.7, 0.5]} color={BOOTH} castShadow={false} />
      <Box position={[0, 0.2, 0.7]} args={[1.3, 0.4, 0.5]} color={BOOTH} castShadow={false} />
      <Box position={[0, 0.55, -0.28]} args={[1.3, 0.9, 0.12]} color={BOOTH} castShadow={false} />
      <Box position={[0, 0.42, 0.42]} args={[0.9, 0.05, 0.6]} color={COUNTER_TOP} roughness={0.4} castShadow={false} />
    </group>
  )
}

function Booths() {
  return (
    <group>
      <Booth position={[-6.6, 0, -4]} rotation={[0, Math.PI / 2, 0]} />
      <Booth position={[-6.6, 0, -1.5]} rotation={[0, Math.PI / 2, 0]} />
      <Booth position={[6.6, 0, -4]} rotation={[0, -Math.PI / 2, 0]} />
      <Booth position={[6.6, 0, -1.5]} rotation={[0, -Math.PI / 2, 0]} />
    </group>
  )
}

// ─── Ceiling + fluorescent panels ───────────────────────────────────────────

function Ceiling() {
  const panelXs = [-5, -1.67, 1.67, 5]
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WH, 0]}>
        <planeGeometry args={[HW * 2, HD * 2]} />
        <meshStandardMaterial color={CEIL} roughness={1} side={THREE.BackSide} />
      </mesh>
      {panelXs.map((x) => (
        <Box key={x} position={[x, WH - 0.05, 0]} args={[2.6, 0.06, HD * 1.6]} color="#dfe6ea" emissive="#dfe6ea" emissiveIntensity={0.5} castShadow={false} receiveShadow={false} />
      ))}
    </group>
  )
}

// ─── Flat roof + parapet + rooftop sign ─────────────────────────────────────

function Roof() {
  return (
    <group>
      <Box position={[0, WH + 0.15, 0]} args={[HW * 2 + 0.6, 0.3, HD * 2 + 0.6]} color="#1c1a16" castShadow={false} receiveShadow={false} />
      {/* Parapet lip */}
      <Box position={[0, WH + 0.4, HD + 0.25]} args={[HW * 2 + 0.6, 0.4, 0.12]} color={WALL_TRIM} castShadow={false} />
      <Box position={[0, WH + 0.4, -HD - 0.25]} args={[HW * 2 + 0.6, 0.4, 0.12]} color={WALL_TRIM} castShadow={false} />
      <Box position={[HW + 0.25, WH + 0.4, 0]} args={[0.12, 0.4, HD * 2 + 0.6]} color={WALL_TRIM} castShadow={false} />
      <Box position={[-HW - 0.25, WH + 0.4, 0]} args={[0.12, 0.4, HD * 2 + 0.6]} color={WALL_TRIM} castShadow={false} />
      {/* Rooftop sign facing the forecourt */}
      <group position={[0, WH + 1.3, HD - 1]}>
        <Box position={[0, 0, 0]} args={[4.5, 1.1, 0.12]} color={SIGN_RED} emissive={SIGN_GLOW} emissiveIntensity={0.9} castShadow={false} />
      </group>
    </group>
  )
}

// ─── Exterior: gas station forecourt (visible through the storefront glass) ──

function Canopy({ position }) {
  return (
    <group position={position}>
      <Box position={[0, 3.2, 0]} args={[6, 0.25, 4]} color={CANOPY} castShadow={false} />
      {[[-2.6, -1.6], [2.6, -1.6], [-2.6, 1.6], [2.6, 1.6]].map(([x, z], i) => (
        <Box key={i} position={[x, 1.6, z]} args={[0.18, 3.2, 0.18]} color={STEEL} metalness={0.3} roughness={0.6} castShadow={false} />
      ))}
      <Box position={[0, 3.05, 0]} args={[5.8, 0.06, 3.8]} color="#dfe6ea" emissive="#dfe6ea" emissiveIntensity={0.35} castShadow={false} />
    </group>
  )
}

function Pump({ position }) {
  return (
    <group position={position}>
      <Box position={[0, 0.6, 0]} args={[0.55, 1.2, 0.4]} color={PUMP} castShadow={false} />
      <Box position={[0, 1.25, 0]} args={[0.6, 0.1, 0.45]} color={STEEL} metalness={0.4} roughness={0.5} castShadow={false} />
      <Box position={[0, 0.75, 0.22]} args={[0.35, 0.4, 0.02]} color="#dfe6ea" emissive="#dfe6ea" emissiveIntensity={0.4} castShadow={false} />
    </group>
  )
}

function Forecourt() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial color={FORECOURT} roughness={1} />
      </mesh>
      {/* Parking stall lines out front, under the canopy */}
      {[-4, 0, 4].map((x) => (
        <Box key={x} position={[x, 0.01, HD + 6]} args={[0.15, 0.01, 4]} color={PARKING_LINE} castShadow={false} receiveShadow={false} />
      ))}
      <Canopy position={[0, 0, HD + 6.5]} />
      <Pump position={[-2, 0, HD + 6.5]} />
      <Pump position={[2, 0, HD + 6.5]} />
    </group>
  )
}

// ─── Spawn-point cover (low forecourt clutter marking each spawn cluster) ──

function SpawnClutter() {
  return (
    <group>
      {SPAWN_CLUSTERS.map((c, i) => (
        <Box key={i} position={[c.x, 0.25, c.z]} args={[0.7, 0.5, 0.7]} color="#0f0f0f" castShadow={false} receiveShadow={false} />
      ))}
    </group>
  )
}

// ─── Loot chest ──────────────────────────────────────────────────────────────

function Chest() {
  const x = CHEST_POS.x, z = CHEST_POS.z
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.44, 0.55]} />
        <meshStandardMaterial color="#2a2018" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.49, -0.04]} castShadow>
        <boxGeometry args={[0.9, 0.13, 0.5]} />
        <meshStandardMaterial color="#362a1a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.3, 0.285]}>
        <boxGeometry args={[0.13, 0.11, 0.04]} />
        <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  )
}

// ─── DinerArena export ──────────────────────────────────────────────────────

export default function DinerArena() {
  return (
    <group>
      {/* ── Lighting — same shape as the cabin's rig: one shadow-casting
           directional light, ambient + hemisphere fill, a few non-shadow
           point lights for interior glow. No new shadow casters. ── */}
      <ambientLight intensity={0.6} color="#dce4e8" />
      <directionalLight position={[-20, 35, -15]} color="#d0e0ff" intensity={1.6} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-near={1} shadow-camera-far={80}
        shadow-camera-left={-30} shadow-camera-right={30}
        shadow-camera-top={30} shadow-camera-bottom={-30}
      />
      <hemisphereLight skyColor="#3a4858" groundColor="#100c08" intensity={0.45} />
      <pointLight position={[0, WH - 0.4, 2]} color="#fff3d8" intensity={12} distance={16} decay={2} />
      <pointLight position={[0, WH - 0.4, -3.5]} color="#fff3d8" intensity={10} distance={14} decay={2} />
      <pointLight position={[CHEST_POS.x, 1.0, CHEST_POS.z]} color="#ffcc44" intensity={5} distance={8} decay={2} />

      <DinerFloor />
      <Forecourt />
      <SpawnClutter />

      <Ceiling />
      <Roof />
      <Walls />
      <WindowPlanks />

      <Counter />
      <Booths />
      <Chest />
    </group>
  )
}
