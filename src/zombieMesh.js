// Zombie mesh baking: merge the boxes of one moving part (head, body, one arm, one leg...) into ONE
// geometry, so a zombie is ~6 draw calls instead of ~120 (see CLAUDE.md "Performance").
//
// What each box used to carry in its own material is now per vertex:
//   color  = the box's fixed colour, or white for a palette box (linear, like material.color)
//   zmat   = (palette slot, roughness, metalness, emissive-follows-slot)
//   zemi   = (r, g, b, intensity) emissive: fixed colour x intensity, or white x slot colour x intensity
// and ONE material shape (a MeshStandardMaterial with vertexColors and a small shader patch) turns
// that into the final look:
//   diffuse   = color x palette[slot]
//   roughness / metalness straight from zmat
//   emissive  = zemi.rgb x zemi.a  (x palette[slot] when it follows the slot)
// Palette slots are the per-zombie colours (shirt, skin, pants, eye...), a uniform array on the
// material. A material is shared by every zombie with the same palette (zombieMaterial), so it is
// the same shader program for every zombie and the program count stays flat.
//
// Geometry is cached by (part, feature flags) and built lazily; it never depends on the palette,
// so a new variant colour costs a material lookup, not a geometry build or a GPU upload.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Palette slot names, in uniform order (index 0 is reserved for "fixed colour": white).
export const SLOTS = ['shirt', 'shirtTear', 'pants', 'skin', 'skinDark', 'skinVein', 'skullBone', 'skullDark', 'accent', 'eye', 'baseVein']
const SLOT_INDEX = Object.fromEntries(SLOTS.map((s, i) => [s, i + 1]))
const PAL_LEN = SLOTS.length + 1
// A box colour is either a hex string or '@slot'.
export const slot = (name) => '@' + name

const _col = new THREE.Color()
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _one = new THREE.Vector3(1, 1, 1)

const _boxes = new Map()
function boxGeo(w, h, d) {
  const k = `${w},${h},${d}`
  let g = _boxes.get(k)
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _boxes.set(k, g) }
  return g
}

// part = { s:[w,h,d], p:[x,y,z], r:[rx,ry,rz]|null, c:'#hex'|'@slot', ro, me, em:null|true|'#hex', ei }
function bakeBox(part) {
  const g = boxGeo(part.s[0], part.s[1], part.s[2]).clone()
  g.deleteAttribute('uv')
  if (part.r) _q.setFromEuler(_e.set(part.r[0], part.r[1], part.r[2]))
  else _q.identity()
  g.applyMatrix4(_m.compose(_p.set(part.p[0], part.p[1], part.p[2]), _q, _one))
  const n = g.attributes.position.count
  const color = new Float32Array(n * 3)
  const zmat = new Float32Array(n * 4)
  const zemi = new Float32Array(n * 4)
  let sl = 0
  if (typeof part.c === 'string' && part.c[0] === '@') {
    sl = SLOT_INDEX[part.c.slice(1)]
    if (!sl) throw new Error('unknown zombie palette slot ' + part.c)
    color.fill(1)
  } else {
    _col.set(part.c)
    for (let i = 0; i < n; i++) { color[i * 3] = _col.r; color[i * 3 + 1] = _col.g; color[i * 3 + 2] = _col.b }
  }
  const follow = part.em === true ? 1 : 0
  let er = 0, eg = 0, eb = 0, ea = 0
  if (part.em === true) { er = eg = eb = 1; ea = part.ei }
  else if (part.em) { _col.set(part.em); er = _col.r; eg = _col.g; eb = _col.b; ea = part.ei }
  for (let i = 0; i < n; i++) {
    zmat[i * 4] = sl; zmat[i * 4 + 1] = part.ro ?? 1; zmat[i * 4 + 2] = part.me ?? 0; zmat[i * 4 + 3] = follow
    zemi[i * 4] = er; zemi[i * 4 + 1] = eg; zemi[i * 4 + 2] = eb; zemi[i * 4 + 3] = ea
  }
  g.setAttribute('color', new THREE.BufferAttribute(color, 3))
  g.setAttribute('zmat', new THREE.BufferAttribute(zmat, 4))
  g.setAttribute('zemi', new THREE.BufferAttribute(zemi, 4))
  return g
}

// Merge a list of box parts into one geometry (position, normal, color, zmat, zemi, index).
export function bakeParts(parts) {
  const geos = parts.map(bakeBox)
  const g = mergeGeometries(geos, false)
  for (const x of geos) x.dispose()
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

// ── Material ────────────────────────────────────────────────────────────────
const _palCache = new Map()   // key -> material
const _hex = new Map()        // '#hex' -> [r,g,b] (linear)
function rgb(hex) {
  let v = _hex.get(hex)
  if (!v) { _col.set(hex); v = [_col.r, _col.g, _col.b]; _hex.set(hex, v) }
  return v
}

const VERT_DECL = `#include <common>
uniform vec3 uZPal[${PAL_LEN}];
attribute vec4 zmat;
attribute vec4 zemi;
varying vec2 vZm;
varying vec3 vZe;`
const VERT_BODY = `#include <color_vertex>
vec3 zPal = uZPal[int(zmat.x + 0.5)];
vColor *= zPal;
vZm = zmat.yz;
vZe = zemi.rgb * zemi.a * mix(vec3(1.0), zPal, zmat.w);`
const FRAG_DECL = `#include <common>
varying vec2 vZm;
varying vec3 vZe;`

export function patchZombieShader(shader, pal) {
  shader.uniforms.uZPal = { value: pal }
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', VERT_DECL)
    .replace('#include <color_vertex>', VERT_BODY)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', FRAG_DECL)
    .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = vZe;')
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vZm.x;')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vZm.y;')
}

// One shared material per palette. `colors` = { shirt, shirtTear, pants, skin, skinDark, skinVein,
// skullBone, skullDark, accent, eye, baseVein } as hex strings. `key` identifies the palette.
export function zombieMaterial(key, colors) {
  let mat = _palCache.get(key)
  if (mat) return mat
  const pal = new Float32Array(PAL_LEN * 3).fill(1)
  SLOTS.forEach((name, i) => {
    const c = rgb(colors[name])
    pal[(i + 1) * 3] = c[0]; pal[(i + 1) * 3 + 1] = c[1]; pal[(i + 1) * 3 + 2] = c[2]
  })
  mat = new THREE.MeshStandardMaterial({ vertexColors: true })
  mat.userData.palette = pal
  mat.userData.paletteHex = colors
  mat.customProgramCacheKey = () => 'zombie-parts-v1'
  mat.onBeforeCompile = (shader) => patchZombieShader(shader, pal)
  _palCache.set(key, mat)
  return mat
}
export const zombieMaterialCount = () => _palCache.size

// The colour a vertex ends up with (JS mirror of the shader, for tests and tools).
export function resolveVertex(geo, i, palette) {
  const c = geo.attributes.color, zm = geo.attributes.zmat, ze = geo.attributes.zemi
  const s = zm.getX(i)
  const pr = s ? palette[(s) * 3] : 1, pg = s ? palette[s * 3 + 1] : 1, pb = s ? palette[s * 3 + 2] : 1
  const f = zm.getW(i)
  const k = ze.getW(i)
  return {
    color: [c.getX(i) * pr, c.getY(i) * pg, c.getZ(i) * pb],
    roughness: zm.getY(i), metalness: zm.getZ(i),
    emissive: [ze.getX(i) * k * (f ? pr : 1), ze.getY(i) * k * (f ? pg : 1), ze.getZ(i) * k * (f ? pb : 1)],
  }
}
