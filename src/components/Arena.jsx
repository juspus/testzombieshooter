import * as THREE from 'three'
import { useGameStore } from '../store'
import {
  CABIN_HW, CABIN_HD, WALL_H, WALL_T,
  WIN_Y0, WIN_Y1, WIN_HALF,
  DOOR_Z, DOOR_HALF,
  PART_Z_BH, PART_Z_HK, PART_X,
  WINDOW_DEFS,
} from '../cabin'

const HW = CABIN_HW
const HD = CABIN_HD
const WH = WALL_H
const WT = WALL_T

const WIN_SILL_H   = WIN_Y0
const WIN_LINTEL_H = WH - WIN_Y1
const WIN_LINTEL_Y = WIN_Y1 + WIN_LINTEL_H / 2

const DOOR_H        = 2.2
const DOOR_LINTEL_H = WH - DOOR_H
const DOOR_LINTEL_Y = DOOR_H + DOOR_LINTEL_H / 2

export const CHEST_POS = { x: 5, z: 7 }

// ─── Color palette ─────────────────────────────────────────────────────────
const WALL    = '#2a1608'   // Dark weathered timber
const WALL2   = '#1e1006'   // Darker panel variant
const FLOOR   = '#1a0e06'   // Rotting floorboards
const CEIL    = '#0e0804'   // Black ceiling
const BEAM    = '#1a0c04'   // Ceiling beam
const STONE   = '#2c2218'   // Fieldstone
const STONE2  = '#1e1810'   // Darker stone
const ASH     = '#181614'   // Cold ash
const FIREBOX = '#1a0400'   // Firebox back (absorbs light)
const WOOD    = '#221408'   // Furniture wood
const WOOD2   = '#160e04'   // Very dark wood
const PLANK   = '#0e0803'   // Barricade planks
const METAL   = '#252018'   // Rusted iron
const BONE    = '#c0ae80'   // Bone / old ivory
const BOOK_R  = '#3d0a0a'   // Cracked red leather
const BOOK_G  = '#0a1e0a'   // Dark green cloth
const BOOK_B  = '#08101e'   // Dark blue leather
const NECRO   = '#2e1808'   // Necronomicon cover (bound in hide)
const LINEN   = '#1e1810'   // Grimy linen / bedding
const IRON    = '#1a1614'   // Old iron frame
const COPPER  = '#3a2410'   // Tarnished copper (kettle / pots)
const RUG1    = '#2a0808'   // Rug dark red
const RUG2    = '#180808'   // Rug almost black
const COBWEB  = '#1c1c18'   // Dusty cobweb strands
const ROOF    = '#1e0e04'   // Dark weathered shingles

const PITCH   = 2.8         // Roof height above wall top

function Box({ position, args, color, roughness = 0.95, metalness = 0, castShadow = true, receiveShadow = true, rotation, emissive, emissiveIntensity = 0 }) {
  return (
    <mesh position={position} castShadow={castShadow} receiveShadow={receiveShadow} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive} emissiveIntensity={emissiveIntensity} />
    </mesh>
  )
}

// ─── Window / door fills ────────────────────────────────────────────────────

function WindowFill({ cx, cz, isXWall }) {
  const sillY = WIN_SILL_H / 2
  const lintY = WIN_LINTEL_Y
  const w = WIN_HALF * 2
  const [sw, sd] = isXWall ? [w, WT] : [WT, w]
  return (
    <>
      <Box position={[cx, sillY, cz]} args={[sw, WIN_SILL_H,   sd]} color={WALL} />
      <Box position={[cx, lintY, cz]} args={[sw, WIN_LINTEL_H, sd]} color={WALL} />
    </>
  )
}

// Adds visible wooden frame boards around a window opening
function WindowFrame({ cx, cz, isXWall }) {
  const openH = WIN_Y1 - WIN_Y0          // 1.5
  const cy    = WIN_Y0 + openH / 2       // 1.25  (centre of opening)
  const jamb  = 0.08                     // frame board width
  const proud = 0.06                     // how far frame stands proud of wall face
  const half  = WIN_HALF                 // 1.0
  const [jW, jD] = isXWall
    ? [jamb, WT + proud]
    : [WT + proud, jamb]
  const [cjx1, cjz1, cjx2, cjz2] = isXWall
    ? [cx - half - jamb / 2, cz, cx + half + jamb / 2, cz]
    : [cx, cz - half - jamb / 2, cx, cz + half + jamb / 2]
  return (
    <>
      {/* Side jambs */}
      <Box position={[cjx1, cy, cjz1]} args={[jW, openH, jD]} color={WOOD2} />
      <Box position={[cjx2, cy, cjz2]} args={[jW, openH, jD]} color={WOOD2} />
    </>
  )
}

function DoorwayFill({ cx, cz, halfW, isXWall }) {
  const w = halfW * 2
  const [sw, sd] = isXWall ? [w, WT] : [WT, w]
  return <Box position={[cx, DOOR_LINTEL_Y, cz]} args={[sw, DOOR_LINTEL_H, sd]} color={WALL} />
}

// Interior door frame
function DoorwayFrame({ cx, cz, halfW, isXWall }) {
  const jamb = 0.07
  const proud = 0.06
  const cy = DOOR_H / 2
  const [jW, jD] = isXWall
    ? [jamb, WT + proud]
    : [WT + proud, jamb]
  const [x1, z1, x2, z2] = isXWall
    ? [cx - halfW - jamb / 2, cz, cx + halfW + jamb / 2, cz]
    : [cx, cz - halfW - jamb / 2, cx, cz + halfW + jamb / 2]
  return (
    <>
      <Box position={[x1, cy, z1]} args={[jW, DOOR_H, jD]} color={WOOD2} />
      <Box position={[x2, cy, z2]} args={[jW, DOOR_H, jD]} color={WOOD2} />
    </>
  )
}

// ─── Barricaded west door ───────────────────────────────────────────────────

