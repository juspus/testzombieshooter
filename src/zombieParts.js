// The zombie model as plain box lists, one per moving part (head, body, one arm, one leg, a spider
// limb half, the spitter's throat sac), baked into cached merged geometries by zombieMesh.js.
// Every position is in the local space of the group the animation rotates (the head group, the body
// frame, a shoulder, a hip), exactly as the old one-mesh-per-box JSX had them.
//
// A box is b(w,h,d, x,y,z, colour, roughness, rotation, metalness, emissive, emissiveIntensity):
//   colour    '#hex' (fixed) or one of the palette slots below (shirt, skin, ... per zombie variant)
//   rotation  [rx,ry,rz] Euler XYZ, or null
//   emissive  a '#hex', or true = glow in the box's own (slot) colour
import { bakeParts, slot } from './zombieMesh'

// Palette slots (per zombie: see zombieVariant.js getVariantColors and the archetype colours).
const shirt = slot('shirt'), shirtTear = slot('shirtTear'), pants = slot('pants')
const skin = slot('skin'), skinDark = slot('skinDark'), skinVein = slot('skinVein')
const skullBone = slot('skullBone'), skullDark = slot('skullDark')
const accent = slot('accent'), eye = slot('eye'), baseVein = slot('baseVein')
// Fixed colours (same for every zombie)
const boot = '#0e0c08', bootSole = '#080604', blood = '#3a0b0a', flesh = '#5a3a28', fleshDark = '#3a2018'
const gum = '#6a1c1c', tooth = '#d8cca8', bloodBrt = '#5a1210', hair = '#141008', bone = '#b8a882'
const STEEL = '#2a3744'

function list() {
  const parts = []
  const b = (w, h, d, x, y, z, c, ro = 1, r = null, me = 0, em = null, ei = 0) => {
    parts.push({ s: [w, h, d], p: [x, y, z], r, c, ro, me, em, ei })
  }
  return [parts, b]
}

