import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getTexBoxGeo, getTexture } from './textures'

// Cabin furniture as plain "parts" (boxes / cylinders with a colour), merged per
// surface kind into ONE mesh per kind per room. Static decor therefore costs a
// handful of draw calls instead of one per box:
//   - geometry is baked (position + vertex colour), no per-part Object3D;
//   - one shared material per kind (texture map x vertex colour), cached here;
//   - no castShadow, no lights: candles / lamps are glow parts (meshBasicMaterial).
// Piece functions take a builder `f` and describe themselves in LOCAL space
// (origin = floor centre, front = +Z); `placed()` bakes the world transform.

const _tmpM = new THREE.Matrix4()
const _tmpR = new THREE.Matrix4()
const _tmpE = new THREE.Euler()
const _tmpC = new THREE.Color()

// Builder bound to a placement. kind: 'wood' | 'fabric' | 'metal' | 'stone' | 'flat' | 'glow'.
export function makeBuilder(out, ox = 0, oy = 0, oz = 0, ry = 0) {
  const base = new THREE.Matrix4().makeRotationY(ry).setPosition(ox, oy, oz)
  const place = (x, y, z, r) => {
    _tmpM.makeTranslation(x, y, z)
    if (r) _tmpM.multiply(_tmpR.makeRotationFromEuler(_tmpE.set(r[0] || 0, r[1] || 0, r[2] || 0)))
    return new THREE.Matrix4().multiplyMatrices(base, _tmpM)
  }
  return {
    b(kind, x, y, z, w, h, d, color, r) { out.push({ shape: 'box', kind, m: place(x, y, z, r), size: [w, h, d], color }) },
    c(kind, x, y, z, rad, h, color, r, seg = 8) { out.push({ shape: 'cyl', kind, m: place(x, y, z, r), size: [rad, h, seg], color }) },
    // Flat cobweb quad lying in the XZ plane (u -> +x*sx, v -> +z*sz), corner at (x,y,z).
    web(x, y, z, sx, sz) {
      const m = place(x, y, z, [Math.PI / 2, 0, 0])
      m.multiply(_tmpR.makeScale(sx, sz, 1))
      out.push({ shape: 'web', kind: 'web', m, size: [1, 1], color: '#ffffff' })
    },
  }
}

// Run a piece function at a world placement, appending its parts to `out`.
export function placed(out, piece, x, y, z, ry = 0, ...args) { piece(makeBuilder(out, x, y, z, ry), ...args) }

// ─── materials (one per kind, shared by every room / the playground) ─────────
const _mats = {}
function material(kind) {
  if (_mats[kind]) return _mats[kind]
  let m
  if (kind === 'glow') m = new THREE.MeshBasicMaterial({ vertexColors: true })
  else if (kind === 'web') m = new THREE.MeshBasicMaterial({ map: webTexture(), color: '#9a988c', transparent: true, depthWrite: false, side: THREE.DoubleSide })
  else if (kind === 'flat') m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
  else if (kind === 'metal') m = new THREE.MeshStandardMaterial({ map: getTexture('metal'), vertexColors: true, roughness: 0.55, metalness: 0.45 })
  else m = new THREE.MeshStandardMaterial({ map: getTexture(kind), vertexColors: true, roughness: 0.95 })
  _mats[kind] = m
  return m
}

let _web
function webTexture() {
  if (_web) return _web
  const S = 64
  const d = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5, dy = y + 0.5
      const r = Math.hypot(dx, dy)
      const a = Math.atan2(dy, dx) / (Math.PI / 2)          // 0..1 across the quarter
      const ray = Math.abs(a * 5 - Math.round(a * 5)) * r < 0.7 && r < S
      const ring = [14, 26, 40, 54].some((R) => Math.abs(r - R * (1 - 0.15 * Math.sin(a * 9))) < 0.75) && r < S - 3
      const i = (y * S + x) * 4
      const v = ray || ring ? 255 : 0
      d[i] = d[i + 1] = d[i + 2] = 255
      d[i + 3] = v ? 150 : 0
    }
  }
  _web = new THREE.DataTexture(d, S, S, THREE.RGBAFormat)
  _web.magFilter = THREE.NearestFilter
  _web.minFilter = THREE.NearestFilter
  _web.needsUpdate = true
  return _web
}

const _cylCache = new Map()
function cylGeo(rad, h, seg) {
  const k = `${rad},${h},${seg}`
  let g = _cylCache.get(k)
  if (!g) { g = new THREE.CylinderGeometry(rad, rad, h, seg); _cylCache.set(k, g) }
  return g
}
const _boxCache = new Map()
function flatBoxGeo(w, h, d) {
  const k = `${w},${h},${d}`
  let g = _boxCache.get(k)
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _boxCache.set(k, g) }
  return g
}
let _plane
const planeGeo = () => (_plane ||= new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0))

function partGeometry(p) {
  let g
  if (p.shape === 'box') g = (p.kind === 'flat' || p.kind === 'glow') ? flatBoxGeo(...p.size) : getTexBoxGeo(p.size, p.kind)
  else if (p.shape === 'cyl') g = cylGeo(...p.size)
  else g = planeGeo()
  g = g.clone()
  g.applyMatrix4(p.m)
  if (p.shape !== 'web') {
    _tmpC.set(p.color)
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { col[i * 3] = _tmpC.r; col[i * 3 + 1] = _tmpC.g; col[i * 3 + 2] = _tmpC.b }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }
  return g
}

// Parts -> [{ kind, geometry, material }]. One merged geometry per kind.
export function mergeParts(parts) {
  const by = {}
  for (const p of parts) (by[p.kind] ||= []).push(partGeometry(p))
  return Object.entries(by).map(([kind, geos]) => {
    const geometry = mergeGeometries(geos, false)
    geos.forEach((g) => g.dispose())
    return { kind, geometry, material: material(kind) }
  })
}