function BarricadedDoor() {
  const x   = -HW + WT / 2 + 0.01
  const cz  = DOOR_Z
  const hw  = DOOR_HALF  // 1.2
  const dW  = hw * 2     // 2.4
  const dH  = DOOR_H     // 2.2

  // 6 vertical planks evenly spaced across door width
  const plankZs = [-1.0, -0.6, -0.2, 0.2, 0.6, 1.0]

  return (
    <group>
      {/* ── Door frame ─────────────────────────────────────────────── */}
      <Box position={[x + 0.04, dH / 2, cz - hw - 0.06]} args={[WT + 0.06, dH + 0.08, 0.08]} color={WOOD2} />
      <Box position={[x + 0.04, dH / 2, cz + hw + 0.06]} args={[WT + 0.06, dH + 0.08, 0.08]} color={WOOD2} />
      <Box position={[x + 0.04, dH + 0.05, cz]}           args={[WT + 0.06, 0.10, dW + 0.16]} color={WOOD2} />

      {/* ── Door body — vertical tongue-and-groove planks ──────────── */}
      {plankZs.map((pz) => (
        <Box key={pz} position={[x + 0.05, dH / 2, cz + pz]} args={[0.09, dH - 0.02, 0.36]} color={WOOD} />
      ))}
      {/* Plank edge beads (thin dark strips between planks) */}
      {[-0.8, -0.4, 0, 0.4, 0.8].map((pz) => (
        <Box key={pz} position={[x + 0.055, dH / 2, cz + pz]} args={[0.09, dH - 0.02, 0.03]} color={WOOD2} />
      ))}

      {/* ── Horizontal battens (back of door) ──────────────────────── */}
      <Box position={[x + 0.10, 0.38, cz]} args={[0.05, 0.14, dW - 0.06]} color={WOOD2} />
      <Box position={[x + 0.10, 1.82, cz]} args={[0.05, 0.14, dW - 0.06]} color={WOOD2} />

      {/* ── Z-brace diagonal batten ────────────────────────────────── */}
      <mesh position={[x + 0.10, dH / 2, cz]} rotation={[Math.atan2(dH, dW), 0, 0]} castShadow>
        <boxGeometry args={[0.05, Math.hypot(dH, dW) - 0.1, 0.07]} />
        <meshStandardMaterial color={WOOD2} roughness={0.98} />
      </mesh>

      {/* ── Iron strap hinges (left jamb side) ─────────────────────── */}
      <Box position={[x + 0.10, 0.34, cz - hw + 0.26]} args={[0.04, 0.07, 0.52]} color={METAL} metalness={0.4} roughness={0.7} />
      <Box position={[x + 0.10, 1.78, cz - hw + 0.26]} args={[0.04, 0.07, 0.52]} color={METAL} metalness={0.4} roughness={0.7} />

      {/* ── Door handle / knob ──────────────────────────────────────── */}
      <mesh position={[x + 0.13, dH * 0.46, cz + hw - 0.30]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.026, 0.026, 0.14, 6]} />
        <meshStandardMaterial color={METAL} roughness={0.45} metalness={0.55} />
      </mesh>
      <Box position={[x + 0.13, dH * 0.46, cz + hw - 0.20]} args={[0.04, 0.08, 0.06]} color={METAL} metalness={0.5} roughness={0.5} />

      {/* ── Barricade — diagonal boards nailed over the door ───────── */}
      <mesh position={[x - 0.01, WH * 0.42, cz]} rotation={[ 0.55, 0, 0]} castShadow>
        <boxGeometry args={[0.07, hw * 2.8, 0.10]} />
        <meshStandardMaterial color={PLANK} roughness={0.98} />
      </mesh>
      <mesh position={[x - 0.03, WH * 0.42, cz]} rotation={[-0.55, 0, 0]} castShadow>
        <boxGeometry args={[0.07, hw * 2.8, 0.10]} />
        <meshStandardMaterial color={PLANK} roughness={0.98} />
      </mesh>
      {/* Horizontal braces */}
      <mesh position={[x - 0.02, WH * 0.28, cz]} castShadow>
        <boxGeometry args={[0.07, 0.10, hw * 2.2]} />
        <meshStandardMaterial color={PLANK} roughness={0.98} />
      </mesh>
      <mesh position={[x - 0.02, WH * 0.62, cz]} castShadow>
        <boxGeometry args={[0.07, 0.10, hw * 2.2]} />
        <meshStandardMaterial color={PLANK} roughness={0.98} />
      </mesh>

      {/* ── Chain + padlock ─────────────────────────────────────────── */}
      <mesh position={[x - 0.06, WH * 0.46, cz - 0.3]} rotation={[0.4, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.018, hw * 2.6, 6]} />
        <meshStandardMaterial color={METAL} roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[x - 0.10, WH * 0.46, cz]}>
        <boxGeometry args={[0.09, 0.16, 0.20]} />
        <meshStandardMaterial color="#111" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[x - 0.10, WH * 0.46 + 0.12, cz]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.065, 0.018, 8, 8, Math.PI]} />
        <meshStandardMaterial color="#222" roughness={0.3} metalness={0.8} />
      </mesh>
    </group>
  )
}

// ─── Window planks ──────────────────────────────────────────────────────────

const PLANK_CLR_BOARD = '#5a3c10'
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
            <meshStandardMaterial color={isStrong ? '#2a1a06' : PLANK_CLR_BOARD} roughness={0.95} />
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

// ─── Ceiling beams ──────────────────────────────────────────────────────────

function CeilingBeams() {
  const y = WH - 0.14
  const bh = 0.22   // beam height (Y)
  const bd = 0.18   // beam depth (Z or X thickness)
  return (
    <group>
      {/* Main room — beams run E-W (along X), spaced in Z */}
      {[-8, -4.5, -1, 2.5, 6, 9.5].map((z) => (
        <Box key={z} position={[3.5, y, z]} args={[11, bh, bd]} color={BEAM} roughness={1} castShadow />
      ))}
      {/* Bedroom — beams run E-W */}
      {[-8.5, -6.5].map((z) => (
        <Box key={z} position={[-5.5, y, z]} args={[7, bh, bd]} color={BEAM} roughness={1} castShadow />
      ))}
      {/* Hall — beams run E-W */}
      {[-1.5, 1.5, 4].map((z) => (
        <Box key={z} position={[-5.5, y, z]} args={[7, bh, bd]} color={BEAM} roughness={1} castShadow />
      ))}
      {/* Kitchen — beams run E-W */}
      {[6.5, 8.5].map((z) => (
        <Box key={z} position={[-5.5, y, z]} args={[7, bh, bd]} color={BEAM} roughness={1} castShadow />
      ))}
    </group>
  )
}

// ─── Cobwebs ─────────────────────────────────────────────────────────────────

function Cobweb({ x, y, z, rx = 0, ry = 0, rz = 0, sx = 0.6, sy = 0.01, sz = 0.5 }) {
  return (
    <mesh position={[x, y, z]} rotation={[rx, ry, rz]} castShadow={false}>
      <boxGeometry args={[sx, sy, sz]} />
      <meshStandardMaterial color={COBWEB} roughness={1} transparent opacity={0.55} />
    </mesh>
  )
}

function Cobwebs() {
  return (
    <group>
      {/* Main room corners */}
      <Cobweb x={-1.8} y={WH - 0.3} z={-9.7} rx={0} ry={Math.PI/4} sz={0.8} sx={0.8} />
      <Cobweb x={ 8.7} y={WH - 0.3} z={-9.7} rx={0} ry={-Math.PI/4} sz={0.8} sx={0.8} />
      <Cobweb x={-1.8} y={WH - 0.3} z={ 9.7} rx={0} ry={-Math.PI/4} sz={0.7} sx={0.7} />
      <Cobweb x={ 8.7} y={WH - 0.3} z={ 9.7} rx={0} ry={Math.PI/4}  sz={0.7} sx={0.7} />
      {/* Hanging strands from beams */}
      <Cobweb x={0}   y={WH - 0.55} z={-8} rx={Math.PI/2} sy={0.008} sz={0.5} sx={0.3} />
      <Cobweb x={6.5} y={WH - 0.55} z={6}  rx={Math.PI/2} sy={0.008} sz={0.4} sx={0.25} />
      {/* Bedroom corners */}
      <Cobweb x={-8.7} y={WH - 0.3} z={-9.7} rx={0} ry={Math.PI/4} sz={0.6} sx={0.6} />
      <Cobweb x={-2.3} y={WH - 0.3} z={-9.7} rx={0} ry={-Math.PI/4} sz={0.6} sx={0.6} />
      {/* Hall corner */}
      <Cobweb x={-8.7} y={WH - 0.3} z={-3.7} rx={0} ry={Math.PI/4} sz={0.5} sx={0.5} />
      {/* Kitchen corner */}
      <Cobweb x={-8.7} y={WH - 0.3} z={ 9.7} rx={0} ry={Math.PI/4} sz={0.6} sx={0.6} />
    </group>
  )
}

