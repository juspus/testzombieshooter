// Cabin furniture pieces (see furnitureParts.js). Local space: origin = floor
// centre, front = +Z, so ry = PI faces north (-Z), PI/2 faces +X, -PI/2 faces -X.
// Palette stays in the cabin's dark 1970s-rot mood; accent hues are small and dim.

const WD = '#2c1a0b', WD2 = '#1a1006', WD3 = '#3a2410'
const IRONC = '#1c1814', BRASS = '#5a4418', CHROME = '#6a6a62'
const SOFA = '#5a4420', SOFA2 = '#6a5228'      // faded mustard-brown
const AVO = '#34421f'                          // avocado armchair
const PAPER = '#7a7058', STAIN = '#2e0707', DUST = '#1a1410'
const AMBER = '#ffb040'

// ─── seating ────────────────────────────────────────────────────────────────
export function sofa(f) {
  f.b('wood', 0, 0.09, 0, 1.9, 0.12, 0.8, WD2)
  for (const sx of [-0.88, 0.88]) for (const sz of [-0.34, 0.34]) f.b('wood', sx, 0.04, sz, 0.08, 0.08, 0.08, WD2)
  f.b('fabric', -0.46, 0.27, 0.06, 0.9, 0.2, 0.66, SOFA)
  f.b('fabric', 0.46, 0.22, 0.06, 0.9, 0.2, 0.66, SOFA2, [0.03, 0, -0.06])     // sagging cushion
  f.b('fabric', 0, 0.64, -0.33, 1.9, 0.6, 0.16, SOFA)
  f.b('fabric', -0.46, 0.66, -0.2, 0.86, 0.4, 0.14, SOFA2, [-0.16, 0, 0])
  f.b('fabric', 0.46, 0.6, -0.2, 0.86, 0.36, 0.14, SOFA, [-0.22, 0, 0.04])
  f.b('fabric', -0.96, 0.42, 0.04, 0.16, 0.42, 0.78, SOFA)
  f.b('fabric', 0.96, 0.42, 0.04, 0.16, 0.38, 0.78, SOFA)
  f.b('fabric', 0.25, 0.4, 0.1, 0.5, 0.02, 0.36, '#3a2a1a', [0, 0.4, 0])        // old blanket
  f.b('flat', -0.5, 0.375, 0.2, 0.3, 0.012, 0.22, STAIN, [0, 0.3, 0])           // stain
}

export function armchair(f) {
  f.b('wood', 0, 0.09, 0, 0.84, 0.12, 0.8, WD2)
  f.b('fabric', 0, 0.25, 0.06, 0.62, 0.2, 0.6, AVO)
  f.b('fabric', 0, 0.62, -0.3, 0.84, 0.66, 0.18, AVO, [-0.08, 0, 0])
  f.b('fabric', -0.37, 0.42, 0.02, 0.14, 0.4, 0.78, AVO)
  f.b('fabric', 0.37, 0.42, 0.02, 0.14, 0.4, 0.78, AVO)
  f.b('flat', 0.1, 0.355, 0.12, 0.2, 0.01, 0.2, '#1a2210', [0, 0.5, 0])
}

export function diningChair(f, v = 0) {
  const c = v === 1 ? '#3a2210' : v === 2 ? '#241608' : WD
  f.b('wood', 0, 0.43, 0, 0.4, 0.04, 0.4, c)
  for (const sx of [-0.17, 0.17]) { f.b('wood', sx, 0.21, 0.17, 0.04, 0.42, 0.04, c); f.b('wood', sx, 0.46, -0.17, 0.04, 0.92, 0.04, c) }
  f.b('wood', 0, 0.8, -0.17, 0.34, 0.06, 0.03, c)
  if (v !== 2) f.b('wood', 0, 0.62, -0.17, 0.34, 0.05, 0.03, c)
  if (v === 1) f.b('fabric', 0, 0.47, 0.01, 0.36, 0.04, 0.36, '#4a2a12')
}

export function brokenChair(f) {   // tipped over, one leg snapped
  f.b('wood', 0, 0.2, 0, 0.4, 0.04, 0.4, WD, [0, 0.4, 1.4])
  f.b('wood', 0.2, 0.18, -0.2, 0.04, 0.9, 0.04, WD, [0, 0.4, 1.4])
  f.b('wood', 0.2, 0.18, 0.2, 0.04, 0.85, 0.04, WD, [0, 0.4, 1.4])
  f.b('wood', -0.14, 0.04, 0.25, 0.04, 0.34, 0.04, WD2, [0.2, 1.1, 1.52])
  f.b('wood', 0.3, 0.05, -0.1, 0.04, 0.24, 0.04, WD2, [1.2, 0.3, 1.6])         // snapped leg on floor
}

