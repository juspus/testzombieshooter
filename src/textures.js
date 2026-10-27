import * as THREE from 'three'

// Procedural lo-fi surface textures (Wave 2 "Real surfaces").
//
// Every texture is a tiny 64x64 DataTexture generated once at first use from a
// seeded RNG (no canvas, no files, deterministic, test-friendly) and then shared
// by every material. Values are greyscale-ish multipliers (mean ~0.9) so the
// existing flat palette colours still set hue and mood; the texture only adds
// grain/seams/mortar. NearestFilter on magnification keeps the chunky pixel look
// (matches the pixel-art zombies and the low-res post pass); minification uses
// nearest-mipmap so distant surfaces don't shimmer.
//
// Tiling is done in the GEOMETRY UVs, not with texture.repeat: texBoxProps /
// texPlaneProps scale each face's UVs to world size (metres per tile), so one
// shared texture + one shared material serve boxes of any size, with no cloned
// textures and no extra shader programs (all are meshStandardMaterial + map).
//
// GPU cost: 8 kinds x 64x64x4 B x 1.33 (mips) ~ 175 KB total.

const SIZE = 64

// Metres covered by one tile per kind. `dir` = grain runs along the longer
// face dimension (wood); otherwise u always runs horizontally on walls.
const KINDS = {
  wood:    { tile: 1.3, dir: true },    // 2 floor planks of 0.65 m per tile
  timber:  { tile: 1.1, dir: false },   // 2 clapboards of 0.55 m (matches wall groove lines)
  stone:   { tile: 1.0, dir: false },
  fabric:  { tile: 0.5, dir: false },
  metal:   { tile: 0.5, dir: false },
  shingle: { tile: 0.8, dir: false },
  plaster: { tile: 1.6, dir: false },
  asphalt: { tile: 1.0, dir: false },
  vinyl:   { tile: 0.6, dir: false },
}

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

// Tiny buffer wrapper: set(x, y, lum, warm) writes a wrapped pixel. `warm` tints
// slightly toward orange (+) or blue (-) so the maps are not dead grey.
function makeBuf() {
  const data = new Uint8Array(SIZE * SIZE * 4)
  const set = (x, y, v, warm = 0) => {
    const i = (((y % SIZE) + SIZE) % SIZE * SIZE + (((x % SIZE) + SIZE) % SIZE)) * 4
    v = clamp01(v)
    data[i] = Math.round(clamp01(v + warm) * 255)
    data[i + 1] = Math.round(v * 255)
    data[i + 2] = Math.round(clamp01(v - warm) * 255)
    data[i + 3] = 255
  }
  return { data, set }
}

// Horizontal boards: `boards` rows per tile, grain streaks along u, butt joints,
// knots, and (bevel) a shadowed lower edge per board.
function genBoards(seed, boards, bevel) {
  const r = rng(seed)
  const { data, set } = makeBuf()
  const bh = SIZE / boards
  for (let b = 0; b < boards; b++) {
    const base = 0.82 + r() * 0.16
    const joint = r() < 0.5 ? Math.floor(r() * SIZE) : -1
    const phase = r() * 100
    const rowNoise = []
    for (let y = 0; y < bh; y++) rowNoise.push((r() - 0.5) * 0.16)
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < SIZE; x++) {
        // long grain: slow wobble along x, per-row offset, occasional dark fibre
        const g = Math.sin((x + phase) * 0.18 + y * 0.7) * 0.04
        let v = base + rowNoise[y] + g + (r() - 0.5) * 0.05
        if (y === 0) v *= 0.45                       // seam
        else if (bevel && y >= bh - 3) v *= 0.8 + 0.06 * (bh - 1 - y)
        else if (bevel && y === 1) v *= 1.06
        if (x === joint) v *= 0.68                    // butt joint
        set(x, b * bh + y, v, 0.04)
      }
    }
    // a knot or two (dark 3x3 blob with lighter ring)
    const knots = r() < 0.7 ? 1 : 0
    for (let k = 0; k < knots; k++) {
      const kx = Math.floor(r() * SIZE), ky = b * bh + 4 + Math.floor(r() * (bh - 9))
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const d = Math.abs(dx) + Math.abs(dy)
        set(kx + dx, ky + dy, d <= 1 ? 0.35 : d === 2 ? 0.6 : 0.72, 0.04)
      }
    }
  }
  return data
}

