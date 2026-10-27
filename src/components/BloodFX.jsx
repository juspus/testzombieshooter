import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store'
import { getMap, getInitialMapId } from '../maps'
import { FX_IS_MOBILE } from '../fxConfig'

// Blood burst particles + persistent floor/wall splatter decals.
// Everything is pooled in InstancedMeshes (1 draw call each, shared geometry +
// material, no per-event allocation). Spawned via the module-level emitter
// BloodFX.spawn(point, dir, ...) — same pattern as BulletTrails.add — so no
// store churn. Decals persist until the wave ends (cleared on phase change).

const PARTICLE_POOL = FX_IS_MOBILE ? 48 : 96
const FLOOR_DECALS = FX_IS_MOBILE ? 28 : 48
const WALL_DECALS = FX_IS_MOBILE ? 12 : 24
const GRAVITY = 9.5
const FLOOR_Y = 0.012
const WALL_H_MAX = 2.3
const COUNT_SCALE = FX_IS_MOBILE ? 0.6 : 1

const ACTIVE_MAP = getMap(getInitialMapId())
// Closed doors (Wave 3) also catch blood decals; rebuilt when a door opens.
let WALLS = ACTIVE_MAP.bulletWallSegments(useGameStore.getState?.().openDoors ?? {})
useGameStore.subscribe?.((s, prev) => {
  if (s.openDoors !== prev.openDoors) WALLS = ACTIVE_MAP.bulletWallSegments(s.openDoors)
})

const TONES = ['#5a0a0a', '#7a0f0f', '#3d0606', '#650c0c'].map((c) => new THREE.Color(c))

// Irregular blob alpha mask (white on transparent), tinted per instance.
const splatTexture = (() => {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    let s = 0x5eed
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(32, 32, 14, 0, Math.PI * 2); ctx.fill()
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2
      const d = 8 + rnd() * 14
      ctx.beginPath(); ctx.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 3 + rnd() * 7, 0, Math.PI * 2); ctx.fill()
    }
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2
      const d = 20 + rnd() * 9
      ctx.beginPath(); ctx.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1 + rnd() * 2, 0, Math.PI * 2); ctx.fill()
    }
  }
  const t = new THREE.CanvasTexture(canvas)
  t.needsUpdate = true
  return t
})()

const _particleGeo = new THREE.BoxGeometry(1, 1, 1)
const _particleMat = new THREE.MeshBasicMaterial({ color: '#7a0f0f' })
const _decalGeo = new THREE.PlaneGeometry(1, 1)
const _decalMat = new THREE.MeshBasicMaterial({
  map: splatTexture,
  alphaTest: 0.5,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
})

// Pool state (plain typed arrays — no per-frame allocation)
const pPos = new Float32Array(PARTICLE_POOL * 3)
const pVel = new Float32Array(PARTICLE_POOL * 3)
const pLife = new Float32Array(PARTICLE_POOL)
const pMax = new Float32Array(PARTICLE_POOL)
const pSize = new Float32Array(PARTICLE_POOL)
let pNext = 0
let pHigh = 0

let particlesMesh = null
let floorMesh = null
let wallMesh = null
let fNext = 0, fHigh = 0
let wNext = 0, wHigh = 0

const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _qFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
const _axisZ = new THREE.Vector3(0, 0, 1)
const _axisY = new THREE.Vector3(0, 1, 0)
const _zero = new THREE.Matrix4().makeScale(0, 0, 0)

function addFloorDecal(x, z, size) {
  if (!floorMesh) return
  const i = fNext
  fNext = (fNext + 1) % FLOOR_DECALS
  if (i + 1 > fHigh) fHigh = i + 1
  // tiny per-slot height offset so overlapping decals never z-fight
  _p.set(x, FLOOR_Y + i * 0.0002, z)
  _q2.setFromAxisAngle(_axisZ, Math.random() * Math.PI * 2)
  _q.copy(_qFlat).multiply(_q2)
  const sc = size * (0.8 + Math.random() * 0.4)
  _s.set(sc, sc * (0.7 + Math.random() * 0.5), 1)
  _m.compose(_p, _q, _s)
  floorMesh.setMatrixAt(i, _m)
  floorMesh.setColorAt(i, TONES[(Math.random() * TONES.length) | 0])
  floorMesh.count = fHigh
  floorMesh.instanceMatrix.needsUpdate = true
  floorMesh.instanceColor.needsUpdate = true
}

