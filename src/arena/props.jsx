import { lightReg } from '../components/LivingLights'
import { CHEST_POS } from '../maps/cabin'
import { texBoxProps } from '../textures'
import { HD, WT, STONE, STONE2, ASH, FIREBOX, WOOD, WOOD2, METAL, BONE, BOOK_R, BOOK_G, BOOK_B, NECRO, LINEN, IRON, COPPER, RUG1, RUG2, Box } from './shared'

// ─── Fireplace ───────────────────────────────────────────────────────────────

export function Fireplace() {
  // Against north wall of main room at X=4
  const fx  = 4
  const fzW = -HD + WT / 2 + 0.01   // interior face of north wall

  return (
    <group>
      {/* Hearth stone floor */}
      <Box position={[fx, 0.025, fzW + 0.45]} args={[2.8, 0.05, 1.0]} color={STONE} roughness={1} receiveShadow castShadow={false} />

      {/* Left stone pillar */}
      <Box position={[fx - 1.15, 1.3, fzW + 0.18]} args={[0.38, 2.6, 0.42]} color={STONE} roughness={1} castShadow />
      {/* Right stone pillar */}
      <Box position={[fx + 1.15, 1.3, fzW + 0.18]} args={[0.38, 2.6, 0.42]} color={STONE} roughness={1} castShadow />
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
      <mesh position={[fx - 0.22, 0.32, fzW + 0.14]} rotation={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 1.1, 5]} />
        <meshStandardMaterial color="#0e0400" roughness={1} />
      </mesh>
      <mesh position={[fx + 0.18, 0.28, fzW + 0.16]} rotation={[0, -0.3, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 1.0, 5]} />
        <meshStandardMaterial color="#0a0300" roughness={1} />
      </mesh>
      <mesh position={[fx, 0.38, fzW + 0.10]} rotation={[0, 0, 0]}>
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
      <pointLight ref={(o) => { lightReg.fire = o }} position={[fx, 0.8, fzW + 0.4]} color="#ff5500" intensity={30} distance={20} decay={2} />
      <pointLight ref={(o) => { lightReg.fire2 = o }} position={[fx, 0.3, fzW + 0.2]} color="#ff2200" intensity={8}  distance={6}  decay={2} />
    </group>
  )
}

// ─── Small props ─────────────────────────────────────────────────────────────

export function Candle({ position }) {
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

export function DeerHead({ position }) {
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

export function RockingChair({ position, rotation }) {
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

export function Bookshelf({ position, rotation }) {
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

export function OldDesk({ position, rotation }) {
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

export function FloorRug({ position, args }) {
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

export function Bed({ position }) {
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

export function Nightstand({ position }) {
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

export function CellarDoor({ position }) {
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

export function WoodStove({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Body */}
      <Box position={[0, 0.44, 0]} args={[0.52, 0.88, 0.44]} color="#1a1612" roughness={0.8} metalness={0.2} tex="metal" />
      {/* Top plate */}
      <Box position={[0, 0.90, 0]} args={[0.56, 0.06, 0.48]} color="#131210" roughness={0.7} metalness={0.3} tex="metal" />
      {/* Firebox door */}
      <Box position={[0, 0.35, 0.23]} args={[0.28, 0.30, 0.03]} color="#222018" roughness={0.8} metalness={0.2} tex="metal" />
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

export function KitchenTable({ position }) {
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

export function Chest({ position = [CHEST_POS.x, 0, CHEST_POS.z] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow {...texBoxProps([0.9, 0.44, 0.55], 'wood', '#2a1408', 0.95)} />
      <mesh position={[0, 0.49, -0.04]} castShadow {...texBoxProps([0.9, 0.13, 0.5], 'wood', '#361a0a', 0.9)} />
      <mesh position={[0, 0.22, 0.278]} {...texBoxProps([0.92, 0.44, 0.02], 'metal', METAL, 0.5, 0.6)} />
      <mesh position={[0, 0.22, -0.278]} {...texBoxProps([0.92, 0.44, 0.02], 'metal', METAL, 0.5, 0.6)} />
      <mesh position={[0, 0.3, 0.285]}>
        <boxGeometry args={[0.13, 0.11, 0.04]} />
        <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  )
}

// ─── Wall lanterns ───────────────────────────────────────────────────────────

export function WallLantern({ position, rotation }) {
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

