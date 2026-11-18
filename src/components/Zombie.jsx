// Zombie model + pose. The AI (pathing, state machine, attack timers, specials, hit-reaction timers,
// the death sequence) lives in src/zombieAI/* and is ticked once per frame by ZombieManager; this file
// only draws it: ZombieBody is the model, poseZombie copies the sim state (src/zombieAI/state.js) onto
// the groups (position, yaw, limbs, lean, head snap, flash, flames, death fall).
import { memo, useRef, useEffect, useState, useMemo } from 'react'
import { getZombieArchetype, useGameStore, ZOMBIE_ARCHETYPES } from '../store'
import { playScreamerScreech } from '../sounds'
import { blood } from '../fxBus'
import { registerZombieRef, unregisterZombieRef, registerHoleAdder, unregisterHoleAdder } from '../zombieRegistry'
import { getZombieVariant, getVariantColors } from '../zombieVariant'
import * as THREE from 'three'
import { SPIDER, spiderAirborne } from '../zombieSpecials'
import Hitbox from './Hitbox'
import { hitboxSpec } from '../hitboxes'
import { zombieMaterial } from '../zombieMesh'
import { headGeo, bodyGeo, armGeo, legGeo, sacGeo, spiderUpperGeo, spiderLowerGeo, zombieGeometryJobs, SPIDER_L1 } from '../zombieParts'
import { zombieSystem } from '../zombieLive'
import { ATTACK_INTERVAL, LEAN_DURATION, HEAD_SNAP_DURATION, FLASH_NONE, FLASH_ON } from '../zombieAI/constants'

const _geoCache = new Map()
function bg(x, y, z) {
  const k = `${x},${y},${z}`
  if (!_geoCache.has(k)) _geoCache.set(k, new THREE.BoxGeometry(x, y, z))
  return _geoCache.get(k)
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

// Reused scratch for the death pose (written and consumed within one zombie's pose call)
const _deathTmpQuat = new THREE.Quaternion()
const _deathTmpEuler = new THREE.Euler()

// Bullet holes are pushed into a zombie's model through zombieRegistry.addBulletHole; ignite and
// hit reactions go straight to zombieSystem (src/zombieLive.js).

// ── Hit flash ───────────────────────────────────────────────────────────────
// Zombie materials are shared across zombies (one per palette, see zombieMesh.js), so we can't
// pulse an emissive. Instead the baked part meshes (those with userData.zombieId, about six per
// zombie) briefly swap to ONE shared opaque basic material, then swap back. No per-zombie
// materials. It is warmed by the always-mounted hidden warmer zombie (see ZombieComponent).
const HIT_MAT = new THREE.MeshBasicMaterial({ color: '#ffd8cc' })
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

// Corpse freeze: bake matrices and drop shadows. (A zombie is only ~6 merged part meshes now, so the
// old trick of hiding small decor meshes is gone: there are none left to hide.)
function _freezeVisit(o) {
  o.updateMatrix()
  o.matrixAutoUpdate = false
  if (o.isMesh) o.castShadow = false
}
function freezeCorpse(group) {
  group.updateMatrixWorld(true)
  group.traverse(_freezeVisit)
}

const _hv = new THREE.Vector3()
const _hd = new THREE.Vector3()
const _axis = new THREE.Vector3()

// Shared flame materials/geometry — created once, additive-blended so they read as
// glowing fire without adding lighting cost. Visibility/scale toggled per-zombie.
const _flameGeo = (() => {
  const g = new THREE.ConeGeometry(0.16, 0.42, 6)
  g.translate(0, 0.21, 0)
  return g
})()
const _flameMatOuter = new THREE.MeshBasicMaterial({ color: '#ff7700', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
const _flameMatInner = new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending })
const FLAME_OFFSETS = [
  [0, 0.30, 0.08],
  [0, 0.78, 0.05],
  [-0.18, 0.15, 0.05],
  [0.18, 0.15, 0.05],
]

// Called by NetManager on host to collect current zombie positions for broadcast
export function getZombiePositions() {
  return zombieSystem.positions()
}

// Called by NetManager on guest to apply host's authoritative positions
export function applyRemoteZombiePositions(posMap) {
  zombieSystem.applyRemotePositions(posMap)
}

// Static zombie colors (shared across all instances)
const pants     = '#18180f'
const skullBone = '#c2b090'
const skullDark = '#a09070'
const eyeGlow   = '#ffaa00'
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
  spider: { skin: '#a3a596', skinDark: '#77796c', skinVein: '#3c3c58', shirt: '#6e665c', shirtTear: '#4a443c', accent: '#b8c8de', eye: '#dff2ff' },
  boss: { skin: '#8b4c43', skinDark: '#5b2d28', skinVein: '#2d0707', shirt: '#201010', shirtTear: '#120808', accent: '#ff2a1a', eye: '#ff1000' },
}

