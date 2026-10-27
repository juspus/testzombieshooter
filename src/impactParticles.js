// Pooled impact particles (sparks / splinters / dust chips) for non-zombie bullet
// hits and plank breaks. One InstancedMesh (single draw call), fixed pool, no
// per-event allocation. Purely cosmetic -- no net sync needed. The mesh is
// mounted by components/ImpactFX.jsx; the store and Player call spawnImpact().
import * as THREE from 'three'

export const POOL = 128

const geo = new THREE.BoxGeometry(1, 1, 1)
const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' })   // opaque: no transparent shader variant
export const impactMesh = new THREE.InstancedMesh(geo, mat, POOL)
impactMesh.frustumCulled = false
impactMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
impactMesh.count = POOL

const pos = new Float32Array(POOL * 3)
const vel = new Float32Array(POOL * 3)
const rot = new Float32Array(POOL * 3)
const rotVel = new Float32Array(POOL * 3)
const size = new Float32Array(POOL * 3)
const life = new Float32Array(POOL)
const maxLife = new Float32Array(POOL)
const grav = new Float32Array(POOL)
const live = new Uint8Array(POOL)
let next = 0
let dirty = true

const _d = new THREE.Object3D()
const _c = new THREE.Color()
_d.scale.set(0, 0, 0)
_d.updateMatrix()
for (let i = 0; i < POOL; i++) impactMesh.setMatrixAt(i, _d.matrix)
impactMesh.setColorAt(0, _c.set('#ffffff'))   // allocates instanceColor
impactMesh.instanceColor.setUsage(THREE.DynamicDrawUsage)

const rnd = Math.random

// Colour palettes per kind
const pal = (list) => list.map((c) => new THREE.Color(c))   // pre-parsed: no string parsing per emit
const SPARK = pal(['#fff2a0', '#ffd24a', '#ff9a2a'])
const DUST = pal(['#8a8478', '#6e695f', '#a39d90'])
const WOOD = pal(['#b08850', '#8a6334', '#c9a46a', '#5c3a1a'])
const METAL = pal(['#ffffff', '#cfe8ff', '#ffe9a8'])                 // armour ricochet
const GORE = pal(['#7a9a1c', '#d9791c', '#a8b04a', '#4a6a14'])       // exploder burst
const ACID = pal(['#9aff3a', '#6fd01c', '#c8ff70'])                  // spitter splash

function emit(px, py, pz, vx, vy, vz, sx, sy, sz, ttl, g, color) {
  const i = next
  next = (next + 1) % POOL
  const i3 = i * 3
  pos[i3] = px; pos[i3 + 1] = py; pos[i3 + 2] = pz
  vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz
  size[i3] = sx; size[i3 + 1] = sy; size[i3 + 2] = sz
  rot[i3] = rnd() * 6.28; rot[i3 + 1] = rnd() * 6.28; rot[i3 + 2] = rnd() * 6.28
  rotVel[i3] = (rnd() - 0.5) * 24; rotVel[i3 + 1] = (rnd() - 0.5) * 24; rotVel[i3 + 2] = (rnd() - 0.5) * 24
  life[i] = maxLife[i] = ttl
  grav[i] = g
  live[i] = 1
  impactMesh.setColorAt(i, color)
  impactMesh.instanceColor.needsUpdate = true
  dirty = true
}

// Emit `count` particles fanned around the surface normal.
function burst(p, n, count, speed, spread, sMin, sMax, ttl, g, palette, elongate) {
  for (let k = 0; k < count; k++) {
    // random direction biased along the normal
    const rx = (rnd() - 0.5) * 2 * spread, ry = (rnd() - 0.5) * 2 * spread, rz = (rnd() - 0.5) * 2 * spread
    let vx = n.x + rx, vy = n.y + ry, vz = n.z + rz
    const l = Math.hypot(vx, vy, vz) || 1
    const sp = speed * (0.4 + rnd() * 0.8)
    vx = vx / l * sp; vy = vy / l * sp; vz = vz / l * sp
    const s = sMin + rnd() * (sMax - sMin)
    emit(p.x + n.x * 0.03, p.y + n.y * 0.03, p.z + n.z * 0.03, vx, vy, vz,
      s, s, s * (elongate ? 2.6 : 1), ttl * (0.7 + rnd() * 0.6), g, palette[(rnd() * palette.length) | 0])
  }
}

