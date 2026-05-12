import * as THREE from 'three'
import { useGameStore } from '../store'
import {
  CABIN_HW, CABIN_HD, WALL_H, WALL_T,
  WIN_Y0, WIN_Y1, WIN_HALF,
  DOOR_Z, DOOR_HALF,
  PART_Z_BH, PART_Z_HK, PART_X,
  WINDOW_DEFS,
} from '../cabin'

const HW = CABIN_HW   // 9
const HD = CABIN_HD   // 10
const WH = WALL_H     // 3.2
const WT = WALL_T     // 0.3

const WIN_SILL_H   = WIN_Y0                      // 0.5
const WIN_LINTEL_H = WH - WIN_Y1                 // 1.2
const WIN_LINTEL_Y = WIN_Y1 + WIN_LINTEL_H / 2  // 2.6

const DOOR_H       = 2.2
const DOOR_LINTEL_H = WH - DOOR_H               // 1.0
const DOOR_LINTEL_Y = DOOR_H + DOOR_LINTEL_H / 2 // 2.7

export const CHEST_POS = { x: 5, z: 7 }

const WALL_CLR  = '#7c5c38'
const FLOOR_CLR = '#4a3018'
const CEIL_CLR  = '#3d2814'
const PLANK_CLR = '#2d1e08'
const METAL_CLR = '#808080'

function Box({ position, args, color, roughness = 0.85, metalness = 0, castShadow = true, receiveShadow = true, rotation }) {
  return (
    <mesh position={position} castShadow={castShadow} receiveShadow={receiveShadow} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  )
}

function WindowFill({ cx, cz, isXWall }) {
  const sillY = WIN_SILL_H / 2
  const lintY = WIN_LINTEL_Y
  const w = WIN_HALF * 2
  const [sw, sd] = isXWall ? [w, WT] : [WT, w]
  return (
    <>
      <Box position={[cx, sillY, cz]} args={[sw, WIN_SILL_H,   sd]} color={WALL_CLR} />
      <Box position={[cx, lintY, cz]} args={[sw, WIN_LINTEL_H, sd]} color={WALL_CLR} />
    </>
  )
}

// Renders only the lintel above an interior doorway opening.
function DoorwayFill({ cx, cz, halfW, isXWall }) {
  const w = halfW * 2
  const [sw, sd] = isXWall ? [w, WT] : [WT, w]
  return <Box position={[cx, DOOR_LINTEL_Y, cz]} args={[sw, DOOR_LINTEL_H, sd]} color={WALL_CLR} />
}

function BarricadedDoor() {
  // On interior face of west wall; door center at Z=DOOR_Z, spans ±DOOR_HALF in Z
  const x  = -HW + WT / 2 + 0.01
  const cz = DOOR_Z
  const hw = DOOR_HALF

  return (
    <group>
      <mesh position={[x - 0.01, WH * 0.42, cz]} rotation={[ 0.55, 0, 0]} castShadow>
        <boxGeometry args={[0.07, hw * 2.8, 0.1]} />
        <meshStandardMaterial color={PLANK_CLR} roughness={0.95} />
      </mesh>
      <mesh position={[x - 0.03, WH * 0.42, cz]} rotation={[-0.55, 0, 0]} castShadow>
        <boxGeometry args={[0.07, hw * 2.8, 0.1]} />
        <meshStandardMaterial color={PLANK_CLR} roughness={0.95} />
      </mesh>
      <mesh position={[x - 0.02, WH * 0.28, cz]} castShadow>
        <boxGeometry args={[0.07, 0.1, hw * 2.2]} />
        <meshStandardMaterial color={PLANK_CLR} roughness={0.95} />
      </mesh>
      <mesh position={[x - 0.02, WH * 0.62, cz]} castShadow>
        <boxGeometry args={[0.07, 0.1, hw * 2.2]} />
        <meshStandardMaterial color={PLANK_CLR} roughness={0.95} />
      </mesh>
      <mesh position={[x - 0.06, WH * 0.46, cz - 0.3]} rotation={[0.4, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.018, hw * 2.6, 6]} />
        <meshStandardMaterial color={METAL_CLR} roughness={0.25} metalness={0.85} />
      </mesh>
      <mesh position={[x - 0.1, WH * 0.46, cz]}>
        <boxGeometry args={[0.09, 0.16, 0.2]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.25} metalness={0.75} />
      </mesh>
      <mesh position={[x - 0.1, WH * 0.46 + 0.12, cz]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.065, 0.018, 8, 8, Math.PI]} />
        <meshStandardMaterial color="#333" roughness={0.25} metalness={0.8} />
      </mesh>
    </group>
  )
}