// Fieldstone: staggered courses of irregular stones with dark mortar.
function genStone(seed) {
  const r = rng(seed)
  const { data, set } = makeBuf()
  const rows = [0, 12, 25, 38, 51]
  rows.forEach((y0, ri) => {
    const y1 = ri === rows.length - 1 ? SIZE : rows[ri + 1]
    let x = Math.floor(r() * 10) - 8
    const stones = []
    while (x < SIZE) { const w = 12 + Math.floor(r() * 14); stones.push([x, x + w]); x += w }
    // wrap: stretch last stone to meet the first of the next tile
    stones[stones.length - 1][1] = SIZE + stones[0][0]
    for (const [xa, xb] of stones) {
      const base = 0.7 + r() * 0.3
      for (let y = y0; y < y1; y++) {
        for (let xx = xa; xx < xb; xx++) {
          const edge = xx === xa || y === y0 || xx === xb - 1 || y === y1 - 1
          let v = edge ? 0.3 : base + (r() - 0.5) * 0.18
          // round the stone: lighter centre, darker next to mortar
          if (!edge && (xx === xa + 1 || xx === xb - 2 || y === y0 + 1 || y === y1 - 2)) v *= 0.82
          set(xx, y, v, -0.01)
        }
      }
    }
  })
  return data
}

// Woven cloth: 2px thread grid with slow low-frequency mottling.
function genFabric(seed) {
  const r = rng(seed)
  const { data, set } = makeBuf()
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const weave = ((x >> 1) + (y >> 1)) % 2 === 0 ? 0.96 : 0.82
      const blot = Math.sin(x * 0.21) * Math.sin(y * 0.17) * 0.06
      set(x, y, weave + blot + (r() - 0.5) * 0.08, 0.02)
    }
  }
  return data
}

// Rusted/brushed iron: horizontal scratches + rust blotches + a few rivets.
function genMetal(seed) {
  const r = rng(seed)
  const { data, set } = makeBuf()
  const rowTone = Array.from({ length: SIZE }, () => (r() - 0.5) * 0.14)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const rust = Math.sin(x * 0.11 + y * 0.05) * Math.sin(y * 0.13 - x * 0.04)
      const v = 0.86 + rowTone[y] + (r() - 0.5) * 0.06 - Math.max(0, rust) * 0.3
      set(x, y, v, rust > 0.35 ? 0.06 : 0)
    }
  }
  for (const [cx, cy] of [[8, 8], [40, 8], [8, 40], [40, 40]]) {
    set(cx, cy, 1, 0); set(cx + 1, cy, 0.95); set(cx, cy + 1, 0.55); set(cx + 1, cy + 1, 0.5)
  }
  return data
}

// Roof shingles: staggered rows, each shingle its own tone, dark lower edge.
function genShingle(seed) {
  const r = rng(seed)
  const { data, set } = makeBuf()
  const rh = 8
  for (let row = 0; row < SIZE / rh; row++) {
    const off = (row % 2) * 4
    for (let s = 0; s < SIZE / 8; s++) {
      const base = 0.7 + r() * 0.3
      for (let y = 0; y < rh; y++) for (let x = 0; x < 8; x++) {
        let v = base + (r() - 0.5) * 0.08
        if (y >= rh - 2) v *= 0.55
        if (x === 0) v *= 0.55
        set(s * 8 + x + off, row * rh + y, v, 0.02)
      }
    }
  }
  return data
}

// Plaster / stucco: soft blotches + speckle + a few hairline cracks.
function genPlaster(seed) {
  const r = rng(seed)
  const { data, set } = makeBuf()
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const blot = Math.sin(x * 0.14 + 1) * Math.sin(y * 0.11) * 0.06 + Math.sin(x * 0.33 + y * 0.29) * 0.03
      set(x, y, 0.92 + blot + (r() - 0.5) * 0.1, 0.01)
    }
  }
  for (let c = 0; c < 1; c++) {
    let x = Math.floor(r() * SIZE), y = Math.floor(r() * SIZE)
    for (let i = 0; i < 14; i++) { set(x, y, 0.5); x += r() < 0.5 ? 0 : 1; y += 1 }
  }
  return data
}

// Asphalt: dark grit with lighter aggregate flecks and a crack.
function genAsphalt(seed) {
  const r = rng(seed)
  const { data, set } = makeBuf()
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const fleck = r() < 0.06 ? 0.35 : 0
    set(x, y, 0.78 + (r() - 0.5) * 0.2 + fleck)
  }
  let x = 6, y = 0
  for (let i = 0; i < SIZE; i++) { set(x, y, 0.3); x += Math.floor(r() * 3) - 1; y++ }
  return data
}