// kind: 'wall' | 'plank' | 'floor' | 'break' | 'metal' | 'burst' | 'acid'. intensity scales particle count (shotgun pellets use less).
export function spawnImpact(point, normal, kind = 'wall', intensity = 1) {
  const n = (c) => Math.max(1, Math.round(c * intensity))
  if (kind === 'plank') {
    burst(point, normal, n(6), 4.5, 0.9, 0.035, 0.07, 0.55, 9, WOOD, true)
    burst(point, normal, n(2), 2.5, 0.8, 0.03, 0.045, 0.2, 0, SPARK, false)
  } else if (kind === 'floor') {
    burst(point, normal, n(4), 2.2, 0.7, 0.045, 0.08, 0.45, 8, DUST, false)
    burst(point, normal, n(2), 3.5, 0.6, 0.025, 0.04, 0.2, 4, SPARK, false)
  } else if (kind === 'metal') {
    // bright sparks thrown back at the shooter (normal = back toward the muzzle)
    burst(point, normal, n(9), 7, 0.75, 0.02, 0.04, 0.3, 7, METAL, true)
    burst(point, normal, n(2), 3, 0.9, 0.03, 0.05, 0.25, 4, SPARK, false)
  } else if (kind === 'burst') {
    burst(point, normal, n(30), 7, 1.5, 0.05, 0.13, 0.95, 9, GORE, false)
    burst(point, normal, n(12), 5, 1.2, 0.025, 0.05, 0.5, 5, SPARK, true)
  } else if (kind === 'acid') {
    burst(point, normal, n(10), 3.2, 1.0, 0.03, 0.07, 0.6, 8, ACID, false)
  } else if (kind === 'break') {
    burst(point, normal, n(16), 4.0, 1.1, 0.045, 0.11, 0.9, 9, WOOD, true)
    burst(point, normal, n(5), 2.0, 1.0, 0.04, 0.07, 0.6, 7, DUST, false)
  } else {
    burst(point, normal, n(5), 5.5, 0.7, 0.025, 0.045, 0.22, 6, SPARK, true)
    burst(point, normal, n(3), 2.5, 0.9, 0.045, 0.08, 0.5, 8, DUST, false)
  }
}

export function updateImpacts(dt) {
  if (dt > 0.05) dt = 0.05
  let any = false
  for (let i = 0; i < POOL; i++) {
    if (!live[i]) continue
    const i3 = i * 3
    life[i] -= dt
    if (life[i] <= 0) {
      live[i] = 0
      _d.position.set(0, 0, 0); _d.scale.set(0, 0, 0); _d.rotation.set(0, 0, 0)
      _d.updateMatrix()
      impactMesh.setMatrixAt(i, _d.matrix)
      any = true
      continue
    }
    vel[i3 + 1] -= grav[i] * dt
    pos[i3] += vel[i3] * dt
    pos[i3 + 1] += vel[i3 + 1] * dt
    pos[i3 + 2] += vel[i3 + 2] * dt
    if (pos[i3 + 1] < 0.02) {          // floor bounce with friction
      pos[i3 + 1] = 0.02
      vel[i3 + 1] *= -0.3
      vel[i3] *= 0.6; vel[i3 + 2] *= 0.6
    }
    rot[i3] += rotVel[i3] * dt; rot[i3 + 1] += rotVel[i3 + 1] * dt; rot[i3 + 2] += rotVel[i3 + 2] * dt
    const k = Math.min(1, (life[i] / maxLife[i]) * 2.5)   // shrink out over the last 40%
    _d.position.set(pos[i3], pos[i3 + 1], pos[i3 + 2])
    _d.rotation.set(rot[i3], rot[i3 + 1], rot[i3 + 2])
    _d.scale.set(size[i3] * k, size[i3 + 1] * k, size[i3 + 2] * k)
    _d.updateMatrix()
    impactMesh.setMatrixAt(i, _d.matrix)
    any = true
  }
  if (any || dirty) {
    impactMesh.instanceMatrix.needsUpdate = true
    dirty = false
  }
}
