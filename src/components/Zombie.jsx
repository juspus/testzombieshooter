import { runRandom, keyedRandom } from '../rng'
import { memo, useRef, useEffect, useState, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { time } from '../timeScale'
import { getZombieArchetype, useGameStore } from '../store'
import Player from './Player'
import { findPath, isBlocked, collidesWithWalls } from '../walls'
import { getMap, getInitialMapId } from '../maps'
import { playZombieFootstep, playPlankHit, playScreamerScreech } from '../sounds'
import { playZombieGroan } from '../sounds'

// Map is chosen once (debug ?map= param) and fixed for the whole session.
const ACTIVE_MAP = getMap(getInitialMapId())
const { WINDOW_DEFS, HW: CABIN_HW, HD: CABIN_HD, windowBlockSegment } = ACTIVE_MAP
import { getRemotePlayerPos } from './RemotePlayer'
import BloodFX from './BloodFX'
import { getZombieVariant, getVariantColors, SHIRTS, PANTS, TONES } from '../zombieVariant'
import * as THREE from 'three'
// Wave 3 special archetypes (exploder / spitter / armored)
import { EXPLODER, SPITTER, burstPlayerDamage, burstZombieDamage, burstPlankHits, globFlightTime } from '../zombieSpecials'
import { raycastWorld } from '../worldRay'
import { modFx } from '../modifiers'
import { spawnImpact } from '../impactParticles'
import SpecialFX from './SpecialFX'
import { playExploderHiss, playExplosion, playSpitWindup, playSpitLaunch } from '../sounds'
import { send, isConnected } from '../net'

const _geoCache = new Map()
function bg(x, y, z) {
  const k = `${x},${y},${z}`
  if (!_geoCache.has(k)) _geoCache.set(k, new THREE.BoxGeometry(x, y, z))
  return _geoCache.get(k)
}

const _matCache = new Map()
function sm(color, roughness = 1, metalness = 0, emissive = null, emissiveIntensity = 0) {
  const key = `${color}|${roughness}|${metalness}|${emissive ?? ''}|${emissiveIntensity}`
  if (!_matCache.has(key)) {
    _matCache.set(key, new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive: emissive ?? undefined,
      emissiveIntensity,
    }))
  }
  return _matCache.get(key)
}

const _screamerAuraTexture = (() => {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.10, size / 2, size / 2, size * 0.5)
    grad.addColorStop(0, 'rgba(130,70,220,0.65)')
    grad.addColorStop(0.45, 'rgba(130,70,220,0.28)')
    grad.addColorStop(0.78, 'rgba(130,70,220,0.08)')
    grad.addColorStop(1, 'rgba(130,70,220,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
})()

function cg(rt, rb, h, segs = 6) {
  const k = `${rt},${rb},${h},${segs}`
  if (!_geoCache.has(k)) _geoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, segs))
  return _geoCache.get(k)
}

const ZOMBIE_HEIGHT = 1.8
const DEATH_DURATION = 0.75
// Reused quaternion for death slerp — written and consumed within a single zombie's useFrame
const _deathTmpQuat = new THREE.Quaternion()
const _deathTmpEuler = new THREE.Euler()
const ARENA_BOUND = 18.5
const ZOMBIE_R = 0.30             // physical collision radius
const PATH_INTERVAL = 0.12        // seconds between A* recalculations
const WAYPOINT_REACH = 0.6        // distance to advance to next waypoint
const ATTACK_RANGE = 1.8          // distance to window face to start hitting
const ATTACK_INTERVAL = 2.0       // seconds between plank/player hits
const PLAYER_ATTACK_RANGE = 1.0   // distance to local player to start hitting

// Reused movement direction vector — set and consumed within a single zombie's useFrame
const _moveDir = new THREE.Vector3()

// Module-level registry so Player can push holes into any zombie instance
const _holeAdders = {}
// Module-level registry so Player can ignite any zombie instance (flamethrower)
const _igniters = {}
// Position registry so zombies can compare distances to windows
const _zombieGroups = {}
// Guest-mode position corrections sent by host (id → { x, z })
const _guestPositions = {}

function Zombie() {}
Zombie.addBulletHole = (id, localPos, localNormal) => _holeAdders[id]?.(localPos, localNormal)
Zombie.ignite = (id) => _igniters[id]?.()
// Hit-reaction registry (flash / stagger / death style). Returns blood intensity:
// 0 = regular hit, 1 = kill, 2 = headshot/deagle kill.
const _hitReactors = {}
Zombie.hitReact = (id, dx, dy, dz, head, weapon, dist) => _hitReactors[id]?.(dx, dy, dz, head, weapon, dist) ?? 0

// ── Hit reactions ───────────────────────────────────────────────────────────
// Flash: zombie materials are shared across every zombie (sm() cache), so we can't
// pulse an emissive. Instead the hittable body meshes (those with userData.zombieId)
// briefly swap to ONE shared opaque basic material, then swap back. No per-zombie
// materials; the swap is ~75 property writes on hit and again on restore.
// It is warmed by the always-mounted hidden warmer zombie (see ZombieComponent).
const HIT_MAT = new THREE.MeshBasicMaterial({ color: '#ffd8cc' })
const FLASH_DURATION = 0.09
const LEAN_DURATION = 0.3
const HEAD_SNAP_DURATION = 0.26
const STAGGER_COOLDOWN = 0.55      // min gap between movement pauses (stops AK stun-lock)
const NECK_Y = 0.535               // head-snap pivot (neck height in head-group space)
let _flashOn = true
// Original materials of flashed meshes. A WeakMap, not userData: R3F replaces
// the userData object on every re-render (health change), which would drop it.
const _origMat = new WeakMap()
function _flashVisit(o) {
  if (!o.isMesh || o.userData.zombieId === undefined) return
  if (_flashOn) {
    if (o.material !== HIT_MAT) { _origMat.set(o, o.material); o.material = HIT_MAT }
  } else if (o.material === HIT_MAT) {
    // If React swapped the material during the flash (health colour change) the
    // mesh no longer holds HIT_MAT and is left alone.
    const m = _origMat.get(o)
    if (m) o.material = m
  }
}
function setFlash(group, on) { _flashOn = on; group.traverse(_flashVisit) }

// Corpse freeze: bake matrices, drop shadows, hide small decor meshes (teeth,
// aura discs, holes, fine head detail) to cut draw calls.
function _freezeVisit(o) {
  o.updateMatrix()
  o.matrixAutoUpdate = false
  if (o.isMesh) {
    o.castShadow = false
    if (o.userData.zombieId === undefined) o.visible = false
    else if (o.userData.isHead) {
      // the head alone is ~65 tiny meshes (teeth, eye sockets, flesh strips...):
      // keep only the bulky skull/jaw pieces on a corpse
      const gp = o.geometry.parameters
      if (gp && Math.max(gp.width ?? 0, gp.height ?? 0, gp.depth ?? 0) < 0.16) o.visible = false
    }
  }
}
function freezeCorpse(group) {
  group.updateMatrixWorld(true)
  group.traverse(_freezeVisit)
}

const DEATH_SHOTGUN_DURATION = 0.95
const DEATH_KNIFE_DURATION = 0.9
const _hq = new THREE.Quaternion()
const _hv = new THREE.Vector3()
const _hd = new THREE.Vector3()
const _axis = new THREE.Vector3()
const _smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// Shared flame materials/geometry — created once, additive-blended so they read as
// glowing fire without adding lighting cost. Visibility/scale toggled per-zombie.
const _flameGeo = (() => {
  const g = new THREE.ConeGeometry(0.16, 0.42, 6)
  g.translate(0, 0.21, 0)
  return g
})()
const _flameMatOuter = new THREE.MeshBasicMaterial({ color: '#ff7700', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
const _flameMatInner = new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending })
const BURN_VISUAL_DURATION = 1.0
const FLAME_OFFSETS = [
  [0, 0.30, 0.08],
  [0, 0.78, 0.05],
  [-0.18, 0.15, 0.05],
  [0.18, 0.15, 0.05],
]

// Called by NetManager on host to collect current zombie positions for broadcast
export function getZombiePositions() {
  const out = {}
  for (const [id, group] of Object.entries(_zombieGroups)) {
    out[id] = { x: group.position.x, z: group.position.z }
  }
  return out
}

// Called by NetManager on guest to apply host's authoritative positions
export function applyRemoteZombiePositions(posMap) {
  for (const [id, pos] of Object.entries(posMap)) {
    _guestPositions[id] = pos
  }
}

// Static zombie colors (shared across all instances)
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
const bloodBrt  = '#5a1210'
const hair      = '#141008'
const bone      = '#b8a882'
// Health-dependent colors — two pre-built objects, selected by health value
const _SKIN_NORMAL  = { skin: '#7d8c65', skinDark: '#5c6e4e', skinVein: '#4a5c3a', shirt: '#252520', shirtTear: '#1a1a15' }
const _SKIN_DAMAGED = { skin: '#6b7355', skinDark: '#4e5840', skinVein: '#3a4530', shirt: '#1e1e18', shirtTear: '#141410' }
const _TYPE_COLORS = {
  walker: { accent: '#665533', eye: eyeGlow },
  runner: { skin: '#8fa05a', skinDark: '#64723c', skinVein: '#8a2d1d', shirt: '#2a1f1a', shirtTear: '#1b120f', accent: '#d34a20', eye: '#ff3d00' },
  brute: { skin: '#6f715e', skinDark: '#4c4d40', skinVein: '#2e3326', shirt: '#241d24', shirtTear: '#151018', accent: '#8b2d18', eye: '#ff8a00' },
  screamer: { skin: '#6f6894', skinDark: '#494269', skinVein: '#39235b', shirt: '#21172b', shirtTear: '#140c1b', accent: '#9b4dff', eye: '#b26cff' },
  crawler: { skin: '#5f7b55', skinDark: '#3f5538', skinVein: '#263c28', shirt: '#171f17', shirtTear: '#0d130d', accent: '#7dbb58', eye: '#aaff66' },
  exploder: { skin: '#9aa14a', skinDark: '#6d7430', skinVein: '#c9731c', shirt: '#4a3a22', shirtTear: '#2c2214', accent: '#ff8a1a', eye: '#ffd23a' },
  armored: { skin: '#6b7a78', skinDark: '#48524f', skinVein: '#2e3836', shirt: '#1d2128', shirtTear: '#12151a', accent: '#5aa0d8', eye: '#ff5a1a' },
  spitter: { skin: '#6f8a4a', skinDark: '#4a6232', skinVein: '#8acf2a', shirt: '#2b3a22', shirtTear: '#1a2414', accent: '#9aff3a', eye: '#c6ff3a' },
  boss: { skin: '#8b4c43', skinDark: '#5b2d28', skinVein: '#2d0707', shirt: '#201010', shirtTear: '#120808', accent: '#ff2a1a', eye: '#ff1000' },
}

function getZombieColors(type, health, maxHealth) {
  const base = health <= Math.ceil(maxHealth / 2) ? _SKIN_DAMAGED : _SKIN_NORMAL
  return { ...base, ...(_TYPE_COLORS[type] ?? _TYPE_COLORS.walker) }
}

