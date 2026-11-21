import {
  CABIN_HW,
  CABIN_HD,
  WALL_H,
  WALL_T,
  WIN_Y0,
  WIN_Y1,
} from '../maps/cabin'
import { texBoxProps } from '../textures'

export const HW = CABIN_HW
export const HD = CABIN_HD
export const WH = WALL_H
export const WT = WALL_T

export const WIN_SILL_H   = WIN_Y0
export const WIN_LINTEL_H = WH - WIN_Y1
export const WIN_LINTEL_Y = WIN_Y1 + WIN_LINTEL_H / 2

export const DOOR_H        = 2.2
export const DOOR_LINTEL_H = WH - DOOR_H
export const DOOR_LINTEL_Y = DOOR_H + DOOR_LINTEL_H / 2

// ─── Color palette ─────────────────────────────────────────────────────────
export const WALL    = '#2a1608'   // Dark weathered timber
export const WALL2   = '#1e1006'   // Darker panel variant
export const FLOOR   = '#1a0e06'   // Rotting floorboards
export const CEIL    = '#0e0804'   // Black ceiling
export const BEAM    = '#1a0c04'   // Ceiling beam
export const STONE   = '#2c2218'   // Fieldstone
export const STONE2  = '#1e1810'   // Darker stone
export const ASH     = '#181614'   // Cold ash
export const FIREBOX = '#1a0400'   // Firebox back (absorbs light)
export const WOOD    = '#221408'   // Furniture wood
export const WOOD2   = '#160e04'   // Very dark wood
export const PLANK   = '#0e0803'   // Barricade planks
export const METAL   = '#252018'   // Rusted iron
export const BONE    = '#c0ae80'   // Bone / old ivory
export const BOOK_R  = '#3d0a0a'   // Cracked red leather
export const BOOK_G  = '#0a1e0a'   // Dark green cloth
export const BOOK_B  = '#08101e'   // Dark blue leather
export const NECRO   = '#2e1808'   // Necronomicon cover (bound in hide)
export const LINEN   = '#1e1810'   // Grimy linen / bedding
export const IRON    = '#1a1614'   // Old iron frame
export const COPPER  = '#3a2410'   // Tarnished copper (kettle / pots)
export const RUG1    = '#2a0808'   // Rug dark red
export const RUG2    = '#180808'   // Rug almost black
export const ROOF    = '#1e0e04'   // Dark weathered shingles
export const FOREST_FLOOR = '#020605' // Exterior grass/leaf bed blends into spawn thickets

export const PITCH   = 2.8         // Roof height above wall top

// Surface texture kind per palette colour (src/textures.js). A Box picks its
// texture from its colour so the flat palette keeps setting hue/mood; pass
// tex={false} to force flat, or tex="kind" to override. Emissive boxes stay flat.
const KIND_BY_COLOR = {
  [WALL]: 'timber', [WALL2]: 'timber',
  [BEAM]: 'wood', [WOOD]: 'wood', [WOOD2]: 'wood', [PLANK]: 'wood',
  [STONE]: 'stone', [STONE2]: 'stone',
  [RUG1]: 'fabric', [RUG2]: 'fabric', [LINEN]: 'fabric',
  [IRON]: 'metal', [METAL]: 'metal',
  [ROOF]: 'shingle',
}

export function Box({ position, args, color, roughness = 0.95, metalness = 0, castShadow = false, receiveShadow = true, rotation, emissive, emissiveIntensity = 0, tex }) {
  const kind = emissive || tex === false ? null : (tex || KIND_BY_COLOR[color])
  if (kind) {
    return <mesh position={position} castShadow={castShadow} receiveShadow={receiveShadow} rotation={rotation} {...texBoxProps(args, kind, color, roughness, metalness)} />
  }
  return (
    <mesh position={position} castShadow={castShadow} receiveShadow={receiveShadow} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive} emissiveIntensity={emissiveIntensity} />
    </mesh>
  )
}