// ─── Floor planks ───────────────────────────────────────────────────────────

function FloorPlanks() {
  // Thin raised strips to suggest plank seams
  const strips = []
  for (let z = -9.5; z <= 9.5; z += 0.65) {
    strips.push(z)
  }
  return (
    <group>
      {strips.map((z) => (
        <mesh key={z} position={[0, 0.003, z]} receiveShadow>
          <boxGeometry args={[HW * 2, 0.006, 0.03]} />
          <meshStandardMaterial color="#0e0804" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

// ─── Fireplace ───────────────────────────────────────────────────────────────

function Fireplace() {
  // Against north wall of main room at X=4
  const fx  = 4
  const fzW = -HD + WT / 2 + 0.01   // interior face of north wall

  return (
    <group>
      {/* Hearth stone floor */}
      <Box position={[fx, 0.025, fzW + 0.45]} args={[2.8, 0.05, 1.0]} color={STONE} roughness={1} receiveShadow castShadow={false} />

      {/* Left stone pillar */}
      <Box position={[fx - 1.15, 1.3, fzW + 0.18]} args={[0.38, 2.6, 0.42]} color={STONE} roughness={1} />
      {/* Right stone pillar */}
      <Box position={[fx + 1.15, 1.3, fzW + 0.18]} args={[0.38, 2.6, 0.42]} color={STONE} roughness={1} />
      {/* Lintel beam */}
      <Box position={[fx, 2.5, fzW + 0.18]} args={[2.8, 0.28, 0.44]} color={STONE2} roughness={1} />
      {/* Mantle shelf */}
      <Box position={[fx, 2.66, fzW + 0.32]} args={[3.0, 0.1, 0.7]} color={STONE} roughness={1} />

      {/* Firebox sides */}
      <Box position={[fx - 0.78, 0.85, fzW + 0.22]} args={[0.08, 1.7, 0.5]} color={STONE2} roughness={1} />
      <Box position={[fx + 0.78, 0.85, fzW + 0.22]} args={[0.08, 1.7, 0.5]} color={STONE2} roughness={1} />
      {/* Firebox back */}
      <Box position={[fx, 0.85, fzW - 0.02]} args={[1.7, 1.7, 0.08]} color={FIREBOX} roughness={1} />
      {/* Firebox floor / ash */}
      <Box position={[fx, 0.24, fzW + 0.14]} args={[1.5, 0.04, 0.34]} color={ASH} roughness={1} />

      {/* Logs */}
      <mesh position={[fx - 0.22, 0.32, fzW + 0.14]} rotation={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, 1.1, 5]} />
        <meshStandardMaterial color="#0e0400" roughness={1} />
      </mesh>
      <mesh position={[fx + 0.18, 0.28, fzW + 0.16]} rotation={[0, -0.3, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.065, 1.0, 5]} />
        <meshStandardMaterial color="#0a0300" roughness={1} />
      </mesh>
      <mesh position={[fx, 0.38, fzW + 0.10]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 1.0, 5]} />
        <meshStandardMaterial color="#0c0400" roughness={1} />
      </mesh>

      {/* Ember glow box */}
      <mesh position={[fx, 0.26, fzW + 0.16]}>
        <boxGeometry args={[1.0, 0.05, 0.2]} />
        <meshStandardMaterial color="#ff2200" emissive="#ff2200" emissiveIntensity={1.5} roughness={1} />
      </mesh>

      {/* Mantle decorations */}
      {/* Three candles */}
      <Candle position={[fx - 0.9, 2.72, fzW + 0.4]} />
      <Candle position={[fx - 0.5, 2.72, fzW + 0.42]} />
      <Candle position={[fx + 0.85, 2.72, fzW + 0.41]} />
      {/* Skull on mantle */}
      <Skull position={[fx + 0.2, 2.72, fzW + 0.42]} />
      {/* Old clock */}
      <MantelClock position={[fx - 0.15, 2.72, fzW + 0.4]} />

      {/* Firelight */}
      <pointLight position={[fx, 0.8, fzW + 0.4]} color="#ff5500" intensity={30} distance={20} decay={2} castShadow />
      <pointLight position={[fx, 0.3, fzW + 0.2]} color="#ff2200" intensity={8}  distance={6}  decay={2} />
    </group>
  )
}

// ─── Small props ─────────────────────────────────────────────────────────────

function Candle({ position }) {
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.03, 0.03, 0.18, 6]} />
        <meshStandardMaterial color="#c8b898" roughness={1} />
      </mesh>
      <mesh position={[0, 0.10, 0]}>
        <cylinderGeometry args={[0.003, 0.005, 0.07, 4]} />
        <meshStandardMaterial color="#111" roughness={1} />
      </mesh>
      {/* Emissive flame — no per-candle pointLight to keep total light count low */}
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.02, 0.03, 0.02]} />
        <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={4} roughness={1} />
      </mesh>
    </group>
  )
}

function Skull({ position }) {
  return (
    <group position={position}>
      {/* Cranium */}
      <Box position={[0, 0.10, 0]} args={[0.14, 0.14, 0.12]} color={BONE} />
      {/* Jaw */}
      <Box position={[0, 0.02, 0.02]} args={[0.12, 0.06, 0.10]} color={BONE} />
      {/* Eye sockets */}
      <Box position={[-0.035, 0.10, 0.06]} args={[0.045, 0.045, 0.04]} color="#0a0604" />
      <Box position={[ 0.035, 0.10, 0.06]} args={[0.045, 0.045, 0.04]} color="#0a0604" />
      {/* Nasal cavity */}
      <Box position={[0, 0.065, 0.063]} args={[0.025, 0.025, 0.03]} color="#0a0604" />
    </group>
  )
}

function MantelClock({ position }) {
  return (
    <group position={position}>
      <Box position={[0, 0.14, 0]} args={[0.18, 0.28, 0.10]} color={WOOD2} />
      <Box position={[0, 0.14, 0.055]} args={[0.12, 0.18, 0.01]} color="#0e0e0e" />
      {/* Clock hands */}
      <Box position={[0, 0.15, 0.061]} args={[0.005, 0.08, 0.005]} color="#332200" rotation={[0, 0, 0.5]} />
      <Box position={[0, 0.15, 0.061]} args={[0.005, 0.06, 0.005]} color="#332200" rotation={[0, 0, -1.2]} />
    </group>
  )
}

