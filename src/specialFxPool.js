// Pooled effects for the Wave 3 special zombies: exploder flash, spitter acid
// globs (projectiles) and ground puddles (acid DoT + harmless scorch marks).
// Three fixed InstancedMeshes (1 draw call each, shared geometry + material, no
// per-event allocation); mounted by components/SpecialFX.jsx. Everything here is
// client-local and cosmetic, except that the local player takes damage from globs
// and puddles on their own client (same model as zombie melee: every client
// damages only its own player, so no net sync is needed).
import * as THREE from 'three'
import { useGameStore } from './store'
import { SPITTER } from './zombieSpecials'
import { spawnImpact } from './impactParticles'
import { playAcidSplash } from './sounds'

const GLOB_POOL = 6
const PUDDLE_POOL = 10
const FLASH_POOL = 4

const _d = new THREE.Object3D()
const _c = new THREE.Color()
const _up = { x: 0, y: 1, z: 0 }
const _pt = { x: 0, y: 0, z: 0 }

function makeMesh(geo, mat, count, init) {
  const m = new THREE.InstancedMesh(geo, mat, count)
  m.frustumCulled = false
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  _d.position.set(0, 0, 0); _d.scale.set(0, 0, 0); _d.rotation.set(0, 0, 0); _d.updateMatrix()
  for (let i = 0; i < count; i++) m.setMatrixAt(i, _d.matrix)
  m.setColorAt(0, _c.set(init))   // allocates instanceColor
  m.instanceColor.setUsage(THREE.DynamicDrawUsage)
  m.count = 0                     // nothing to draw yet, but the shader still compiles at mount
  m.raycast = () => null
  return m
}

const opaqueMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
// Additive "colour fades to black = alpha fades out" so one InstancedMesh can fade per instance
const flashMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })

export const globMesh = makeMesh(new THREE.SphereGeometry(1, 8, 6), opaqueMat, GLOB_POOL, '#9aff3a')
export const puddleMesh = makeMesh(new THREE.CylinderGeometry(1, 1, 0.03, 14), opaqueMat, PUDDLE_POOL, '#5fc21a')
export const flashMesh = makeMesh(new THREE.SphereGeometry(1, 12, 8), flashMat, FLASH_POOL, '#ffb347')
puddleMesh.renderOrder = 1
flashMesh.renderOrder = 3

// ── Globs (spitter projectiles) ──────────────────────────────────────────────
const gLive = new Uint8Array(GLOB_POOL)
const gX0 = new Float32Array(GLOB_POOL), gY0 = new Float32Array(GLOB_POOL), gZ0 = new Float32Array(GLOB_POOL)
const gX1 = new Float32Array(GLOB_POOL), gZ1 = new Float32Array(GLOB_POOL)
const gU = new Float32Array(GLOB_POOL), gT = new Float32Array(GLOB_POOL), gArc = new Float32Array(GLOB_POOL)
let gNext = 0

// Lob a glob from (x0,y0,z0) to the floor point (x1,z1) over `flight` seconds.
export function spawnGlob(x0, y0, z0, x1, z1, flight) {
  const i = gNext
  gNext = (gNext + 1) % GLOB_POOL
  gLive[i] = 1
  gX0[i] = x0; gY0[i] = y0; gZ0[i] = z0
  gX1[i] = x1; gZ1[i] = z1
  gU[i] = 0; gT[i] = flight
  gArc[i] = 0.9 + Math.hypot(x1 - x0, z1 - z0) * 0.07
  globMesh.count = GLOB_POOL
}

