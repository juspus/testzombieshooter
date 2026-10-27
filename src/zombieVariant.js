// Per-zombie visual variety ("no two zombies alike").
//
// Everything here is a pure function of (type, id): host and guest both receive
// the same zombie ids (the host's `zombies` list is mirrored to the guest), so
// both clients derive the same look with zero extra network data.
//
// Colours come from small fixed palettes. They are resolved to hex strings and
// handed to the existing sm() shared-material cache in Zombie.jsx, so a zombie
// never owns a material: same colour = same material instance, and every
// material is a MeshStandardMaterial, so the shader program count stays flat.
import * as THREE from 'three'

// ── Seeded RNG ──────────────────────────────────────────────────────────────
export function hash32(x) {
  let h
  if (typeof x === 'string') {
    h = 2166136261
    for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619) }
  } else {
    h = (Math.imul((x | 0) + 0x9e3779b9, 0x85ebca6b)) | 0
  }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Colour helpers (module-load only) ───────────────────────────────────────
const _c = new THREE.Color()
const _t = new THREE.Color()
const shade = (hex, f) => '#' + _c.set(hex).multiplyScalar(f).getHexString()
const tint = (hex, to, k) => '#' + _c.set(hex).lerp(_t.set(to), k).getHexString()

// ── Palettes (index 0 is always the archetype's original look) ──────────────
export const SHIRTS = {
  walker:   ['#252520', '#34507a', '#6a4a2c', '#56683a', '#7a2e2e', '#2f6663'],
  runner:   ['#2a1f1a', '#6a2e1c', '#5a5a2c', '#3a4658', '#6a5238'],
  brute:    ['#241d24', '#5e4226', '#2f5a40', '#6a2e2c', '#46465a'],
  screamer: ['#21172b'],               // hidden under the dress
  crawler:  ['#171f17', '#3c4e2c', '#2e4660', '#52382a'],
  boss:     ['#201010'],
  // Wave 3 specials: shirts are mostly covered by gear / swelling, so only a few shades
  exploder: ['#4a3a22', '#3c4a2a', '#5a3a2a'],
  armored:  ['#1d2128', '#2a2e22', '#2a2230'],   // under the plates
  spitter:  ['#2b3a22', '#3a3a24', '#2a2f38'],
}
export const PANTS = ['#18180f', '#2a3c5c', '#4a4228', '#3a2e2e']
// Sickly skin tones as a tint over the archetype's own skin colour, so a
// runner stays yellow-green and a screamer stays violet, just a shade off.
export const TONES = [
  { to: null,      k: 0 },        // original
  { to: '#a0a04c', k: 0.30 },     // sallow
  { to: '#8c9298', k: 0.35 },     // ashen
  { to: '#8a4a60', k: 0.30 },     // bruised
]
const TONE_WEIGHTS = [0.4, 0.2, 0.2, 0.2]
// Skull/jaw bone is shared by every archetype; the tone tints it so heads differ too.
const SKULL_BONE = '#c2b090'
const SKULL_DARK = '#a09070'

// Per-archetype variation envelope. h/w are +- fractions around 1; dmg scales the
// damage-variant odds (the boss and screamer keep a clean silhouette).
const RANGE = {
  walker:   { h: 0.08, w: 0.07, dmg: 1 },
  runner:   { h: 0.06, w: 0.05, dmg: 1 },
  brute:    { h: 0.06, w: 0.07, dmg: 1 },
  screamer: { h: 0.04, w: 0.04, dmg: 0.5 },
  crawler:  { h: 0.08, w: 0.07, dmg: 1 },
  boss:     { h: 0.02, w: 0.02, dmg: 0 },
  exploder: { h: 0.05, w: 0.06, dmg: 0.4 },   // bloated silhouette stays readable
  armored:  { h: 0.04, w: 0.03, dmg: 0.2 },   // gear hides most damage variants
  spitter:  { h: 0.06, w: 0.05, dmg: 0.6 },
}
const P_ARM = 0.12, P_JAW = 0.10, P_RIBS = 0.14, P_LIMP = 0.18

// ── Variant ─────────────────────────────────────────────────────────────────
// Plain data. Fixed number/order of rng draws so adding a feature later never
// reshuffles unrelated traits of existing ids.
export function getZombieVariant(type, seed) {
  const R = RANGE[type] ?? RANGE.walker
  const shirts = SHIRTS[type] ?? SHIRTS.walker
  const r = mulberry32(hash32(seed))
  const shirt = Math.floor(r() * shirts.length)
  const pants = Math.floor(r() * PANTS.length)
  let tone = 0
  { let u = r(); while (tone < TONE_WEIGHTS.length - 1 && u >= TONE_WEIGHTS[tone]) { u -= TONE_WEIGHTS[tone]; tone++ } }
  const h = 1 + (r() * 2 - 1) * R.h
  const w = 1 + (r() * 2 - 1) * R.w
  const armRoll = r(), armSide = r(), jawRoll = r(), ribsRoll = r()
  const limpRoll = r(), limpSide = r(), limpAmt = r(), rate = r()
  const d = R.dmg
  const noArm = armRoll < P_ARM * d ? (armSide < 0.5 ? -1 : 1) : 0         // -1 = left, 1 = right
  const noJaw = jawRoll < P_JAW * d
  const ribs = type !== 'screamer' && type !== 'exploder' && type !== 'armored' && ribsRoll < P_RIBS * d                 // dress covers the chest
  const limpOn = type !== 'crawler' && limpRoll < P_LIMP * d
  const limp = limpOn ? (limpSide < 0.5 ? -1 : 1) : 0
  const bad = 0.30 + limpAmt * 0.25                                         // bad leg keeps 30-55% swing
  return {
    shirt, pants, tone, h, w, noArm, noJaw, ribs, limp,
    // walk animation: cycle rate, per-leg amplitude/phase (limp = short, late stride)
    gait: {
      rate: 3.6 + rate * 0.8,
      ampL: limp === -1 ? 0.32 * bad : 0.32,
      ampR: limp === 1 ? 0.32 * bad : 0.32,
      phL: limp === -1 ? 0.8 : 0,
      phR: limp === 1 ? 0.8 : 0,
    },
  }
}

// ── Resolved colours ────────────────────────────────────────────────────────
const _palCache = new Map()
// `base` = the archetype's colours from getZombieColors (skin triplet). `dmg` =
// walker at half health: the only archetype whose colours already darken with
// health. Returns a cached object, so repeat renders allocate nothing.
export function getVariantColors(type, v, base, dmg) {
  const key = `${type}|${v.shirt}|${v.pants}|${v.tone}|${dmg ? 1 : 0}`
  let p = _palCache.get(key)
  if (p) return p
  const shirts = SHIRTS[type] ?? SHIRTS.walker
  const tone = TONES[v.tone]
  const adj = (hex) => (tone.to ? tint(hex, tone.to, tone.k) : hex)
  const shirt = dmg ? shade(shirts[v.shirt], 0.8) : shirts[v.shirt]
  p = {
    shirt, shirtTear: shade(shirt, 0.7),
    pants: PANTS[v.pants],
    skin: adj(base.skin), skinDark: adj(base.skinDark), skinVein: adj(base.skinVein),
    skullBone: adj(SKULL_BONE), skullDark: adj(SKULL_DARK),
  }
  _palCache.set(key, p)
  return p
}