// ─── Deer head trophy ────────────────────────────────────────────────────────

function DeerHead({ position }) {
  return (
    <group position={position}>
      {/* Mounting plaque */}
      <Box position={[0, 0, -0.04]} args={[0.6, 0.55, 0.08]} color={WOOD} />
      {/* Skull */}
      <Box position={[0, -0.02, 0.08]} args={[0.22, 0.18, 0.22]} color={BONE} />
      {/* Snout */}
      <Box position={[0, -0.06, 0.20]} args={[0.14, 0.10, 0.16]} color={BONE} />
      {/* Nostril cavities */}
      <Box position={[-0.04, -0.08, 0.28]} args={[0.04, 0.04, 0.04]} color="#0e0a08" />
      <Box position={[ 0.04, -0.08, 0.28]} args={[0.04, 0.04, 0.04]} color="#0e0a08" />
      {/* Eye sockets */}
      <Box position={[-0.09, 0.02, 0.12]} args={[0.06, 0.06, 0.05]} color="#0a0806" />
      <Box position={[ 0.09, 0.02, 0.12]} args={[0.06, 0.06, 0.05]} color="#0a0806" />
      {/* Left antler main beam */}
      <Box position={[-0.12, 0.22, 0.05]} args={[0.06, 0.30, 0.06]} color={BONE} rotation={[0, 0, -0.3]} />
      <Box position={[-0.22, 0.44, 0.03]} args={[0.05, 0.24, 0.05]} color={BONE} rotation={[0, 0, -0.15]} />
      {/* Left tines */}
      <Box position={[-0.15, 0.38, 0.04]} args={[0.04, 0.16, 0.04]} color={BONE} rotation={[0, 0, -0.6]} />
      <Box position={[-0.24, 0.52, 0.04]} args={[0.04, 0.14, 0.04]} color={BONE} rotation={[0, 0, 0.4]} />
      {/* Right antler main beam */}
      <Box position={[ 0.12, 0.22, 0.05]} args={[0.06, 0.30, 0.06]} color={BONE} rotation={[0, 0,  0.3]} />
      <Box position={[ 0.22, 0.44, 0.03]} args={[0.05, 0.24, 0.05]} color={BONE} rotation={[0, 0,  0.15]} />
      {/* Right tines */}
      <Box position={[ 0.15, 0.38, 0.04]} args={[0.04, 0.16, 0.04]} color={BONE} rotation={[0, 0,  0.6]} />
      <Box position={[ 0.24, 0.52, 0.04]} args={[0.04, 0.14, 0.04]} color={BONE} rotation={[0, 0, -0.4]} />
    </group>
  )
}

// ─── Rocking chair ───────────────────────────────────────────────────────────

function RockingChair({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Seat */}
      <Box position={[0, 0.44, 0]}    args={[0.58, 0.07, 0.52]} color={WOOD} />
      {/* Seat brace */}
      <Box position={[0, 0.41, -0.1]} args={[0.56, 0.05, 0.30]} color={WOOD2} />
      {/* Back rails */}
      <Box position={[0, 0.82, -0.24]} args={[0.52, 0.06, 0.06]} color={WOOD} />
      <Box position={[0, 1.16, -0.24]} args={[0.52, 0.06, 0.06]} color={WOOD} />
      <Box position={[0, 1.50, -0.24]} args={[0.46, 0.06, 0.06]} color={WOOD} />
      {/* Back posts */}
      <Box position={[-0.24, 1.06, -0.24]} args={[0.06, 1.25, 0.06]} color={WOOD2} />
      <Box position={[ 0.24, 1.06, -0.24]} args={[0.06, 1.25, 0.06]} color={WOOD2} />
      {/* Front legs */}
      <Box position={[-0.24, 0.22,  0.22]} args={[0.06, 0.46, 0.06]} color={WOOD2} />
      <Box position={[ 0.24, 0.22,  0.22]} args={[0.06, 0.46, 0.06]} color={WOOD2} />
      {/* Rockers */}
      <Box position={[-0.24, 0.05, 0]} args={[0.06, 0.09, 0.72]} color={WOOD2} />
      <Box position={[ 0.24, 0.05, 0]} args={[0.06, 0.09, 0.72]} color={WOOD2} />
      {/* Armrests */}
      <Box position={[-0.28, 0.65, -0.05]} args={[0.06, 0.06, 0.42]} color={WOOD} />
      <Box position={[ 0.28, 0.65, -0.05]} args={[0.06, 0.06, 0.42]} color={WOOD} />
    </group>
  )
}

// ─── Bookshelf with Necronomicon ─────────────────────────────────────────────

function Bookshelf({ position, rotation }) {
  const books = [
    { color: BOOK_R,  w: 0.08, h: 0.26, x: -0.38 },
    { color: BOOK_G,  w: 0.07, h: 0.22, x: -0.29 },
    { color: NECRO,   w: 0.14, h: 0.30, x: -0.18 },  // Necronomicon
    { color: BOOK_B,  w: 0.07, h: 0.24, x: -0.07 },
    { color: '#1e0e0e', w: 0.06, h: 0.20, x:  0.01 },
    { color: BOOK_R,  w: 0.09, h: 0.25, x:  0.09 },
    { color: WOOD2,   w: 0.07, h: 0.22, x:  0.20 },
    { color: BOOK_G,  w: 0.08, h: 0.23, x:  0.29 },
    { color: BOOK_B,  w: 0.10, h: 0.27, x:  0.39 },
  ]
  const shelves = [0.32, 0.90, 1.50]
  return (
    <group position={position} rotation={rotation}>
      {/* Carcass back */}
      <Box position={[0, 1.0, -0.18]} args={[1.0, 2.0, 0.06]} color={WOOD2} />
      {/* Sides */}
      <Box position={[-0.48, 1.0, 0]} args={[0.06, 2.0, 0.42]} color={WOOD2} />
      <Box position={[ 0.48, 1.0, 0]} args={[0.06, 2.0, 0.42]} color={WOOD2} />
      {/* Top */}
      <Box position={[0, 2.02, 0]} args={[1.02, 0.06, 0.42]} color={WOOD} />
      {/* Shelves */}
      {shelves.map((y) => (
        <Box key={y} position={[0, y, 0]} args={[0.94, 0.05, 0.40]} color={WOOD} />
      ))}
      {/* Books on bottom shelf */}
      {books.map((b, i) => (
        <Box key={i} position={[b.x, shelves[0] + b.h / 2 + 0.03, 0.02]} args={[b.w, b.h, 0.28]} color={b.color} />
      ))}
      {/* Middle shelf — fewer books, more scattered */}
      <Box position={[-0.30, shelves[1] + 0.14, 0.02]} args={[0.08, 0.28, 0.26]} color={BOOK_R} />
      <Box position={[-0.20, shelves[1] + 0.12, 0.02]} args={[0.12, 0.24, 0.26]} color={WOOD2} />
      <Box position={[ 0.25, shelves[1] + 0.13, 0.02]} args={[0.07, 0.26, 0.26]} color={BOOK_G} />
      {/* Top shelf — mostly empty, one spine */}
      <Box position={[-0.35, shelves[2] + 0.12, 0.02]} args={[0.09, 0.24, 0.26]} color={BOOK_B} />
    </group>
  )
}