function getZombieColors(type, health, maxHealth) {
  const base = health <= Math.ceil(maxHealth / 2) ? _SKIN_DAMAGED : _SKIN_NORMAL
  return { ...base, ...(_TYPE_COLORS[type] ?? _TYPE_COLORS.walker) }
}

// Bake every part geometry in idle time (a few ms per slice, once): a rare variant (torn jaw, stump
// arm...) or a new archetype then never builds geometry on the frame it spawns. Started by the
// always-mounted warmer zombie.
let _geoWarmStarted = false
function warmZombieGeometries() {
  if (_geoWarmStarted) return
  _geoWarmStarted = true
  const jobs = zombieGeometryJobs(Object.keys(ZOMBIE_ARCHETYPES), Object.keys(ZOMBIE_ARCHETYPES).filter((t) => ZOMBIE_ARCHETYPES[t].boss))
  const later = (f) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 60))
  const step = () => {
    const t0 = performance.now()
    while (jobs.length && performance.now() - t0 < 3) jobs.shift()()
    if (jobs.length) later(step)
  }
  later(step)
}

// One baked part of a zombie (see src/zombieParts.js): a single mesh for everything the animation
// rotates together. `userData.zombieId` marks it for the hit flash and corpse freeze, `isHead` for
// headshots. Memoised: geometry and material come from caches, so it never re-renders on health
// or hole changes.
const PartMesh = memo(function PartMesh({ geo, mat, id, head = false, shadow = false }) {
  const userData = useMemo(() => ({ zombieId: id, isHead: head }), [id, head])
  return <mesh geometry={geo} material={mat} castShadow={shadow} userData={userData} />
})

// ── Spider: model + module helpers ──────────────────────────────────────────
// The spider is built in its own "surface frame": +z forward, +y away from the surface it
// clings to (the floor, or the ceiling once the flip group rolls it by PI), body centre at
// the origin and the surface at y = -SPIDER.BODY_Y. The humanoid torso + head are reused,
// laid on their back (head forward, chest away from the surface) and tilted so the head
// rides a little higher; the four limbs are custom and bend the wrong way.
const SPIDER_MODEL_ROT = [-Math.PI / 2 - 0.18, 0, Math.PI]
const SPIDER_MODEL_POS = [0, 0, -0.25]
// SPIDER_L1 / SPIDER_L2 (upper / lower limb length) live in zombieParts.js with the limb geometry
const SPIDER_A0 = 0.75             // upper limb raise above the body plane (rad)
// phi = forward angle from the lateral axis, b = elbow/knee bend, ph = gait phase
// (diagonal pairs move together). Order = leftArm, rightArm, leftLeg, rightLeg refs.
const SPIDER_LIMBS = [
  { pos: [ 0.22,  0.00,  0.10], side:  1, phi:  0.75, arm: true,  b: 1.75, ph: 0 },
  { pos: [-0.22,  0.00,  0.10], side: -1, phi:  0.75, arm: true,  b: 1.75, ph: Math.PI },
  { pos: [ 0.14, -0.07, -0.42], side:  1, phi: -0.65, arm: false, b: 1.68, ph: Math.PI },
  { pos: [-0.14, -0.07, -0.42], side: -1, phi: -0.65, arm: false, b: 1.68, ph: 0 },
]
const SPIDER_HB = hitboxSpec('spider')
const SPIDER_FLAMES = [[0, 0.05, 0.3], [0, 0.1, -0.25], [0.35, -0.05, 0.1], [-0.35, -0.05, 0.1]]
const _flipInv = new THREE.Matrix4()