// ── Puddles ──────────────────────────────────────────────────────────────────
const pLive = new Uint8Array(PUDDLE_POOL)
const pKind = new Uint8Array(PUDDLE_POOL)   // 0 acid (damages), 1 scorch (cosmetic)
const pX = new Float32Array(PUDDLE_POOL), pZ = new Float32Array(PUDDLE_POOL)
const pLife = new Float32Array(PUDDLE_POOL), pMax = new Float32Array(PUDDLE_POOL)
const pRad = new Float32Array(PUDDLE_POOL), pTick = new Float32Array(PUDDLE_POOL)
let pNext = 0
const ACID_NEW = new THREE.Color('#6fd81c'), ACID_OLD = new THREE.Color('#2d5a10'), SCORCH = new THREE.Color('#1a120a')

function addPuddle(x, z, kind) {
  const i = pNext
  pNext = (pNext + 1) % PUDDLE_POOL
  pLive[i] = 1; pKind[i] = kind
  pX[i] = x; pZ[i] = z
  pLife[i] = pMax[i] = kind === 0 ? SPITTER.PUDDLE_LIFE : 6
  pRad[i] = kind === 0 ? SPITTER.PUDDLE_RADIUS : 1.4
  pTick[i] = 0.15
  puddleMesh.count = PUDDLE_POOL
}
export const spawnScorch = (x, z) => addPuddle(x, z, 1)

// ── Flashes (exploder burst) ─────────────────────────────────────────────────
const fLive = new Uint8Array(FLASH_POOL)
const fX = new Float32Array(FLASH_POOL), fY = new Float32Array(FLASH_POOL), fZ = new Float32Array(FLASH_POOL)
const fLife = new Float32Array(FLASH_POOL)
const FLASH_TIME = 0.4
const FLASH_RADIUS = 3.0
const FLASH_COLOR = new THREE.Color('#ffa63a')
let fNext = 0

export function spawnFlash(x, y, z) {
  const i = fNext
  fNext = (fNext + 1) % FLASH_POOL
  fLive[i] = 1; fX[i] = x; fY[i] = y; fZ[i] = z; fLife[i] = FLASH_TIME
  flashMesh.count = FLASH_POOL
}

export function clearSpecialFx() {
  gLive.fill(0); pLive.fill(0); fLive.fill(0)
  _d.scale.set(0, 0, 0); _d.updateMatrix()
  for (let i = 0; i < GLOB_POOL; i++) globMesh.setMatrixAt(i, _d.matrix)
  for (let i = 0; i < PUDDLE_POOL; i++) puddleMesh.setMatrixAt(i, _d.matrix)
  for (let i = 0; i < FLASH_POOL; i++) flashMesh.setMatrixAt(i, _d.matrix)
  globMesh.instanceMatrix.needsUpdate = puddleMesh.instanceMatrix.needsUpdate = flashMesh.instanceMatrix.needsUpdate = true
}

function hurt(dmg, x, z) {
  useGameStore.getState().hitPlayer(dmg, x, z)
}

function landGlob(i, x, z, direct) {
  gLive[i] = 0
  _d.scale.set(0, 0, 0); _d.updateMatrix()
  globMesh.setMatrixAt(i, _d.matrix)
  addPuddle(x, z, 0)
  _pt.x = x; _pt.y = 0.05; _pt.z = z
  spawnImpact(_pt, _up, 'acid')
  playAcidSplash(x, 0.2, z)
  return direct
}