// ─── Old desk with tape recorder ─────────────────────────────────────────────

function OldDesk({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Tabletop */}
      <Box position={[0, 0.72, 0]} args={[1.2, 0.06, 0.65]} color={WOOD} />
      {/* Legs */}
      <Box position={[-0.55, 0.35, -0.28]} args={[0.07, 0.72, 0.07]} color={WOOD2} />
      <Box position={[ 0.55, 0.35, -0.28]} args={[0.07, 0.72, 0.07]} color={WOOD2} />
      <Box position={[-0.55, 0.35,  0.28]} args={[0.07, 0.72, 0.07]} color={WOOD2} />
      <Box position={[ 0.55, 0.35,  0.28]} args={[0.07, 0.72, 0.07]} color={WOOD2} />
      {/* Apron rail */}
      <Box position={[0, 0.62, -0.30]} args={[1.08, 0.12, 0.05]} color={WOOD2} />
      {/* Tape recorder (on desk) */}
      <Box position={[ 0.25, 0.76, -0.05]} args={[0.28, 0.06, 0.18]} color="#1a1a18" />
      <Box position={[ 0.25, 0.79, -0.05]} args={[0.22, 0.01, 0.06]} color="#2a2a28" />
      {/* Spools */}
      <mesh position={[0.15, 0.80, -0.03]} rotation={[Math.PI/2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.015, 8]} />
        <meshStandardMaterial color="#1a1008" roughness={0.8} />
      </mesh>
      <mesh position={[0.34, 0.80, -0.03]} rotation={[Math.PI/2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.015, 8]} />
        <meshStandardMaterial color="#1a1008" roughness={0.8} />
      </mesh>
      {/* Papers / books on desk */}
      <Box position={[-0.3, 0.755, 0.05]} args={[0.35, 0.01, 0.28]} color="#1a1610" />
      <Box position={[-0.28, 0.77, 0.04]} args={[0.30, 0.01, 0.24]} color="#181410" />
      {/* Ink bottle */}
      <mesh position={[-0.4, 0.79, -0.10]}>
        <cylinderGeometry args={[0.03, 0.04, 0.08, 6]} />
        <meshStandardMaterial color="#0a0808" roughness={0.5} metalness={0.1} />
      </mesh>
      <Candle position={[0.1, 0.755, 0.16]} />
    </group>
  )
}

// ─── Floor rug ───────────────────────────────────────────────────────────────

function FloorRug({ position, args }) {
  return (
    <group position={position}>
      <Box position={[0, 0.008, 0]} args={[args[0], 0.016, args[1]]} color={RUG1} castShadow={false} receiveShadow />
      {/* Rug border */}
      <Box position={[0, 0.009, -args[1] / 2 + 0.12]} args={[args[0], 0.018, 0.18]} color={RUG2} castShadow={false} />
      <Box position={[0, 0.009,  args[1] / 2 - 0.12]} args={[args[0], 0.018, 0.18]} color={RUG2} castShadow={false} />
      <Box position={[-args[0] / 2 + 0.12, 0.009, 0]} args={[0.18, 0.018, args[1]]} color={RUG2} castShadow={false} />
      <Box position={[ args[0] / 2 - 0.12, 0.009, 0]} args={[0.18, 0.018, args[1]]} color={RUG2} castShadow={false} />
    </group>
  )
}

// ─── Bed ─────────────────────────────────────────────────────────────────────

function Bed({ position }) {
  return (
    <group position={position}>
      {/* Headboard */}
      <Box position={[0, 0.72, -0.78]} args={[1.0, 1.44, 0.10]} color={IRON} />
      <Box position={[0, 0.50, -0.78]} args={[0.90, 0.06, 0.10]} color={IRON} />
      <Box position={[0, 0.90, -0.78]} args={[0.90, 0.06, 0.10]} color={IRON} />
      <Box position={[0, 1.30, -0.78]} args={[0.90, 0.06, 0.10]} color={IRON} />
      {/* Footboard */}
      <Box position={[0, 0.44, 0.78]} args={[1.0, 0.88, 0.10]} color={IRON} />
      {/* Frame rails */}
      <Box position={[-0.45, 0.30, 0]} args={[0.08, 0.06, 1.56]} color={IRON} />
      <Box position={[ 0.45, 0.30, 0]} args={[0.08, 0.06, 1.56]} color={IRON} />
      {/* Legs */}
      <Box position={[-0.45, 0.15, -0.76]} args={[0.08, 0.30, 0.08]} color={IRON} />
      <Box position={[ 0.45, 0.15, -0.76]} args={[0.08, 0.30, 0.08]} color={IRON} />
      <Box position={[-0.45, 0.15,  0.76]} args={[0.08, 0.30, 0.08]} color={IRON} />
      <Box position={[ 0.45, 0.15,  0.76]} args={[0.08, 0.30, 0.08]} color={IRON} />
      {/* Mattress */}
      <Box position={[0, 0.40, 0]} args={[0.88, 0.16, 1.52]} color={LINEN} />
      {/* Rumpled sheet */}
      <Box position={[0.1, 0.49, -0.2]} args={[0.80, 0.05, 0.90]} color="#161210" />
      {/* Pillow */}
      <Box position={[0, 0.50, -0.58]} args={[0.60, 0.10, 0.30]} color={LINEN} />
    </group>
  )
}

// ─── Nightstand ──────────────────────────────────────────────────────────────

function Nightstand({ position }) {
  return (
    <group position={position}>
      <Box position={[0, 0.38, 0]} args={[0.42, 0.76, 0.36]} color={WOOD2} />
      <Box position={[0, 0.39, 0]} args={[0.36, 0.74, 0.30]} color={WOOD} />
      <Box position={[0, 0.40, 0.16]} args={[0.30, 0.02, 0.04]} color={WOOD2} />
      {/* Top */}
      <Box position={[0, 0.78, 0]} args={[0.44, 0.04, 0.38]} color={WOOD2} />
      <Candle position={[0.08, 0.83, -0.05]} />
    </group>
  )
}

// ─── Cellar door ─────────────────────────────────────────────────────────────