// One merged mesh per limb half (src/zombieParts.js). Layout (poseSpiderLimbs relies on it):
// outer group (yaw) > raise group > [knee group (FIRST child) > lower half, hitbox], upper half,
// hitbox (hitbox boxes are the LAST child of their group).
function SpiderLimbs({ id, limbRefs, mat }) {
  return SPIDER_LIMBS.map((L, i) => (
    <group key={i} ref={limbRefs[i]} position={L.pos} rotation={[0, L.side > 0 ? -L.phi : Math.PI + L.phi, 0]}>
      <group rotation={[0, 0, SPIDER_A0]}>
        <group position={[SPIDER_L1, 0, 0]} rotation={[0, 0, -L.b]}>
          <PartMesh geo={spiderLowerGeo(L.arm)} mat={mat} id={id} />
          <Hitbox part="limb" box={SPIDER_HB.limbLower} />
        </group>
        <PartMesh geo={spiderUpperGeo(L.arm)} mat={mat} id={id} shadow />
        <Hitbox part="limb" box={SPIDER_HB.limbUpper} />
      </group>
    </group>
  ))
}

// Pose the four spider limbs. mode: 'walk' | 'idle' | 'windup' | 'attack' | 'fall' | 'dead';
// t = gait cycle / clock, k = 0..1 strength of windup / attack / dead.
export function poseSpiderLimbs(refs, mode, t, k = 0) {
  for (let i = 0; i < 4; i++) {
    const g = refs[i]?.current
    if (!g) continue
    const L = SPIDER_LIMBS[i]
    const raise = g.children[0]
    const knee = raise?.children[0]
    let phi = L.phi, a = SPIDER_A0, b = L.b
    if (mode === 'walk') {
      const ph = t + L.ph
      phi -= 0.32 * Math.cos(ph)               // swings forward while lifted
      a += 0.3 * Math.max(0, Math.sin(ph))
    } else if (mode === 'idle') {
      a += 0.035 * Math.sin(t * 2.2 + L.ph)
    } else if (mode === 'windup') {            // coils in and trembles
      a += 0.24 * k + Math.sin(t * 55 + i * 1.7) * 0.035 * k
      phi *= 1 - 0.3 * k
    } else if (mode === 'attack') {            // front limbs rear up, then slam
      if (L.arm) { a += 1.1 * k; b -= 0.6 * k }
    } else if (mode === 'fall') {              // splayed mid-air
      a += 0.45; b -= 0.6
    } else if (mode === 'dead') {              // curls up
      a += 0.6 * k; b += 0.75 * k; phi *= 1 - 0.3 * k
    }
    g.rotation.y = L.side > 0 ? -phi : Math.PI + phi
    if (raise) raise.rotation.z = a
    if (knee) knee.rotation.z = -b
  }
}