export function bench(f) {
  f.b('wood', 0, 0.45, 0, 1.5, 0.05, 0.4, WD)
  f.b('wood', 0, 0.85, -0.18, 1.5, 0.1, 0.04, WD)
  f.b('wood', 0, 0.68, -0.18, 1.5, 0.1, 0.04, WD)
  for (const sx of [-0.65, 0.65]) { f.b('wood', sx, 0.22, 0.14, 0.06, 0.44, 0.06, WD2); f.b('wood', sx, 0.45, -0.17, 0.06, 0.9, 0.06, WD2) }
  f.b('fabric', 0.3, 0.48, 0, 0.3, 0.03, 0.3, '#2a2214', [0, 0.3, 0])
}

// ─── tall storage ───────────────────────────────────────────────────────────
export function wardrobe(f) {
  f.b('wood', 0, 0.95, 0, 1.1, 1.9, 0.55, WD)
  f.b('wood', 0, 1.93, 0.02, 1.2, 0.07, 0.62, WD3)
  f.b('flat', 0, 0.95, 0.28, 0.02, 1.7, 0.01, '#0a0604')
  f.b('wood', -0.28, 0.95, 0.285, 0.46, 1.74, 0.02, WD3)
  f.b('wood', 0.28, 0.95, 0.285, 0.46, 1.74, 0.02, '#331e0e', [0, -0.08, 0])      // right door hangs ajar
  f.b('metal', -0.06, 0.95, 0.31, 0.03, 0.14, 0.03, BRASS)
  f.b('metal', 0.06, 0.95, 0.31, 0.03, 0.14, 0.03, BRASS)
  f.b('flat', 0, 0.15, 0.2, 0.9, 0.3, 0.01, '#050302')
}

export function dresser(f) {
  f.b('wood', 0, 0.42, 0, 0.95, 0.84, 0.46, WD)
  f.b('wood', 0, 0.86, 0, 1.0, 0.04, 0.5, WD3)
  for (const y of [0.2, 0.46, 0.7]) {
    f.b('wood', 0, y, 0.235, 0.88, 0.22, 0.02, WD3)
    f.b('metal', -0.2, y, 0.255, 0.05, 0.03, 0.02, BRASS)
    f.b('metal', 0.2, y, 0.255, 0.05, 0.03, 0.02, BRASS)
  }
  f.b('fabric', 0.15, 0.89, 0.05, 0.4, 0.02, 0.26, '#3a3020', [0, 0.1, 0])         // doily
  f.b('flat', -0.3, 0.9, 0.1, 0.1, 0.01, 0.1, PAPER, [0, 0.5, 0])
}

export function grandfatherClock(f) {
  f.b('wood', 0, 0.1, 0, 0.5, 0.2, 0.32, WD3)
  f.b('wood', 0, 0.9, 0, 0.38, 1.6, 0.26, WD)
  f.b('wood', 0, 1.78, 0, 0.5, 0.36, 0.32, WD3)
  f.b('wood', 0, 2.0, 0, 0.42, 0.08, 0.28, WD3)
  f.c('flat', 0, 1.78, 0.17, 0.15, 0.02, '#a89c78', [Math.PI / 2, 0, 0], 12)
  f.b('flat', 0, 1.82, 0.19, 0.012, 0.11, 0.008, '#120c06', [0, 0, 0.5])
  f.b('flat', 0, 1.78, 0.19, 0.012, 0.08, 0.008, '#120c06', [0, 0, -1.9])
  f.b('flat', 0, 1.0, 0.135, 0.22, 0.7, 0.01, '#0a0604')                            // pendulum case
  f.b('metal', 0, 0.8, 0.14, 0.02, 0.5, 0.01, BRASS)
  f.c('metal', 0, 0.58, 0.14, 0.06, 0.012, BRASS, [Math.PI / 2, 0, 0], 10)
}