function CellarDoor({ position }) {
  return (
    <group position={position}>
      {/* Door frame inset in floor */}
      <Box position={[0, 0.015, 0]} args={[0.98, 0.030, 1.38]} color={WOOD2} castShadow={false} receiveShadow />
      {/* Two door panels */}
      <Box position={[-0.24, 0.033, 0]} args={[0.44, 0.02, 1.28]} color={WOOD} castShadow={false} receiveShadow />
      <Box position={[ 0.24, 0.033, 0]} args={[0.44, 0.02, 1.28]} color={WOOD} castShadow={false} receiveShadow />
      {/* Cross braces on each panel */}
      <Box position={[-0.24, 0.044, 0]}  args={[0.40, 0.02, 0.06]} color={WOOD2} castShadow={false} />
      <Box position={[ 0.24, 0.044, 0]}  args={[0.40, 0.02, 0.06]} color={WOOD2} castShadow={false} />
      {/* Iron ring handles */}
      <mesh position={[-0.24, 0.06, 0.28]} rotation={[Math.PI/2, 0, 0]}>
        <torusGeometry args={[0.05, 0.012, 6, 8]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[ 0.24, 0.06, 0.28]} rotation={[Math.PI/2, 0, 0]}>
        <torusGeometry args={[0.05, 0.012, 6, 8]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.5} />
      </mesh>
      {/* Lock hasp */}
      <Box position={[0, 0.05, 0.20]} args={[0.12, 0.03, 0.06]} color={METAL} />
    </group>
  )
}

// ─── Wood stove ──────────────────────────────────────────────────────────────

function WoodStove({ position }) {
  return (
    <group position={position}>
      {/* Body */}
      <Box position={[0, 0.44, 0]} args={[0.52, 0.88, 0.44]} color="#1a1612" roughness={0.8} metalness={0.2} />
      {/* Top plate */}
      <Box position={[0, 0.90, 0]} args={[0.56, 0.06, 0.48]} color="#131210" roughness={0.7} metalness={0.3} />
      {/* Firebox door */}
      <Box position={[0, 0.35, 0.23]} args={[0.28, 0.30, 0.03]} color="#222018" roughness={0.8} metalness={0.2} />
      {/* Door handle */}
      <Box position={[0, 0.35, 0.25]} args={[0.06, 0.06, 0.03]} color={METAL} metalness={0.5} />
      {/* Legs */}
      <Box position={[-0.20, 0.04, -0.16]} args={[0.06, 0.10, 0.06]} color="#1a1612" />
      <Box position={[ 0.20, 0.04, -0.16]} args={[0.06, 0.10, 0.06]} color="#1a1612" />
      <Box position={[-0.20, 0.04,  0.16]} args={[0.06, 0.10, 0.06]} color="#1a1612" />
      <Box position={[ 0.20, 0.04,  0.16]} args={[0.06, 0.10, 0.06]} color="#1a1612" />
      {/* Stovepipe */}
      <mesh position={[0, 1.55, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 1.2, 8]} />
        <meshStandardMaterial color="#141210" roughness={0.8} metalness={0.3} />
      </mesh>
      {/* Kettle on top */}
      <mesh position={[0.12, 0.98, 0.05]} castShadow>
        <cylinderGeometry args={[0.09, 0.10, 0.16, 8]} />
        <meshStandardMaterial color={COPPER} roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh position={[0.12, 1.07, 0.05]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.06, 8]} />
        <meshStandardMaterial color={COPPER} roughness={0.7} metalness={0.3} />
      </mesh>
      {/* Stove firebox emissive — no pointLight (kept scene light count low) */}
    </group>
  )
}

// ─── Kitchen table ───────────────────────────────────────────────────────────

function KitchenTable({ position }) {
  return (
    <group position={position}>
      <Box position={[0, 0.74, 0]} args={[1.1, 0.07, 0.62]} color={WOOD} />
      <Box position={[-0.48, 0.37, -0.26]} args={[0.07, 0.74, 0.07]} color={WOOD2} />
      <Box position={[ 0.48, 0.37, -0.26]} args={[0.07, 0.74, 0.07]} color={WOOD2} />
      <Box position={[-0.48, 0.37,  0.26]} args={[0.07, 0.74, 0.07]} color={WOOD2} />
      <Box position={[ 0.48, 0.37,  0.26]} args={[0.07, 0.74, 0.07]} color={WOOD2} />
      <Box position={[0, 0.64, -0.27]} args={[0.96, 0.10, 0.06]} color={WOOD2} />
      {/* Old bowl on table */}
      <mesh position={[-0.2, 0.80, 0.05]}>
        <cylinderGeometry args={[0.12, 0.08, 0.09, 8]} />
        <meshStandardMaterial color="#1a1410" roughness={1} />
      </mesh>
      {/* Candle */}
      <Candle position={[0.3, 0.755, -0.08]} />
    </group>
  )
}

// ─── Chest ───────────────────────────────────────────────────────────────────

function Chest() {
  const x = CHEST_POS.x, z = CHEST_POS.z
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.44, 0.55]} />
        <meshStandardMaterial color="#2a1408" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.49, -0.04]} castShadow>
        <boxGeometry args={[0.9, 0.13, 0.5]} />
        <meshStandardMaterial color="#361a0a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.22, 0.278]}>
        <boxGeometry args={[0.92, 0.44, 0.02]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.22, -0.278]}>
        <boxGeometry args={[0.92, 0.44, 0.02]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.3, 0.285]}>
        <boxGeometry args={[0.13, 0.11, 0.04]} />
        <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  )
}

// ─── Wall lanterns ───────────────────────────────────────────────────────────

function WallLantern({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Bracket arm */}
      <Box position={[0, 0, 0.12]} args={[0.06, 0.06, 0.28]} color={METAL} metalness={0.5} roughness={0.7} />
      {/* Body */}
      <Box position={[0, 0, 0.28]} args={[0.18, 0.22, 0.18]} color="#1e1810" roughness={0.7} />
      {/* Glass panes (dark amber) */}
      <Box position={[0, 0, 0.30]} args={[0.13, 0.16, 0.13]} color="#2a1a04" roughness={0.3} />
      {/* Emissive flame — no per-lantern pointLight */}
      <Box position={[0, 0.02, 0.28]} args={[0.04, 0.06, 0.04]} color="#ffaa00" emissive="#ffaa00" emissiveIntensity={4} castShadow={false} />
    </group>
  )
}

// ─── Wall sections ────────────────────────────────────────────────────────────

function NorthWall() {
  const z = -HD
  return (
    <group>
      {/* Bedroom section: two windows at X=-7 and X=-4 */}
      <Box position={[-8.5, WH/2, z]} args={[1,  WH, WT]} color={WALL} />
      <Box position={[-5.5, WH/2, z]} args={[1,  WH, WT]} color={WALL} />
      <Box position={[-2.5, WH/2, z]} args={[1,  WH, WT]} color={WALL} />
      <WindowFill cx={-7} cz={z} isXWall />
      <WindowFill cx={-4} cz={z} isXWall />
      <WindowFrame cx={-7} cz={z + WT / 2} isXWall />
      <WindowFrame cx={-4} cz={z + WT / 2} isXWall />
      {/* Main room section: solid */}
      <Box position={[3.5, WH/2, z]} args={[11, WH, WT]} color={WALL} />
      {/* Horizontal clapboard groove lines */}
      {[0.55, 1.10, 1.65, 2.20, 2.75].map((y) => (
        <Box key={y} position={[-5.5, y, z + WT / 2 + 0.005]} args={[7, 0.018, 0.012]} color={WALL2} castShadow={false} />
      ))}
      {[0.55, 1.10, 1.65, 2.20, 2.75].map((y) => (
        <Box key={y} position={[3.5, y, z + WT / 2 + 0.005]} args={[11, 0.018, 0.012]} color={WALL2} castShadow={false} />
      ))}
    </group>
  )
}