const PLANK_CLR_BOARD = '#6b4a1a'
const PLANK_W = WIN_HALF * 2
const PLANK_H = 0.13
const PLANK_D = 0.09

const STRIPE_CLR = '#7a8fa0'
const STRIPE_OFFSETS = [-0.62, 0, 0.62]

function WindowPlankMesh({ win, count, isStrong }) {
  const isNS = win.wall === 'N' || win.wall === 'S'
  const offset = WALL_T / 2 + 0.01
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
            <meshStandardMaterial color={isStrong ? '#3d2a0e' : PLANK_CLR_BOARD} roughness={0.9} />
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

function Chest() {
  const x = CHEST_POS.x, z = CHEST_POS.z
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.44, 0.55]} />
        <meshStandardMaterial color="#3d2008" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.49, -0.04]} castShadow>
        <boxGeometry args={[0.9, 0.13, 0.5]} />
        <meshStandardMaterial color="#4a2a0a" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.22, 0.278]}>
        <boxGeometry args={[0.92, 0.44, 0.02]} />
        <meshStandardMaterial color="#666" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.22, -0.278]}>
        <boxGeometry args={[0.92, 0.44, 0.02]} />
        <meshStandardMaterial color="#666" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.3, 0.285]}>
        <boxGeometry args={[0.13, 0.11, 0.04]} />
        <meshStandardMaterial color="#999" metalness={0.9} roughness={0.2} />
      </mesh>
      <pointLight position={[0, 0.8, 0]} color="#ffcc66" intensity={2} distance={4} />
    </group>
  )
}

function Lantern({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.24, 6]} />
        <meshStandardMaterial color="#555" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[0.22, 0.28, 0.22]} />
        <meshStandardMaterial color="#c88a30" emissive="#ff9944" emissiveIntensity={2.5} />
      </mesh>
    </group>
  )
}

// ─── Wall sections ────────────────────────────────────────────────────────────

function NorthWall() {
  const z = -HD
  return (
    <group>
      {/* Bedroom section: two windows at X=-7 and X=-4 */}
      <Box position={[-8.5, WH/2, z]} args={[1,  WH, WT]} color={WALL_CLR} />
      <Box position={[-5.5, WH/2, z]} args={[1,  WH, WT]} color={WALL_CLR} />
      <Box position={[-2.5, WH/2, z]} args={[1,  WH, WT]} color={WALL_CLR} />
      <WindowFill cx={-7} cz={z} isXWall />
      <WindowFill cx={-4} cz={z} isXWall />
      {/* Main room section: solid */}
      <Box position={[3.5, WH/2, z]} args={[11, WH, WT]} color={WALL_CLR} />
    </group>
  )
}

function SouthWall() {
  const z = HD
  return (
    <group>
      {/* Kitchen section: window at X=-5 */}
      <Box position={[-7.5, WH/2, z]} args={[3, WH, WT]} color={WALL_CLR} />
      <Box position={[  -3, WH/2, z]} args={[2, WH, WT]} color={WALL_CLR} />
      <WindowFill cx={-5} cz={z} isXWall />
      {/* Main room section: window at X=+4 */}
      <Box position={[0.5, WH/2, z]} args={[5, WH, WT]} color={WALL_CLR} />
      <Box position={[  7, WH/2, z]} args={[4, WH, WT]} color={WALL_CLR} />
      <WindowFill cx={4} cz={z} isXWall />
    </group>
  )
}

function EastWall() {
  const x = HW
  return (
    <group>
      <Box position={[x, WH/2, -5.5]} args={[WT, WH, 9]} color={WALL_CLR} />
      <Box position={[x, WH/2, +5.5]} args={[WT, WH, 9]} color={WALL_CLR} />
      <WindowFill cx={x} cz={0} isXWall={false} />
    </group>
  )
}