// ── Head (head group space) ─────────────────────────────────────────────────
// flags: armored (riot helmet), spitter (cheek pouches, acid drool), noJaw (variant: jaw torn off)
function headParts({ armored, spitter, noJaw }) {
  const [P, b] = list()
  // Main skull dome
  b(0.30, 0.38, 0.28, 0, 0.760, 0, skullBone, 0.85)
  // Dome rings: 3 steps to round the crown
  b(0.268, 0.026, 0.244, 0, 0.963, -0.008, skullBone, 0.84)
  b(0.194, 0.024, 0.173, 0, 0.989, -0.010, skullBone, 0.83)
  b(0.130, 0.022, 0.113, 0, 1.013, -0.009, skullBone, 0.83)
  // Occipital bump: back of skull
  b(0.180, 0.120, 0.030, 0, 0.730, -0.148, skullBone, 0.84)
  // Decayed flesh: left side, right patch, back/top, forehead strip
  b(0.038, 0.190, 0.140, -0.142, 0.808, 0.020, flesh, 1)
  b(0.036, 0.130, 0.120, 0.138, 0.745, 0.038, fleshDark, 1)
  b(0.200, 0.100, 0.055, 0, 0.830, -0.102, flesh, 1)
  b(0.030, 0.060, 0.018, -0.060, 0.870, 0.095, fleshDark, 1, [0, 0, 0.15])
  // Brow ridge, knobs, glabella dip, underside shadow
  b(0.290, 0.060, 0.075, 0, 0.800, 0.142, skullDark, 0.84)
  b(0.075, 0.038, 0.042, -0.080, 0.806, 0.150, skullDark, 0.84)
  b(0.075, 0.038, 0.042, 0.080, 0.806, 0.150, skullDark, 0.84)
  b(0.038, 0.025, 0.020, 0, 0.796, 0.154, '#130f08', 1)
  b(0.270, 0.018, 0.048, 0, 0.774, 0.150, '#0d0a06', 1)
  // Left eye: socket, orbital rim, supraorbital notch, glow (amber), iris (hot orange)
  b(0.096, 0.088, 0.042, -0.082, 0.762, 0.132, '#040201', 1)
  b(0.104, 0.096, 0.014, -0.082, 0.762, 0.115, skullDark, 0.84)
  b(0.018, 0.010, 0.014, -0.052, 0.802, 0.139, '#0a0804', 1)
  b(0.055, 0.055, 0.014, -0.082, 0.762, 0.140, eye, 1, null, 0, true, 3.5)
  b(0.030, 0.030, 0.008, -0.082, 0.762, 0.144, eye, 1, null, 0, true, 5)
  // Right eye
  b(0.096, 0.088, 0.042, 0.082, 0.762, 0.132, '#040201', 1)
  b(0.104, 0.096, 0.014, 0.082, 0.762, 0.115, skullDark, 0.84)
  b(0.018, 0.010, 0.014, 0.052, 0.802, 0.139, '#0a0804', 1)
  b(0.055, 0.055, 0.014, 0.082, 0.762, 0.140, eye, 1, null, 0, true, 3.5)
  b(0.030, 0.030, 0.008, 0.082, 0.762, 0.144, eye, 1, null, 0, true, 5)
  // Nasal aperture, two pillars, spine
  b(0.072, 0.065, 0.025, 0, 0.714, 0.150, '#060302', 1)
  b(0.010, 0.048, 0.016, -0.030, 0.720, 0.148, skullBone, 0.80)
  b(0.010, 0.048, 0.016, 0.030, 0.720, 0.148, skullBone, 0.80)
  b(0.014, 0.012, 0.016, 0, 0.694, 0.148, skullBone, 0.80)
  // Cheekbones and hanging cheek flesh
  b(0.040, 0.058, 0.115, -0.150, 0.718, 0.106, skullBone, 0.78)
  b(0.040, 0.058, 0.115, 0.150, 0.718, 0.106, skullBone, 0.78)
  b(0.025, 0.090, 0.018, -0.154, 0.695, 0.122, flesh, 1, [0, 0, 0.22])
  b(0.022, 0.075, 0.016, 0.154, 0.688, 0.118, fleshDark, 1, [0, 0, -0.18])
  // Upper jaw / maxilla, upper gum, 7 upper teeth of varying heights
  b(0.250, 0.072, 0.205, 0, 0.650, 0.058, skullBone, 0.85)
  b(0.210, 0.026, 0.020, 0, 0.620, 0.140, gum, 1)
  for (const [x, h] of [[-0.085, 0.030], [-0.051, 0.038], [-0.017, 0.034], [0.017, 0.042], [0.051, 0.034], [0.085, 0.030], [-0.034, 0.028]]) {
    b(0.020, h, 0.018, x, 0.604 - h / 2, 0.143, tooth, 0.55)
  }
  // Gaping mouth: void and throat
  b(0.220, 0.115, 0.095, 0, 0.562, 0.098, '#030101', 1)
  b(0.160, 0.090, 0.060, 0, 0.560, 0.040, '#020101', 1)
  if (!noJaw) {
    // Tongue (lying on the lower jaw), groove, tip
    b(0.135, 0.024, 0.115, 0, 0.528, 0.092, '#7a1a1a', 0.95, [0.40, 0, 0])
    b(0.008, 0.010, 0.100, 0, 0.532, 0.102, '#521010', 1, [0.40, 0, 0])
    b(0.085, 0.020, 0.030, 0, 0.516, 0.140, '#601414', 0.95, [0.40, 0, 0])
    // Lower jaw (dropped wide open), lower gum, 6 jagged lower teeth
    b(0.235, 0.065, 0.185, 0, 0.540, 0.052, skullBone, 0.85, [0.44, 0, 0])
    b(0.175, 0.022, 0.018, 0, 0.508, 0.140, gum, 1)
    for (const [x, h] of [[-0.070, 0.032], [-0.036, 0.042], [-0.004, 0.036], [0.028, 0.044], [0.060, 0.032], [-0.052, 0.026]]) {
      b(0.020, h, 0.016, x, 0.519 + h / 2, 0.143, tooth, 0.55)
    }
    // Torn jaw corners
    b(0.026, 0.075, 0.015, -0.108, 0.572, 0.130, flesh, 1, [0.10, 0, 0.50])
    b(0.018, 0.050, 0.012, -0.118, 0.558, 0.126, fleshDark, 1, [0.20, 0, 0.65])
    b(0.026, 0.075, 0.015, 0.108, 0.572, 0.130, fleshDark, 1, [0.10, 0, -0.50])
    b(0.018, 0.050, 0.012, 0.118, 0.558, 0.126, flesh, 1, [0.20, 0, -0.65])
  }
  // Blood: pooled under the lip, two drips, smear on the upper jaw
  b(0.110, 0.016, 0.010, 0, 0.506, 0.148, blood, 1)
  b(0.010, 0.030, 0.008, -0.030, 0.485, 0.145, blood, 1)
  b(0.008, 0.020, 0.007, 0.025, 0.492, 0.147, blood, 1)
  b(0.044, 0.022, 0.008, 0.042, 0.614, 0.150, blood, 1)
  // Skull crack, branch, blood from the crack, hair wisps
  b(0.008, 0.130, 0.005, 0.060, 0.862, 0.060, '#140e06', 1, [0, 0, 0.60])
  b(0.006, 0.060, 0.004, 0.085, 0.830, 0.065, '#140e06', 1, [0, 0, 1.10])
  b(0.007, 0.070, 0.006, 0.072, 0.822, 0.068, blood, 1, [0, 0, 0.60])
  b(0.008, 0.080, 0.005, -0.095, 0.918, -0.082, hair, 1, [0.38, 0.28, 0.18])
  b(0.006, 0.062, 0.005, 0.070, 0.924, -0.090, hair, 1, [0.30, -0.20, -0.12])
  if (armored) {
    // Riot helmet: shell, brow band, neck + cheek guards (eyes and mouth stay open)
    b(0.37, 0.30, 0.35, 0, 0.905, -0.012, STEEL, 0.4, null, 0.6)
    b(0.33, 0.07, 0.36, 0, 1.07, -0.012, STEEL, 0.4, null, 0.6)
    b(0.05, 0.40, 0.30, 0, 1.05, -0.012, '#c9ccd0', 0.5, null, 0.4)
    b(0.36, 0.075, 0.06, 0, 0.835, 0.172, '#161d24', 0.3, null, 0.7)
    b(0.34, 0.20, 0.07, 0, 0.74, -0.178, STEEL, 0.4, null, 0.6)
    b(0.05, 0.26, 0.24, -0.178, 0.76, 0.01, STEEL, 0.4, null, 0.6)
    b(0.05, 0.26, 0.24, 0.178, 0.76, 0.01, STEEL, 0.4, null, 0.6)
  }
  if (spitter) {
    // Swollen cheek pouches, acid drool
    b(0.07, 0.13, 0.13, -0.165, 0.665, 0.07, '#7fa03a', 0.7)
    b(0.07, 0.13, 0.13, 0.165, 0.665, 0.07, '#7fa03a', 0.7)
    b(0.018, 0.12, 0.014, -0.03, 0.46, 0.15, '#9aff3a', 0.4, null, 0, '#6aff1a', 1.6)
    b(0.014, 0.08, 0.012, 0.04, 0.47, 0.15, '#9aff3a', 0.4, null, 0, '#6aff1a', 1.6)
  }
  return P
}