function addWallDecal(x, y, z, nx, nz, size) {
  if (!wallMesh) return
  const i = wNext
  wNext = (wNext + 1) % WALL_DECALS
  if (i + 1 > wHigh) wHigh = i + 1
  _p.set(x + nx * 0.02, y, z + nz * 0.02)
  // Plane faces +Z by default; yaw it to face the wall normal, then random roll.
  _q.setFromAxisAngle(_axisY, Math.atan2(nx, nz))
  _q2.setFromAxisAngle(_axisZ, Math.random() * Math.PI * 2)
  _q.multiply(_q2)
  const sc = size * (0.8 + Math.random() * 0.4)
  _s.set(sc, sc, 1)
  _m.compose(_p, _q, _s)
  wallMesh.setMatrixAt(i, _m)
  wallMesh.setColorAt(i, TONES[(Math.random() * TONES.length) | 0])
  wallMesh.count = wHigh
  wallMesh.instanceMatrix.needsUpdate = true
  wallMesh.instanceColor.needsUpdate = true
}

// 2D ray vs wall AABBs (XZ) — nearest face hit within maxT. Writes into _wallHit.
const _wallHit = { t: 0, nx: 0, nz: 0 }
function rayWalls(ox, oz, dx, dz, maxT) {
  let best = maxT, bnx = 0, bnz = 0, found = false
  for (let k = 0; k < WALLS.length; k++) {
    const w = WALLS[k]
    const minX = w.x - w.halfW, maxX = w.x + w.halfW
    const minZ = w.z - w.halfD, maxZ = w.z + w.halfD
    let tmin = 0, tmax = best, nx = 0, nz = 0
    if (Math.abs(dx) < 1e-6) {
      if (ox < minX || ox > maxX) continue
    } else {
      let t1 = (minX - ox) / dx, t2 = (maxX - ox) / dx
      let n = -1
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1 }
      if (t1 > tmin) { tmin = t1; nx = n; nz = 0 }
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) continue
    }
    if (Math.abs(dz) < 1e-6) {
      if (oz < minZ || oz > maxZ) continue
    } else {
      let t1 = (minZ - oz) / dz, t2 = (maxZ - oz) / dz
      let n = -1
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1 }
      if (t1 > tmin) { tmin = t1; nx = 0; nz = n }
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) continue
    }
    if (tmin > 0.05 && tmin < best && (nx !== 0 || nz !== 0)) {
      best = tmin; bnx = nx; bnz = nz; found = true
    }
  }
  if (!found) return false
  _wallHit.t = best; _wallHit.nx = bnx; _wallHit.nz = bnz
  return true
}

function spawnParticles(px, py, pz, dx, dy, dz, count, speed) {
  for (let n = 0; n < count; n++) {
    const i = pNext
    pNext = (pNext + 1) % PARTICLE_POOL
    if (i + 1 > pHigh) pHigh = i + 1
    const k = speed * (0.35 + Math.random() * 0.9)
    pPos[i * 3] = px; pPos[i * 3 + 1] = py; pPos[i * 3 + 2] = pz
    pVel[i * 3] = dx * k + (Math.random() - 0.5) * 2.2
    pVel[i * 3 + 1] = dy * k + 0.8 + Math.random() * 1.8
    pVel[i * 3 + 2] = dz * k + (Math.random() - 0.5) * 2.2
    pMax[i] = pLife[i] = 0.35 + Math.random() * 0.45
    pSize[i] = 0.025 + Math.random() * 0.035
  }
}

