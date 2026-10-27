import { useEffect, useMemo } from 'react'
import { WALL_H } from '../maps/cabin'
import { makeBuilder, mergeParts, placed } from '../furnitureParts'
import * as P from '../furniturePieces'

// Static cabin furniture. Each room is baked into one merged mesh per surface kind
// (see furnitureParts.js): no per-box meshes, no shadows, no lights. The
// colliders for the big pieces live in maps/cabin.js (FURNITURE_COLLIDERS).

const PI = Math.PI
const WH = WALL_H
const CEIL_WEB = WH - 0.05

function Merged({ parts, position, rotation }) {
  const meshes = useMemo(() => mergeParts(parts), [parts])
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes])
  return (
    <group position={position} rotation={rotation}>
      {meshes.map((m) => (
        <mesh key={m.kind} geometry={m.geometry} material={m.material}
          receiveShadow={m.kind !== 'glow' && m.kind !== 'web'} renderOrder={m.kind === 'web' ? 2 : 0} />
      ))}
    </group>
  )
}

// Wrap one piece function as a prop component (playground + ad-hoc use).
const prop = (piece, ...args) => function FurnitureProp({ position, rotation }) {
  const parts = useMemo(() => { const o = []; piece(makeBuilder(o), ...args); return o }, [])
  return <Merged parts={parts} position={position} rotation={rotation} />
}

export const Sofa = prop(P.sofa)
export const Armchair = prop(P.armchair)
export const DiningChair = prop(P.diningChair, 0)
export const BrokenChair = prop(P.brokenChair)
export const PorchBench = prop(P.bench)
export const Wardrobe = prop(P.wardrobe)
export const Dresser = prop(P.dresser)
export const GrandfatherClock = prop(P.grandfatherClock)
export const OldFridge = prop(P.fridge)
export const KitchenCounter = prop(P.counter)
export const WallCupboards = prop(P.wallCupboards)
export const JarShelf = prop(P.jarShelf)
export const KeroseneLamp = prop(P.kerosene)
export const BookTable = prop(P.consoleTable, true)
export const ShotgunRack = prop(P.shotgunRack)
export const WallClock = prop(P.wallClock)
export const CrackedMirror = prop(P.crackedMirror)
export const WallPhotos = prop(P.photos)
export const CoatHooks = prop(P.coatHooks)
export const FirewoodStack = prop(P.firewood)
export const ChoppingBlock = prop(P.chopBlock)
export const Trunk = prop(P.trunk)

// ─── room sets ──────────────────────────────────────────────────────────────

function mainRoom() {
  const o = []
  placed(o, P.sofa, 3.8, 0, -6.2, PI)
  placed(o, P.armchair, 1.9, 0, -6.2, 2.6)
  placed(o, P.sideTable, 5.35, 0, -6.1, -0.2)
  placed(o, P.kerosene, 5.35, 0.54, -6.1)
  placed(o, P.consoleTable, 8.42, 0, -2.3, -PI / 2, true)
  placed(o, P.crackedMirror, 8.69, 1.55, -2.3, -PI / 2)
  placed(o, P.photos, -1.69, 1.5, 2.4, PI / 2)
  placed(o, P.crackedMirror, -1.69, 1.5, 4.05, PI / 2)
  placed(o, P.wallClock, 0.6, 2.3, -9.69, 0)
  placed(o, P.shotgunRack, 6.9, 2.1, -9.69, 0)
  placed(o, P.firewood, 1.7, 0, -9.45, 0)
  placed(o, P.bench, 0.9, 0, 9.45, PI)
  placed(o, P.chopBlock, 8.15, 0, 8.85)
  placed(o, P.brokenChair, 1.3, 0, 4.2, 0.6)
  placed(o, P.papers, 3.0, 0, 3.5, 0.3)
  placed(o, P.papers, 6.3, 0, -1.2, 1.2)
  placed(o, P.bookPile, -1.2, 0, -4.4, 0)
  placed(o, P.floorStain, 5.0, 0, 2.5, 0)
  placed(o, P.floorStain, 1.0, 0, -2.0, 1.0, 0.8)
  placed(o, P.candleStub, 2.9, 0, -8.6)
  placed(o, P.candleStub, 0.4, 0, -9.3)
  for (const [x, z, sx, sz] of [[-1.7, -9.7, 0.9, 0.9], [8.7, -9.7, -1.0, 0.8], [-1.7, 9.7, 0.8, -1.0], [8.7, 9.7, -0.9, -0.9]]) {
    makeBuilder(o).web(x, CEIL_WEB, z, sx, sz)
  }
  makeBuilder(o).web(4.0, CEIL_WEB, 9.7, 1.1, -0.7)
  return o
}

