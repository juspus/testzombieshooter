// The Director's survivor's-war-map look (paper + ink). Pure helpers plus painters that take a 2D
// context. The paper and ink layers are painted once to offscreen canvases (see DirectorView.jsx)
// and blitted every frame; all jitter comes from a seeded PRNG so lines never shimmer.

// Muted pin-head colours that sit on aged paper.
export const PIN_COLORS = {
  walker: '#b8372b', crawler: '#8e6a3a', runner: '#d98a1c', exploder: '#d4560f', brute: '#6e1a1a',
  spitter: '#6a3d8f', armored: '#4a5d70', screamer: '#b8507a', boss: '#1c1410',
}

export const INK = '#2a2118'
export const RED_INK = '#a3201a'
export const BLUE_INK = '#1d3f9a'
export const HAND_FONT = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive'

/** Small seeded PRNG (mulberry32): same seed, same jitter on every rebuild. */
export function seededRandom(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Screen positions for the spawn markers, pushed apart until none is closer than `minDist` (and
 * kept inside the box). Pairs move along the line between them; identical points along the edge's
 * tangent. pts: [{ x, y, edge }]. Returns new [{ x, y }].
 */
export function spreadMarkers(pts, minDist, box) {
  const out = pts.map((p) => ({ x: p.x, y: p.y }))
  for (let it = 0; it < 24; it++) {
    let moved = false
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        let dx = out[j].x - out[i].x, dy = out[j].y - out[i].y
        let d = Math.hypot(dx, dy)
        if (d >= minDist) continue
        if (d < 1e-3) {
          const ns = pts[i].edge === 'N' || pts[i].edge === 'S'
          dx = ns ? 1 : 0; dy = ns ? 0 : 1; d = 1
        }
        const push = (minDist - d) / 2 + 0.5
        const ux = dx / d, uy = dy / d
        out[i].x -= ux * push; out[i].y -= uy * push
        out[j].x += ux * push; out[j].y += uy * push
        moved = true
      }
    }
    if (box) {
      for (const p of out) {
        p.x = Math.max(box.pad, Math.min(box.w - box.pad, p.x))
        p.y = Math.max(box.pad, Math.min(box.h - box.pad, p.y))
      }
    }
    if (!moved) break
  }
  return out
}

/** Nearest screen point within radiusPx of (px, py); -1 if none. */
export function hitPoint(points, px, py, radiusPx) {
  let best = -1, bestD = radiusPx * radiusPx
  for (let i = 0; i < points.length; i++) {
    const d = (points[i].x - px) ** 2 + (points[i].y - py) ** 2
    if (d <= bestD) { bestD = d; best = i }
  }
  return best
}

// ── Painters (called once per resize / plank change) ────────────────────────

/** Aged paper: tan base, speckle, stains, fold creases, dark edges. */
export function paintPaper(c, w, h, seed = 11) {
  const rnd = seededRandom(seed)
  const g = c.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#e2d2aa'); g.addColorStop(0.5, '#d8c69b'); g.addColorStop(1, '#cdb88a')
  c.fillStyle = g; c.fillRect(0, 0, w, h)
  // fibre speckle
  const n = Math.round((w * h) / 90)
  for (let i = 0; i < n; i++) {
    c.fillStyle = rnd() < 0.5 ? `rgba(90,60,25,${0.03 + rnd() * 0.07})` : `rgba(255,248,225,${0.04 + rnd() * 0.08})`
    c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2)
  }
  // stains
  for (let i = 0; i < 7; i++) {
    const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * Math.min(w, h) * 0.25
    const rg = c.createRadialGradient(x, y, r * 0.2, x, y, r)
    rg.addColorStop(0, `rgba(120,80,30,${0.10 + rnd() * 0.10})`); rg.addColorStop(0.8, 'rgba(120,80,30,0.04)'); rg.addColorStop(1, 'rgba(120,80,30,0)')
    c.fillStyle = rg; c.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // coffee ring
  const rx = w * (0.15 + rnd() * 0.2), ry = h * (0.65 + rnd() * 0.2)
  c.strokeStyle = 'rgba(110,70,25,0.16)'; c.lineWidth = 3
  c.beginPath(); c.arc(rx, ry, 26, 0.3, 5.9); c.stroke()
  // fold creases: one vertical, one horizontal (light edge + dark edge)
  const folds = [[w * (0.48 + rnd() * 0.06), 0, 1], [0, h * (0.5 + rnd() * 0.06), 0]]
  for (const [fx, fy, vert] of folds) {
    c.lineWidth = 1.5
    c.strokeStyle = 'rgba(70,45,15,0.28)'
    c.beginPath(); vert ? (c.moveTo(fx, 0), c.lineTo(fx, h)) : (c.moveTo(0, fy), c.lineTo(w, fy)); c.stroke()
    c.strokeStyle = 'rgba(255,250,230,0.35)'
    c.beginPath(); vert ? (c.moveTo(fx + 2, 0), c.lineTo(fx + 2, h)) : (c.moveTo(0, fy + 2), c.lineTo(w, fy + 2)); c.stroke()
  }
  // burnt edges
  const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75)
  v.addColorStop(0, 'rgba(60,35,10,0)'); v.addColorStop(1, 'rgba(60,35,10,0.55)')
  c.fillStyle = v; c.fillRect(0, 0, w, h)
}