export function fridge(f) {
  f.b('flat', 0, 0.82, 0, 0.74, 1.64, 0.68, '#4e4a3a')
  f.b('flat', 0, 1.2, 0.345, 0.7, 0.02, 0.01, '#1a160e')                            // door seam
  f.b('metal', 0.3, 1.45, 0.36, 0.03, 0.3, 0.04, CHROME)
  f.b('metal', 0.3, 0.85, 0.36, 0.03, 0.4, 0.04, CHROME)
  f.b('flat', -0.15, 1.0, 0.35, 0.3, 0.5, 0.005, '#3a1c0c')                          // rust
  f.b('flat', 0.12, 0.3, 0.35, 0.2, 0.3, 0.005, '#2c1608')
  f.b('flat', 0, 1.67, 0, 0.7, 0.02, 0.62, DUST)
}

// ─── kitchen ────────────────────────────────────────────────────────────────
// Counter with sink, length along X. Front +Z.
export function counter(f, len = 1.6) {
  f.b('wood', 0, 0.43, -0.02, len, 0.86, 0.56, WD)
  f.b('wood', 0, 0.89, 0, len + 0.04, 0.05, 0.62, '#2a2016')
  const n = Math.round(len / 0.5)
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * (len / n)
    f.b('wood', x, 0.43, 0.27, len / n - 0.04, 0.74, 0.02, i === 1 ? '#3a2410' : WD3)
    f.b('metal', x, 0.6, 0.3, 0.1, 0.02, 0.02, BRASS)
  }
  // sink basin + tap
  f.b('flat', -len / 4, 0.915, 0, 0.5, 0.01, 0.38, '#0c0c0a')
  f.b('metal', -len / 4, 1.0, -0.24, 0.03, 0.2, 0.03, CHROME)
  f.b('metal', -len / 4, 1.1, -0.17, 0.03, 0.03, 0.16, CHROME)
  // clutter on the worktop
  f.c('metal', len / 4, 0.99, 0.05, 0.1, 0.14, '#2a2218', null, 8)               // pot
  f.c('metal', len / 4 + 0.2, 0.96, -0.1, 0.08, 0.08, '#3a2410', null, 8)
  f.b('fabric', len / 4 - 0.15, 0.925, 0.12, 0.2, 0.02, 0.14, '#3a3a2a', [0, 0.3, 0])
}

export function wallCupboards(f, len = 1.6) {
  f.b('wood', 0, 0, 0, len, 0.7, 0.34, WD)
  const n = Math.round(len / 0.5)
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * (len / n)
    f.b('wood', x, 0, 0.175, len / n - 0.04, 0.62, 0.02, i === 0 ? '#3a2410' : WD3, i === 2 ? [0, 0, 0.03] : null)
    f.b('metal', x + 0.1, -0.1, 0.2, 0.02, 0.1, 0.02, BRASS)
  }
}

// Open wall shelves with jars and cans. Length along X; back at z = 0.
export function jarShelf(f, len = 1.6) {
  const jars = ['#2a3a24', '#3a2e14', '#2a2e36', '#3a2418', '#2e3a2a']
  for (const y of [0, 0.42]) {
    f.b('wood', 0, y, 0.12, len, 0.04, 0.24, WD)
    f.b('wood', -len / 2 + 0.03, y - 0.1, 0.03, 0.03, 0.16, 0.06, WD2)
    f.b('wood', len / 2 - 0.03, y - 0.1, 0.03, 0.03, 0.16, 0.06, WD2)
    for (let i = 0; i < 6; i++) {
      const x = -len / 2 + 0.18 + i * ((len - 0.36) / 5)
      if ((i + (y ? 1 : 0)) % 4 === 3) continue            // gaps
      if ((i + (y ? 0 : 1)) % 2) f.c('flat', x, y + 0.11, 0.12, 0.05, 0.18, jars[i % 5], null, 7)
      else f.c('metal', x, y + 0.08, 0.12, 0.04, 0.12, i % 3 ? '#4a4030' : '#503a28', null, 7)
    }
  }
}

// ─── tables with props ──────────────────────────────────────────────────────
export function kerosene(f) {
  f.c('metal', 0, 0.04, 0, 0.07, 0.08, BRASS, null, 8)
  f.c('glow', 0, 0.2, 0, 0.045, 0.2, AMBER, null, 8)
  f.c('metal', 0, 0.32, 0, 0.055, 0.04, BRASS, null, 8)
}

export function candleStub(f) {
  f.c('flat', 0, 0.05, 0, 0.03, 0.1, '#c8b898', null, 6)
  f.b('glow', 0, 0.12, 0, 0.02, 0.035, 0.02, AMBER)
  f.c('flat', 0, 0.005, 0, 0.06, 0.01, '#d8c8a0', null, 8)
}