// camX/camZ: local player (the camera). dt already scaled by game time.
export function updateSpecialFx(dt, camX, camZ, playing) {
  const t = performance.now() / 1000
  let globs = false, puddles = false, flashes = false

  for (let i = 0; i < GLOB_POOL; i++) {
    if (!gLive[i]) continue
    globs = true
    gU[i] += dt / gT[i]
    const u = gU[i]
    if (u >= 1) {
      landGlob(i, gX1[i], gZ1[i])
      if (playing && Math.hypot(camX - gX1[i], camZ - gZ1[i]) < SPITTER.PUDDLE_RADIUS) hurt(SPITTER.SPLASH_DAMAGE, gX1[i], gZ1[i])
      continue
    }
    const x = gX0[i] + (gX1[i] - gX0[i]) * u
    const z = gZ0[i] + (gZ1[i] - gZ0[i]) * u
    const y = gY0[i] * (1 - u) + 0.05 * u + gArc[i] * 4 * u * (1 - u)
    // Passing through the player bursts on them (dodgeable: keep moving)
    if (playing && y > 0.1 && y < 1.9 && Math.hypot(camX - x, camZ - z) < SPITTER.GLOB_HIT_RADIUS) {
      landGlob(i, x, z)
      hurt(SPITTER.SPLASH_DAMAGE, x, z)
      continue
    }
    const s = 0.14 * (1 + Math.sin(t * 30 + i) * 0.15)
    _d.position.set(x, y, z); _d.scale.set(s, s * (1 + (1 - u) * 0.2), s); _d.rotation.set(0, 0, 0); _d.updateMatrix()
    globMesh.setMatrixAt(i, _d.matrix)
  }
  if (globs) globMesh.instanceMatrix.needsUpdate = true

  for (let i = 0; i < PUDDLE_POOL; i++) {
    if (!pLive[i]) continue
    puddles = true
    pLife[i] -= dt
    if (pLife[i] <= 0) {
      pLive[i] = 0
      _d.scale.set(0, 0, 0); _d.updateMatrix()
      puddleMesh.setMatrixAt(i, _d.matrix)
      continue
    }
    const age = pMax[i] - pLife[i]
    const grow = Math.min(1, age / 0.18)
    const fade = Math.min(1, pLife[i] / 0.8)
    const r = pRad[i] * (0.35 + 0.65 * grow) * (0.5 + 0.5 * fade)
    if (pKind[i] === 0) {
      _c.copy(ACID_NEW).lerp(ACID_OLD, age / pMax[i])
      // bubbling shimmer
      const sh = 0.92 + Math.sin(t * 9 + i * 2) * 0.08
      _c.multiplyScalar(sh)
      puddleMesh.setColorAt(i, _c)
      if (playing && Math.hypot(camX - pX[i], camZ - pZ[i]) < r) {
        pTick[i] -= dt
        if (pTick[i] <= 0) { pTick[i] = SPITTER.PUDDLE_TICK; hurt(SPITTER.PUDDLE_DAMAGE, pX[i], pZ[i]) }
      } else pTick[i] = Math.min(pTick[i] + dt, 0.15)
    } else {
      puddleMesh.setColorAt(i, SCORCH)
    }
    _d.position.set(pX[i], 0.015 + i * 0.0004, pZ[i]); _d.scale.set(r, 1, r); _d.rotation.set(0, 0, 0); _d.updateMatrix()
    puddleMesh.setMatrixAt(i, _d.matrix)
  }
  if (puddles) { puddleMesh.instanceMatrix.needsUpdate = true; puddleMesh.instanceColor.needsUpdate = true }

  for (let i = 0; i < FLASH_POOL; i++) {
    if (!fLive[i]) continue
    flashes = true
    fLife[i] -= dt
    if (fLife[i] <= 0) {
      fLive[i] = 0
      _d.scale.set(0, 0, 0); _d.updateMatrix()
      flashMesh.setMatrixAt(i, _d.matrix)
      continue
    }
    const k = 1 - fLife[i] / FLASH_TIME            // 0 -> 1
    const s = 0.4 + FLASH_RADIUS * (1 - (1 - k) * (1 - k))
    _c.copy(FLASH_COLOR).multiplyScalar(Math.pow(1 - k, 1.4))
    flashMesh.setColorAt(i, _c)
    _d.position.set(fX[i], fY[i], fZ[i]); _d.scale.set(s, s, s); _d.rotation.set(0, 0, 0); _d.updateMatrix()
    flashMesh.setMatrixAt(i, _d.matrix)
  }
  if (flashes) { flashMesh.instanceMatrix.needsUpdate = true; flashMesh.instanceColor.needsUpdate = true }
}