// `seed` (default: id) picks the look, see zombieVariant.js. `variant` may be passed
// pre-computed (ZombieComponent also needs it for the gait) to skip the lookup.
export function ZombieBody({ type = 'walker', id = 'display', seed, variant: variantProp, health, maxHealth, leftArmRef, rightArmRef, leftLegRef, rightLegRef, headRef, sacRef, holes = [] }) {
  const archetype = getZombieArchetype(type)
  const hp = health ?? archetype.health
  const maxHp = maxHealth ?? archetype.health   // Horde modifier halves spawn HP
  const colors = getZombieColors(type, hp, maxHp)
  const variant = useMemo(() => variantProp ?? getZombieVariant(type, seed ?? id), [variantProp, type, seed, id])
  // Per-variant colours (cached by zombieVariant.js). Only the walker's palette darkens with
  // health (the other archetypes override those colours entirely). They become the palette of a
  // shared material (one per palette, one shader program for all of them), see zombieMesh.js.
  const vc = getVariantColors(type, variant, colors, type === 'walker' && hp <= Math.ceil(maxHp / 2))
  const mat = zombieMaterial(`${type}|${variant.shirt}|${variant.pants}|${variant.tone}|${type === 'walker' && hp <= Math.ceil(maxHp / 2) ? 1 : 0}`, {
    shirt: vc.shirt, shirtTear: vc.shirtTear, pants: vc.pants, skin: vc.skin, skinDark: vc.skinDark, skinVein: vc.skinVein,
    skullBone: vc.skullBone, skullDark: vc.skullDark, accent: colors.accent, eye: colors.eye, baseVein: colors.skinVein,
  })
  const heightScale = archetype.heightScale ?? 1
  const isCrawler = type === 'crawler'
  const isScreamer = type === 'screamer'
  const isRunner = type === 'runner'
  const isBrute = type === 'brute'
  const isBoss = archetype.boss
  const isExploder = type === 'exploder'
  const isArmored = type === 'armored'
  const isSpitter = type === 'spitter'
  const isSpider = type === 'spider'
  const hb = hitboxSpec(type)   // invisible raycast boxes (src/hitboxes.js)
  // Variant build: scales the whole model group, so meshes (and therefore the raycast
  // hitboxes, head included) scale with the visuals. Feet are re-seated on the floor.
  const baseHeight = isCrawler ? 0.7 : isScreamer ? heightScale * 1.08 : heightScale
  const widthScale = (isBoss ? 1.42 : isExploder ? 1.2 : isArmored ? 1.12 : isSpitter || isSpider ? 0.9 : isBrute ? 1.32 : isRunner ? 0.88 : isCrawler ? 1.08 : isScreamer ? 0.82 : 1) * variant.w
  const depthScale = (isBoss ? 1.42 : isExploder ? 1.3 : isArmored ? 1.12 : isSpitter || isSpider ? 0.9 : isBrute ? 1.32 : isRunner ? 0.88 : isCrawler ? 1.22 : isScreamer ? 0.88 : 1) * variant.w
  const visualHeightScale = baseHeight * variant.h
  const modelPosition = isCrawler ? [0, -0.36, 0.10] : isSpider ? SPIDER_MODEL_POS : [0, 0.866 * baseHeight * (variant.h - 1), 0]
  // limp = a slight static lean toward the bad leg
  const modelRotation = isCrawler ? [-0.82, 0, 0] : isSpider ? SPIDER_MODEL_ROT : isScreamer ? [0.16, 0, 0] : isSpitter ? [0.24, 0, 0] : [0, 0, variant.limp * 0.05]
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

      {/* ══ HEAD ══ (skull, jaw, teeth, eyes, helmet... baked into one mesh: src/zombieParts.js) */}
      <group ref={headRef} position={headPosition}>
        <PartMesh geo={headGeo(type, variant)} mat={mat} id={id} head shadow />
        <Hitbox part="head" box={hb.head} />
      </group>

      <group rotation={bodyRotation}>
      {/* ══ NECK + TORSO + HIPS + type gear ══ */}
      <PartMesh geo={bodyGeo(type, variant, isBoss)} mat={mat} id={id} shadow />
      {isSpitter && (
        /* Glowing throat sac (pulses during the spit wind-up) */
        <group ref={sacRef} position={[0, 0.40, 0.085]}>
          <PartMesh geo={sacGeo()} mat={mat} id={id} />
        </group>
      )}

      {!isSpider && (
        <>
      {/* ══ LEFT ARM — pivot at shoulder ══ */}
      <group ref={leftArmRef} position={leftArmPosition}>
        <Hitbox part="arm" box={hb.armL} />
        <PartMesh geo={armGeo(-1, type, variant)} mat={mat} id={id} shadow />
      </group>

      {/* ══ RIGHT ARM — pivot at shoulder ══ */}
      <group ref={rightArmRef} position={rightArmPosition}>
        <Hitbox part="arm" box={hb.armR} />
        <PartMesh geo={armGeo(1, type, variant)} mat={mat} id={id} shadow />
      </group>
        </>
      )}

      {!isCrawler && !isSpider && (
        <>
      {/* ══ LEFT LEG — pivot at hip ══ */}
      <group ref={leftLegRef} position={[-0.12, -0.175, 0]}>
        <Hitbox part="leg" box={hb.legL} />
        <PartMesh geo={legGeo(type)} mat={mat} id={id} shadow />
      </group>

      {/* ══ RIGHT LEG — pivot at hip ══ */}
      <group ref={rightLegRef} position={[0.12, -0.175, 0]}>
        <Hitbox part="leg" box={hb.legR} />
        <PartMesh geo={legGeo(type)} mat={mat} id={id} shadow />
      </group>
        </>
      )}

      <Hitbox part="torso" box={hb.torso} />
      </group>
      </group>

      {isSpider && (
        <SpiderLimbs id={id} limbRefs={[leftArmRef, rightArmRef, leftLegRef, rightLegRef]} mat={mat} />
      )}

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

// ── Pose: sim state -> groups ───────────────────────────────────────────────
// Runs once per frame per zombie, right after ZombieSystem.tick (see ZombieManager). Everything here
// is drawing: it never decides anything. `rig` holds the groups and the few purely visual states
// (walk cycle, baked death quaternions, flame / scale flags).
function popHead(rig, kill) {
  const head = rig.headRef.current
  if (!head) return
  head.localToWorld(_hv.set(0, 0.78, 0))
  blood.spawn(_hv, _hd.set(kill.dx, 0.35, kill.dz).normalize(), 2)
  head.visible = false
}

function poseDeath(rig, zs, g) {
  const fx = zs.fx
  if (!rig.deathStart) {
    // First dying frame: capture current orientation and build target
    rig.deathStart = g.quaternion.clone()
    if (fx.style === 1) {
      // World-axis tilt so the top of the body travels along the shot direction
      rig.deathEnd = new THREE.Quaternion()
        .setFromAxisAngle(_axis.set(fx.kz, 0, -fx.kx), Math.PI / 2)
        .multiply(rig.deathStart)
    } else {
      // Extract the facing (Y) angle from the lookAt quaternion using YXZ order,
      // which avoids gimbal lock when decomposing a pure-Y rotation
      const yAngle = _deathTmpEuler.setFromQuaternion(g.quaternion, 'YXZ').y
      // End pose: same facing direction, tilted 90° forward (positive X rotation = falls toward player)
      rig.deathEnd = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(0, yAngle, 0))
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)))
    }
    // Ensure slerp takes the shortest arc
    if (rig.deathStart.dot(rig.deathEnd) < 0) {
      rig.deathEnd.set(-rig.deathEnd.x, -rig.deathEnd.y, -rig.deathEnd.z, -rig.deathEnd.w)
    }
    // Deagle kill: the head pops
    if (fx.kill && fx.kill.weapon === 'deagle') popHead(rig, fx.kill)
  }
  if (fx.style === 2) {
    // knife: knees buckle
    const buckle = zs.deathBuckle
    if (rig.leftLegRef.current)  rig.leftLegRef.current.rotation.x  = -1.1 * buckle
    if (rig.rightLegRef.current) rig.rightLegRef.current.rotation.x = -0.8 * buckle
    if (rig.leftArmRef.current)  rig.leftArmRef.current.rotation.x  = -0.5 * buckle
    if (rig.rightArmRef.current) rig.rightArmRef.current.rotation.x = -0.35 * buckle
  }
  _deathTmpQuat.slerpQuaternions(rig.deathStart, rig.deathEnd, zs.deathRotT)
  g.quaternion.copy(_deathTmpQuat)
}