// ── Body frame: neck, torso, hips and everything attached to it ─────────────
// flags: kind ('' | 'exploder' | 'armored' | 'spitter' | 'screamer' | 'crawler'), ribs, plate
// (the type's accent badge: '' none (walker), 'boss', 'runner', 'std')
function bodyParts({ kind, ribs, plate }) {
  const [P, b] = list()
  // Neck and collar / torn shirt edge
  b(0.15, 0.11, 0.14, 0, 0.535, 0, skin, 0.9)
  b(0.22, 0.03, 0.12, 0, 0.480, 0.06, shirtTear, 1)
  // Chest, seam, torn flap, blood stains
  b(0.44, 0.38, 0.22, 0, 0.285, 0, shirt, 0.95)
  b(0.006, 0.34, 0.004, 0, 0.285, 0.112, shirtTear, 1)
  b(0.08, 0.12, 0.01, -0.17, 0.18, 0.115, shirtTear, 1, [0, 0, 0.3])
  b(0.12, 0.15, 0.008, 0.07, 0.30, 0.113, blood, 1)
  b(0.04, 0.08, 0.007, 0.06, 0.14, 0.112, bloodBrt, 1)
  // Shoulder caps / deltoids
  b(0.09, 0.08, 0.17, -0.245, 0.365, 0, shirt, 0.95)
  b(0.09, 0.08, 0.17, 0.245, 0.365, 0, shirt, 0.95)
  // Abdomen, belt, buckle, hips
  b(0.36, 0.22, 0.20, 0, 0.015, 0, shirt, 0.95)
  b(0.40, 0.055, 0.23, 0, -0.085, 0, boot, 0.6, null, 0.3)
  b(0.06, 0.045, 0.012, 0, -0.085, 0.120, '#888060', 0.4, null, 0.7)
  b(0.38, 0.16, 0.21, 0, -0.175, 0, kind === 'screamer' ? '#d8d0c0' : pants, 0.95)

  if (kind === 'exploder') {
    // Swollen, bloated belly with veins and glowing pustules
    b(0.60, 0.50, 0.44, 0, 0.06, 0.09, skin, 0.75)
    b(0.52, 0.40, 0.50, 0, 0.10, 0.10, skinDark, 0.8, [0, 0.6, 0])
    b(0.012, 0.36, 0.012, -0.08, 0.08, 0.335, baseVein, 1)
    b(0.012, 0.30, 0.012, 0.14, 0.06, 0.33, baseVein, 1, [0, 0, 0.3])
    for (const [px, py, pz, ps] of [
      [-0.15, 0.14, 0.34, 0.10], [0.12, 0.00, 0.35, 0.12], [0.02, 0.22, 0.32, 0.075], [-0.21, -0.05, 0.31, 0.085],
      [0.23, 0.17, 0.30, 0.075], [-0.31, 0.12, 0.12, 0.09], [0.31, 0.02, 0.14, 0.10], [0.0, -0.08, 0.35, 0.07],
    ]) b(ps, ps, ps * 0.7, px, py, pz, '#ffb02e', 0.4, null, 0, '#ff7a00', 2.8)
  }
  if (kind === 'armored') {
    // Riot plates: chest, front plate, pauldrons, abdomen guard, badge
    b(0.52, 0.42, 0.27, 0, 0.285, 0, STEEL, 0.45, null, 0.6)
    b(0.42, 0.30, 0.04, 0, 0.30, 0.148, '#3d4f60', 0.4, null, 0.65)
    b(0.16, 0.10, 0.25, -0.285, 0.41, 0, STEEL, 0.45, null, 0.6)
    b(0.16, 0.10, 0.25, 0.285, 0.41, 0, STEEL, 0.45, null, 0.6)
    b(0.36, 0.14, 0.23, 0, 0.02, 0, STEEL, 0.45, null, 0.6)
    b(0.12, 0.05, 0.04, 0, 0.40, 0.17, '#d8a020', 0.5, null, 0.3, '#d8a020', 0.6)
  }
  if (kind === 'spitter') {
    // Dorsal spines (the throat sac is its own mesh: it pulses)
    ;[0.44, 0.30, 0.16].forEach((y, i) => b(0.04, 0.12 - i * 0.02, 0.05, 0, y, -0.14, '#3a4a1a', 0.8, [-0.5, 0, 0]))
  }
  if (ribs) {
    // Exposed ribs: torn-open chest patch
    b(0.19, 0.20, 0.012, -0.06, 0.27, 0.116, '#210807', 1)
    ;[0.19, 0.235, 0.28, 0.325].forEach((y, i) => b(0.17 - i * 0.008, 0.018, 0.016, -0.06, y, 0.124, bone, 0.85))
    b(0.016, 0.20, 0.014, -0.06, 0.27, 0.122, bone, 0.85)
  }
  if (kind === 'screamer') {
    // Dress and long black hair
    b(0.50, 0.78, 0.045, 0, 0.055, 0.137, '#d9d2c3', 0.98, [0.08, 0, 0])
    b(0.42, 0.50, 0.04, 0, -0.245, 0.132, '#bfb6a8', 1, [0.18, 0, 0])
    b(0.030, 0.62, 0.035, -0.152, 0.615, 0.020, '#090706', 1, [0.30, 0, -0.15])
    b(0.034, 0.68, 0.040, 0.148, 0.590, 0.010, '#090706', 1, [0.34, 0, 0.13])
    b(0.20, 0.46, 0.055, 0, 0.710, -0.090, '#090706', 1, [0.20, 0, 0])
  }
  if (kind === 'crawler') {
    // Trailing gore and leg bones
    b(0.34, 0.080, 0.22, 0, -0.282, -0.020, blood, 1)
    b(0.12, 0.065, 0.18, -0.115, -0.272, -0.070, bone, 0.85, [0, 0, -0.25])
    b(0.12, 0.065, 0.18, 0.115, -0.272, -0.070, bone, 0.85, [0, 0, 0.25])
    b(0.48, 0.055, 0.60, 0, -0.315, -0.180, '#210807', 1, null, 0, '#3a0908', 0.45)
  }
  if (plate) {
    // Accent badge on the chest (every archetype but the walker), glows in the archetype colour
    const boss = plate === 'boss'
    b(boss ? 0.30 : 0.18, boss ? 0.055 : 0.035, 0.028, 0, 0.455, 0.126, accent, 0.75, null, 0, true, boss ? 2.8 : plate === 'runner' ? 1.5 : 0.7)
  }
  return P
}

