import * as THREE from 'three'
import {
  CABIN_HW, CABIN_HD, WALL_H, WALL_T,
  WIN_Y0, WIN_Y1, WIN_HALF,
  DOOR_CX, DOOR_HALF,
} from '../cabin'

const HW = CABIN_HW   // 7
const HD = CABIN_HD   // 9
const WH = WALL_H     // 3.2
const WT = WALL_T     // 0.3
const WY0 = WIN_Y0    // 0.5
const WY1 = WIN_Y1    // 2.0
const WG  = WIN_HALF  // 1.0  (window opening = 2 units wide)

const WIN_SILL_H   = WY0               // 0.5
const WIN_LINTEL_H = WH - WY1          // 1.2
const WIN_LINTEL_Y = WY1 + WIN_LINTEL_H / 2  // 2.6

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

// Renders one window opening as sill + lintel boxes (sides are covered by adjacent solid segments).
function WindowFill({ cx, cy, cz, isXWall }) {
  const sillY  = WIN_SILL_H / 2
  const lintY  = WIN_LINTEL_Y
  const w = WG * 2  // 2.0
  const [sw, sd] = isXWall ? [w, WT] : [WT, w]
  return (
    <>
      <Box position={[cx, sillY,  cz]} args={[sw, WIN_SILL_H,   sd]} color={WALL_CLR} />
      <Box position={[cx, lintY, cz]} args={[sw, WIN_LINTEL_H, sd]} color={WALL_CLR} />
    </>
  )
}

function NorthWall() {
  const z = -HD
  return (
    <group>
      <Box position={[-6, WH/2, z]} args={[2, WH, WT]} color={WALL_CLR} />
      <Box position={[ 0, WH/2, z]} args={[6, WH, WT]} color={WALL_CLR} />
      <Box position={[ 6, WH/2, z]} args={[2, WH, WT]} color={WALL_CLR} />
      <WindowFill cx={-4} cy={0} cz={z} isXWall />
      <WindowFill cx={ 4} cy={0} cz={z} isXWall />
    </group>
  )
}

function SouthWall() {
  const z = HD
  return (
    <group>
      {/* Left solid + door area: x ∈ [-7, 3] */}
      <Box position={[-2, WH/2, z]} args={[10, WH, WT]} color={WALL_CLR} />
      {/* Right solid: x ∈ [5, 7] */}
      <Box position={[ 6, WH/2, z]} args={[ 2, WH, WT]} color={WALL_CLR} />
      <WindowFill cx={4} cy={0} cz={z} isXWall />
      <BarricadedDoor />
    </group>
  )
}

function EastWall() {
  const x = HW
  return (
    <group>
      {/* Top solid: z ∈ [-9, -1] */}
      <Box position={[x, WH/2, -5]} args={[WT, WH, 8]} color={WALL_CLR} />
      {/* Bottom solid: z ∈ [1, 9] */}
      <Box position={[x, WH/2,  5]} args={[WT, WH, 8]} color={WALL_CLR} />
      <WindowFill cx={x} cy={0} cz={0} isXWall={false} />
    </group>
  )
}

function WestWall() {
  const x = -HW
  return (
    <group>
      {/* Top solid: z ∈ [-9, -4] */}
      <Box position={[x, WH/2, -6.5]} args={[WT, WH,  5]} color={WALL_CLR} />
      {/* Bottom solid: z ∈ [-2, 9] */}
      <Box position={[x, WH/2,  3.5]} args={[WT, WH, 11]} color={WALL_CLR} />
      <WindowFill cx={x} cy={0} cz={-3} isXWall={false} />
    </group>
  )
}

function BarricadedDoor() {
  // Rendered on interior face of south wall
  const z  = HD - WT / 2 - 0.01
  const cx = DOOR_CX    // -2
  const hw = DOOR_HALF  // 1.2

  return (
    <group>
      {/* Diagonal planks */}
      <mesh position={[cx, WH * 0.42, z - 0.01]} rotation={[0, 0,  0.55]} castShadow>
        <boxGeometry args={[0.1, hw * 2.8, 0.07]} />
        <meshStandardMaterial color={PLANK_CLR} roughness={0.95} />
      </mesh>
      <mesh position={[cx, WH * 0.42, z - 0.03]} rotation={[0, 0, -0.55]} castShadow>
        <boxGeometry args={[0.1, hw * 2.8, 0.07]} />
        <meshStandardMaterial color={PLANK_CLR} roughness={0.95} />
      </mesh>
      {/* Horizontal braces */}
      <mesh position={[cx, WH * 0.28, z - 0.02]} castShadow>
        <boxGeometry args={[hw * 2.2, 0.1, 0.07]} />
        <meshStandardMaterial color={PLANK_CLR} roughness={0.95} />
      </mesh>
      <mesh position={[cx, WH * 0.62, z - 0.02]} castShadow>
        <boxGeometry args={[hw * 2.2, 0.1, 0.07]} />
        <meshStandardMaterial color={PLANK_CLR} roughness={0.95} />
      </mesh>
      {/* Chain */}
      <mesh position={[cx - 0.3, WH * 0.46, z - 0.06]} rotation={[0, 0, 0.4]}>
        <cylinderGeometry args={[0.018, 0.018, hw * 2.6, 6]} />
        <meshStandardMaterial color={METAL_CLR} roughness={0.25} metalness={0.85} />
      </mesh>
      {/* Padlock body */}
      <mesh position={[cx, WH * 0.46, z - 0.1]}>
        <boxGeometry args={[0.2, 0.16, 0.09]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.25} metalness={0.75} />
      </mesh>
      {/* Padlock shackle */}
      <mesh position={[cx, WH * 0.46 + 0.12, z - 0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.065, 0.018, 8, 8, Math.PI]} />
        <meshStandardMaterial color="#333" roughness={0.25} metalness={0.8} />
      </mesh>
    </group>
  )
}

function Lantern({ position }) {
  return (
    <group position={position}>
      {/* Hanging wire */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.24, 6]} />
        <meshStandardMaterial color="#555" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Body */}
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[0.22, 0.28, 0.22]} />
        <meshStandardMaterial color="#c88a30" emissive="#ff9944" emissiveIntensity={2.5} />
      </mesh>
    </group>
  )
}

export default function Arena() {
  return (
    <group>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <pointLight position={[0, WH - 0.5, 0]} intensity={16} color="#ffe0aa" castShadow distance={35} decay={2} />

      <Lantern position={[0, WH - 0.1, 0]} />

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
    </group>
  )
}