function SouthWall() {
  const z = HD
  return (
    <group>
      {/* Kitchen: window at X=-5 */}
      <Box position={[-7.5, WH/2, z]} args={[3, WH, WT]} color={WALL} />
      <Box position={[  -3, WH/2, z]} args={[2, WH, WT]} color={WALL} />
      <WindowFill cx={-5} cz={z} isXWall />
      <WindowFrame cx={-5} cz={z - WT / 2} isXWall />
      {/* Main room: window at X=+4 */}
      <Box position={[0.5, WH/2, z]} args={[5, WH, WT]} color={WALL} />
      <Box position={[  7, WH/2, z]} args={[4, WH, WT]} color={WALL} />
      <WindowFill cx={4} cz={z} isXWall />
      <WindowFrame cx={4} cz={z - WT / 2} isXWall />
      {/* Clapboards */}
      {[0.55, 1.10, 1.65, 2.20, 2.75].map((y) => (
        <Box key={y} position={[-5.5, y, z - WT / 2 - 0.005]} args={[7, 0.018, 0.012]} color={WALL2} castShadow={false} />
      ))}
      {[0.55, 1.10, 1.65, 2.20, 2.75].map((y) => (
        <Box key={y} position={[3.5, y, z - WT / 2 - 0.005]} args={[11, 0.018, 0.012]} color={WALL2} castShadow={false} />
      ))}
    </group>
  )
}

function EastWall() {
  const x = HW
  return (
    <group>
      <Box position={[x, WH/2, -5.5]} args={[WT, WH, 9]} color={WALL} />
      <Box position={[x, WH/2, +5.5]} args={[WT, WH, 9]} color={WALL} />
      <WindowFill cx={x} cz={0} isXWall={false} />
      <WindowFrame cx={x - WT / 2} cz={0} isXWall={false} />
      {[0.55, 1.10, 1.65, 2.20, 2.75].map((y) => (
        <Box key={y} position={[x - WT / 2 - 0.005, y, 0]} args={[0.012, 0.018, 20]} color={WALL2} castShadow={false} />
      ))}
    </group>
  )
}

function WestWall() {
  const x = -HW
  return (
    <group>
      {/* Bedroom: solid */}
      <Box position={[x, WH/2,   -7]} args={[WT, WH,   6]} color={WALL} />
      {/* Hall: north of door */}
      <Box position={[x, WH/2, -2.6]} args={[WT, WH, 2.8]} color={WALL} />
      {/* Hall: column between door and window */}
      <Box position={[x, WH/2, 1.35]} args={[WT, WH, 0.3]} color={WALL} />
      {/* Hall: south of window */}
      <Box position={[x, WH/2, 4.25]} args={[WT, WH, 1.5]} color={WALL} />
      <WindowFill cx={x} cz={2.5} isXWall={false} />
      <WindowFrame cx={x + WT / 2} cz={2.5} isXWall={false} />
      <BarricadedDoor />
      {/* Kitchen: solid */}
      <Box position={[x, WH/2,  7.5]} args={[WT, WH,   5]} color={WALL} />
      {/* Clapboards on interior face */}
      {[0.55, 1.10, 1.65, 2.20, 2.75].map((y) => (
        <Box key={y} position={[x + WT / 2 + 0.005, y, 0]} args={[0.012, 0.018, 20]} color={WALL2} castShadow={false} />
      ))}
    </group>
  )
}

function BedroomHallWall() {
  const z = PART_Z_BH
  return (
    <group>
      <Box position={[  -8, WH/2, z]} args={[2, WH, WT]} color={WALL} />
      <Box position={[-3.5, WH/2, z]} args={[3, WH, WT]} color={WALL} />
      <DoorwayFill cx={-6} cz={z} halfW={1} isXWall />
      <DoorwayFrame cx={-6} cz={z} halfW={1} isXWall />
    </group>
  )
}

function HallKitchenWall() {
  const z = PART_Z_HK
  return (
    <group>
      <Box position={[-7.5, WH/2, z]} args={[3, WH, WT]} color={WALL} />
      <Box position={[  -3, WH/2, z]} args={[2, WH, WT]} color={WALL} />
      <DoorwayFill cx={-5} cz={z} halfW={1} isXWall />
      <DoorwayFrame cx={-5} cz={z} halfW={1} isXWall />
    </group>
  )
}

function WestMainWall() {
  const x = PART_X
  return (
    <group>
      <Box position={[x, WH/2,   -9]} args={[WT, WH,  2]} color={WALL} />
      <Box position={[x, WH/2,   -5]} args={[WT, WH,  2]} color={WALL} />
      <Box position={[x, WH/2, -2.5]} args={[WT, WH,  3]} color={WALL} />
      <Box position={[x, WH/2,    3]} args={[WT, WH,  4]} color={WALL} />
      <Box position={[x, WH/2,  7.5]} args={[WT, WH,  5]} color={WALL} />
      <DoorwayFill cx={x} cz={-7} halfW={1} isXWall={false} />
      <DoorwayFrame cx={x} cz={-7} halfW={1} isXWall={false} />
      <DoorwayFill cx={x} cz={ 0} halfW={1} isXWall={false} />
      <DoorwayFrame cx={x} cz={ 0} halfW={1} isXWall={false} />
    </group>
  )
}

// ─── Roof ────────────────────────────────────────────────────────────────────

function Roof() {
  const angle    = Math.atan2(PITCH, HW)
  const eavX     = HW + 0.55
  const panelW   = Math.sqrt(eavX * eavX + PITCH * PITCH)
  const panelCX  = eavX / 2
  const panelCY  = WH + PITCH / 2
  const panelLen = HD * 2 + 1.1
  const ROWS     = 10

  return (
    <group>
      {/* Right slope */}
      <mesh position={[panelCX, panelCY, 0]} rotation={[0, 0, -angle]}>
        <boxGeometry args={[panelW, 0.22, panelLen]} />
        <meshStandardMaterial color={ROOF} roughness={1} />
      </mesh>

      {/* Left slope */}
      <mesh position={[-panelCX, panelCY, 0]} rotation={[0, 0, angle]}>
        <boxGeometry args={[panelW, 0.22, panelLen]} />
        <meshStandardMaterial color={ROOF} roughness={1} />
      </mesh>

      {/* Ridge cap */}
      <mesh position={[0, WH + PITCH + 0.06, 0]}>
        <boxGeometry args={[0.5, 0.16, panelLen + 0.2]} />
        <meshStandardMaterial color={ROOF} roughness={1} />
      </mesh>

      {/* Gable ends — stacked boxes approximating a triangle */}
      {[HD + 0.55, -(HD + 0.55)].map((gz) => (
        <group key={gz}>
          {Array.from({ length: ROWS }, (_, i) => {
            const rowH = PITCH / ROWS
            const rowW = HW * 2 * (1 - i / ROWS)
            return (
              <mesh key={i} position={[0, WH + rowH * i + rowH / 2, gz]}>
                <boxGeometry args={[rowW, rowH + 0.02, 0.32]} />
                <meshStandardMaterial color={ROOF} roughness={1} />
              </mesh>
            )
          })}
        </group>
      ))}
    </group>
  )
}