function hall() {
  const o = []
  placed(o, P.grandfatherClock, -8.54, 0, 4.15, PI / 2)
  placed(o, P.consoleTable, -2.5, 0, 2.0, -PI / 2, false)
  placed(o, P.crackedMirror, -2.31, 1.55, 2.0, -PI / 2)
  placed(o, P.coatHooks, -3.5, 1.7, -3.69, 0)
  placed(o, P.umbrellaStand, -2.75, 0, -3.35)
  placed(o, P.boots, -4.1, 0, -3.35, 0.4)
  placed(o, P.photos, -7.5, 1.55, 4.69, PI)
  placed(o, P.runner, -5.5, 0, -1.2, 0)
  placed(o, P.papers, -6.5, 0, 3.4, 0.8)
  placed(o, P.floorStain, -7.4, 0, 0.3, 0.5, 0.7)
  for (const [x, z, sx, sz] of [[-8.7, -3.7, 0.8, 0.8], [-2.3, -3.7, -0.7, 0.7], [-8.7, 4.7, 0.9, -0.7], [-2.3, 4.7, -0.8, -0.8]]) {
    makeBuilder(o).web(x, CEIL_WEB, z, sx, sz)
  }
  return o
}

function bedroom() {
  const o = []
  placed(o, P.bedStains, -5.5, 0, -8.2)
  placed(o, P.wardrobe, -3.2, 0, -4.58, PI)
  placed(o, P.dresser, -7.9, 0, -4.53, PI)
  placed(o, P.crackedMirror, -7.9, 1.6, -4.31, PI)
  placed(o, P.kerosene, -7.6, 0.88, -4.55)
  placed(o, P.trunk, -8.45, 0, -7.45, PI / 2)
  placed(o, P.photos, -8.69, 1.7, -7.4, PI / 2)
  placed(o, P.floorStain, -4.4, 0, -6.1, 0.2)
  placed(o, P.papers, -3.6, 0, -7.0, 2.0)
  placed(o, P.candleStub, -3.3, 0, -9.3)
  for (const [x, z, sx, sz] of [[-8.7, -9.7, 1.0, 0.9], [-2.3, -9.7, -0.8, 0.8], [-8.7, -4.3, 0.7, -0.7], [-2.3, -4.3, -0.9, -0.8]]) {
    makeBuilder(o).web(x, CEIL_WEB, z, sx, sz)
  }
  return o
}

function kitchen() {
  const o = []
  placed(o, P.counter, -2.62, 0, 8.0, -PI / 2, 1.6)
  placed(o, P.wallCupboards, -2.47, 1.7, 8.0, -PI / 2, 1.6)
  placed(o, P.fridge, -3.1, 0, 9.36, PI)
  placed(o, P.jarShelf, -7.2, 1.35, 9.69, PI, 1.6)
  placed(o, P.diningChair, -3.4, 0, 5.78, 0, 0)
  placed(o, P.diningChair, -4.5, 0, 6.4, PI / 2, 1)
  placed(o, P.brokenChair, -4.1, 0, 7.3, 2.2)
  placed(o, P.floorStain, -5.0, 0, 8.4, 0.3, 0.8)
  placed(o, P.papers, -6.8, 0, 6.2, 1.0)
  for (const [x, z, sx, sz] of [[-8.7, 5.3, 0.9, 0.8], [-2.3, 5.3, -0.7, 0.7], [-8.7, 9.7, 1.0, -0.9], [-2.3, 9.7, -0.7, -0.8]]) {
    makeBuilder(o).web(x, CEIL_WEB, z, sx, sz)
  }
  return o
}

export default function CabinFurniture() {
  const sets = useMemo(() => [mainRoom(), hall(), bedroom(), kitchen()], [])
  return (
    <group>
      {sets.map((parts, i) => <Merged key={i} parts={parts} />)}
    </group>
  )
}
