import { useGameStore } from '../store'
import {
  WIN_Y0,
  WIN_Y1,
  WIN_HALF,
  DOOR_Z,
  DOOR_HALF,
  PART_Z_BH,
  PART_Z_HK,
  PART_X,
  WINDOW_DEFS,
  SPAWN_CLUSTERS,
} from '../maps/cabin'
import { texBoxProps } from '../textures'
import { HW, HD, WH, WT, WIN_SILL_H, WIN_LINTEL_H, WIN_LINTEL_Y, DOOR_H, DOOR_LINTEL_H, DOOR_LINTEL_Y, WALL, WALL2, BEAM, WOOD, WOOD2, PLANK, METAL, ROOF, FOREST_FLOOR, PITCH, Box } from './shared'

// ─── Window / door fills ────────────────────────────────────────────────────

function WindowFill({ cx, cz, isXWall }) {
  const sillY = WIN_SILL_H / 2
  const lintY = WIN_LINTEL_Y
  const w = WIN_HALF * 2
  const [sw, sd] = isXWall ? [w, WT] : [WT, w]
  return (
    <>
      <Box position={[cx, sillY, cz]} args={[sw, WIN_SILL_H,   sd]} color={WALL} castShadow />
      <Box position={[cx, lintY, cz]} args={[sw, WIN_LINTEL_H, sd]} color={WALL} castShadow />
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
  return <Box position={[cx, DOOR_LINTEL_Y, cz]} args={[sw, DOOR_LINTEL_H, sd]} color={WALL} castShadow />
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
      <mesh position={[x + 0.10, dH / 2, cz]} rotation={[Math.atan2(dH, dW), 0, 0]} castShadow {...texBoxProps([0.05, Math.hypot(dH, dW) - 0.1, 0.07], 'wood', WOOD2, 0.98)} />

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
      <mesh position={[x - 0.01, WH * 0.42, cz]} rotation={[ 0.55, 0, 0]} castShadow {...texBoxProps([0.07, hw * 2.8, 0.10], 'wood', PLANK, 0.98)} />
      <mesh position={[x - 0.03, WH * 0.42, cz]} rotation={[-0.55, 0, 0]} castShadow {...texBoxProps([0.07, hw * 2.8, 0.10], 'wood', PLANK, 0.98)} />
      {/* Horizontal braces */}
      <mesh position={[x - 0.02, WH * 0.28, cz]} castShadow {...texBoxProps([0.07, 0.10, hw * 2.2], 'wood', PLANK, 0.98)} />
      <mesh position={[x - 0.02, WH * 0.62, cz]} castShadow {...texBoxProps([0.07, 0.10, hw * 2.2], 'wood', PLANK, 0.98)} />

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
          {/* Shared geometry + material (wood / metal textures) - nothing allocated per plank */}
          <mesh castShadow {...texBoxProps(args, 'wood', isStrong ? '#2a1a06' : PLANK_CLR_BOARD, 0.95)} />
          {isStrong && STRIPE_OFFSETS.map((off, j) => (
            <mesh key={j} position={isNS ? [off, 0, 0] : [0, 0, off]} {...texBoxProps(stripeArgs, 'metal', STRIPE_CLR, 0.2, 0.85)} />
          ))}
        </group>
      ))}
    </>
  )
}