function poseSpiderDeath(rig, zs) {
  const d = zs.spDead
  if (!d) return
  const fl = rig.flipRef.current
  if (!rig.spDeadInit) {
    rig.spDeadInit = true
    if (fl) fl.position.x = 0
    const kill = zs.fx.kill
    if (kill && kill.weapon === 'deagle') popHead(rig, kill)
  }
  if (fl) fl.rotation.z = d.f0 + (Math.PI - d.f0) * d.k
  poseSpiderLimbs(rig.limbRefs, 'dead', 0, d.k)
}

function poseAlive(rig, zs, dt) {
  const variant = rig.variant
  if (zs.isSpider) {
    const sp = zs.spd
    const fl = rig.flipRef.current
    if (fl) fl.rotation.z = sp.flip
    if (zs.moving) rig.walkCycle += dt * variant.gait.rate * 2.2   // fast scuttle
    let mode = zs.moving ? 'walk' : 'idle', k = 0, t = rig.walkCycle
    if (sp.s === 'windup') { mode = 'windup'; k = 1 - Math.max(0, sp.t) / SPIDER.WINDUP; t = performance.now() / 1000 }
    else if (spiderAirborne(sp)) mode = 'fall'
    else if (zs.attacking) {
      const ph = 1.0 - zs.attackTimer / ATTACK_INTERVAL
      mode = 'attack'; k = ph < 0.72 ? ph / 0.72 : 1 - (ph - 0.72) / 0.28   // slow rear-up, fast slam
    }
    poseSpiderLimbs(rig.limbRefs, mode, t, k)
    if (fl) fl.position.x = mode === 'windup' ? Math.sin(performance.now() * 0.06) * 0.025 * k : 0
  } else if (zs.attacking) {
    const phase = 1.0 - zs.attackTimer / ATTACK_INTERVAL
    // Slow lift (72% of cycle), fast slam (28% of cycle)
    const HIGH = 0.9, LOW = -1.05, LIFT = 0.1
    const armX = phase < LIFT
      ? LOW + (HIGH - LOW) * (phase / LIFT)
      : HIGH + (LOW - HIGH) * ((phase - LIFT) / (1 - LIFT))
    if (rig.leftArmRef.current)  rig.leftArmRef.current.rotation.x  = armX
    if (rig.rightArmRef.current) rig.rightArmRef.current.rotation.x = armX
    if (rig.leftLegRef.current)  rig.leftLegRef.current.rotation.x  = 0
    if (rig.rightLegRef.current) rig.rightLegRef.current.rotation.x = 0
  } else {
    const gait = variant.gait
    if (zs.moving) rig.walkCycle += dt * gait.rate
    const t = rig.walkCycle
    if (rig.leftLegRef.current)  rig.leftLegRef.current.rotation.x  =  Math.sin(t + gait.phL) * gait.ampL
    if (rig.rightLegRef.current) rig.rightLegRef.current.rotation.x = -Math.sin(t + gait.phR) * gait.ampR
    if (rig.leftArmRef.current)  rig.leftArmRef.current.rotation.x  = -Math.sin(t) * 0.20
    if (rig.rightArmRef.current) rig.rightArmRef.current.rotation.x  =  Math.sin(t) * 0.20
  }
}