// Console table: leather-bound book, reel-to-reel recorder, a kerosene lamp.
export function consoleTable(f, full = true) {
  f.b('wood', 0, 0.76, 0, 1.0, 0.05, 0.4, WD)
  for (const sx of [-0.45, 0.45]) for (const sz of [-0.15, 0.15]) f.b('wood', sx, 0.37, sz, 0.05, 0.74, 0.05, WD2)
  f.b('wood', 0, 0.58, -0.17, 0.9, 0.08, 0.03, WD2)
  if (!full) {
    f.c('metal', -0.25, 0.8, 0.0, 0.06, 0.04, BRASS, null, 8)
    f.c('glow', -0.25, 0.92, 0.0, 0.04, 0.2, AMBER, null, 8)
    f.b('flat', 0.2, 0.79, 0.04, 0.26, 0.012, 0.18, PAPER, [0, 0.4, 0])
    return
  }
  // skin-bound book, ragged pages, strap, a pale pressed "eye" on the cover
  f.b('flat', -0.28, 0.82, 0.0, 0.3, 0.07, 0.23, '#8a7a50')
  f.b('flat', -0.28, 0.82, 0.0, 0.32, 0.075, 0.2, '#3a2412', [0, 0.1, 0])
  f.b('flat', -0.28, 0.862, 0.0, 0.24, 0.006, 0.17, '#4a3018', [0, 0.1, 0])
  f.b('flat', -0.28, 0.866, 0.0, 0.07, 0.004, 0.035, '#c0b080', [0, 0.1, 0])
  f.b('flat', -0.28, 0.866, 0.0, 0.02, 0.005, 0.02, '#120804', [0, 0.1, 0])
  f.b('flat', -0.28, 0.82, 0.0, 0.03, 0.08, 0.25, '#1a0e06', [0, 0.1, 0])
  // reel-to-reel
  f.b('flat', 0.18, 0.84, -0.02, 0.36, 0.14, 0.26, '#24241f')
  f.b('flat', 0.18, 0.91, 0.0, 0.34, 0.01, 0.2, '#32322c')
  f.c('metal', 0.07, 0.915, 0.0, 0.075, 0.02, '#8a8678', [0, 0, 0], 12)
  f.c('metal', 0.29, 0.915, 0.0, 0.075, 0.02, '#8a8678', [0, 0, 0], 12)
  f.c('flat', 0.07, 0.93, 0.0, 0.022, 0.02, '#14120e', null, 6)
  f.c('flat', 0.29, 0.93, 0.0, 0.022, 0.02, '#14120e', null, 6)
  f.b('flat', 0.18, 0.912, 0.085, 0.22, 0.004, 0.006, '#2a1a0c')                     // tape run
  f.b('flat', 0.0, 0.775, 0.12, 0.5, 0.004, 0.012, '#0c0c0a', [0, 0.3, 0])            // mic cable
}

export function sideTable(f) {   // small round-ish table next to the sofa
  f.b('wood', 0, 0.52, 0, 0.5, 0.04, 0.5, WD)
  for (const sx of [-0.2, 0.2]) for (const sz of [-0.2, 0.2]) f.b('wood', sx, 0.25, sz, 0.04, 0.5, 0.04, WD2)
  f.c('flat', -0.08, 0.62, 0.05, 0.05, 0.14, '#2a2418', null, 7)                       // bottle
  f.b('flat', 0.12, 0.545, -0.08, 0.16, 0.012, 0.12, PAPER, [0, 0.4, 0])
  f.c('flat', 0.12, 0.575, 0.1, 0.045, 0.05, '#2a1c14', null, 7)                       // mug
}

// ─── wall pieces (back at z = 0, front +Z) ──────────────────────────────────
export function shotgunRack(f) {
  f.b('wood', 0, 0, 0.03, 1.1, 0.14, 0.05, WD2)
  f.b('wood', -0.4, 0.12, 0.07, 0.05, 0.1, 0.05, WD3)
  f.b('wood', 0.4, 0.12, 0.07, 0.05, 0.1, 0.05, WD3)
  f.b('metal', 0, 0.2, 0.1, 1.0, 0.03, 0.03, '#14120e')
  f.b('metal', 0, 0.16, 0.1, 1.0, 0.025, 0.025, '#1a1814')
  f.b('wood', -0.6, 0.18, 0.1, 0.34, 0.07, 0.04, '#3a2210', [0, 0, 0.08])
  f.b('metal', 0.1, 0.09, 0.1, 0.22, 0.04, 0.04, '#14120e')
}