// ── Arms (shoulder group space). side -1 = left, 1 = right. Left and right differ in pose. ──
// flags: noArm (this arm is a stump), kind ('' | 'armored' | 'screamer')
function armParts(side, { noArm, kind }) {
  const [P, b] = list()
  const L = side < 0
  const x = (v) => (L ? -v : v)
  b(0.10, 0.10, 0.10, 0, -0.060, 0.04, shirt, 0.95)
  b(0.13, 0.36, 0.12, x(0.057), -0.170, 0.095, shirt, 0.95, [L ? -0.55 : -0.45, 0, L ? -0.12 : 0.12])
  b(0.09, 0.09, 0.09, x(L ? 0.070 : 0.068), L ? -0.330 : -0.310, L ? 0.195 : 0.185, skin, 0.9)
  if (noArm) {
    b(0.10, 0.05, 0.10, x(L ? 0.070 : 0.068), L ? -0.352 : -0.332, L ? 0.200 : 0.190, blood, 1, [L ? -0.55 : -0.45, 0, 0])
    return P
  }
  const rx = L ? -1.05 : -0.95
  const rz = (v) => (L ? -v : v)
  const fy = L ? -0.347 : -0.325, fz = L ? 0.300 : 0.285
  b(0.11, 0.32, 0.10, x(L ? 0.077 : 0.074), fy, fz, skin, 0.9, [rx, 0, rz(0.08)])
  if (kind === 'armored') b(0.14, 0.22, 0.13, x(L ? 0.077 : 0.074), fy, fz, STEEL, 0.45, [rx, 0, rz(0.08)], 0.6)
  // Wrist vein, hand, three fingers
  if (L) {
    b(0.007, 0.07, 0.005, -0.078, -0.403, 0.408, skinVein, 1, [-1.05, 0, -0.05])
    b(0.105, 0.105, 0.09, -0.082, -0.410, 0.462, skullBone, 0.85, [-1.05, 0, -0.05])
    b(0.025, 0.07, 0.022, -0.097, -0.433, 0.510, skullBone, 0.85, [-1.05, -0.15, -0.05])
    b(0.025, 0.075, 0.022, -0.072, -0.427, 0.512, skullBone, 0.85, [-1.05, 0, -0.04])
    b(0.025, 0.068, 0.022, -0.048, -0.433, 0.508, skullBone, 0.85, [-1.05, 0.14, -0.03])
    if (kind === 'screamer') {
      b(0.012, 0.18, 0.010, -0.112, -0.505, 0.572, '#1b120f', 0.6, [-1.12, -0.20, -0.06])
      b(0.012, 0.20, 0.010, -0.075, -0.500, 0.582, '#1b120f', 0.6, [-1.12, 0, -0.05])
      b(0.012, 0.17, 0.010, -0.037, -0.505, 0.570, '#1b120f', 0.6, [-1.12, 0.18, -0.04])
    }
  } else {
    b(0.007, 0.07, 0.005, 0.075, -0.387, 0.390, skinVein, 1, [-0.95, 0, 0.05])
    b(0.105, 0.105, 0.09, 0.080, -0.383, 0.435, skullBone, 0.85, [-0.95, 0, 0.05])
    b(0.025, 0.07, 0.022, 0.096, -0.405, 0.483, skullBone, 0.85, [-0.95, -0.15, 0.04])
    b(0.025, 0.075, 0.022, 0.071, -0.401, 0.486, skullBone, 0.85, [-0.95, 0, 0.03])
    b(0.025, 0.068, 0.022, 0.047, -0.407, 0.481, skullBone, 0.85, [-0.95, 0.14, 0.02])
    if (kind === 'screamer') {
      b(0.012, 0.18, 0.010, 0.112, -0.478, 0.545, '#1b120f', 0.6, [-1.02, -0.20, 0.05])
      b(0.012, 0.20, 0.010, 0.075, -0.474, 0.555, '#1b120f', 0.6, [-1.02, 0, 0.04])
      b(0.012, 0.17, 0.010, 0.037, -0.480, 0.543, '#1b120f', 0.6, [-1.02, 0.18, 0.03])
    }
  }
  return P
}