function poseZombie(rig, zs, dt) {
  const g = rig.ref.current
  if (!g || rig.frozen) return
  const fx = zs.fx

  // Hit flash / exploder flash (the sim decides when, we swap the material)
  if (zs.flashCmd !== FLASH_NONE) { setFlash(g, zs.flashCmd === FLASH_ON); zs.flashCmd = FLASH_NONE }

  // Hit reactions: lean the body, snap the head (timers run in the sim)
  const body = rig.bodyRef.current
  if (fx.leanDirty && body) {
    fx.leanDirty = false
    const k = fx.lean > 0 ? fx.lean / LEAN_DURATION : 0
    const e = k > 0.65 ? (1 - k) / 0.35 : k / 0.65
    body.rotation.set(fx.leanA * fx.lz * e, 0, -fx.leanA * fx.lx * e)
  }
  const head = rig.headRef.current
  if (fx.headDirty && head) {
    fx.headDirty = false
    if (!fx.hbSet) { fx.hbY = head.position.y; fx.hbZ = head.position.z; fx.hbSet = true }
    const k = fx.head > 0 ? fx.head / HEAD_SNAP_DURATION : 0
    const e = k > 0.6 ? (1 - k) / 0.4 : k / 0.6
    const rx = fx.headA * fx.lz * e
    head.rotation.set(rx, 0, -fx.headA * fx.lx * e)
    // rotate about the neck, not the head-group origin
    head.position.y = fx.hbY + NECK_Y * (1 - Math.cos(rx))
    head.position.z = fx.hbZ - NECK_Y * Math.sin(rx)
  }

  // Burning flame visual
  const flames = rig.flameRefs.current
  if (zs.burn > 0) {
    rig.flamesOn = true
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i]
      if (!f) continue
      f.visible = true
      const tt = performance.now() / 1000 + i * 1.7
      const s = 0.85 + Math.sin(tt * 14) * 0.18 + Math.sin(tt * 23 + i) * 0.08
      f.scale.set(s, s * (1 + Math.sin(tt * 9) * 0.25), s)
    }
  } else if (rig.flamesOn) {
    rig.flamesOn = false
    for (let i = 0; i < flames.length; i++) { if (flames[i] && flames[i].visible) flames[i].visible = false }
  }

  // Exploder: the body swells while the fuse burns
  if (zs.isExploder && body) {
    const ex = zs.ex
    if (ex.fuse >= 0 && !ex.done) {
      const k = Math.min(1, 1 - ex.fuse / ex.total)
      body.scale.setScalar(1 + 0.5 * k * k + Math.sin(performance.now() * 0.05) * 0.025 * k)
      rig.exScaled = true
    } else if (rig.exScaled) {
      body.scale.setScalar(1)
      rig.exScaled = false
    }
  }

  // Spitter wind-up: head rears back, throat sac swells (k 0..1)
  if (zs.isSpitter && zs.sp.poseDirty) {
    zs.sp.poseDirty = false
    const k = zs.sp.poseK
    if (head && fx.head <= 0) head.rotation.x = -0.75 * k
    if (rig.sacRef.current) {
      const s = 1 + 0.55 * k + Math.sin(performance.now() * 0.03) * 0.12 * k
      rig.sacRef.current.scale.set(s, s, s)
    }
  }

  g.position.set(zs.x, zs.y, zs.z)

  if (zs.dying) {
    if (zs.isSpider) poseSpiderDeath(rig, zs)
    else if (zs.deathStarted) poseDeath(rig, zs, g)
  } else {
    g.rotation.y = zs.yaw   // the sim's facing (Object3D.lookAt at a horizontal target)
    if (zs.animDirty) poseAlive(rig, zs, dt)
  }

  if (zs.corpse) {
    // Settled: out of every registry (not a raycast / melee / flame target, no AI), baked matrices, no shadows.
    for (let i = 0; i < flames.length; i++) { if (flames[i]) flames[i].visible = false }
    unregisterZombieRef(zs.id, g)
    unregisterHoleAdder(zs.id)
    freezeCorpse(g)
    rig.frozen = true
    zs.pose = null
  }
}