export function wallClock(f) {
  f.c('wood', 0, 0, 0.03, 0.22, 0.05, WD3, [Math.PI / 2, 0, 0], 14)
  f.c('flat', 0, 0, 0.058, 0.18, 0.012, '#a89c78', [Math.PI / 2, 0, 0], 14)
  f.b('flat', 0, 0.05, 0.07, 0.012, 0.11, 0.006, '#120c06', [0, 0, 0.2])
  f.b('flat', 0, 0.03, 0.07, 0.012, 0.08, 0.006, '#120c06', [0, 0, 1.9])
  for (const [x, y] of [[0, 0.15], [0, -0.15], [0.15, 0], [-0.15, 0]]) f.b('flat', x, y, 0.066, 0.015, 0.015, 0.006, '#120c06')
}

export function crackedMirror(f) {
  f.b('wood', 0, 0, 0.02, 0.58, 0.9, 0.04, WD3)
  f.b('flat', 0, 0, 0.045, 0.48, 0.8, 0.012, '#1c262c')
  const crack = '#6a7c86'
  f.b('flat', 0.02, 0.1, 0.053, 0.012, 0.5, 0.004, crack, [0, 0, 0.5])
  f.b('flat', -0.06, 0.2, 0.053, 0.01, 0.3, 0.004, crack, [0, 0, -0.7])
  f.b('flat', 0.08, -0.15, 0.053, 0.01, 0.3, 0.004, crack, [0, 0, 1.2])
  f.b('flat', -0.15, 0.32, 0.053, 0.01, 0.22, 0.004, crack, [0, 0, 0.2])
  f.b('flat', 0.15, 0.3, 0.052, 0.14, 0.18, 0.003, '#1a2228', [0, 0, 0.6])             // missing shard
}

export function photos(f) {
  const frames = [[-0.34, 0.04, 0.3, 0.38, 0.05], [0.1, -0.05, 0.42, 0.32, -0.04], [0.5, 0.06, 0.26, 0.34, 0.03]]
  frames.forEach(([x, y, w, h, tilt], i) => {
    f.b('wood', x, y, 0.02, w + 0.06, h + 0.06, 0.03, i === 1 ? WD3 : WD2, [0, 0, tilt])
    f.b('flat', x, y, 0.04, w, h, 0.01, '#4a3e28', [0, 0, tilt])
    f.b('flat', x - 0.03, y - 0.02, 0.048, w * 0.18, h * 0.5, 0.004, '#201408', [0, 0, tilt])
    f.b('flat', x + 0.04, y - 0.03, 0.048, w * 0.16, h * 0.44, 0.004, '#201408', [0, 0, tilt])
    f.b('flat', x - 0.03, y + h * 0.14, 0.048, w * 0.1, w * 0.1, 0.004, '#8a7850', [0, 0, tilt])
  })
}

export function coatHooks(f) {
  f.b('wood', 0, 0, 0.03, 1.3, 0.12, 0.05, WD2)
  for (const x of [-0.5, -0.17, 0.17, 0.5]) f.b('metal', x, 0.0, 0.08, 0.03, 0.03, 0.08, IRONC)
  f.b('fabric', -0.5, -0.5, 0.11, 0.42, 0.95, 0.12, '#2a2a1c', [0, 0.1, 0.02])          // long coat
  f.b('fabric', -0.17, -0.38, 0.11, 0.34, 0.7, 0.1, '#3a2418', [0, -0.15, -0.03])
  f.c('flat', 0.17, -0.1, 0.12, 0.14, 0.04, '#241a10', [Math.PI / 2 - 0.2, 0, 0], 10)     // hat
  f.c('flat', 0.17, -0.06, 0.13, 0.08, 0.1, '#241a10', [Math.PI / 2 - 0.2, 0, 0], 10)
}

// ─── hearth / yard clutter ──────────────────────────────────────────────────
export function firewood(f) {
  const rows = [[5, 0.08], [4, 0.24], [3, 0.4]]
  rows.forEach(([n, y], r) => {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.17
      f.c('wood', x, y, (i % 2) * 0.01, 0.075 + (i % 3) * 0.006, 0.42 + (i % 2) * 0.04, i % 2 ? '#3a2410' : '#2a1a0a', [0, 0, Math.PI / 2 + 0.03 * (r - 1)], 7)
    }
  })
}

