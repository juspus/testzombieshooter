import * as THREE from 'three'
import { PART_X } from '../maps/cabin'
import { texPlaneProps } from '../textures'
import { HW, HD, WH, WT, FLOOR, CEIL, METAL, COPPER, FOREST_FLOOR, Box } from '../arena/shared'
import CabinFurniture from '../components/Furniture'
import StaticBake from '../components/StaticBake'
import ArenaLighting from '../arena/lighting'
import { WindowPlanks, CeilingBeams, NorthWall, SouthWall, EastWall, WestWall, BedroomHallWall, HallKitchenWall, WestMainWall, Roof, ForestSpawnThickets } from '../arena/shell'
import { Fireplace, Candle, DeerHead, RockingChair, Bookshelf, OldDesk, FloorRug, Bed, Nightstand, CellarDoor, WoodStove, KitchenTable, Chest, WallLantern } from '../arena/props'
// Cabin props the model playground shows on their own (src/playground/registry.js)
export { Candle, DeerHead, RockingChair, Bookshelf, OldDesk, FloorRug, Bed, Nightstand, CellarDoor, WoodStove, KitchenTable, Chest, WallLantern } from '../arena/props'

// ─── Arena export ────────────────────────────────────────────────────────────

export default function Arena() {
  return (
    <group>
      <ArenaLighting />

      {/* Window planks follow the store: they stay out of the bake. */}
      <WindowPlanks />

      {/* Everything below never moves: merged per material once after mount (staticMerge.js). */}
      <StaticBake>
      {/* ── Floor ────────────────────────────────────────────────────────── */}
      {/* Plank seams are baked into the wood texture (replaces the old FloorPlanks strip meshes) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow {...texPlaneProps(HW * 2, HD * 2, 'wood', FLOOR, 0.98)} />

      {/* ── Exterior ground ──────────────────────────────────────────────── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={FOREST_FLOOR} roughness={1} />
      </mesh>

      <ForestSpawnThickets />

      {/* ── Ceiling ──────────────────────────────────────────────────────── */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WH, 0]} {...texPlaneProps(HW * 2, HD * 2, 'wood', CEIL, 1, 0, THREE.BackSide)} />
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

      {/* ── Atmosphere ───────────────────────────────────────────────────── */}
      <CabinFurniture />

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
      <WoodStove position={[-8.3, 0, 7.7]} rotation={[0, Math.PI / 2, 0]} />
      <KitchenTable position={[-3.4, 0, 6.4]} />
      <WallLantern position={[-HW + WT, 1.8, 7.5]} rotation={[0, Math.PI / 2, 0]} />
      {/* Hanging pots */}
      <mesh position={[-5.5, WH - 0.45, 6.5]}>
        <cylinderGeometry args={[0.10, 0.12, 0.20, 7]} />
        <meshStandardMaterial color={COPPER} roughness={0.8} metalness={0.2} />
      </mesh>
      <mesh position={[-7, WH - 0.45, 7]}>
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
      </StaticBake>
    </group>
  )
}