export default function BloodFX() {
  const pRef = useRef()
  const fRef = useRef()
  const wRef = useRef()
  const three = useThree()
  // Dev/preview only: expose r3f state for browser-driven verification
  if (typeof window !== 'undefined' && import.meta.env.VITE_VERCEL_ENV !== 'production') window.__r3f = three

  useEffect(() => {
    if (!pRef.current?.setMatrixAt) return   // not a real three scene (tests)
    particlesMesh = pRef.current
    floorMesh = fRef.current
    wallMesh = wRef.current
    for (let i = 0; i < PARTICLE_POOL; i++) particlesMesh.setMatrixAt(i, _zero)
    particlesMesh.count = 0
    floorMesh.count = 0
    wallMesh.count = 0
    // instanceColor must exist before the first render
    for (let i = 0; i < FLOOR_DECALS; i++) floorMesh.setColorAt(i, TONES[0])
    for (let i = 0; i < WALL_DECALS; i++) wallMesh.setColorAt(i, TONES[0])
    return () => { particlesMesh = floorMesh = wallMesh = null }
  }, [])

  // Decals live until the wave ends: new run / next wave both pass through
  // the 'intermission' phase (startGame, nextWave); 'start' covers the menu.
  useEffect(() => {
    if (!useGameStore.subscribe) return   // mocked store (tests)
    let prev = useGameStore.getState().phase
    return useGameStore.subscribe((s) => {
      if (s.phase === prev) return
      prev = s.phase
      if (s.phase === 'intermission' || s.phase === 'start') BloodFX.clear()
    })
  }, [])

  // point/dir: world impact point and normalized shot direction.
  // intensity: 0 = regular hit, 1 = kill, 2 = headshot/gib kill.
  BloodFX.spawn = (point, dir, intensity = 0, pellet = false) => {
    const big = intensity > 0
    const base = pellet ? 3 : big ? (intensity > 1 ? 16 : 11) : 5
    spawnParticles(point.x, point.y, point.z, dir.x, dir.y * 0.5, dir.z, Math.max(2, Math.round(base * COUNT_SCALE)), big ? 4.2 : 3)

    // Floor splatter: along the shot direction behind the target; kills also pool under the body.
    const hLen = Math.hypot(dir.x, dir.z) || 1
    const nx = dir.x / hLen, nz = dir.z / hLen
    if (big || Math.random() < (pellet ? 0.22 : 0.45)) {
      const d = 0.3 + Math.random() * (big ? 1.5 : 1.0)
      addFloorDecal(point.x + nx * d + (Math.random() - 0.5) * 0.3, point.z + nz * d + (Math.random() - 0.5) * 0.3,
        big ? 0.5 + Math.random() * 0.4 : 0.22 + Math.random() * 0.25)
    }
    if (big) {
      addFloorDecal(point.x + (Math.random() - 0.5) * 0.3, point.z + (Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.5)
    }
    // Wall spatter where the shot would have continued
    if (hLen > 0.2 && Math.random() < (big ? 0.8 : pellet ? 0.15 : 0.3) && rayWalls(point.x, point.z, nx, nz, 4.5)) {
      const t = _wallHit.t
      const y = Math.max(0.2, Math.min(WALL_H_MAX, point.y + (dir.y / hLen) * t))
      addWallDecal(point.x + nx * t, y, point.z + nz * t, _wallHit.nx, _wallHit.nz, big ? 0.55 + Math.random() * 0.35 : 0.25 + Math.random() * 0.2)
    }
  }

  BloodFX.clear = () => {
    fNext = fHigh = wNext = wHigh = 0
    if (floorMesh) floorMesh.count = 0
    if (wallMesh) wallMesh.count = 0
  }

  useFrame((_, delta) => {
    if (pHigh === 0 || !particlesMesh) return
    const dt = Math.min(delta, 0.05)
    let any = false
    for (let i = 0; i < pHigh; i++) {
      if (pLife[i] <= 0) continue
      pLife[i] -= dt
      let y = pPos[i * 3 + 1]
      if (pLife[i] <= 0 || y < FLOOR_Y) {
        pLife[i] = 0
        particlesMesh.setMatrixAt(i, _zero)
        any = true
        continue
      }
      pVel[i * 3 + 1] -= GRAVITY * dt
      pPos[i * 3] += pVel[i * 3] * dt
      y += pVel[i * 3 + 1] * dt
      pPos[i * 3 + 1] = y
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt
      const sc = pSize[i] * (0.4 + 0.6 * (pLife[i] / pMax[i]))
      _p.set(pPos[i * 3], y, pPos[i * 3 + 2])
      _s.set(sc, sc, sc)
      _m.compose(_p, _q.identity(), _s)
      particlesMesh.setMatrixAt(i, _m)
      any = true
    }
    particlesMesh.count = pHigh
    if (any) particlesMesh.instanceMatrix.needsUpdate = true
    else pHigh = 0
  })

  // Meshes stay visible (even at count 0) so their shader programs are compiled
  // up front and the first blood never stalls on a compile.
  return (
    <>
      <instancedMesh ref={pRef} args={[_particleGeo, _particleMat, PARTICLE_POOL]} frustumCulled={false} raycast={() => null} />
      <instancedMesh ref={fRef} args={[_decalGeo, _decalMat, FLOOR_DECALS]} frustumCulled={false} raycast={() => null} renderOrder={1} />
      <instancedMesh ref={wRef} args={[_decalGeo, _decalMat, WALL_DECALS]} frustumCulled={false} raycast={() => null} renderOrder={1} />
    </>
  )
}