export function chopBlock(f) {
  f.c('wood', 0, 0.22, 0, 0.26, 0.44, '#3a2410', null, 10)
  f.c('flat', 0, 0.445, 0, 0.22, 0.01, '#4a3218', null, 10)
  f.b('wood', 0.02, 0.62, 0.04, 0.04, 0.5, 0.04, WD3, [0.1, 0.3, 0.9])                  // axe handle
  f.b('metal', -0.1, 0.44, 0.0, 0.16, 0.14, 0.03, '#3a3a38', [0, 0.3, 0.2])              // axe head, buried
}

export function boots(f) {
  f.b('flat', -0.1, 0.07, 0, 0.1, 0.14, 0.26, '#1e140c', [0, 0.2, 0])
  f.b('flat', 0.1, 0.05, 0.05, 0.1, 0.1, 0.26, '#1e140c', [0, -0.3, 0])
  f.b('flat', -0.1, 0.18, -0.06, 0.1, 0.12, 0.1, '#1e140c', [0, 0.2, 0])
}

export function umbrellaStand(f) {
  f.c('flat', 0, 0.2, 0, 0.13, 0.4, '#1a1a16', null, 8)
  f.b('wood', -0.03, 0.55, 0, 0.02, 0.7, 0.02, '#120c06', [0, 0, 0.12])
  f.b('wood', 0.04, 0.5, 0.02, 0.02, 0.6, 0.02, '#120c06', [0, 0, -0.1])
}

export function papers(f) {
  f.b('flat', 0, 0.004, 0, 0.3, 0.004, 0.22, PAPER, [0, 0.4, 0])
  f.b('flat', 0.22, 0.004, 0.1, 0.26, 0.004, 0.2, '#6a6048', [0, -0.5, 0])
  f.b('flat', -0.18, 0.004, 0.2, 0.22, 0.004, 0.16, '#5e5640', [0, 1.1, 0])
  f.b('flat', 0.1, 0.008, -0.16, 0.2, 0.004, 0.14, PAPER, [0, 0.9, 0])
}

export function bookPile(f) {
  f.b('flat', 0, 0.04, 0, 0.26, 0.07, 0.19, '#3d0a0a', [0, 0.3, 0])
  f.b('flat', 0.01, 0.1, 0, 0.24, 0.06, 0.17, '#0a1e0a', [0, -0.2, 0])
  f.b('flat', -0.01, 0.15, 0, 0.2, 0.05, 0.15, '#2a1a0a', [0, 0.5, 0])
  f.b('flat', 0.3, 0.025, 0.1, 0.2, 0.04, 0.15, '#08101e', [0, 1.0, 0])
}

export function floorStain(f, s = 1) {
  f.b('flat', 0, 0.006, 0, 0.7 * s, 0.004, 0.5 * s, STAIN, [0, 0.4, 0])
  f.b('flat', 0.3 * s, 0.006, 0.2 * s, 0.35 * s, 0.004, 0.3 * s, '#240505', [0, 1.2, 0])
}

export function runner(f, w = 1.0, l = 2.6) {
  f.b('fabric', 0, 0.007, 0, w, 0.014, l, '#3a2218')
  f.b('fabric', -w / 2 + 0.07, 0.009, 0, 0.1, 0.014, l, '#1a0e08')
  f.b('fabric', w / 2 - 0.07, 0.009, 0, 0.1, 0.014, l, '#1a0e08')
}

export function trunk(f) {
  f.b('wood', 0, 0.2, 0, 0.9, 0.4, 0.5, '#2a1a0c')
  f.b('wood', 0, 0.44, 0, 0.92, 0.1, 0.52, WD3)
  f.b('metal', -0.3, 0.22, 0.255, 0.05, 0.42, 0.01, IRONC)
  f.b('metal', 0.3, 0.22, 0.255, 0.05, 0.42, 0.01, IRONC)
  f.b('metal', 0, 0.38, 0.26, 0.07, 0.08, 0.02, BRASS)
}

// Blood-stained mattress overlay for the existing Bed prop (placed on the bed).
export function bedStains(f) {
  f.b('flat', 0.08, 0.519, -0.15, 0.4, 0.004, 0.4, STAIN, [0, 0.25, 0])
  f.b('flat', -0.12, 0.484, 0.4, 0.28, 0.004, 0.3, '#240505', [0, -0.4, 0])
}