function ZombieComponent({ id, startX, startZ, type = 'walker', hidden = false }) {
  const ref = useRef()
  const archetype = getZombieArchetype(type)
  const health = useGameStore((s) => s.zombies.find((z) => z.id === id)?.health ?? archetype.health)
  const maxHealth = useGameStore((s) => s.zombies.find((z) => z.id === id)?.maxHealth ?? archetype.health)

  const [holes, setHoles] = useState([])

  const flipRef = useRef()                 // spider: rolls the body onto the ceiling (rotation.z = PI)
  const sacRef = useRef()                  // spitter throat sac
  const leftLegRef      = useRef()
  const rightLegRef     = useRef()
  const leftArmRef      = useRef()
  const rightArmRef     = useRef()
  const limbRefs        = useRef([leftArmRef, rightArmRef, leftLegRef, rightLegRef]).current   // spider limbs
  const flameRefs       = useRef([])
  const bodyRef         = useRef()   // lean wrapper around the whole model
  const headRef         = useRef()   // head-snap / head-pop
  // Deterministic look from the id (same on host and guest, no net data)
  const variant         = useMemo(() => getZombieVariant(type, id), [type, id])
  const isSpider = type === 'spider'

  // Visual-only state of the pose (the AI state lives in the ZombieSystem)
  const rigRef = useRef(null)
  if (!rigRef.current) {
    rigRef.current = {
      ref, flipRef, sacRef, leftLegRef, rightLegRef, leftArmRef, rightArmRef, limbRefs, flameRefs, bodyRef, headRef,
      variant, walkCycle: Math.random() * Math.PI * 2,
      frozen: false, flamesOn: false, exScaled: false, spDeadInit: false, deathStart: null, deathEnd: null,
    }
  }
  rigRef.current.variant = variant

  useEffect(() => {
    if (hidden) return
    const g = ref.current
    const zs = zombieSystem.ensure(id, type, startX, startZ)
    if (g) {
      g.position.set(zs.x, zs.y, zs.z)
      registerZombieRef(id, g)
    }
    const addHole = (localPos, localNormal) => {
      // Holes render inside the spider's flip group: move the point into that frame
      const fl = flipRef.current
      if (fl && (fl.rotation.z !== 0 || fl.position.x !== 0)) {
        fl.updateMatrix()
        localPos = localPos.clone().applyMatrix4(_flipInv.copy(fl.matrix).invert())
      }
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        localNormal.clone().normalize()
      )
      setHoles((prev) => [...prev, { pos: localPos.clone(), quat }])
    }
    registerHoleAdder(id, addHole)
    if (!zs.corpse) zs.pose = (z, dt) => poseZombie(rigRef.current, z, dt)
    return () => {
      if (zs.pose) zs.pose = null
      unregisterZombieRef(id, g)
      unregisterHoleAdder(id, addHole)
    }
  }, [id, type, startX, startZ, hidden])

  useEffect(() => { if (hidden) warmZombieGeometries() }, [hidden])

  useEffect(() => {
    if (hidden) return
    if (type === 'screamer') playScreamerScreech(startX, 1.4, startZ)
  }, [hidden, type, startX, startZ])

  const bodyScale = hidden ? 0.001 : 1
  return (
    <group ref={ref} scale={bodyScale}>
      {hidden && <mesh geometry={bg(0.1, 0.1, 0.1)} material={HIT_MAT} frustumCulled={false} />}
      <group ref={flipRef}>
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
      </group>
      {!hidden && (isSpider ? SPIDER_FLAMES : FLAME_OFFSETS).map((off, i) => (
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