// ── Leg (hip group space): left and right are identical ─────────────────────
function legParts({ armored }) {
  const [P, b] = list()
  if (armored) b(0.18, 0.13, 0.20, 0, -0.37, 0.04, STEEL, 0.45, null, 0.6)
  b(0.16, 0.36, 0.17, 0, -0.200, 0, pants, 0.95)
  b(0.08, 0.07, 0.04, 0, -0.380, 0.09, pants, 0.95)
  b(0.14, 0.30, 0.15, 0, -0.495, 0.01, pants, 0.95)
  b(0.145, 0.10, 0.165, 0, -0.645, 0.01, boot, 0.8)
  b(0.135, 0.06, 0.235, 0, -0.697, 0.055, boot, 0.8)
  b(0.140, 0.015, 0.240, 0, -0.728, 0.055, bootSole, 0.6)
  return P
}

// ── Spitter throat sac (own group: it pulses during the spit wind-up) ──────
function sacParts() {
  const [P, b] = list()
  b(0.20, 0.20, 0.17, 0, 0, 0, '#8fe02a', 0.45, null, 0, '#6aff1a', 1.9)
  return P
}

// ── Spider limb halves (see SpiderLimbs in Zombie.jsx for the group layout) ─
export const SPIDER_L1 = 0.5   // upper limb length (shoulder / hip -> elbow / knee apex)
export const SPIDER_L2 = 1.0   // lower limb length (apex -> claw)
// arm limbs are skin with bone claws, leg limbs are shirt-coloured with a dark foot
function spiderUpperParts(arm) {
  const [P, b] = list()
  b(SPIDER_L1, 0.12, 0.12, SPIDER_L1 / 2, 0, 0, arm ? skin : shirt, 0.95)
  b(0.14, 0.14, 0.14, SPIDER_L1, 0, 0, skinDark, 0.9)
  return P
}
function spiderLowerParts(arm) {
  const [P, b] = list()
  b(SPIDER_L2, 0.085, 0.085, SPIDER_L2 / 2, 0, 0, skin, 0.9)
  b(0.14, 0.05, 0.13, SPIDER_L2 + 0.02, 0, 0, arm ? skullBone : skinDark, 0.85)
  if (arm) for (const z of [-0.045, 0, 0.045]) b(0.12, 0.022, 0.022, SPIDER_L2 + 0.13, -0.015, z, skullBone, 0.85, [0, -z * 5, -0.45])
  return P
}