// Pre-create every shared variant material at module load (palette-sized: shirts +
// pants + tones x archetypes, all MeshStandardMaterial = the same shader program as
// the base look). Each dimension is walked independently, so this is ~100 materials,
// not the full cross product. ZombieBody never allocates a material while rendering.
// (sm() with the dominant roughness per slot; rarer roughness combos fill in lazily.)
;(function warmVariantMaterials() {
  const touch = (c) => {
    sm(c.shirt, 0.95); sm(c.shirtTear, 1); sm(c.pants, 0.95)
    sm(c.skin, 0.9); sm(c.skullBone, 0.85); sm(c.skullDark, 0.84)
  }
  for (const type of Object.keys(SHIRTS)) {
    for (const dmg of type === 'walker' ? [false, true] : [false]) {
      const base = getZombieColors(type, dmg ? 0 : 99, 99)
      const v = { shirt: 0, pants: 0, tone: 0 }
      SHIRTS[type].forEach((_, i) => touch(getVariantColors(type, { ...v, shirt: i }, base, dmg)))
      PANTS.forEach((_, i) => touch(getVariantColors(type, { ...v, pants: i }, base, dmg)))
      TONES.forEach((_, i) => touch(getVariantColors(type, { ...v, tone: i }, base, dmg)))
    }
  }
})()

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

// ── Wave 3 special archetypes: module helpers ───────────────────────────────
const BULLET_WALLS = ACTIVE_MAP.bulletWallSegments()
const MAP_WALL_H = ACTIVE_MAP.WALL_H ?? 3.2
const _spitWr = { dist: 0, nx: 0, ny: 0, nz: 0, kind: 0 }
const _burstUp = { x: 0, y: 1, z: 0 }
const _burstPt = { x: 0, y: 0.9, z: 0 }
// Spitter line of sight: mouth height -> player's chest, against the bullet wall list
// (window gaps are open; boarded planks do not block the acid).
function spitLOS(x1, z1, x2, z2) {
  const dx = x2 - x1, dy = 1.0 - 1.45, dz = z2 - z1
  const len = Math.hypot(dx, dy, dz) || 1
  return !raycastWorld(x1, 1.45, z1, dx / len, dy / len, dz / len, len - 0.2, BULLET_WALLS, MAP_WALL_H, null, null, 0, 0, 0, _spitWr)
}
const netEvent = (event, data) => { if (isConnected()) send('game_event', { event, data }) }

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