// ─── Arena export ────────────────────────────────────────────────────────────

export default function Arena() {
  return (
    <group>
      {/* ── Lighting ─────────────────────────────────────────────────────── */}
      <ambientLight intensity={0.55} color="#c8d8f0" />
      {/* Moonlight — shadow map only hits 6 proxy meshes per zombie now */}
      <directionalLight position={[-20, 35, -15]} color="#d0e0ff" intensity={1.8} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-near={1} shadow-camera-far={80}
        shadow-camera-left={-30} shadow-camera-right={30}
        shadow-camera-top={30} shadow-camera-bottom={-30}
      />
      {/* Hemisphere sky/ground fill */}
      <hemisphereLight skyColor="#3a5080" groundColor="#0a1808" intensity={0.4} />
      {/* ── Scene point lights — kept to a minimum to avoid shader recompilation
           stutter when zombie materials mount.  Per-candle/lantern lights removed;
           these four fills + the two fireplace lights cover all four rooms.      ── */}
      {/* Main room warm fill */}
      <pointLight position={[3.5, WH - 0.5,  0]}  color="#ffcc88" intensity={14} distance={24} decay={2} />
      {/* West rooms fill (bedroom / hall / kitchen share one broad light) */}
      <pointLight position={[-5.5, WH - 0.5, -7]}  color="#ffaa66" intensity={12} distance={14} decay={2} />
      <pointLight position={[-5.5, WH - 0.5,  0.5]} color="#ffaa55" intensity={12} distance={14} decay={2} />
      <pointLight position={[-5.5, WH - 0.5,  7.5]} color="#ffaa55" intensity={10} distance={12} decay={2} />
      {/* Chest glow */}
      <pointLight position={[CHEST_POS.x, 1.0, CHEST_POS.z]} color="#ffcc44" intensity={5} distance={8} decay={2} />

      {/* ── Floor ────────────────────────────────────────────────────────── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[HW * 2, HD * 2]} />
        <meshStandardMaterial color={FLOOR} roughness={0.98} />
      </mesh>
      <FloorPlanks />

      {/* ── Exterior ground ──────────────────────────────────────────────── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#1a2a14" roughness={1} />
      </mesh>

      {/* ── Ceiling ──────────────────────────────────────────────────────── */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WH, 0]}>
        <planeGeometry args={[HW * 2, HD * 2]} />
        <meshStandardMaterial color={CEIL} roughness={1} side={THREE.BackSide} />
      </mesh>
      <CeilingBeams />

      <Roof />

      {/* ── Walls ────────────────────────────────────────────────────────── */}
      <NorthWall />
      <SouthWall />
      <EastWall />
      <WestWall />
      <BedroomHallWall />
      <HallKitchenWall />
      <WestMainWall />
      <WindowPlanks />

      {/* ── Atmosphere ───────────────────────────────────────────────────── */}
      <Cobwebs />

      {/* ── Main room ────────────────────────────────────────────────────── */}
      <Fireplace />
      <DeerHead position={[4, 2.1, -HD + WT + 0.02]} rotation={[0, Math.PI, 0]} />
      <RockingChair position={[0.8, 0, -7.2]} rotation={[0, 0.5, 0]} />
      <FloorRug position={[3, 0, -0.5]} args={[5.5, 4.5]} />
      <OldDesk position={[6.5, 0, -4.5]} rotation={[0, Math.PI, 0]} />
      <Bookshelf position={[-1.8, 0, -5.5]} rotation={[0, Math.PI / 2, 0]} />
      {/* Candelabra on floor */}
      <group position={[2, 0, 2]}>
        <Box position={[0, 0.55, 0]} args={[0.05, 1.10, 0.05]} color={METAL} metalness={0.5} />
        <Box position={[0, 1.12, 0]} args={[0.32, 0.04, 0.04]} color={METAL} metalness={0.5} />
        <Box position={[0, 1.12, 0]} args={[0.04, 0.04, 0.32]} color={METAL} metalness={0.5} />
        <Candle position={[0,    1.14, 0]} />
        <Candle position={[ 0.16, 1.14, 0]} />
        <Candle position={[-0.16, 1.14, 0]} />
        <Candle position={[0,    1.14,  0.16]} />
        <Candle position={[0,    1.14, -0.16]} />
      </group>
      {/* Wall lanterns in main room */}
      <WallLantern position={[HW - WT, 2.0, -6]} rotation={[0,  Math.PI / 2, 0]} />
      <WallLantern position={[HW - WT, 2.0,  6]} rotation={[0,  Math.PI / 2, 0]} />

      {/* ── Bedroom ──────────────────────────────────────────────────────── */}
      <Bed position={[-5.5, 0, -8.2]} />
      <Nightstand position={[-3.6, 0, -8.2]} />
      <WallLantern position={[PART_X + WT, 1.8, -8]} rotation={[0, -Math.PI / 2, 0]} />

      {/* ── Hall ─────────────────────────────────────────────────────────── */}
      <CellarDoor position={[-5.5, 0, 1.5]} />
      <WallLantern position={[-HW + WT, 1.8, -2.8]} rotation={[0, Math.PI / 2, 0]} />

      {/* ── Kitchen ──────────────────────────────────────────────────────── */}
      <WoodStove position={[-6.5, 0, -HD + WT + 0.38]} />
      <KitchenTable position={[-4.5, 0, 7.5]} />
      <WallLantern position={[-HW + WT, 1.8, 7.5]} rotation={[0, Math.PI / 2, 0]} />
      {/* Hanging pots */}
      <mesh position={[-5.5, WH - 0.45, 6.5]} castShadow>
        <cylinderGeometry args={[0.10, 0.12, 0.20, 7]} />
        <meshStandardMaterial color={COPPER} roughness={0.8} metalness={0.2} />
      </mesh>
      <mesh position={[-7, WH - 0.45, 7]} castShadow>
        <cylinderGeometry args={[0.08, 0.10, 0.16, 7]} />
        <meshStandardMaterial color={COPPER} roughness={0.8} metalness={0.2} />
      </mesh>
      {/* Pot hooks/chains */}
      <mesh position={[-5.5, WH - 0.25, 6.5]}>
        <cylinderGeometry args={[0.005, 0.005, 0.4, 4]} />
        <meshStandardMaterial color={METAL} roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[-7, WH - 0.25, 7]}>
        <cylinderGeometry args={[0.005, 0.005, 0.4, 4]} />
        <meshStandardMaterial color={METAL} roughness={0.5} metalness={0.6} />
      </mesh>

      {/* ── Loot chest ───────────────────────────────────────────────────── */}
      <Chest />
    </group>
  )
}