/** A wobbly stroke between two points (jitter from rnd). */
export function wobbleLine(c, x1, y1, x2, y2, rnd, amp = 0.9, step = 9) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const n = Math.max(1, Math.round(len / step))
  c.moveTo(x1 + (rnd() - 0.5) * amp, y1 + (rnd() - 0.5) * amp)
  for (let i = 1; i <= n; i++) {
    const t = i / n
    c.lineTo(x1 + (x2 - x1) * t + (rnd() - 0.5) * amp * 1.6, y1 + (y2 - y1) * t + (rnd() - 0.5) * amp * 1.6)
  }
}

/** Hand-drawn rect outline (+ optional wash and diagonal hatching clipped to it). */
export function inkRect(c, x, y, w, h, rnd, { hatch = false, wash = null, line = INK, width = 1.8 } = {}) {
  if (wash) { c.fillStyle = wash; c.fillRect(x, y, w, h) }
  if (hatch) {
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip()
    c.strokeStyle = 'rgba(42,33,24,0.42)'; c.lineWidth = 1
    c.beginPath()
    const gap = 3.5
    for (let k = -h; k < w; k += gap) { c.moveTo(x + k, y + h); c.lineTo(x + k + h, y) }
    c.stroke(); c.restore()
  }
  c.strokeStyle = line; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'
  c.beginPath()
  wobbleLine(c, x, y, x + w, y, rnd); wobbleLine(c, x + w, y, x + w, y + h, rnd)
  wobbleLine(c, x + w, y + h, x, y + h, rnd); wobbleLine(c, x, y + h, x, y, rnd)
  c.stroke()
}

/** One scribbled pine: three stacked zig-zag boughs, a trunk stroke and a little shade. */
export function inkPine(c, x, y, size, rnd) {
  c.strokeStyle = 'rgba(38,48,30,0.8)'; c.lineWidth = 1.2; c.lineCap = 'round'; c.lineJoin = 'round'
  c.beginPath()
  c.moveTo(x, y + size * 0.6); c.lineTo(x, y + size * 0.2)
  for (let i = 0; i < 3; i++) {
    const top = y - size + i * size * 0.5, bottom = top + size * 0.8, half = size * (0.32 + i * 0.14)
    const j = () => (rnd() - 0.5) * 2
    c.moveTo(x, top); c.lineTo(x - half + j(), bottom); c.lineTo(x + half + j(), bottom); c.lineTo(x, top)
  }
  c.stroke()
  c.strokeStyle = 'rgba(38,48,30,0.4)'; c.lineWidth = 1
  c.beginPath()
  for (let i = 0; i < 4; i++) { const sy = y - size * 0.7 + i * size * 0.4; c.moveTo(x - size * 0.25, sy); c.lineTo(x + size * 0.1, sy + 2) }
  c.stroke()
}

/** A hand-drawn circle (slightly open, overshooting) as a path; radius jitter from `jit` (array of offsets). */
export function circlePath(c, x, y, r, jit, rot = 0) {
  const n = jit.length
  c.beginPath()
  for (let i = 0; i <= n + 1; i++) {
    const a = rot + (i / n) * Math.PI * 2 * 1.04
    const rr = r + jit[i % n] + i * 0.06
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py)
  }
}

/** Jitter table for a hand-drawn circle. */
export function circleJitter(rnd, n = 20, amp = 0.8) {
  return Array.from({ length: n }, () => (rnd() - 0.5) * amp * 2)
}