// `seed` (default: id) picks the look, see zombieVariant.js. `variant` may be passed
// pre-computed (ZombieComponent also needs it for the gait) to skip the lookup.
export function ZombieBody({ type = 'walker', id = 'display', seed, variant: variantProp, health, maxHealth, leftArmRef, rightArmRef, leftLegRef, rightLegRef, headRef, sacRef, holes = [] }) {
  const archetype = getZombieArchetype(type)
  const hp = health ?? archetype.health
  const maxHp = maxHealth ?? archetype.health   // Horde modifier halves spawn HP
  const colors = getZombieColors(type, hp, maxHp)
  const variant = useMemo(() => variantProp ?? getZombieVariant(type, seed ?? id), [variantProp, type, seed, id])
  // Per-variant colours (shared, cached, fed through sm()). Only the walker's palette
  // darkens with health (the other archetypes override those colours entirely).
  const vc = getVariantColors(type, variant, colors, type === 'walker' && hp <= Math.ceil(maxHp / 2))
  const { accent, eye } = colors
  const { skin, skinVein, shirt, shirtTear, pants, skullBone, skullDark } = vc
  const heightScale = archetype.heightScale ?? 1
  const isCrawler = type === 'crawler'
  const isScreamer = type === 'screamer'
  const isRunner = type === 'runner'
  const isBrute = type === 'brute'
  const isBoss = archetype.boss
  const isExploder = type === 'exploder'
  const isArmored = type === 'armored'
  const isSpitter = type === 'spitter'
  // Variant build: scales the whole model group, so meshes (and therefore the raycast
  // hitboxes, head included) scale with the visuals. Feet are re-seated on the floor.
  const baseHeight = isCrawler ? 0.7 : isScreamer ? heightScale * 1.08 : heightScale
  const widthScale = (isBoss ? 1.42 : isExploder ? 1.2 : isArmored ? 1.12 : isSpitter ? 0.9 : isBrute ? 1.32 : isRunner ? 0.88 : isCrawler ? 1.08 : isScreamer ? 0.82 : 1) * variant.w
  const depthScale = (isBoss ? 1.42 : isExploder ? 1.3 : isArmored ? 1.12 : isSpitter ? 0.9 : isBrute ? 1.32 : isRunner ? 0.88 : isCrawler ? 1.22 : isScreamer ? 0.88 : 1) * variant.w
  const visualHeightScale = baseHeight * variant.h
  const modelPosition = isCrawler ? [0, -0.36, 0.10] : [0, 0.866 * baseHeight * (variant.h - 1), 0]
  // limp = a slight static lean toward the bad leg
  const modelRotation = isCrawler ? [-0.82, 0, 0] : isScreamer ? [0.16, 0, 0] : isSpitter ? [0.24, 0, 0] : [0, 0, variant.limp * 0.05]
  const headPosition = isCrawler ? [0, -0.70, 0.63] : [0, 0, 0]
  // Keep the crawler head in the existing crawl pose, but counter-rotate the torso
  // so the chest pitches forward into the ground instead of arching backward.
  const bodyRotation = isCrawler ? [1.64, 0, 0] : [0, 0, 0]
  const leftArmPosition = isCrawler ? [-0.285, 0.310, 0.055] : isScreamer ? [-0.270, 0.345, 0.015] : [-0.248, 0.365, 0]
  const rightArmPosition = isCrawler ? [0.285, 0.310, 0.055] : isScreamer ? [0.270, 0.345, 0.015] : [0.248, 0.365, 0]

  return (
    <>
      {isBoss && (
        <>
          <mesh geometry={cg(0.95, 1.22, 0.08, 24)} position={[0, -0.868, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <meshBasicMaterial color="#7a0505" transparent opacity={0.52} depthWrite={false} />
          </mesh>
          <mesh geometry={cg(1.18, 1.48, 0.05, 28)} position={[0, -0.866, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <meshBasicMaterial color="#ff1700" transparent opacity={0.18} depthWrite={false} />
          </mesh>
        </>
      )}
      {isScreamer && (
        <mesh position={[0, -0.865, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[archetype.auraRadius * 2, archetype.auraRadius * 2]} />
          <meshBasicMaterial map={_screamerAuraTexture} color="#7c42cd" transparent opacity={0.06} depthWrite={false} />
        </mesh>
      )}
      {isRunner && (
        <mesh geometry={cg(0.42, 0.58, 0.045, 20)} position={[0, -0.866, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <meshBasicMaterial color="#ff6a00" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}
      <group position={modelPosition} rotation={modelRotation} scale={[widthScale, visualHeightScale, depthScale]}>

      {/* ══ HEAD ══ */}
      <group ref={headRef} position={headPosition}>

      {/* Main skull dome */}
      <mesh geometry={bg(0.30, 0.38, 0.28)} position={[0, 0.760, 0]} castShadow userData={{ zombieId: id, isHead: true }} material={sm(skullBone, 0.85)} />
      {/* Dome rings — 3 steps to round the crown */}
      <mesh geometry={bg(0.268, 0.026, 0.244)} position={[0, 0.963, -0.008]} userData={{ zombieId: id, isHead: true }} material={sm(skullBone, 0.84)} />
      <mesh geometry={bg(0.194, 0.024, 0.173)} position={[0, 0.989, -0.010]} userData={{ zombieId: id, isHead: true }} material={sm(skullBone, 0.83)} />
      <mesh geometry={bg(0.130, 0.022, 0.113)} position={[0, 1.013, -0.009]} userData={{ zombieId: id, isHead: true }} material={sm(skullBone, 0.83)} />
      {/* Occipital bump — back of skull */}
      <mesh geometry={bg(0.180, 0.120, 0.030)} position={[0, 0.730, -0.148]} userData={{ zombieId: id, isHead: true }} material={sm(skullBone, 0.84)} />

      {/* Decayed flesh — left side */}
      <mesh geometry={bg(0.038, 0.190, 0.140)} position={[-0.142, 0.808, 0.020]} userData={{ zombieId: id, isHead: true }} material={sm(flesh, 1)} />
      {/* Flesh — right patch */}
      <mesh geometry={bg(0.036, 0.130, 0.120)} position={[0.138, 0.745, 0.038]} userData={{ zombieId: id, isHead: true }} material={sm(fleshDark, 1)} />
      {/* Flesh — back/top */}
      <mesh geometry={bg(0.200, 0.100, 0.055)} position={[0, 0.830, -0.102]} userData={{ zombieId: id, isHead: true }} material={sm(flesh, 1)} />
      {/* Torn flesh strip — forehead left */}
      <mesh geometry={bg(0.030, 0.060, 0.018)} position={[-0.060, 0.870, 0.095]} rotation={[0, 0, 0.15]} userData={{ zombieId: id, isHead: true }} material={sm(fleshDark, 1)} />

      {/* Brow ridge — overhanging slab */}
      <mesh geometry={bg(0.290, 0.060, 0.075)} position={[0, 0.800, 0.142]} userData={{ zombieId: id, isHead: true }} material={sm(skullDark, 0.84)} />
      {/* Left brow knob */}
      <mesh geometry={bg(0.075, 0.038, 0.042)} position={[-0.080, 0.806, 0.150]} userData={{ zombieId: id, isHead: true }} material={sm(skullDark, 0.84)} />
      {/* Right brow knob */}
      <mesh geometry={bg(0.075, 0.038, 0.042)} position={[0.080, 0.806, 0.150]} userData={{ zombieId: id, isHead: true }} material={sm(skullDark, 0.84)} />
      {/* Glabella center dip */}
      <mesh geometry={bg(0.038, 0.025, 0.020)} position={[0, 0.796, 0.154]} userData={{ zombieId: id, isHead: true }} material={sm("#130f08", 1)} />
      {/* Brow underside shadow */}
      <mesh geometry={bg(0.270, 0.018, 0.048)} position={[0, 0.774, 0.150]} userData={{ zombieId: id, isHead: true }} material={sm("#0d0a06", 1)} />

      {/* Left eye socket — deep cavity */}
      <mesh geometry={bg(0.096, 0.088, 0.042)} position={[-0.082, 0.762, 0.132]} userData={{ zombieId: id, isHead: true }} material={sm("#040201", 1)} />
      {/* Left orbital rim — bone frame */}
      <mesh geometry={bg(0.104, 0.096, 0.014)} position={[-0.082, 0.762, 0.115]} userData={{ zombieId: id, isHead: true }} material={sm(skullDark, 0.84)} />
      {/* Left supraorbital notch (inner top edge) */}
      <mesh geometry={bg(0.018, 0.010, 0.014)} position={[-0.052, 0.802, 0.139]} userData={{ zombieId: id, isHead: true }} material={sm("#0a0804", 1)} />
      {/* Left glow — amber */}
      <mesh geometry={bg(0.055, 0.055, 0.014)} position={[-0.082, 0.762, 0.140]} userData={{ zombieId: id, isHead: true }} material={sm(eye, undefined, undefined, eye, 3.5)} />
      {/* Left iris — hot orange */}
      <mesh geometry={bg(0.030, 0.030, 0.008)} position={[-0.082, 0.762, 0.144]} userData={{ zombieId: id, isHead: true }} material={sm(eye, undefined, undefined, eye, 5)} />

      {/* Right eye socket */}
      <mesh geometry={bg(0.096, 0.088, 0.042)} position={[0.082, 0.762, 0.132]} userData={{ zombieId: id, isHead: true }} material={sm("#040201", 1)} />
      <mesh geometry={bg(0.104, 0.096, 0.014)} position={[0.082, 0.762, 0.115]} userData={{ zombieId: id, isHead: true }} material={sm(skullDark, 0.84)} />
      <mesh geometry={bg(0.018, 0.010, 0.014)} position={[0.052, 0.802, 0.139]} userData={{ zombieId: id, isHead: true }} material={sm("#0a0804", 1)} />
      <mesh geometry={bg(0.055, 0.055, 0.014)} position={[0.082, 0.762, 0.140]} userData={{ zombieId: id, isHead: true }} material={sm(eye, undefined, undefined, eye, 3.5)} />
      <mesh geometry={bg(0.030, 0.030, 0.008)} position={[0.082, 0.762, 0.144]} userData={{ zombieId: id, isHead: true }} material={sm(eye, undefined, undefined, eye, 5)} />

      {/* Nasal aperture — wide cavity, two pillars */}
      <mesh geometry={bg(0.072, 0.065, 0.025)} position={[0, 0.714, 0.150]} userData={{ zombieId: id, isHead: true }} material={sm("#060302", 1)} />
      {/* Left nasal pillar */}
      <mesh geometry={bg(0.010, 0.048, 0.016)} position={[-0.030, 0.720, 0.148]} userData={{ zombieId: id, isHead: true }} material={sm(skullBone, 0.80)} />
      {/* Right nasal pillar */}
      <mesh geometry={bg(0.010, 0.048, 0.016)} position={[0.030, 0.720, 0.148]} userData={{ zombieId: id, isHead: true }} material={sm(skullBone, 0.80)} />
      {/* Nasal spine (bottom bridge) */}
      <mesh geometry={bg(0.014, 0.012, 0.016)} position={[0, 0.694, 0.148]} userData={{ zombieId: id, isHead: true }} material={sm(skullBone, 0.80)} />

      {/* Left cheekbone — prominent slab */}
      <mesh geometry={bg(0.040, 0.058, 0.115)} position={[-0.150, 0.718, 0.106]} userData={{ zombieId: id, isHead: true }} material={sm(skullBone, 0.78)} />
      {/* Right cheekbone */}
      <mesh geometry={bg(0.040, 0.058, 0.115)} position={[0.150, 0.718, 0.106]} userData={{ zombieId: id, isHead: true }} material={sm(skullBone, 0.78)} />
      {/* Left cheek flesh — hanging strip */}
      <mesh geometry={bg(0.025, 0.090, 0.018)} position={[-0.154, 0.695, 0.122]} rotation={[0, 0, 0.22]} userData={{ zombieId: id, isHead: true }} material={sm(flesh, 1)} />
      {/* Right cheek flesh */}
      <mesh geometry={bg(0.022, 0.075, 0.016)} position={[0.154, 0.688, 0.118]} rotation={[0, 0, -0.18]} userData={{ zombieId: id, isHead: true }} material={sm(fleshDark, 1)} />

      {/* Upper jaw / maxilla */}
      <mesh geometry={bg(0.250, 0.072, 0.205)} position={[0, 0.650, 0.058]} userData={{ zombieId: id, isHead: true }} material={sm(skullBone, 0.85)} />
      {/* Upper gum — thick ridge */}
      <mesh geometry={bg(0.210, 0.026, 0.020)} position={[0, 0.620, 0.140]} userData={{ zombieId: id, isHead: true }} material={sm(gum, 1)} />
      {/* Upper teeth — 7 individual varying heights */}
      {[
        { x: -0.085, h: 0.030 }, { x: -0.051, h: 0.038 }, { x: -0.017, h: 0.034 },
        { x:  0.017, h: 0.042 }, { x:  0.051, h: 0.034 }, { x:  0.085, h: 0.030 },
        { x: -0.034, h: 0.028 },
      ].map(({ x, h }, i) => (
        <mesh geometry={bg(0.020, h, 0.018)} key={`ut${i}`} position={[x, 0.604 - h / 2, 0.143]} userData={{ zombieId: id, isHead: true }} material={sm(tooth, 0.55)} />
      ))}

      {/* ── GAPING MOUTH ── */}

      {/* Mouth void — huge dark cavity between jaws */}
      <mesh geometry={bg(0.220, 0.115, 0.095)} position={[0, 0.562, 0.098]} userData={{ zombieId: id, isHead: true }} material={sm("#030101", 1)} />
      {/* Throat depth */}
      <mesh geometry={bg(0.160, 0.090, 0.060)} position={[0, 0.560, 0.040]} userData={{ zombieId: id, isHead: true }} material={sm("#020101", 1)} />

      {!variant.noJaw && (
      <>
      {/* Tongue — lying on lower jaw, dark red */}
      <mesh geometry={bg(0.135, 0.024, 0.115)} position={[0, 0.528, 0.092]} rotation={[0.40, 0, 0]} userData={{ zombieId: id, isHead: true }} material={sm("#7a1a1a", 0.95)} />
      {/* Tongue center groove */}
      <mesh geometry={bg(0.008, 0.010, 0.100)} position={[0, 0.532, 0.102]} rotation={[0.40, 0, 0]} userData={{ zombieId: id, isHead: true }} material={sm("#521010", 1)} />
      {/* Tongue tip — slightly darker */}
      <mesh geometry={bg(0.085, 0.020, 0.030)} position={[0, 0.516, 0.140]} rotation={[0.40, 0, 0]} userData={{ zombieId: id, isHead: true }} material={sm("#601414", 0.95)} />

      {/* Lower jaw — dropped wide open */}
      <mesh geometry={bg(0.235, 0.065, 0.185)} position={[0, 0.540, 0.052]} rotation={[0.44, 0, 0]} userData={{ zombieId: id, isHead: true }} material={sm(skullBone, 0.85)} />
      {/* Lower gum */}
      <mesh geometry={bg(0.175, 0.022, 0.018)} position={[0, 0.508, 0.140]} userData={{ zombieId: id, isHead: true }} material={sm(gum, 1)} />
      {/* Lower teeth — 6 jagged, uneven heights */}
      {[
        { x: -0.070, h: 0.032 }, { x: -0.036, h: 0.042 }, { x: -0.004, h: 0.036 },
        { x:  0.028, h: 0.044 }, { x:  0.060, h: 0.032 }, { x: -0.052, h: 0.026 },
      ].map(({ x, h }, i) => (
        <mesh geometry={bg(0.020, h, 0.016)} key={`lt${i}`} position={[x, 0.519 + h / 2, 0.143]} userData={{ zombieId: id, isHead: true }} material={sm(tooth, 0.55)} />
      ))}

      {/* Jaw corner — torn left */}
      <mesh geometry={bg(0.026, 0.075, 0.015)} position={[-0.108, 0.572, 0.130]} rotation={[0.10, 0, 0.50]} userData={{ zombieId: id, isHead: true }} material={sm(flesh, 1)} />
      <mesh geometry={bg(0.018, 0.050, 0.012)} position={[-0.118, 0.558, 0.126]} rotation={[0.20, 0, 0.65]} userData={{ zombieId: id, isHead: true }} material={sm(fleshDark, 1)} />
      {/* Jaw corner — torn right */}
      <mesh geometry={bg(0.026, 0.075, 0.015)} position={[0.108, 0.572, 0.130]} rotation={[0.10, 0, -0.50]} userData={{ zombieId: id, isHead: true }} material={sm(fleshDark, 1)} />
      <mesh geometry={bg(0.018, 0.050, 0.012)} position={[0.118, 0.558, 0.126]} rotation={[0.20, 0, -0.65]} userData={{ zombieId: id, isHead: true }} material={sm(flesh, 1)} />
      </>
      )}

      {/* Blood — pooled under lower lip */}
      <mesh geometry={bg(0.110, 0.016, 0.010)} position={[0, 0.506, 0.148]} userData={{ zombieId: id, isHead: true }} material={sm(blood, 1)} />
      {/* Blood drip — left */}
      <mesh geometry={bg(0.010, 0.030, 0.008)} position={[-0.030, 0.485, 0.145]} userData={{ zombieId: id, isHead: true }} material={sm(blood, 1)} />
      {/* Blood drip — right */}
      <mesh geometry={bg(0.008, 0.020, 0.007)} position={[0.025, 0.492, 0.147]} userData={{ zombieId: id, isHead: true }} material={sm(blood, 1)} />
      {/* Blood smear on upper jaw */}
      <mesh geometry={bg(0.044, 0.022, 0.008)} position={[0.042, 0.614, 0.150]} userData={{ zombieId: id, isHead: true }} material={sm(blood, 1)} />

      {/* Skull crack — main */}
      <mesh geometry={bg(0.008, 0.130, 0.005)} position={[0.060, 0.862, 0.060]} rotation={[0, 0, 0.60]} userData={{ zombieId: id, isHead: true }} material={sm("#140e06", 1)} />
      {/* Crack branch */}
      <mesh geometry={bg(0.006, 0.060, 0.004)} position={[0.085, 0.830, 0.065]} rotation={[0, 0, 1.10]} userData={{ zombieId: id, isHead: true }} material={sm("#140e06", 1)} />
      {/* Blood from crack */}
      <mesh geometry={bg(0.007, 0.070, 0.006)} position={[0.072, 0.822, 0.068]} rotation={[0, 0, 0.60]} userData={{ zombieId: id, isHead: true }} material={sm(blood, 1)} />
      {/* Hair wisps */}
      <mesh geometry={bg(0.008, 0.080, 0.005)} position={[-0.095, 0.918, -0.082]} rotation={[0.38, 0.28, 0.18]} userData={{ zombieId: id, isHead: true }} material={sm(hair, 1)} />
      <mesh geometry={bg(0.006, 0.062, 0.005)} position={[0.070, 0.924, -0.090]} rotation={[0.30, -0.20, -0.12]} userData={{ zombieId: id, isHead: true }} material={sm(hair, 1)} />

      {isArmored && (
        <>
          {/* Riot helmet — shell, brow band, neck + cheek guards (eyes/mouth stay open) */}
          <mesh geometry={bg(0.37, 0.30, 0.35)} position={[0, 0.905, -0.012]} userData={{ zombieId: id, isHead: true }} material={sm('#2a3744', 0.4, 0.6)} />
          <mesh geometry={bg(0.33, 0.07, 0.36)} position={[0, 1.07, -0.012]} userData={{ zombieId: id, isHead: true }} material={sm('#2a3744', 0.4, 0.6)} />
          <mesh geometry={bg(0.05, 0.40, 0.30)} position={[0, 1.05, -0.012]} userData={{ zombieId: id, isHead: true }} material={sm('#c9ccd0', 0.5, 0.4)} />
          <mesh geometry={bg(0.36, 0.075, 0.06)} position={[0, 0.835, 0.172]} userData={{ zombieId: id, isHead: true }} material={sm('#161d24', 0.3, 0.7)} />
          <mesh geometry={bg(0.34, 0.20, 0.07)} position={[0, 0.74, -0.178]} userData={{ zombieId: id, isHead: true }} material={sm('#2a3744', 0.4, 0.6)} />
          <mesh geometry={bg(0.05, 0.26, 0.24)} position={[-0.178, 0.76, 0.01]} userData={{ zombieId: id, isHead: true }} material={sm('#2a3744', 0.4, 0.6)} />
          <mesh geometry={bg(0.05, 0.26, 0.24)} position={[0.178, 0.76, 0.01]} userData={{ zombieId: id, isHead: true }} material={sm('#2a3744', 0.4, 0.6)} />
        </>
      )}
      {isSpitter && (
        <>
          {/* Swollen cheek pouches */}
          <mesh geometry={bg(0.07, 0.13, 0.13)} position={[-0.165, 0.665, 0.07]} userData={{ zombieId: id, isHead: true }} material={sm('#7fa03a', 0.7)} />
          <mesh geometry={bg(0.07, 0.13, 0.13)} position={[0.165, 0.665, 0.07]} userData={{ zombieId: id, isHead: true }} material={sm('#7fa03a', 0.7)} />
          {/* Acid drool */}
          <mesh geometry={bg(0.018, 0.12, 0.014)} position={[-0.03, 0.46, 0.15]} material={sm('#9aff3a', 0.4, 0, '#6aff1a', 1.6)} />
          <mesh geometry={bg(0.014, 0.08, 0.012)} position={[0.04, 0.47, 0.15]} material={sm('#9aff3a', 0.4, 0, '#6aff1a', 1.6)} />
        </>
      )}
      </group>

      <group rotation={bodyRotation}>
      {/* ══ NECK ══ */}
      <mesh geometry={bg(0.15, 0.11, 0.14)} position={[0, 0.535, 0]} userData={{ zombieId: id, isHead: false }} material={sm(skin, 0.9)} />
      {/* Collar / torn shirt edge */}
      <mesh geometry={bg(0.22, 0.03, 0.12)} position={[0, 0.480, 0.06]} userData={{ zombieId: id, isHead: false }} material={sm(shirtTear, 1)} />

      {/* ══ TORSO ══ */}
      {/* Chest */}
      <mesh geometry={bg(0.44, 0.38, 0.22)} position={[0, 0.285, 0]} castShadow userData={{ zombieId: id, isHead: false }} material={sm(shirt, 0.95)} />
      {/* Shirt crease / seam lines */}
      <mesh geometry={bg(0.006, 0.34, 0.004)} position={[0, 0.285, 0.112]} material={sm(shirtTear, 1)} />
      {/* Torn shirt flap — left side */}
      <mesh geometry={bg(0.08, 0.12, 0.01)} position={[-0.17, 0.18, 0.115]} rotation={[0, 0, 0.3]} material={sm(shirtTear, 1)} />
      {/* Blood stains — main splatter */}
      <mesh geometry={bg(0.12, 0.15, 0.008)} position={[0.07, 0.30, 0.113]} material={sm(blood, 1)} />
      {/* Secondary blood drip */}
      <mesh geometry={bg(0.04, 0.08, 0.007)} position={[0.06, 0.14, 0.112]} material={sm(bloodBrt, 1)} />
      {/* Shoulder caps / deltoids */}
      <mesh geometry={bg(0.09, 0.08, 0.17)} position={[-0.245, 0.365, 0]} userData={{ zombieId: id, isHead: false }} material={sm(shirt, 0.95)} />
      <mesh geometry={bg(0.09, 0.08, 0.17)} position={[0.245, 0.365, 0]} userData={{ zombieId: id, isHead: false }} material={sm(shirt, 0.95)} />
      {/* Abdomen */}
      <mesh geometry={bg(0.36, 0.22, 0.20)} position={[0, 0.015, 0]} userData={{ zombieId: id, isHead: false }} material={sm(shirt, 0.95)} />
      {/* Belt */}
      <mesh geometry={bg(0.40, 0.055, 0.23)} position={[0, -0.085, 0]} userData={{ zombieId: id, isHead: false }} material={sm("#0e0c08", 0.6, 0.3)} />
      {/* Belt buckle */}
      <mesh geometry={bg(0.06, 0.045, 0.012)} position={[0, -0.085, 0.120]} material={sm("#888060", 0.4, 0.7)} />
      {/* Hips */}
      <mesh geometry={bg(0.38, 0.16, 0.21)} position={[0, -0.175, 0]} userData={{ zombieId: id, isHead: false }} material={sm(isScreamer ? '#d8d0c0' : pants, 0.95)} />

      {isExploder && (
        <>
          {/* Swollen, bloated belly with glowing pustules (no userData on pustules: hidden on corpses) */}
          <mesh geometry={bg(0.60, 0.50, 0.44)} position={[0, 0.06, 0.09]} userData={{ zombieId: id, isHead: false }} material={sm(skin, 0.75)} />
          <mesh geometry={bg(0.52, 0.40, 0.50)} position={[0, 0.10, 0.10]} rotation={[0, 0.6, 0]} userData={{ zombieId: id, isHead: false }} material={sm(vc.skinDark, 0.8)} />
          <mesh geometry={bg(0.012, 0.36, 0.012)} position={[-0.08, 0.08, 0.335]} material={sm(colors.skinVein, 1)} />
          <mesh geometry={bg(0.012, 0.30, 0.012)} position={[0.14, 0.06, 0.33]} rotation={[0, 0, 0.3]} material={sm(colors.skinVein, 1)} />
          {[
            [-0.15, 0.14, 0.34, 0.10], [0.12, 0.00, 0.35, 0.12], [0.02, 0.22, 0.32, 0.075], [-0.21, -0.05, 0.31, 0.085],
            [0.23, 0.17, 0.30, 0.075], [-0.31, 0.12, 0.12, 0.09], [0.31, 0.02, 0.14, 0.10], [0.0, -0.08, 0.35, 0.07],
          ].map(([px, py, pz, ps], i) => (
            <mesh key={`pus${i}`} geometry={bg(ps, ps, ps * 0.7)} position={[px, py, pz]} material={sm('#ffb02e', 0.4, 0, '#ff7a00', 2.8)} />
          ))}
        </>
      )}

      {isArmored && (
        <>
          {/* Riot plates: chest, front plate, pauldrons, abdomen guard */}
          <mesh geometry={bg(0.52, 0.42, 0.27)} position={[0, 0.285, 0]} userData={{ zombieId: id, isHead: false }} material={sm('#2a3744', 0.45, 0.6)} />
          <mesh geometry={bg(0.42, 0.30, 0.04)} position={[0, 0.30, 0.148]} userData={{ zombieId: id, isHead: false }} material={sm('#3d4f60', 0.4, 0.65)} />
          <mesh geometry={bg(0.16, 0.10, 0.25)} position={[-0.285, 0.41, 0]} userData={{ zombieId: id, isHead: false }} material={sm('#2a3744', 0.45, 0.6)} />
          <mesh geometry={bg(0.16, 0.10, 0.25)} position={[0.285, 0.41, 0]} userData={{ zombieId: id, isHead: false }} material={sm('#2a3744', 0.45, 0.6)} />
          <mesh geometry={bg(0.36, 0.14, 0.23)} position={[0, 0.02, 0]} userData={{ zombieId: id, isHead: false }} material={sm('#2a3744', 0.45, 0.6)} />
          <mesh geometry={bg(0.12, 0.05, 0.04)} position={[0, 0.40, 0.17]} userData={{ zombieId: id, isHead: false }} material={sm('#d8a020', 0.5, 0.3, '#d8a020', 0.6)} />
        </>
      )}

      {isSpitter && (
        <>
          {/* Glowing throat sac (pulses during the spit wind-up) + dorsal spines */}
          <group ref={sacRef} position={[0, 0.40, 0.085]}>
            <mesh geometry={bg(0.20, 0.20, 0.17)} userData={{ zombieId: id, isHead: false }} material={sm('#8fe02a', 0.45, 0, '#6aff1a', 1.9)} />
          </group>
          {[0.44, 0.30, 0.16].map((y, i) => (
            <mesh key={`spn${i}`} geometry={bg(0.04, 0.12 - i * 0.02, 0.05)} position={[0, y, -0.14]} rotation={[-0.5, 0, 0]} material={sm('#3a4a1a', 0.8)} />
          ))}
        </>
      )}

      {variant.ribs && (
        <>
          {/* Exposed ribs — torn-open chest patch */}
          <mesh geometry={bg(0.19, 0.20, 0.012)} position={[-0.06, 0.27, 0.116]} userData={{ zombieId: id, isHead: false }} material={sm('#210807', 1)} />
          {[0.19, 0.235, 0.28, 0.325].map((y, i) => (
            <mesh key={`rib${i}`} geometry={bg(0.17 - i * 0.008, 0.018, 0.016)} position={[-0.06, y, 0.124]} userData={{ zombieId: id, isHead: false }} material={sm(bone, 0.85)} />
          ))}
          <mesh geometry={bg(0.016, 0.20, 0.014)} position={[-0.06, 0.27, 0.122]} userData={{ zombieId: id, isHead: false }} material={sm(bone, 0.85)} />
        </>
      )}

      {isScreamer && (
        <>
          <mesh geometry={bg(0.50, 0.78, 0.045)} position={[0, 0.055, 0.137]} rotation={[0.08, 0, 0]} material={sm('#d9d2c3', 0.98)} />
          <mesh geometry={bg(0.42, 0.50, 0.04)} position={[0, -0.245, 0.132]} rotation={[0.18, 0, 0]} material={sm('#bfb6a8', 1)} />
          <mesh geometry={bg(0.030, 0.62, 0.035)} position={[-0.152, 0.615, 0.020]} rotation={[0.30, 0, -0.15]} material={sm('#090706', 1)} />
          <mesh geometry={bg(0.034, 0.68, 0.040)} position={[0.148, 0.590, 0.010]} rotation={[0.34, 0, 0.13]} material={sm('#090706', 1)} />
          <mesh geometry={bg(0.20, 0.46, 0.055)} position={[0, 0.710, -0.090]} rotation={[0.20, 0, 0]} material={sm('#090706', 1)} />
        </>
      )}

      {isCrawler && (
        <>
          <mesh geometry={bg(0.34, 0.080, 0.22)} position={[0, -0.282, -0.020]} userData={{ zombieId: id, isHead: false }} material={sm(blood, 1)} />
          <mesh geometry={bg(0.12, 0.065, 0.18)} position={[-0.115, -0.272, -0.070]} rotation={[0, 0, -0.25]} userData={{ zombieId: id, isHead: false }} material={sm(bone, 0.85)} />
          <mesh geometry={bg(0.12, 0.065, 0.18)} position={[0.115, -0.272, -0.070]} rotation={[0, 0, 0.25]} userData={{ zombieId: id, isHead: false }} material={sm(bone, 0.85)} />
          <mesh geometry={bg(0.48, 0.055, 0.60)} position={[0, -0.315, -0.180]} material={sm('#210807', 1, 0, '#3a0908', 0.45)} />
        </>
      )}

      {/* ══ LEFT ARM — pivot at shoulder ══ */}
      <group ref={leftArmRef} position={leftArmPosition}>
        <mesh geometry={bg(0.10, 0.10, 0.10)} position={[0, -0.060, 0.04]} userData={{ zombieId: id, isHead: false }} material={sm(shirt, 0.95)} />
        <mesh geometry={bg(0.13, 0.36, 0.12)} position={[-0.057, -0.170, 0.095]} rotation={[-0.55, 0, -0.12]} castShadow userData={{ zombieId: id, isHead: false }} material={sm(shirt, 0.95)} />
        <mesh geometry={bg(0.09, 0.09, 0.09)} position={[-0.070, -0.330, 0.195]} userData={{ zombieId: id, isHead: false }} material={sm(skin, 0.9)} />
        {variant.noArm === -1 ? (
          <mesh geometry={bg(0.10, 0.05, 0.10)} position={[-0.070, -0.352, 0.200]} rotation={[-0.55, 0, 0]} userData={{ zombieId: id, isHead: false }} material={sm(blood, 1)} />
        ) : (
          <>
        <mesh geometry={bg(0.11, 0.32, 0.10)} position={[-0.077, -0.347, 0.300]} rotation={[-1.05, 0, -0.08]} userData={{ zombieId: id, isHead: false }} material={sm(skin, 0.9)} />
        {isArmored && <mesh geometry={bg(0.14, 0.22, 0.13)} position={[-0.077, -0.347, 0.300]} rotation={[-1.05, 0, -0.08]} userData={{ zombieId: id, isHead: false }} material={sm('#2a3744', 0.45, 0.6)} />}
        <mesh geometry={bg(0.007, 0.07, 0.005)} position={[-0.078, -0.403, 0.408]} rotation={[-1.05, 0, -0.05]} material={sm(skinVein, 1)} />
        <mesh geometry={bg(0.105, 0.105, 0.09)} position={[-0.082, -0.410, 0.462]} rotation={[-1.05, 0, -0.05]} userData={{ zombieId: id, isHead: false }} material={sm(skullBone, 0.85)} />
        <mesh geometry={bg(0.025, 0.07, 0.022)} position={[-0.097, -0.433, 0.510]} rotation={[-1.05, -0.15, -0.05]} material={sm(skullBone, 0.85)} />
        <mesh geometry={bg(0.025, 0.075, 0.022)} position={[-0.072, -0.427, 0.512]} rotation={[-1.05, 0, -0.04]} material={sm(skullBone, 0.85)} />
        <mesh geometry={bg(0.025, 0.068, 0.022)} position={[-0.048, -0.433, 0.508]} rotation={[-1.05, 0.14, -0.03]} material={sm(skullBone, 0.85)} />
        {isScreamer && (
          <>
            <mesh geometry={bg(0.012, 0.18, 0.010)} position={[-0.112, -0.505, 0.572]} rotation={[-1.12, -0.20, -0.06]} material={sm('#1b120f', 0.6)} />
            <mesh geometry={bg(0.012, 0.20, 0.010)} position={[-0.075, -0.500, 0.582]} rotation={[-1.12, 0, -0.05]} material={sm('#1b120f', 0.6)} />
            <mesh geometry={bg(0.012, 0.17, 0.010)} position={[-0.037, -0.505, 0.570]} rotation={[-1.12, 0.18, -0.04]} material={sm('#1b120f', 0.6)} />
          </>
        )}
          </>
        )}
      </group>

      {/* ══ RIGHT ARM — pivot at shoulder ══ */}
      <group ref={rightArmRef} position={rightArmPosition}>
        <mesh geometry={bg(0.10, 0.10, 0.10)} position={[0, -0.060, 0.04]} userData={{ zombieId: id, isHead: false }} material={sm(shirt, 0.95)} />
        <mesh geometry={bg(0.13, 0.36, 0.12)} position={[0.057, -0.170, 0.095]} rotation={[-0.45, 0, 0.12]} castShadow userData={{ zombieId: id, isHead: false }} material={sm(shirt, 0.95)} />
        <mesh geometry={bg(0.09, 0.09, 0.09)} position={[0.068, -0.310, 0.185]} userData={{ zombieId: id, isHead: false }} material={sm(skin, 0.9)} />
        {variant.noArm === 1 ? (
          <mesh geometry={bg(0.10, 0.05, 0.10)} position={[0.068, -0.332, 0.190]} rotation={[-0.45, 0, 0]} userData={{ zombieId: id, isHead: false }} material={sm(blood, 1)} />
        ) : (
          <>
        <mesh geometry={bg(0.11, 0.32, 0.10)} position={[0.074, -0.325, 0.285]} rotation={[-0.95, 0, 0.08]} userData={{ zombieId: id, isHead: false }} material={sm(skin, 0.9)} />
        {isArmored && <mesh geometry={bg(0.14, 0.22, 0.13)} position={[0.074, -0.325, 0.285]} rotation={[-0.95, 0, 0.08]} userData={{ zombieId: id, isHead: false }} material={sm('#2a3744', 0.45, 0.6)} />}
        <mesh geometry={bg(0.007, 0.07, 0.005)} position={[0.075, -0.387, 0.390]} rotation={[-0.95, 0, 0.05]} material={sm(skinVein, 1)} />
        <mesh geometry={bg(0.105, 0.105, 0.09)} position={[0.080, -0.383, 0.435]} rotation={[-0.95, 0, 0.05]} userData={{ zombieId: id, isHead: false }} material={sm(skullBone, 0.85)} />
        <mesh geometry={bg(0.025, 0.07, 0.022)} position={[0.096, -0.405, 0.483]} rotation={[-0.95, -0.15, 0.04]} material={sm(skullBone, 0.85)} />
        <mesh geometry={bg(0.025, 0.075, 0.022)} position={[0.071, -0.401, 0.486]} rotation={[-0.95, 0, 0.03]} material={sm(skullBone, 0.85)} />
        <mesh geometry={bg(0.025, 0.068, 0.022)} position={[0.047, -0.407, 0.481]} rotation={[-0.95, 0.14, 0.02]} material={sm(skullBone, 0.85)} />
        {isScreamer && (
          <>
            <mesh geometry={bg(0.012, 0.18, 0.010)} position={[0.112, -0.478, 0.545]} rotation={[-1.02, -0.20, 0.05]} material={sm('#1b120f', 0.6)} />
            <mesh geometry={bg(0.012, 0.20, 0.010)} position={[0.075, -0.474, 0.555]} rotation={[-1.02, 0, 0.04]} material={sm('#1b120f', 0.6)} />
            <mesh geometry={bg(0.012, 0.17, 0.010)} position={[0.037, -0.480, 0.543]} rotation={[-1.02, 0.18, 0.03]} material={sm('#1b120f', 0.6)} />
          </>
        )}
          </>
        )}
      </group>

      {!isCrawler && (
        <>
      {/* ══ LEFT LEG — pivot at hip ══ */}
      <group ref={leftLegRef} position={[-0.12, -0.175, 0]}>
        {isArmored && <mesh geometry={bg(0.18, 0.13, 0.20)} position={[0, -0.37, 0.04]} userData={{ zombieId: id, isHead: false }} material={sm('#2a3744', 0.45, 0.6)} />}
        <mesh geometry={bg(0.16, 0.36, 0.17)} position={[0, -0.200, 0]} castShadow userData={{ zombieId: id, isHead: false }} material={sm(pants, 0.95)} />
        <mesh geometry={bg(0.08, 0.07, 0.04)} position={[0, -0.380, 0.09]} userData={{ zombieId: id, isHead: false }} material={sm(pants, 0.95)} />
        <mesh geometry={bg(0.14, 0.30, 0.15)} position={[0, -0.495, 0.01]} userData={{ zombieId: id, isHead: false }} material={sm(pants, 0.95)} />
        <mesh geometry={bg(0.145, 0.10, 0.165)} position={[0, -0.645, 0.01]} userData={{ zombieId: id, isHead: false }} material={sm(boot, 0.8)} />
        <mesh geometry={bg(0.135, 0.06, 0.235)} position={[0, -0.697, 0.055]} userData={{ zombieId: id, isHead: false }} material={sm(boot, 0.8)} />
        <mesh geometry={bg(0.140, 0.015, 0.240)} position={[0, -0.728, 0.055]} material={sm(bootSole, 0.6)} />
      </group>

      {/* ══ RIGHT LEG — pivot at hip ══ */}
      <group ref={rightLegRef} position={[0.12, -0.175, 0]}>
        {isArmored && <mesh geometry={bg(0.18, 0.13, 0.20)} position={[0, -0.37, 0.04]} userData={{ zombieId: id, isHead: false }} material={sm('#2a3744', 0.45, 0.6)} />}
        <mesh geometry={bg(0.16, 0.36, 0.17)} position={[0, -0.200, 0]} castShadow userData={{ zombieId: id, isHead: false }} material={sm(pants, 0.95)} />
        <mesh geometry={bg(0.08, 0.07, 0.04)} position={[0, -0.380, 0.09]} userData={{ zombieId: id, isHead: false }} material={sm(pants, 0.95)} />
        <mesh geometry={bg(0.14, 0.30, 0.15)} position={[0, -0.495, 0.01]} userData={{ zombieId: id, isHead: false }} material={sm(pants, 0.95)} />
        <mesh geometry={bg(0.145, 0.10, 0.165)} position={[0, -0.645, 0.01]} userData={{ zombieId: id, isHead: false }} material={sm(boot, 0.8)} />
        <mesh geometry={bg(0.135, 0.06, 0.235)} position={[0, -0.697, 0.055]} userData={{ zombieId: id, isHead: false }} material={sm(boot, 0.8)} />
        <mesh geometry={bg(0.140, 0.015, 0.240)} position={[0, -0.728, 0.055]} material={sm(bootSole, 0.6)} />
      </group>
        </>
      )}

      {type !== 'walker' && (
        <mesh geometry={bg(isBoss ? 0.30 : 0.18, isBoss ? 0.055 : 0.035, 0.028)} position={[0, 0.455, 0.126]} userData={{ zombieId: id, isHead: false }} material={sm(accent, 0.75, 0, accent, isBoss ? 2.8 : isRunner ? 1.5 : 0.7)} />
      )}
      </group>
      </group>

      {/* Bullet holes */}
      {holes.map((h, i) => (
        <mesh key={i} position={h.pos} quaternion={h.quat} renderOrder={1}>
          <circleGeometry args={[0.045, 8]} />
          <meshBasicMaterial color="#0a0a0a" depthWrite={false} />
        </mesh>
      ))}
    </>
  )
}

function ZombieComponent({ id, startX, startZ, type = 'walker', hidden = false }) {
  const ref = useRef()
  const { camera } = useThree()
  const speed = useGameStore((s) => s.getZombieSpeed())
  const archetype = getZombieArchetype(type)
  const phase = useGameStore((s) => s.phase)
  const hitPlayer = useGameStore((s) => s.hitPlayer)
  const health = useGameStore((s) => s.zombies.find((z) => z.id === id)?.health ?? archetype.health)
  const maxHealth = useGameStore((s) => s.zombies.find((z) => z.id === id)?.maxHealth ?? archetype.health)
  const dying = useGameStore((s) => s.zombies.find((z) => z.id === id)?.dying ?? false)
  const hitPlank = useGameStore((s) => s.hitPlank)
  const windowPlanks = useGameStore((s) => s.windowPlanks)
  const openDoors = useGameStore((s) => s.openDoors)   // Wave 3 buyable doors
  const removeDyingZombie = useGameStore((s) => s.removeDyingZombie)

  const [holes, setHoles] = useState([])

  // Wave 3 special archetypes
  const isExploder = type === 'exploder'
  const isSpitter = type === 'spitter'
  const noPlankAttack = type === 'runner' || type === 'screamer' || isSpitter
  const exRef = useRef({ fuse: -1, total: 1, done: false, flashT: 0, flashOn: false })
  const spRef = useRef({ state: 0, t: 0, cd: 1.5 + keyedRandom('spit0', id) * 2, post: -1, postT: 0, los: false, hold: false, gx: 0, gz: 0 })
  const sacRef = useRef()   // spitter throat sac

  // Pathfinding state
  const pathRef         = useRef([])
  const wpIdxRef        = useRef(0)
  const pathTimer       = useRef(Math.random() * PATH_INTERVAL)
  const modeRef         = useRef('chase')   // 'chase' | 'attack_window' | 'attack_player'
  const targetWindowRef = useRef(-1)
  const attackTimerRef  = useRef(0)
  const windowPlanksRef = useRef(windowPlanks)
  const openDoorsRef    = useRef(openDoors)
  const zombieWallsRef  = useRef(ACTIVE_MAP.wallSegments())
  const stepTimerRef    = useRef(Math.random() * 0.6)
  const groanTimerRef   = useRef(3 + Math.random() * 8)   // idle groan countdown (positional, globally rate-limited in sounds.js)
  const groanPitchRef   = useRef((type === 'brute' ? 0.75 : type === 'runner' ? 1.15 : type === 'screamer' ? 1.3 : type === 'armored' ? 0.7 : type === 'exploder' ? 0.8 : 0.9 + Math.random() * 0.2))
  const isAggressorRef  = useRef(false)
  const walkCycleRef    = useRef(Math.random() * Math.PI * 2)
  // Deterministic look from the id (same on host and guest, no net data)
  const variant         = useMemo(() => getZombieVariant(type, id), [type, id])
  const isAttackingRef  = useRef(false)
  const leftLegRef      = useRef()
  const rightLegRef     = useRef()
  const leftArmRef      = useRef()
  const rightArmRef     = useRef()
  const dyingTimerRef      = useRef(0)
  const removedRef         = useRef(false)
  const deathStartQuatRef  = useRef(null)
  const deathEndQuatRef    = useRef(null)
  const burnRef            = useRef(0)
  const flameRefs          = useRef([])
  const bodyRef            = useRef()   // lean wrapper around the whole model
  const headRef            = useRef()   // head-snap / head-pop
  const corpseRef          = useRef(false)
  const fxRef              = useRef({
    flash: 0, lean: 0, leanA: 0, lx: 0, lz: 0, head: 0, headA: 0, hbY: 0, hbZ: 0,
    stagger: 0, staggerCd: 0, lastHit: 0, pellets: 0, kill: null,
    style: 0, dur: DEATH_DURATION, vel: 0, kx: 0, kz: 0, hop: 0,
  })

  useEffect(() => {
    if (hidden) return
    if (ref.current) {
      const heightScale = archetype.heightScale ?? 1
      ref.current.position.set(startX, (ZOMBIE_HEIGHT * heightScale) / 2, startZ)
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
    _igniters[id] = () => { burnRef.current = BURN_VISUAL_DURATION }
    _hitReactors[id] = onHit
    return () => {
      delete _hitReactors[id]
      Player.unregisterZombieRef(id)
      delete _holeAdders[id]
      delete _zombieGroups[id]
      delete _igniters[id]
    }
  }, [id, startX, startZ, archetype.heightScale, hidden])

  useEffect(() => {
    if (hidden) return
    if (type === 'screamer') playScreamerScreech(startX, 1.4, startZ)
    const plankAggroChance = type === 'runner' || type === 'screamer' || type === 'spitter'
      ? 0
      : type === 'brute'
        ? 0.72
        : 0.38
    isAggressorRef.current = keyedRandom('aggro', id) < plankAggroChance
  }, [hidden, type])

  // Keep collision wall list in sync with plank state.
  // Zombies collide with cabin walls (window gaps open) + any boarded window faces.
  useEffect(() => {
    if (corpseRef.current) return
    windowPlanksRef.current = windowPlanks
    openDoorsRef.current = openDoors
    // Structure + boarded windows + closed doors + windows of still-sealed rooms
    zombieWallsRef.current = ACTIVE_MAP.allWallSegments(windowPlanks, openDoors)
  }, [windowPlanks, openDoors])

  // Windows of rooms that are still sealed are never attacked (Wave 3 doors).
  const isWinActive = (wid) => (ACTIVE_MAP.isWindowActive ? ACTIVE_MAP.isWindowActive(wid, openDoorsRef.current) : true)

  // Called from hitFx.js on every gun/knife hit (dir = world shot direction).
  // Mutates refs only — no React state. Returns blood intensity (see Zombie.hitReact).
  function onHit(dx, dy, dz, head, weapon, dist) {
    const g = ref.current
    if (!g || corpseRef.current) return 0
    const f = fxRef.current
    const now = performance.now()
    if (now - f.lastHit > 150) f.pellets = 0
    f.lastHit = now
    if (weapon === 'shotgun') f.pellets++
    if (f.flash <= 0) setFlash(g, true)   // already flashing (e.g. next shotgun pellet): just extend
    f.flash = FLASH_DURATION

    const st = useGameStore.getState().zombies.find((z) => z.id === id)
    if (st?.dying) {
      // The first hit that finds the zombie dying is the killing blow (the death
      // animation hasn't started yet); later pellets just add to the blast.
      if (deathStartQuatRef.current) return 0
      if (f.kill) { f.kill.pellets = f.pellets; return 0 }
      f.kill = { weapon, head, dx, dz, dist, pellets: f.pellets }
      return (head || weapon === 'deagle') ? 2 : 1
    }

    const heavy = type === 'brute' || type === 'armored' || archetype.boss
    const big = weapon === 'deagle' || (weapon === 'shotgun' && dist < 5)
    if (heavy && !big) return 0   // small hits on brutes/bosses only flash

    // Shot direction in the zombie's local frame
    _hq.copy(g.quaternion).invert()
    _hv.set(dx, 0, dz).applyQuaternion(_hq)
    const l = Math.hypot(_hv.x, _hv.z) || 1
    f.lx = _hv.x / l; f.lz = _hv.z / l
    f.leanA = (head ? 0.3 : 0.17) * (big ? 1.5 : 1) * (heavy ? 0.6 : 1)
    f.lean = LEAN_DURATION
    if (head && headRef.current && f.head <= 0) {
      f.hbY = headRef.current.position.y
      f.hbZ = headRef.current.position.z
      f.headA = heavy ? 0.4 : 0.65
      f.head = HEAD_SNAP_DURATION
    }
    if (f.staggerCd <= 0) {
      f.stagger = head ? 0.26 : 0.18
      f.staggerCd = STAGGER_COOLDOWN
    }
    return 0
  }

  // ── Wave 3: Exploder ─────────────────────────────────────────────────────
  // startFuse: hiss + swell + flash; the burst fires when the fuse runs out. Armed either
  // by reaching a player / window (PRIME_TIME) or by dying (DEATH_FUSE, plays over the fall).
  function startFuse(total, pos) {
    const ex = exRef.current
    if (ex.done || ex.fuse >= 0) return
    ex.fuse = ex.total = total
    playExploderHiss(pos.x, 1.2, pos.z)
  }
  function exploderTick(delta, pos) {
    const ex = exRef.current
    if (ex.done || ex.fuse < 0) return
    ex.fuse -= delta
    const k = Math.min(1, 1 - ex.fuse / ex.total)
    if (bodyRef.current) bodyRef.current.scale.setScalar(1 + 0.5 * k * k + Math.sin(performance.now() * 0.05) * 0.025 * k)
    ex.flashT -= delta
    if (ex.flashT <= 0) {
      ex.flashOn = !ex.flashOn
      ex.flashT = 0.13 - 0.08 * k
      if (ref.current) setFlash(ref.current, ex.flashOn)
    }
    if (ex.fuse <= 0) explode(pos)
  }
  // Every client plays the VFX and damages its OWN player (same model as melee). Only the
  // host applies world damage (other zombies, planks, the exploder's own death); guests
  // receive it through the usual zombie_update / hit_plank sync.
  function explode(pos) {
    const ex = exRef.current
    ex.done = true; ex.fuse = -1
    if (ref.current) setFlash(ref.current, false)
    if (bodyRef.current) bodyRef.current.scale.setScalar(1)
    const x = pos.x, z = pos.z
    SpecialFX.flash(x, 0.9, z)
    SpecialFX.scorch(x, z)
    _burstPt.x = x; _burstPt.z = z
    spawnImpact(_burstPt, _burstUp, 'burst')
    playExplosion(x, 1, z)
    const pd = burstPlayerDamage(Math.hypot(camera.position.x - x, camera.position.z - z))
    if (pd > 0) hitPlayer(pd, x, z)

    const st = useGameStore.getState()
    if (st.mpRole && st.mpRole !== 'host') return
    const me = st.zombies.find((q) => q.id === id)
    if (me && !me.dying) st.hitZombieBurst(id, 999)
    for (const [oid, g] of Object.entries(_zombieGroups)) {
      const n = Number(oid)
      if (n === id || !g) continue
      const dx = g.position.x - x, dz = g.position.z - z
      const d = Math.hypot(dx, dz)
      const dmg = burstZombieDamage(d)
      if (dmg <= 0) continue
      const other = useGameStore.getState().zombies.find((q) => q.id === n)
      if (!other || other.dying) continue
      useGameStore.getState().hitZombieBurst(n, dmg)
      Zombie.hitReact(n, dx / (d || 1), 0.15, dz / (d || 1), false, 'shotgun', d)   // after the store update, so a kill gets the blast-back fall
    }
    const planks = useGameStore.getState().windowPlanks
    for (const w of WINDOW_DEFS) {
      const hits = burstPlankHits(Math.hypot(w.winX - x, w.winZ - z))
      if (hits <= 0) continue
      useGameStore.getState().breakWindow(w.id)
      if ((planks[w.id] ?? 0) === 0) continue
      for (let i = 0; i < hits; i++) {
        useGameStore.getState().hitPlank(w.id)
        netEvent('hit_plank', { windowId: w.id })
      }
    }
  }

  // ── Wave 3: Spitter ──────────────────────────────────────────────────────
  // Decides where to stand: hold still while the target is visible and in range; otherwise,
  // when outside, walk to the nearest window with a clear line to the player (spit through it).
  function spitterThink(delta, pos, px, pz) {
    const sp = spRef.current
    const dist = Math.hypot(px - pos.x, pz - pos.z)
    sp.postT -= delta
    if (sp.postT <= 0) {
      sp.postT = 0.4
      sp.los = dist <= SPITTER.RANGE && spitLOS(pos.x, pos.z, px, pz)
      sp.post = -1
      if (!sp.los && !(Math.abs(pos.x) < CABIN_HW && Math.abs(pos.z) < CABIN_HD)) {
        let best = Infinity
        for (const w of WINDOW_DEFS) {
          const d = (w.ax - pos.x) ** 2 + (w.az - pos.z) ** 2
          if (d < best && Math.hypot(w.ax - px, w.az - pz) <= SPITTER.RANGE && spitLOS(w.ax, w.az, px, pz)) { best = d; sp.post = w.id }
        }
      }
    }
    sp.hold = sp.los && dist <= SPITTER.RANGE
    if (sp.post >= 0 && !sp.hold) { sp.gx = WINDOW_DEFS[sp.post].ax; sp.gz = WINDOW_DEFS[sp.post].az } else { sp.gx = px; sp.gz = pz }
  }
  // Wind-up pose: head rears back, throat sac swells (k 0..1)
  function spitterPose(k) {
    if (headRef.current && fxRef.current.head <= 0) headRef.current.rotation.x = -0.75 * k
    if (sacRef.current) {
      const s = 1 + 0.55 * k + Math.sin(performance.now() * 0.03) * 0.12 * k
      sacRef.current.scale.set(s, s, s)
    }
  }
  function spitterCancel() {
    const sp = spRef.current
    if (sp.state !== 1) return
    sp.state = 0
    sp.cd = 1.5          // getting hit mid-wind-up interrupts the spit
    spitterPose(0)
  }
  function spitterTick(delta, pos, px, pz) {
    const sp = spRef.current
    if (sp.state === 0) {
      sp.cd -= delta
      if (sp.cd <= 0 && sp.hold) { sp.state = 1; sp.t = SPITTER.WINDUP; playSpitWindup(pos.x, 1.3, pos.z) }
      return
    }
    sp.t -= delta
    spitterPose(1 - Math.max(0, sp.t) / SPITTER.WINDUP)
    if (sp.t <= 0) {
      sp.state = 0
      sp.cd = SPITTER.COOLDOWN_MIN + runRandom('ai')() * (SPITTER.COOLDOWN_MAX - SPITTER.COOLDOWN_MIN)
      spitterPose(0)
      if (spitLOS(pos.x, pos.z, px, pz)) {
        const dx = px - pos.x, dz = pz - pos.z
        const d = Math.hypot(dx, dz) || 1
        SpecialFX.spit(pos.x + (dx / d) * 0.4, 1.45, pos.z + (dz / d) * 0.4, px, pz, globFlightTime(d))
        playSpitLaunch(pos.x, 1.4, pos.z)
      }
    }
  }

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
      return _moveDir.set(dx / dist, 0, dz / dist)
    }
    const dx = fallbackX - pos.x, dz = fallbackZ - pos.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    return dist > 0.01 ? _moveDir.set(dx / dist, 0, dz / dist) : null
  }

  useFrame((_, rawDelta) => {
    if (hidden || !ref.current) return
    if (corpseRef.current) return   // settled corpse: frozen, no per-frame work
    const delta = Math.min(rawDelta, 0.05) * time.scale  // last-kill slow-mo
    if (useGameStore.getState().paused) return

    // Hit reactions (flash / lean / head snap) — ref-driven, only while active
    const fx = fxRef.current
    if (fx.flash > 0) {
      fx.flash -= delta
      if (fx.flash <= 0) setFlash(ref.current, false)
    }
    if (fx.staggerCd > 0) fx.staggerCd -= delta
    if (fx.lean > 0 && bodyRef.current) {
      fx.lean -= delta
      const k = fx.lean > 0 ? fx.lean / LEAN_DURATION : 0
      const e = k > 0.65 ? (1 - k) / 0.35 : k / 0.65
      bodyRef.current.rotation.set(fx.leanA * fx.lz * e, 0, -fx.leanA * fx.lx * e)
    }
    if (fx.head > 0 && headRef.current) {
      fx.head -= delta
      const k = fx.head > 0 ? fx.head / HEAD_SNAP_DURATION : 0
      const e = k > 0.6 ? (1 - k) / 0.4 : k / 0.6
      const rx = fx.headA * fx.lz * e
      const h = headRef.current
      h.rotation.set(rx, 0, -fx.headA * fx.lx * e)
      // rotate about the neck, not the head-group origin
      h.position.y = fx.hbY + NECK_Y * (1 - Math.cos(rx))
      h.position.z = fx.hbZ - NECK_Y * Math.sin(rx)
    }

    // Burning flame visual — decays independent of phase/death state
    if (burnRef.current > 0) {
      burnRef.current = Math.max(0, burnRef.current - delta)
      for (let i = 0; i < flameRefs.current.length; i++) {
        const f = flameRefs.current[i]
        if (!f) continue
        f.visible = true
        const tt = performance.now() / 1000 + i * 1.7
        const s = 0.85 + Math.sin(tt * 14) * 0.18 + Math.sin(tt * 23 + i) * 0.08
        f.scale.set(s, s * (1 + Math.sin(tt * 9) * 0.25), s)
      }
    } else {
      for (let i = 0; i < flameRefs.current.length; i++) {
        const f = flameRefs.current[i]
        if (f && f.visible) f.visible = false
      }
    }

    // Death animation — plays regardless of phase. Style depends on the killing
    // blow (fx.kill, recorded by onHit): 0 default fall, 1 blast back along the
    // shot (shotgun / deagle), 2 knife slump in place.
    if (dying) {
      if (isExploder && !exRef.current.done) {
        if (exRef.current.fuse < 0) startFuse(EXPLODER.DEATH_FUSE, ref.current.position)
        exploderTick(delta, ref.current.position)
      }
      if (!removedRef.current) {
        const baseY = (ZOMBIE_HEIGHT * (archetype.heightScale ?? 1)) / 2
        if (!deathStartQuatRef.current) {
          // First dying frame: capture current orientation and build target
          deathStartQuatRef.current = ref.current.quaternion.clone()
          const kill = fx.kill
          fx.style = kill ? (kill.weapon === 'knife' ? 2 : (kill.weapon === 'shotgun' || kill.weapon === 'deagle') ? 1 : 0) : 0
          if (fx.style === 1) {
            // World-axis tilt so the top of the body travels along the shot direction
            const kl = Math.hypot(kill.dx, kill.dz) || 1
            fx.kx = kill.dx / kl; fx.kz = kill.dz / kl
            deathEndQuatRef.current = new THREE.Quaternion()
              .setFromAxisAngle(_axis.set(fx.kz, 0, -fx.kx), Math.PI / 2)
              .multiply(deathStartQuatRef.current)
            fx.dur = DEATH_SHOTGUN_DURATION
            if (kill.weapon === 'shotgun') {
              // closer + more pellets = harder blast
              const closeness = Math.max(0.35, Math.min(1.3, 1.3 - kill.dist / 10))
              fx.vel = (2.5 + 0.7 * Math.min(kill.pellets, 8)) * closeness
              fx.hop = 0.18
            } else {
              fx.vel = 2.2; fx.hop = 0.08
            }
          } else {
            // Extract the facing (Y) angle from the lookAt quaternion using YXZ order,
            // which avoids gimbal lock when decomposing a pure-Y rotation
            const yAngle = _deathTmpEuler.setFromQuaternion(ref.current.quaternion, 'YXZ').y
            // End pose: same facing direction, tilted 90° forward (positive X rotation = falls toward player)
            deathEndQuatRef.current = new THREE.Quaternion()
              .setFromEuler(new THREE.Euler(0, yAngle, 0))
              .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)))
            fx.dur = fx.style === 2 ? DEATH_KNIFE_DURATION : DEATH_DURATION
            fx.vel = 0; fx.hop = 0
          }
          // Ensure slerp takes the shortest arc
          if (deathStartQuatRef.current.dot(deathEndQuatRef.current) < 0) {
            deathEndQuatRef.current.set(-deathEndQuatRef.current.x, -deathEndQuatRef.current.y, -deathEndQuatRef.current.z, -deathEndQuatRef.current.w)
          }
          // Deagle kill: the head pops
          if (kill && kill.weapon === 'deagle' && headRef.current) {
            headRef.current.localToWorld(_hv.set(0, 0.78, 0))
            BloodFX.spawn?.(_hv, _hd.set(kill.dx, 0.35, kill.dz).normalize(), 2)
            headRef.current.visible = false
          }
        }
        dyingTimerRef.current = Math.min(dyingTimerRef.current + delta, fx.dur)
        const t = dyingTimerRef.current / fx.dur
        let rotT, yT
        if (fx.style === 2) {
          // knife: knees buckle and the body folds down in place before toppling
          yT = 0.55 * _smooth(0, 0.55, t) + 0.45 * _smooth(0.55, 1, t)
          rotT = 0.3 * _smooth(0, 0.55, t) + 0.7 * _smooth(0.55, 1, t)
          const buckle = _smooth(0, 0.5, t)
          if (leftLegRef.current)  leftLegRef.current.rotation.x  = -1.1 * buckle
          if (rightLegRef.current) rightLegRef.current.rotation.x = -0.8 * buckle
          if (leftArmRef.current)  leftArmRef.current.rotation.x  = -0.5 * buckle
          if (rightArmRef.current) rightArmRef.current.rotation.x = -0.35 * buckle
        } else if (fx.style === 1) {
          rotT = yT = 1 - (1 - t) * (1 - t)   // ease-out: thrown, then lands
        } else {
          rotT = yT = t * t  // ease-in: accelerates like gravity
        }
        _deathTmpQuat.slerpQuaternions(deathStartQuatRef.current, deathEndQuatRef.current, rotT)
        ref.current.quaternion.copy(_deathTmpQuat)
        ref.current.position.y = baseY * (1 - yT * 0.85) + (fx.hop > 0 ? Math.sin(Math.min(1, t * 2) * Math.PI) * fx.hop : 0)
        if (fx.vel > 0.05) {
          const step = fx.vel * delta
          applyMove(ref.current.position, fx.kx * step, fx.kz * step, zombieWallsRef.current)
          fx.vel *= Math.exp(-4.5 * delta)
        }
        if (dyingTimerRef.current >= fx.dur) {
          // Settle into a frozen corpse: out of every registry (not a raycast /
          // melee / flame target, no AI), baked matrices, no shadows.
          removedRef.current = true
          corpseRef.current = true
          const g = ref.current
          if (fx.flash > 0) { fx.flash = 0; setFlash(g, false) }
          for (let i = 0; i < flameRefs.current.length; i++) { if (flameRefs.current[i]) flameRefs.current[i].visible = false }
          Player.unregisterZombieRef(id)
          delete _zombieGroups[id]
          delete _holeAdders[id]
          delete _igniters[id]
          delete _hitReactors[id]
          freezeCorpse(g)
          removeDyingZombie(id)   // store keeps it as a corpse (capped), see store.js
        }
      }
      return
    }

    if (phase !== 'playing') return
    const pos = ref.current.position

    // Exploder fuse keeps burning through stagger
    if (isExploder) exploderTick(delta, pos)

    // Hit stagger: brief movement/attack pause (lean pose is applied above)
    if (fx.stagger > 0) {
      fx.stagger -= delta
      if (isSpitter) spitterCancel()
      return
    }

    // First zombie to physically reach a window's opening shatters its glass —
    // covers both boarded (attack_window mode) and unboarded (walked straight
    // through) windows. No-op on maps whose windows have no glass to break.
    for (const w of WINDOW_DEFS) {
      const wdx = pos.x - w.winX, wdz = pos.z - w.winZ
      if (wdx * wdx + wdz * wdz <= ATTACK_RANGE * ATTACK_RANGE) {
        useGameStore.getState().breakWindow(w.id)
        break
      }
    }

    // Local player position (also used for melee-attack detection — always local)
    const lx = camera.position.x, lz = camera.position.z

    // Idle groan: randomized interval; sounds.js caps concurrent voices and
    // favours nearby zombies, so a rejected groan just retries soon.
    groanTimerRef.current -= delta
    if (groanTimerRef.current <= 0) {
      const gdx = lx - pos.x, gdz = lz - pos.z
      groanTimerRef.current = playZombieGroan(pos.x, 1.4, pos.z, groanPitchRef.current, Math.sqrt(gdx * gdx + gdz * gdz))
        ? 6 + Math.random() * 8
        : 0.8 + Math.random() * 1.2
    }

    // W5 co-op: downed / bled-out players are ignored (zombies retarget the partner).
    const gs0 = useGameStore.getState()
    const myRole = gs0.mpRole
    const selfOk = !myRole || gs0.coop[myRole].status === 'alive'
    const partnerOk = !myRole || gs0.coop[myRole === 'host' ? 'guest' : 'host'].status === 'alive'

    // Pick the closest player as the chase/face target (the partner only while a co-op link is live:
    // a versus run has no partner in this world)
    const rp = myRole && gs0.mpConnected && partnerOk ? getRemotePlayerPos() : null
    let px, pz
    if (rp && !selfOk) {
      px = rp.x; pz = rp.z
    } else if (rp) {
      const dl2 = (pos.x - lx) ** 2 + (pos.z - lz) ** 2
      const dr2 = (pos.x - rp.x) ** 2 + (pos.z - rp.z) ** 2
      px = dr2 < dl2 ? rp.x : lx
      pz = dr2 < dl2 ? rp.z : lz
    } else {
      px = lx; pz = lz
    }

    const planks = windowPlanksRef.current

    // Spitter: where to stand (gx, gz) and whether to hold + spit; everyone else chases the player
    let gx = px, gz = pz
    if (isSpitter) {
      spitterThink(delta, pos, px, pz)
      spitterTick(delta, pos, px, pz)
      gx = spRef.current.gx; gz = spRef.current.gz
    }

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
      const boardedWins = WINDOW_DEFS.filter((w) => (planks[w.id] ?? 0) > 0 && isWinActive(w.id))

      // Consider switching to attack_window mode
      if (!noPlankAttack && modeRef.current !== 'attack_window' && boardedWins.length > 0) {
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
        const newPath = findPath(pos.x, pos.z, gx, gz)
        if (newPath && newPath.length > 1) {
          pathRef.current = newPath
          wpIdxRef.current = 1
        } else if (!noPlankAttack && !isBlocked(px, pz)) {
          // Player unreachable via open path — force nearest window attack
          let nearWin = -1, nearDist = Infinity
          for (const win of WINDOW_DEFS) {
            if ((planks[win.id] ?? 0) === 0 || !isWinActive(win.id)) continue
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
        if (isExploder) {
          startFuse(EXPLODER.PRIME_TIME, pos)   // bursts at the window instead of clawing the planks
        } else if (attackTimerRef.current <= 0) {
          attackTimerRef.current = ATTACK_INTERVAL
          // Only host applies plank damage (prevents double-damage in multiplayer)
          if (!useGameStore.getState().mpRole || useGameStore.getState().mpRole === 'host') {
            for (let i = 0; i < archetype.plankHits; i++) hitPlank(win.id)
          }
          playPlankHit(win.winX, 1.2, win.winZ)
        }
      } else {
        isAttackingRef.current = false
        const tx = win.ax, tz = win.az
        const tdx = tx - pos.x, tdz = tz - pos.z
        const tdist = Math.sqrt(tdx * tdx + tdz * tdz)
        if (hasDirectPath(pos.x, pos.z, tx, tz, zombieWallsRef.current)) {
          if (tdist > 0.01) moveDir = _moveDir.set(tdx / tdist, 0, tdz / tdist)
        } else {
          moveDir = followPath(pos, tx, tz)
        }
      }
    } else {
      // Local-player melee range check — independent of the chase target (px,pz),
      // which may be the remote player. Damage is fully client-local, mirroring
      // how the old kill-distance check only ever tested against lx,lz.
      const ldx = lx - pos.x, ldz = lz - pos.z
      if (selfOk && !isExploder && ldx * ldx + ldz * ldz <= PLAYER_ATTACK_RANGE * PLAYER_ATTACK_RANGE) {
        modeRef.current = 'attack_player'
        ref.current.lookAt(lx, pos.y, lz)
        isAttackingRef.current = true
        attackTimerRef.current -= delta
        if (attackTimerRef.current <= 0) {
          attackTimerRef.current = ATTACK_INTERVAL
          hitPlayer(archetype.playerDamage, pos.x, pos.z)
        }
      } else {
        if (modeRef.current === 'attack_player') modeRef.current = 'chase'
        isAttackingRef.current = false
        if (isExploder) {
          // reaching either player arms the fuse
          let nd2 = selfOk ? ldx * ldx + ldz * ldz : Infinity
          if (rp) nd2 = Math.min(nd2, (pos.x - rp.x) ** 2 + (pos.z - rp.z) ** 2)
          if (nd2 <= EXPLODER.PRIME_RANGE * EXPLODER.PRIME_RANGE) startFuse(EXPLODER.PRIME_TIME, pos)
        }
        ref.current.lookAt(px, pos.y, pz)
        if (hasDirectPath(pos.x, pos.z, gx, gz, zombieWallsRef.current)) {
          const dx = gx - pos.x, dz = gz - pos.z
          const dist = Math.sqrt(dx * dx + dz * dz)
          if (dist > 0.01) moveDir = _moveDir.set(dx / dist, 0, dz / dist)
        } else {
          moveDir = followPath(pos, gx, gz)
        }
      }
    }

    // Exploder plants its feet while the fuse burns; spitter holds still to hold the shot
    if (isExploder && exRef.current.fuse >= 0) moveDir = null
    if (isSpitter && (spRef.current.hold || spRef.current.state === 1)) moveDir = null

    if (moveDir) {
      let speedMultiplier = archetype.speedMultiplier
      if (isExploder && (px - pos.x) ** 2 + (pz - pos.z) ** 2 <= EXPLODER.RUSH_RANGE * EXPLODER.RUSH_RANGE) speedMultiplier *= EXPLODER.RUSH_MULT
      if (type !== 'screamer') {
        const zombies = useGameStore.getState().zombies
        for (const z of zombies) {
          if (z.id === id || z.type !== 'screamer' || z.dying) continue
          const screamerGroup = _zombieGroups[z.id]
          if (!screamerGroup) continue
          const sdx = screamerGroup.position.x - pos.x
          const sdz = screamerGroup.position.z - pos.z
          const screamer = getZombieArchetype('screamer')
          if (sdx * sdx + sdz * sdz <= screamer.auraRadius * screamer.auraRadius) {
            speedMultiplier *= screamer.auraSpeedMultiplier
            break
          }
        }
      }
      const step = speed * speedMultiplier * modFx.speedMul * delta   // Bloodlust modifier
      applyMove(pos, moveDir.x * step, moveDir.z * step, zombieWallsRef.current)

      // Footstep sound — proximity to local player's ears
      const sdx = lx - pos.x, sdz = lz - pos.z
      if (sdx * sdx + sdz * sdz < 144) {
        stepTimerRef.current -= delta
        if (stepTimerRef.current <= 0) {
          stepTimerRef.current = 0.55 + Math.random() * 0.1
          playZombieFootstep(pos.x, 0.2, pos.z)
        }
      }
    }

    // Animation
    if (isAttackingRef.current) {
      const phase = 1.0 - attackTimerRef.current / ATTACK_INTERVAL
      // Slow lift (72% of cycle), fast slam (28% of cycle)
      const HIGH = 0.9, LOW = -1.05, LIFT = 0.1
      const armX = phase < LIFT
        ? LOW + (HIGH - LOW) * (phase / LIFT)
        : HIGH + (LOW - HIGH) * ((phase - LIFT) / (1 - LIFT))
      if (leftArmRef.current)  leftArmRef.current.rotation.x  = armX
      if (rightArmRef.current) rightArmRef.current.rotation.x = armX
      if (leftLegRef.current)  leftLegRef.current.rotation.x  = 0
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0
    } else {
      isAttackingRef.current = false
      const gait = variant.gait
      if (moveDir) walkCycleRef.current += delta * gait.rate
      const t = walkCycleRef.current
      if (leftLegRef.current)  leftLegRef.current.rotation.x  =  Math.sin(t + gait.phL) * gait.ampL
      if (rightLegRef.current) rightLegRef.current.rotation.x = -Math.sin(t + gait.phR) * gait.ampR
      if (leftArmRef.current)  leftArmRef.current.rotation.x  = -Math.sin(t) * 0.20
      if (rightArmRef.current) rightArmRef.current.rotation.x  =  Math.sin(t) * 0.20
    }

    // Converge toward host's authoritative position (guest mode)
    const gp = _guestPositions[id]
    if (gp) {
      const ex = gp.x - pos.x, ez = gp.z - pos.z
      const err = Math.sqrt(ex * ex + ez * ez)
      if (err > 2.0) {
        // Large divergence — snap immediately (teleport / respawn edge case)
        pos.x = gp.x
        pos.z = gp.z
      } else {
        // Time-based exponential convergence: ~80% of error closed per 100ms
        // independent of frame rate (unlike a fixed 0.25/frame)
        const f = Math.min(1, delta * 16)
        pos.x += ex * f
        pos.z += ez * f
      }
    }
  })

  const bodyScale = hidden ? 0.001 : 1
  return (
    <group ref={ref} scale={bodyScale}>
      {hidden && <mesh geometry={bg(0.1, 0.1, 0.1)} material={HIT_MAT} frustumCulled={false} />}
      <group ref={bodyRef}>
        <ZombieBody
          type={type}
          id={id}
          variant={variant}
          health={health}
          maxHealth={maxHealth}
          leftArmRef={leftArmRef}
          rightArmRef={rightArmRef}
          leftLegRef={leftLegRef}
          rightLegRef={rightLegRef}
          headRef={headRef}
          sacRef={sacRef}
          holes={holes}
        />
      </group>
      {!hidden && FLAME_OFFSETS.map((off, i) => (
        <mesh
          key={`flame${i}`}
          ref={(el) => (flameRefs.current[i] = el)}
          position={off}
          visible={false}
          raycast={() => null}
          renderOrder={2}
          geometry={_flameGeo}
          material={i % 2 === 0 ? _flameMatOuter : _flameMatInner}
        />
      ))}
    </group>
  )
}

export default memo(ZombieComponent)

export { Zombie }