function WestWall() {
  const x = -HW
  return (
    <group>
      {/* Bedroom section: solid */}
      <Box position={[x, WH/2,   -7]} args={[WT, WH,   6]} color={WALL_CLR} />
      {/* Hall: north of door */}
      <Box position={[x, WH/2, -2.6]} args={[WT, WH, 2.8]} color={WALL_CLR} />
      {/* Hall: column between door and window */}
      <Box position={[x, WH/2, 1.35]} args={[WT, WH, 0.3]} color={WALL_CLR} />
      {/* Hall: south of window */}
      <Box position={[x, WH/2, 4.25]} args={[WT, WH, 1.5]} color={WALL_CLR} />
      <WindowFill cx={x} cz={2.5} isXWall={false} />
      <BarricadedDoor />
      {/* Kitchen section: solid */}
      <Box position={[x, WH/2,  7.5]} args={[WT, WH,   5]} color={WALL_CLR} />
    </group>
  )
}

// Bedroom / Hall interior partition (Z=-4), door at X=-6
function BedroomHallWall() {
  const z = PART_Z_BH
  return (
    <group>
      <Box position={[  -8, WH/2, z]} args={[2, WH, WT]} color={WALL_CLR} />
      <Box position={[-3.5, WH/2, z]} args={[3, WH, WT]} color={WALL_CLR} />
      <DoorwayFill cx={-6} cz={z} halfW={1} isXWall />
    </group>
  )
}

// Hall / Kitchen interior partition (Z=+5), door at X=-5
function HallKitchenWall() {
  const z = PART_Z_HK
  return (
    <group>
      <Box position={[-7.5, WH/2, z]} args={[3, WH, WT]} color={WALL_CLR} />
      <Box position={[  -3, WH/2, z]} args={[2, WH, WT]} color={WALL_CLR} />
      <DoorwayFill cx={-5} cz={z} halfW={1} isXWall />
    </group>
  )
}

// West rooms / Main room partition (X=-2)
// Bedroom→Main door at Z=-7; Hall→Main door at Z=0; kitchen section solid
function WestMainWall() {
  const x = PART_X
  return (
    <group>
      <Box position={[x, WH/2,   -9]} args={[WT, WH,  2]} color={WALL_CLR} />
      <Box position={[x, WH/2,   -5]} args={[WT, WH,  2]} color={WALL_CLR} />
      <Box position={[x, WH/2, -2.5]} args={[WT, WH,  3]} color={WALL_CLR} />
      <Box position={[x, WH/2,    3]} args={[WT, WH,  4]} color={WALL_CLR} />
      <Box position={[x, WH/2,  7.5]} args={[WT, WH,  5]} color={WALL_CLR} />
      <DoorwayFill cx={x} cz={-7} halfW={1} isXWall={false} />
      <DoorwayFill cx={x} cz={ 0} halfW={1} isXWall={false} />
    </group>
  )
}

export default function Arena() {
  return (
    <group>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <pointLight position={[3.5, WH - 0.5,  0]} intensity={18} color="#ffe0aa" castShadow distance={40} decay={2} />
      <pointLight position={[ -5, WH - 0.5, -7]} intensity={ 6} color="#ffcc88" distance={12} decay={2} />
      <pointLight position={[ -5, WH - 0.5,  1]} intensity={ 6} color="#ffcc88" distance={12} decay={2} />
      <pointLight position={[ -5, WH - 0.5,  7]} intensity={ 5} color="#ffcc88" distance={10} decay={2} />

      <Lantern position={[ 3.5, WH - 0.1,  0]} />
      <Lantern position={[  -5, WH - 0.1, -7]} />
      <Lantern position={[  -5, WH - 0.1,  1]} />
      <Lantern position={[  -5, WH - 0.1,  7]} />

      {/* Interior floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[HW * 2, HD * 2]} />
        <meshStandardMaterial color={FLOOR_CLR} roughness={0.92} />
      </mesh>

      {/* Exterior ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#111a09" roughness={1} />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WH, 0]}>
        <planeGeometry args={[HW * 2, HD * 2]} />
        <meshStandardMaterial color={CEIL_CLR} roughness={1} side={THREE.BackSide} />
      </mesh>

      <NorthWall />
      <SouthWall />
      <EastWall />
      <WestWall />
      <BedroomHallWall />
      <HallKitchenWall />
      <WestMainWall />
      <WindowPlanks />
      <Chest />
    </group>
  )
}