export function WindowPlanks() {
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

export function CeilingBeams() {
  const y = WH - 0.14
  const bh = 0.22   // beam height (Y)
  const bd = 0.18   // beam depth (Z or X thickness)
  return (
    <group>
      {/* Main room — beams run E-W (along X), spaced in Z */}
      {[-8, -4.5, -1, 2.5, 6, 9.5].map((z) => (
        <Box key={z} position={[3.5, y, z]} args={[11, bh, bd]} color={BEAM} roughness={1} />
      ))}
      {/* Bedroom — beams run E-W */}
      {[-8.5, -6.5].map((z) => (
        <Box key={z} position={[-5.5, y, z]} args={[7, bh, bd]} color={BEAM} roughness={1} />
      ))}
      {/* Hall — beams run E-W */}
      {[-1.5, 1.5, 4].map((z) => (
        <Box key={z} position={[-5.5, y, z]} args={[7, bh, bd]} color={BEAM} roughness={1} />
      ))}
      {/* Kitchen — beams run E-W */}
      {[6.5, 8.5].map((z) => (
        <Box key={z} position={[-5.5, y, z]} args={[7, bh, bd]} color={BEAM} roughness={1} />
      ))}
    </group>
  )
}

// ─── Wall sections ────────────────────────────────────────────────────────────

export function NorthWall() {
  const z = -HD
  return (
    <group>
      {/* Bedroom section: two windows at X=-7 and X=-4 */}
      <Box position={[-8.5, WH/2, z]} args={[1,  WH, WT]} color={WALL} castShadow />
      <Box position={[-5.5, WH/2, z]} args={[1,  WH, WT]} color={WALL} castShadow />
      <Box position={[-2.5, WH/2, z]} args={[1,  WH, WT]} color={WALL} castShadow />
      <WindowFill cx={-7} cz={z} isXWall />
      <WindowFill cx={-4} cz={z} isXWall />
      <WindowFrame cx={-7} cz={z + WT / 2} isXWall />
      <WindowFrame cx={-4} cz={z + WT / 2} isXWall />
      {/* Main room section: solid */}
      <Box position={[3.5, WH/2, z]} args={[11, WH, WT]} color={WALL} castShadow />
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

export function SouthWall() {
  const z = HD
  return (
    <group>
      {/* Kitchen: window at X=-5 */}
      <Box position={[-7.5, WH/2, z]} args={[3, WH, WT]} color={WALL} castShadow />
      <Box position={[  -3, WH/2, z]} args={[2, WH, WT]} color={WALL} castShadow />
      <WindowFill cx={-5} cz={z} isXWall />
      <WindowFrame cx={-5} cz={z - WT / 2} isXWall />
      {/* Main room: window at X=+4 */}
      <Box position={[0.5, WH/2, z]} args={[5, WH, WT]} color={WALL} castShadow />
      <Box position={[  7, WH/2, z]} args={[4, WH, WT]} color={WALL} castShadow />
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

export function EastWall() {
  const x = HW
  return (
    <group>
      <Box position={[x, WH/2, -5.5]} args={[WT, WH, 9]} color={WALL} castShadow />
      <Box position={[x, WH/2, +5.5]} args={[WT, WH, 9]} color={WALL} castShadow />
      <WindowFill cx={x} cz={0} isXWall={false} />
      <WindowFrame cx={x - WT / 2} cz={0} isXWall={false} />
      {[0.55, 1.10, 1.65, 2.20, 2.75].map((y) => (
        <Box key={y} position={[x - WT / 2 - 0.005, y, 0]} args={[0.012, 0.018, 20]} color={WALL2} castShadow={false} />
      ))}
    </group>
  )
}

export function WestWall() {
  const x = -HW
  return (
    <group>
      {/* Bedroom: solid */}
      <Box position={[x, WH/2,   -7]} args={[WT, WH,   6]} color={WALL} castShadow />
      {/* Hall: north of door */}
      <Box position={[x, WH/2, -2.6]} args={[WT, WH, 2.8]} color={WALL} castShadow />
      {/* Hall: column between door and window */}
      <Box position={[x, WH/2, 1.35]} args={[WT, WH, 0.3]} color={WALL} castShadow />
      {/* Hall: south of window */}
      <Box position={[x, WH/2, 4.25]} args={[WT, WH, 1.5]} color={WALL} castShadow />
      <WindowFill cx={x} cz={2.5} isXWall={false} />
      <WindowFrame cx={x + WT / 2} cz={2.5} isXWall={false} />
      <BarricadedDoor />
      {/* Kitchen: solid */}
      <Box position={[x, WH/2,  7.5]} args={[WT, WH,   5]} color={WALL} castShadow />
      {/* Clapboards on interior face */}
      {[0.55, 1.10, 1.65, 2.20, 2.75].map((y) => (
        <Box key={y} position={[x + WT / 2 + 0.005, y, 0]} args={[0.012, 0.018, 20]} color={WALL2} castShadow={false} />
      ))}
    </group>
  )
}

export function BedroomHallWall() {
  const z = PART_Z_BH
  return (
    <group>
      <Box position={[  -8, WH/2, z]} args={[2, WH, WT]} color={WALL} castShadow />
      <Box position={[-3.5, WH/2, z]} args={[3, WH, WT]} color={WALL} castShadow />
      <DoorwayFill cx={-6} cz={z} halfW={1} isXWall />
      <DoorwayFrame cx={-6} cz={z} halfW={1} isXWall />
    </group>
  )
}

export function HallKitchenWall() {
  const z = PART_Z_HK
  return (
    <group>
      <Box position={[-7.5, WH/2, z]} args={[3, WH, WT]} color={WALL} castShadow />
      <Box position={[  -3, WH/2, z]} args={[2, WH, WT]} color={WALL} castShadow />
      <DoorwayFill cx={-5} cz={z} halfW={1} isXWall />
      <DoorwayFrame cx={-5} cz={z} halfW={1} isXWall />
    </group>
  )
}

export function WestMainWall() {
  const x = PART_X
  return (
    <group>
      <Box position={[x, WH/2,   -9]} args={[WT, WH,  2]} color={WALL} castShadow />
      <Box position={[x, WH/2,   -5]} args={[WT, WH,  2]} color={WALL} castShadow />
      <Box position={[x, WH/2, -2.5]} args={[WT, WH,  3]} color={WALL} castShadow />
      <Box position={[x, WH/2,    3]} args={[WT, WH,  4]} color={WALL} castShadow />
      <Box position={[x, WH/2,  7.5]} args={[WT, WH,  5]} color={WALL} castShadow />
      <DoorwayFill cx={x} cz={-7} halfW={1} isXWall={false} />
      <DoorwayFrame cx={x} cz={-7} halfW={1} isXWall={false} />
      <DoorwayFill cx={x} cz={ 0} halfW={1} isXWall={false} />
      <DoorwayFrame cx={x} cz={ 0} halfW={1} isXWall={false} />
    </group>
  )
}

// ─── Roof ────────────────────────────────────────────────────────────────────

export function Roof() {
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
      <mesh position={[panelCX, panelCY, 0]} rotation={[0, 0, -angle]} {...texBoxProps([panelW, 0.22, panelLen], 'shingle', ROOF, 1)} />

      {/* Left slope */}
      <mesh position={[-panelCX, panelCY, 0]} rotation={[0, 0, angle]} {...texBoxProps([panelW, 0.22, panelLen], 'shingle', ROOF, 1)} />

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


// ─── Forest spawn thickets ───────────────────────────────────────────────────

const THICKET_TREE_OFFSETS = [
  [-6.4,  0.1,  5.3, 0.48],
  [-5.5,  2.6,  7.1, 0.66],
  [-4.4, -1.4,  5.8, 0.54],
  [-3.4,  1.25, 6.8, 0.62],
  [-2.4,  3.3,  7.6, 0.72],
  [-1.4, -0.7,  6.1, 0.58],
  [-0.4,  1.65, 7.9, 0.76],
  [ 0.7, -1.45, 5.7, 0.54],
  [ 1.6,  0.85, 6.9, 0.64],
  [ 2.5,  3.45, 8.1, 0.78],
  [ 3.6, -0.65, 6.2, 0.58],
  [ 4.7,  1.85, 7.3, 0.68],
  [ 5.8, -1.15, 5.2, 0.5],
  [ 6.7,  2.45, 6.5, 0.6],
]
const THICKET_PATCHES = [
  [0, 1.0, 14.8, 5.7, 0],
  [-4.6, 2.85, 6.6, 3.8, -0.2],
  [4.4, 2.95, 6.8, 4.0, 0.22],
  [-5.9, -0.35, 4.8, 2.5, 0.14],
  [5.9, -0.25, 4.6, 2.4, -0.12],
  [-1.1, 4.35, 7.4, 2.8, 0.08],
  [2.0, -1.65, 6.5, 2.1, -0.08],
]
const THICKET_BRUSH_OFFSETS = [
  [-7.0, -1.15, 0.88, -0.45],
  [-6.2,  0.75, 1.12,  0.4],
  [-5.1,  2.8,  1.0, -0.32],
  [-4.1, -0.55, 1.18,  0.36],
  [-3.1,  1.45, 0.96, -0.38],
  [-2.2,  3.65, 1.2,   0.28],
  [-1.2, -1.4,  1.05, -0.28],
  [-0.3,  0.6,  1.16,  0.42],
  [ 0.8,  2.8,  0.94, -0.35],
  [ 1.8, -0.95, 1.12,  0.44],
  [ 2.8,  1.15, 0.92, -0.28],
  [ 3.8,  3.45, 1.22,  0.34],
  [ 4.8, -0.45, 1.02, -0.42],
  [ 5.8,  1.6,  1.18,  0.32],
  [ 6.8, -1.05, 0.9,  -0.36],
]

function edgeRotation(edge) {
  if (edge === 'N') return 0
  if (edge === 'S') return Math.PI
  if (edge === 'E') return Math.PI / 2
  return -Math.PI / 2
}

function SpawnThicket({ cluster, index }) {
  const rotation = edgeRotation(cluster.edge)
  return (
    <group position={[cluster.x, 0, cluster.z]} rotation={[0, rotation, 0]}>
      {/* Dense, non-colliding patches mark the full treeline zone zombies emerge from. */}
      {THICKET_PATCHES.map(([x, z, w, d, rot], i) => (
        <Box
          key={i}
          position={[x, 0.04, z]}
          args={[w, 0.08, d]}
          color={i === 0 ? FOREST_FLOOR : '#030807'}
          rotation={[0, rot, 0]}
          castShadow={false}
          receiveShadow={false}
        />
      ))}
      {THICKET_TREE_OFFSETS.map(([x, z, h, scale], i) => (
        <group key={i} position={[x, 0, z - 0.3 * (index % 2)]}>
          <mesh position={[0, h * 0.36, 0]}>
            <cylinderGeometry args={[0.09 * scale, 0.16 * scale, h * 0.72, 5]} />
            <meshStandardMaterial color={i % 2 ? '#050a08' : '#030706'} roughness={1} />
          </mesh>
          <mesh position={[0, h * 0.76, 0]}>
            <coneGeometry args={[1.15 * scale, h * 0.58, 5]} />
            <meshStandardMaterial color={i % 2 ? '#03100d' : '#020b09'} roughness={1} />
          </mesh>
          <mesh position={[0, h * 0.52, 0]}>
            <coneGeometry args={[1.45 * scale, h * 0.54, 5]} />
            <meshStandardMaterial color="#010605" roughness={1} />
          </mesh>
        </group>
      ))}
      {THICKET_BRUSH_OFFSETS.map(([x, z, h, rot], i) => (
        <group key={i} position={[x, 0.22, z]} rotation={[0, 0, rot]}>
          <Box position={[0, h * 0.22, 0]} args={[0.12, h, 0.12]} color={FOREST_FLOOR} />
          <Box position={[0.2, h * 0.34, 0.02]} args={[0.08, h * 0.85, 0.08]} color="#030807" rotation={[0, 0, -0.7]} />
          <Box position={[-0.2, h * 0.31, -0.02]} args={[0.08, h * 0.78, 0.08]} color="#030807" rotation={[0, 0, 0.65]} />
        </group>
      ))}
    </group>
  )
}

export function ForestSpawnThickets() {
  return (
    <group>
      {SPAWN_CLUSTERS.map((cluster, index) => (
        <SpawnThicket key={`${cluster.edge}-${index}`} cluster={cluster} index={index} />
      ))}
    </group>
  )
}

