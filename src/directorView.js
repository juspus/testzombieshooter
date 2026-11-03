// Pure helpers for the Director's screen (components/DirectorView.jsx): map-to-screen
// projection, cluster hit test, optimistic budget bookkeeping, unit/modifier availability,
// zombie smoothing. No React, no store, no net.
import { DIR_UNITS, DIR_MODS, canBuy } from './director'

// Colours per unit type (zombie dots and unit-bar swatches).
export const UNIT_COLORS = {
  walker: '#9bbf6a', crawler: '#7fae8a', runner: '#f0c040', exploder: '#ff7a1a', brute: '#c0503c',
  spitter: '#b46ae0', armored: '#9fb4c8', screamer: '#ff6fae', boss: '#ff2a2a',
}
export const UNIT_RADIUS = { walker: 3, crawler: 2.5, runner: 3, exploder: 3.5, brute: 4.5, spitter: 3, armored: 4, screamer: 3, boss: 6.5 }

// ── Projection ──────────────────────────────────────────────────────────────

/** World bounds of a map: wall segments {x,z,halfW,halfD}, spawn clusters {x,z}, pad around. */
export function mapBounds(walls, clusters, pad = 2) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const w of walls) {
    minX = Math.min(minX, w.x - w.halfW); maxX = Math.max(maxX, w.x + w.halfW)
    minZ = Math.min(minZ, w.z - w.halfD); maxZ = Math.max(maxZ, w.z + w.halfD)
  }
  for (const c of clusters) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x)
    minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z)
  }
  if (!Number.isFinite(minX)) return { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad }
}

/** Fit bounds into a w x h box with a pixel margin, keeping the aspect ratio, centred. North (-z) is up. */
export function fitMap(bounds, w, h, margin = 12) {
  const bw = Math.max(1e-6, bounds.maxX - bounds.minX)
  const bd = Math.max(1e-6, bounds.maxZ - bounds.minZ)
  const scale = Math.max(1e-6, Math.min((w - margin * 2) / bw, (h - margin * 2) / bd))
  const ox = (w - bw * scale) / 2 - bounds.minX * scale
  const oy = (h - bd * scale) / 2 - bounds.minZ * scale
  return { scale, ox, oy }
}

export const project = (fit, x, z) => ({ x: fit.ox + x * fit.scale, y: fit.oy + z * fit.scale })
export const unproject = (fit, px, py) => ({ x: (px - fit.ox) / fit.scale, z: (py - fit.oy) / fit.scale })

/** Nearest cluster whose marker is within `radiusPx` of the pointer (px, py); -1 if none. */
export function hitCluster(fit, clusters, px, py, radiusPx) {
  let best = -1, bestD = radiusPx * radiusPx
  for (let i = 0; i < clusters.length; i++) {
    const p = project(fit, clusters[i].x, clusters[i].z)
    const d = (p.x - px) ** 2 + (p.y - py) ** 2
    if (d <= bestD) { bestD = d; best = i }
  }
  return best
}

/** Unit vector (screen space) for a defender yaw: the game looks along (-sin, -cos) in (x, z). */
export const yawToScreen = (yaw) => ({ dx: -Math.sin(yaw), dy: -Math.cos(yaw) })

// ── Budget (optimistic) ─────────────────────────────────────────────────────
// `pending` = [{ cost, t }] of spends we sent that the defender's snapshots may not reflect yet.

export const pendingTotal = (pending) => pending.reduce((s, p) => s + p.cost, 0)
export const availableBudget = (view, pending) => Math.max(0, (view?.budgetLeft ?? 0) - pendingTotal(pending))

/**
 * A newer state arrived at `now`: drop spends the defender has had time to count. A spend sent
 * within `settleMs` before the snapshot may not be in it yet, so it stays; anything older is in
 * (or was rejected). Entries also expire after `maxAgeMs`. A wave/round change clears all.
 */
export function reconcilePending(pending, now, { settleMs = 400, maxAgeMs = 2500, reset = false } = {}) {
  if (reset) return []
  return pending.filter((p) => now - p.t < settleMs && now - p.t < maxAgeMs)
}

/** The wave the director is buying for: during intermission it is the upcoming one. */
export function buyWave(view) {
  if (!view) return 1
  return view.phase === 'intermission' ? view.wave + 1 : view.wave
}

/** Spawns are accepted in intermission (they land when the wave starts) and during the window. */
export function spawnOpen(view) {
  if (!view) return false
  if (view.phase === 'intermission') return true
  return view.phase === 'playing' && view.spawnLeft > 0
}

export const modsOpen = (view) => !!view && view.phase === 'intermission'

/** 'locked' (later wave) | 'broke' (cannot afford) | 'ok' for a unit or modifier def. */
export function defStatus(def, wave, avail) {
  if (def.wave > wave) return 'locked'
  return canBuy(def, wave, avail) ? 'ok' : 'broke'
}

/** Unit list with status for the bar. */
export function unitRows(view, pending) {
  const wave = buyWave(view)
  const avail = availableBudget(view, pending)
  return DIR_UNITS.map((u) => ({ ...u, status: defStatus(u, wave, avail) }))
}

/** Modifier list with status; modifiers also need intermission and none bought yet. */
export function modRows(view, pending) {
  const wave = buyWave(view)
  const avail = availableBudget(view, pending)
  return DIR_MODS.map((m) => {
    let status = defStatus(m, wave, avail)
    if (status === 'ok' && !modsOpen(view)) status = 'closed'
    if (view?.nextMod) status = view.nextMod === m.id ? 'bought' : (status === 'ok' ? 'closed' : status)
    return { ...m, status }
  })
}

/** Key 1-9 -> the unit def at that index if it is not locked, else null. */
export function unitForKey(key, view, pending) {
  const i = Number(key) - 1
  if (!Number.isInteger(i) || i < 0 || i >= DIR_UNITS.length) return null
  const row = unitRows(view, pending)[i]
  return row.status === 'locked' ? null : row
}

// ── Smoothing ───────────────────────────────────────────────────────────────

/**
 * Carry rendered positions across snapshots. Zombies have no ids on the wire, so match each new
 * one to the nearest unused previous sprite of the same type within `maxDist` (greedy).
 * prev: [{ x, z, type }] (rendered); next: decoded zombies. Returns sprites with start x/z + target tx/tz.
 */
export function matchZombies(prev, next, maxDist = 3) {
  const used = new Array(prev.length).fill(false)
  const lim = maxDist * maxDist
  return next.map((n) => {
    let bi = -1, bd = lim
    for (let i = 0; i < prev.length; i++) {
      if (used[i] || prev[i].type !== n.type) continue
      const d = (prev[i].x - n.x) ** 2 + (prev[i].z - n.z) ** 2
      if (d <= bd) { bd = d; bi = i }
    }
    if (bi >= 0) used[bi] = true
    return { x: bi >= 0 ? prev[bi].x : n.x, z: bi >= 0 ? prev[bi].z : n.z, tx: n.x, tz: n.z, type: n.type, hp: n.hp }
  })
}

export const approach = (cur, target, dt, rate = 14) => cur + (target - cur) * Math.min(1, dt * rate)

/** Shortest-way angle approach. */
export function approachAngle(cur, target, dt, rate = 14) {
  let d = (target - cur) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return cur + d * Math.min(1, dt * rate)
}