// ── Cached merged geometries ────────────────────────────────────────────────
const _geo = new Map()
function cached(key, build) {
  let g = _geo.get(key)
  if (!g) { g = bakeParts(build()); _geo.set(key, g) }
  return g
}

export const bodyKind = (type) =>
  type === 'exploder' || type === 'armored' || type === 'spitter' || type === 'screamer' || type === 'crawler' ? type : ''
const plateOf = (type, isBoss) => (type === 'walker' ? '' : isBoss ? 'boss' : type === 'runner' ? 'runner' : 'std')

export const headGeo = (type, v) => {
  const f = { armored: type === 'armored', spitter: type === 'spitter', noJaw: !!v.noJaw }
  return cached(`head|${f.armored ? 'A' : f.spitter ? 'S' : '-'}${f.noJaw ? 'J' : ''}`, () => headParts(f))
}
export const bodyGeo = (type, v, isBoss) => {
  const f = { kind: bodyKind(type), ribs: !!v.ribs, plate: plateOf(type, isBoss) }
  return cached(`body|${f.kind}|${f.ribs ? 'r' : ''}|${f.plate}`, () => bodyParts(f))
}
export const armGeo = (side, type, v) => {
  const f = { noArm: v.noArm === side, kind: type === 'armored' || type === 'screamer' ? type : '' }
  return cached(`arm|${side}|${f.kind}|${f.noArm ? 'x' : ''}`, () => armParts(side, f))
}
export const legGeo = (type) => cached(`leg|${type === 'armored' ? 'A' : ''}`, () => legParts({ armored: type === 'armored' }))
export const sacGeo = () => cached('sac', sacParts)
export const spiderUpperGeo = (arm) => cached(`spU|${arm ? 1 : 0}`, () => spiderUpperParts(arm))
export const spiderLowerGeo = (arm) => cached(`spL|${arm ? 1 : 0}`, () => spiderLowerParts(arm))
export const cachedZombieGeometryCount = () => _geo.size

// Every geometry the game can ask for, as small jobs, so they can be baked in idle time instead of
// on the frame a rare variant (torn jaw, stump arm, exposed ribs, a new archetype) first spawns.
// Each job is a no-op once its geometry is cached. `types` = the archetype names, `bossTypes` the
// ones with the boss badge.
export function zombieGeometryJobs(types, bossTypes = ['boss']) {
  const jobs = []
  const noRibs = new Set(['screamer', 'exploder', 'armored'])
  for (const type of types) {
    const boss = bossTypes.includes(type)
    for (const noJaw of [false, true]) jobs.push(() => headGeo(type, { noJaw }))
    for (const ribs of noRibs.has(type) ? [false] : [false, true]) jobs.push(() => bodyGeo(type, { ribs }, boss))
    if (type === 'spider') { jobs.push(() => spiderUpperGeo(true), () => spiderUpperGeo(false), () => spiderLowerGeo(true), () => spiderLowerGeo(false)); continue }
    for (const side of [-1, 1]) for (const stump of [false, true]) jobs.push(() => armGeo(side, type, { noArm: stump ? side : 0 }))
    if (type !== 'crawler') jobs.push(() => legGeo(type))
    if (type === 'spitter') jobs.push(sacGeo)
  }
  return jobs
}