// Vinyl upholstery / counter face: padded diamond quilting.
function genVinyl(seed) {
  const r = rng(seed)
  const { data, set } = makeBuf()
  const cell = 16
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = Math.abs(((x % cell) - cell / 2) / (cell / 2))
    const dy = Math.abs(((y % cell) - cell / 2) / (cell / 2))
    const d = dx + dy                                  // diamond distance 0..2
    const v = d > 1.75 ? 0.5 : 1 - d * 0.1
    set(x, y, v + (r() - 0.5) * 0.04)
  }
  return data
}

const GENERATORS = {
  wood:    () => genBoards(0x600D, 2, false),
  timber:  () => genBoards(0x71B3, 2, true),
  stone:   () => genStone(0x570E),
  fabric:  () => genFabric(0xFAB1),
  metal:   () => genMetal(0x3E7A),
  shingle: () => genShingle(0x5417),
  plaster: () => genPlaster(0x91A5),
  asphalt: () => genAsphalt(0xA597),
  vinyl:   () => genVinyl(0x71A1),
}

const _tex = new Map()
const _mat = new Map()
const _geo = new Map()

export function getTexture(kind) {
  let t = _tex.get(kind)
  if (t) return t
  t = new THREE.DataTexture(GENERATORS[kind](), SIZE, SIZE, THREE.RGBAFormat)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  _tex.set(kind, t)
  return t
}

// Shared material per (kind, colour, roughness, metalness, side). Never created
// per frame / per spawn.
export function getTexMaterial(kind, color, roughness = 0.95, metalness = 0, side = THREE.FrontSide) {
  const key = `${kind}|${color}|${roughness}|${metalness}|${side}`
  let m = _mat.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: getTexture(kind), color, roughness, metalness, side })
    _mat.set(key, m)
  }
  return m
}

// BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each). Per face the
// [u-extent, v-extent] in metres: x faces (depth,height), y faces (width,depth),
// z faces (width,height).
function scaleBoxUVs(geo, w, h, d, kind) {
  const { tile, dir } = KINDS[kind]
  const uv = geo.attributes.uv
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let f = 0; f < 6; f++) {
    const [a, b] = dims[f]
    const swap = dir && b > a * 1.2   // keep grain along the long axis
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i
      const u0 = uv.getX(idx), v0 = uv.getY(idx)
      if (swap) uv.setXY(idx, (v0 * b) / tile, (u0 * a) / tile)
      else uv.setXY(idx, (u0 * a) / tile, (v0 * b) / tile)
    }
  }
  uv.needsUpdate = true
}

// Cached geometry per (dims, kind) - identical boxes share one buffer.
export function getTexBoxGeo(args, kind) {
  const key = `b|${args.join(',')}|${kind}`
  let g = _geo.get(key)
  if (!g) {
    g = new THREE.BoxGeometry(args[0], args[1], args[2])
    scaleBoxUVs(g, args[0], args[1], args[2], kind)
    _geo.set(key, g)
  }
  return g
}

// Plane in the XY plane (rotate it flat yourself): u along width, v along height.
export function getTexPlaneGeo(w, h, kind) {
  const key = `p|${w},${h}|${kind}`
  let g = _geo.get(key)
  if (!g) {
    const { tile } = KINDS[kind]
    g = new THREE.PlaneGeometry(w, h)
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile)
    uv.needsUpdate = true
    _geo.set(key, g)
  }
  return g
}

// Spread onto a <mesh>: <mesh {...texBoxProps([w,h,d], 'wood', '#221408')} />
export function texBoxProps(args, kind, color, roughness, metalness, side) {
  return { geometry: getTexBoxGeo(args, kind), material: getTexMaterial(kind, color, roughness, metalness, side) }
}

export function texPlaneProps(w, h, kind, color, roughness, metalness, side) {
  return { geometry: getTexPlaneGeo(w, h, kind), material: getTexMaterial(kind, color, roughness, metalness, side) }
}

// Test/debug helpers.
export const TEXTURE_KINDS = Object.keys(GENERATORS)
export function textureBytes() {
  let n = 0
  for (const t of _tex.values()) n += t.image.data.length * 1.34
  return n
}
