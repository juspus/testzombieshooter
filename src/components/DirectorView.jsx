// The Director's screen: a full-screen top-down map of the defender's world, shown while this
// player directs (store `director.role === 'director'`). Reads the latest defender snapshot from
// `director.view` (see makeState in src/director.js) and sends dir_spawn / dir_mod with
// sendVersus. One 2D canvas drawn from refs in a requestAnimationFrame loop (no Three.js, no
// per-frame React state); the DOM only holds the header and the unit bar.
//
// `send` is injectable so tests can capture messages without a network link.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './ui.css'
import './DirectorView.css'
import { useGameStore } from '../store'
import { getMap, getInitialMapId } from '../maps'
import { MSG, decodeZombie } from '../director'
import { sendVersus } from '../versus'
import useMenuEnv from '../menuTouch'
import {
  UNIT_RADIUS, mapBounds, fitMap, project, yawToScreen,
  availableBudget, reconcilePending, buyWave, spawnOpen, unitRows, modRows,
  unitForKey, matchZombies, approach, approachAngle,
} from '../directorView'
import {
  PIN_COLORS, INK, RED_INK, BLUE_INK, HAND_FONT, seededRandom, spreadMarkers, hitPoint, paintPaper,
  wobbleLine, inkRect, inkPine, circlePath, circleJitter,
} from '../directorPaper'

let _spawnCounter = 0
const MARKER_R = 21
const HIT_RADIUS = 24   // 48 px tap circle around a cluster marker
const FLASH_MS = 450

function mapGeometry() {
  const map = getMap(getInitialMapId())
  const walls = map.cabinWallSegments ? map.cabinWallSegments() : map.wallSegments()
  const furniture = map.FURNITURE_COLLIDERS ?? []
  const clusters = map.SPAWN_CLUSTERS
  const windows = map.WINDOW_DEFS ?? []
  const bounds = mapBounds(walls, clusters, 2)
  return { walls, furniture, clusters, windows, bounds, windowBlock: map.windowBlockSegment }
}

function roundScore(rounds, defender) {
  const me = defender === 'host' ? 'guest' : 'host'
  let a = 0, b = 0
  for (const r of rounds ?? []) {
    const w = typeof r === 'string' ? r : r?.winner
    if (w === me) a++
    else if (w === 'host' || w === 'guest') b++
  }
  return `${a}-${b}`
}

export default function DirectorView({ send = sendVersus }) {
  const directing = useGameStore((s) => s.director?.role === 'director')
  if (!directing) return null
  return <DirectorScreen send={send} />
}

function DirectorScreen({ send }) {
  const director = useGameStore((s) => s.director)
  const seed = useGameStore((s) => s.runSeed)
  const view = director?.view ?? null
  const { touch, portrait } = useMenuEnv()
  const geo = useMemo(mapGeometry, [])

  const [selected, setSelected] = useState(null)       // unit id
  const [modSent, setModSent] = useState(null)         // { wave, id }
  const [, bump] = useState(0)
  const pendingRef = useRef([])
  const modSentRef = useRef(null)
  const seenRef = useRef({ view: null, wave: null, round: null })

  // Reconcile optimistic spends when a newer snapshot arrives.
  if (seenRef.current.view !== view) {
    const reset = !view || seenRef.current.wave !== view.wave || seenRef.current.round !== view.round
    pendingRef.current = reconcilePending(pendingRef.current, performance.now(), { reset })
    seenRef.current = { view, wave: view?.wave ?? null, round: view?.round ?? null }
  }
  const pending = pendingRef.current

  const wave = buyWave(view)
  const viewForMods = modSent && modSent.wave === wave && view && !view.nextMod ? { ...view, nextMod: modSent.id } : view
  const units = unitRows(view, pending)
  const mods = modRows(viewForMods, pending)
  const avail = availableBudget(view, pending)
  const open = spawnOpen(view)

  // Live refs for the canvas loop and handlers.
  const live = useRef({})
  live.current = { view, selected, open, geo }

  const spend = useCallback((cost) => {
    pendingRef.current = [...pendingRef.current, { cost, t: performance.now() }]
    bump((n) => n + 1)
  }, [])

  const trySpawn = useCallback((cluster) => {
    const { view: v, selected: sel } = live.current
    if (!v || !sel || !spawnOpen(v)) return false
    const row = unitRows(v, pendingRef.current).find((u) => u.id === sel)
    if (!row || row.status !== 'ok') return false
    send(MSG.SPAWN, { seed, id: `${seed}:${++_spawnCounter}`, type: sel, cluster })
    spend(row.cost)
    flashes.current.push({ cluster, t: performance.now(), color: PIN_COLORS[sel] })
    return true
  }, [send, seed, spend])

  const tryMod = useCallback((id) => {
    const v = live.current.view
    const sentMod = modSentRef.current
    const vm = sentMod && v && sentMod.wave === buyWave(v) && !v.nextMod ? { ...v, nextMod: sentMod.id } : v
    const row = modRows(vm, pendingRef.current).find((m) => m.id === id)
    if (!row || row.status !== 'ok') return
    send(MSG.MOD, { seed, id: `${seed}:m${++_spawnCounter}`, mod: id })
    spend(row.cost)
    modSentRef.current = { wave: buyWave(v), id }
    setModSent(modSentRef.current)
  }, [send, seed, spend])

  const pick = useCallback((id) => {
    const row = unitRows(live.current.view, pendingRef.current).find((u) => u.id === id)
    if (!row || row.status === 'locked') return
    setSelected((cur) => (cur === id ? null : id))
  }, [])

  // Number keys 1-9 pick a unit; Escape clears.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') { setSelected(null); return }
      const row = unitForKey(e.key, live.current.view, pendingRef.current)
      if (row) setSelected(row.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Canvas ────────────────────────────────────────────────────────────────
  // Paper and ink are painted once per size (and ink again when planks change) to offscreen
  // canvases; each frame blits them and draws only the moving pieces.
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const flashes = useRef([])
  const sprites = useRef({ zombies: [], px: 0, pz: 0, yaw: 0, init: false, view: null })
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1, fit: { scale: 1, ox: 0, oy: 0 }, markers: [] })

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current
    if (!wrap || !canvas) return undefined
    const ctx = canvas.getContext('2d')
    const layers = { paper: null, ink: null, planksKey: '', jitter: [] }
    const offscreen = (w, h, dpr) => {
      const o = document.createElement('canvas')
      o.width = Math.round(w * dpr); o.height = Math.round(h * dpr)
      const oc = o.getContext('2d'); oc.setTransform(dpr, 0, 0, dpr, 0, 0)
      return [o, oc]
    }

    const buildInk = (planks) => {
      const { w, h, dpr, fit, markers } = sizeRef.current
      const g = live.current.geo
      const [o, c] = offscreen(w, h, dpr)
      const rnd = seededRandom(1234)
      const s = fit.scale
      const P = (x, z) => project(fit, x, z)

      // Cabin extents (world) for the tree ring
      let cx0 = Infinity, cx1 = -Infinity, cz0 = Infinity, cz1 = -Infinity
      for (const sg of g.walls) {
        cx0 = Math.min(cx0, sg.x - sg.halfW); cx1 = Math.max(cx1, sg.x + sg.halfW)
        cz0 = Math.min(cz0, sg.z - sg.halfD); cz1 = Math.max(cz1, sg.z + sg.halfD)
      }
      // Pine ring
      const size = Math.max(9, Math.min(20, s * 1.5))
      const trees = []
      for (let i = 0; i < 400 && trees.length < 70; i++) {
        const x = cx0 - 7 + rnd() * (cx1 - cx0 + 14), z = cz0 - 7 + rnd() * (cz1 - cz0 + 14)
        if (x > cx0 - 1.8 && x < cx1 + 1.8 && z > cz0 - 1.8 && z < cz1 + 1.8) continue
        const p = P(x, z)
        if (p.x < 8 || p.y < size + 4 || p.x > w - 8 || p.y > h - 8) continue
        if (markers.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < 34)) continue
        if (trees.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < size * 0.9)) continue
        trees.push(p)
      }
      trees.sort((a, b) => a.y - b.y)
      for (const t of trees) inkPine(c, t.x, t.y, size * (0.85 + rnd() * 0.3), rnd)

      // Furniture: faint pencil outlines
      for (const f of g.furniture) {
        const a = P(f.x - f.halfW, f.z - f.halfD)
        inkRect(c, a.x, a.y, f.halfW * 2 * s, f.halfD * 2 * s, rnd, { line: 'rgba(60,48,36,0.45)', width: 1 })
      }
      // Walls: ink outline, wash, hatching
      for (const sg of g.walls) {
        const a = P(sg.x - sg.halfW, sg.z - sg.halfD)
        inkRect(c, a.x, a.y, sg.halfW * 2 * s, sg.halfD * 2 * s, rnd, { hatch: true, wash: 'rgba(60,40,20,0.16)' })
      }
      // Windows: pencil tally per plank, red X when open
      for (const win of g.windows) {
        const n = planks[win.id] ?? 0
        const p = P(win.winX, win.winZ)
        const ns = win.wall === 'N' || win.wall === 'S'
        const half = s * 1.0
        c.lineCap = 'round'
        c.strokeStyle = 'rgba(60,48,36,0.5)'; c.lineWidth = 1
        c.beginPath(); ns ? (c.moveTo(p.x - half, p.y), c.lineTo(p.x + half, p.y)) : (c.moveTo(p.x, p.y - half), c.lineTo(p.x, p.y + half)); c.stroke()
        if (n > 0) {
          const k = Math.min(n, 6), len = Math.max(7, s * 0.7)
          c.strokeStyle = '#2f2820'; c.lineWidth = 2
          c.beginPath()
          for (let i = 0; i < k; i++) {
            const off = (-half * 0.8) + (i + 0.5) * (half * 1.6 / k) + (rnd() - 0.5)
            const j = (rnd() - 0.5) * 1.5
            if (ns) { c.moveTo(p.x + off, p.y - len / 2 + j); c.lineTo(p.x + off + j, p.y + len / 2) }
            else { c.moveTo(p.x - len / 2 + j, p.y + off); c.lineTo(p.x + len / 2, p.y + off + j) }
          }
          c.stroke()
        } else {
          const r = Math.max(6, s * 0.6)
          c.strokeStyle = RED_INK; c.lineWidth = 2.4
          c.beginPath(); wobbleLine(c, p.x - r, p.y - r, p.x + r, p.y + r, rnd, 0.8, 6); wobbleLine(c, p.x + r, p.y - r, p.x - r, p.y + r, rnd, 0.8, 6); c.stroke()
        }
      }
      // Dotted pencil paths from marker to window
      c.setLineDash([2, 5]); c.strokeStyle = 'rgba(42,33,24,0.65)'; c.lineWidth = 1.6
      g.clusters.forEach((cl, i) => {
        const win = g.windows[cl.windowId ?? i]
        if (!win || !markers[i]) return
        const e = P(win.ax, win.az)
        c.beginPath(); c.moveTo(markers[i].x, markers[i].y); c.lineTo(e.x, e.y); c.stroke()
      })
      c.setLineDash([])
      layers.ink = o
    }

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height))
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      const g = live.current.geo
      const fit = fitMap(g.bounds, w, h, 16)
      const raw = g.clusters.map((cl) => ({ ...project(fit, cl.x, cl.z), edge: cl.edge }))
      const markers = spreadMarkers(raw, MARKER_R * 2 + 12, { w, h, pad: MARKER_R + 6 })
      sizeRef.current = { w, h, dpr, fit, markers }
      const [po, pc] = offscreen(w, h, dpr)
      paintPaper(pc, w, h)
      layers.paper = po
      const rnd = seededRandom(99)
      layers.jitter = markers.map(() => [circleJitter(rnd), circleJitter(rnd)])
      layers.planksKey = JSON.stringify(live.current.view?.planks ?? {})
      buildInk(live.current.view?.planks ?? {})
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    let raf = 0, last = performance.now()
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden) { last = now; return }
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      draw(ctx, now, dt)
    }

    const draw = (c, now, dt) => {
      const { view: v, selected: sel, open: isOpen } = live.current
      const { w, h, dpr, fit, markers } = sizeRef.current
      const sp = sprites.current

      // New snapshot: retarget sprites; repaint the ink layer only if the planks changed.
      if (sp.view !== v) {
        sp.view = v
        if (v) {
          sp.zombies = matchZombies(sp.zombies, (v.zombies ?? []).map(decodeZombie))
          if (!sp.init) { sp.px = v.player.x; sp.pz = v.player.z; sp.yaw = v.player.yaw; sp.init = true }
        } else { sp.zombies = []; sp.init = false }
        const key = JSON.stringify(v?.planks ?? {})
        if (key !== layers.planksKey) { layers.planksKey = key; buildInk(v?.planks ?? {}) }
      }
      if (v) {
        for (const z of sp.zombies) { z.x = approach(z.x, z.tx, dt); z.z = approach(z.z, z.tz, dt) }
        sp.px = approach(sp.px, v.player.x, dt); sp.pz = approach(sp.pz, v.player.z, dt)
        sp.yaw = approachAngle(sp.yaw, v.player.yaw, dt)
      }

      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.drawImage(layers.paper, 0, 0, w, h)
      c.drawImage(layers.ink, 0, 0, w, h)
      const s = fit.scale
      const P = (x, z) => project(fit, x, z)

      // Defender: pencil view cone + blue ink arrow
      if (v && sp.init) {
        const p = P(sp.px, sp.pz), d = yawToScreen(sp.yaw)
        const ang = Math.atan2(d.dy, d.dx)
        const R = Math.max(40, s * 5.5)
        c.fillStyle = 'rgba(29,63,154,0.13)'
        c.beginPath(); c.moveTo(p.x, p.y); c.arc(p.x, p.y, R, ang - 0.55, ang + 0.55); c.closePath(); c.fill()
        c.strokeStyle = 'rgba(29,63,154,0.4)'; c.lineWidth = 1; c.setLineDash([3, 3])
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(ang - 0.55) * R, p.y + Math.sin(ang - 0.55) * R)
        c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(ang + 0.55) * R, p.y + Math.sin(ang + 0.55) * R); c.stroke()
        c.setLineDash([])
        const L = Math.max(10, Math.min(16, s * 0.9))
        c.beginPath()
        c.moveTo(p.x + d.dx * L, p.y + d.dy * L)
        c.lineTo(p.x - d.dx * L * 0.7 - d.dy * L * 0.65, p.y - d.dy * L * 0.7 + d.dx * L * 0.65)
        c.lineTo(p.x - d.dx * L * 0.25, p.y - d.dy * L * 0.25)
        c.lineTo(p.x - d.dx * L * 0.7 + d.dy * L * 0.65, p.y - d.dy * L * 0.7 - d.dx * L * 0.65)
        c.closePath()
        c.fillStyle = BLUE_INK; c.fill()
        c.strokeStyle = '#f4ead0'; c.lineWidth = 1.6; c.lineJoin = 'round'; c.stroke()
      }

      // Zombies: map pins. Head fill level = HP.
      for (const z of sp.zombies) {
        const p = P(z.x, z.z)
        const r = Math.max(5, Math.min(9, s * 0.38 * ((UNIT_RADIUS[z.type] ?? 3) / 3)))
        const hy = p.y - r - 4
        c.fillStyle = 'rgba(30,18,6,0.3)'
        c.beginPath(); c.ellipse(p.x + 3, p.y + 1, r * 0.8, r * 0.3, 0, 0, 6.2832); c.fill()
        c.strokeStyle = '#3a3128'; c.lineWidth = 1.5
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, hy + r * 0.6); c.stroke()
        c.fillStyle = '#efe4c4'
        c.beginPath(); c.arc(p.x, hy, r, 0, 6.2832); c.fill()
        const hp = Math.max(0.12, Math.min(1, z.hp))
        c.save(); c.beginPath(); c.arc(p.x, hy, r, 0, 6.2832); c.clip()
        c.fillStyle = PIN_COLORS[z.type] ?? PIN_COLORS.walker
        c.fillRect(p.x - r, hy + r - 2 * r * hp, 2 * r, 2 * r * hp)
        c.restore()
        c.strokeStyle = INK; c.lineWidth = 1.5
        c.beginPath(); c.arc(p.x, hy, r, 0, 6.2832); c.stroke()
        c.fillStyle = 'rgba(255,255,255,0.55)'
        c.beginPath(); c.arc(p.x - r * 0.35, hy - r * 0.35, r * 0.2, 0, 6.2832); c.fill()
      }

      // Spawn markers: hand-circled numbers in red ink
      const pulse = 0.5 + 0.5 * Math.sin(now / 220)
      const live2 = isOpen && sel
      markers.forEach((m, i) => {
        c.globalAlpha = isOpen ? 1 : 0.4
        c.fillStyle = 'rgba(236,224,190,0.88)'
        c.beginPath(); c.arc(m.x, m.y, MARKER_R - 1, 0, 6.2832); c.fill()
        c.strokeStyle = RED_INK; c.lineCap = 'round'; c.lineJoin = 'round'
        const jt = layers.jitter[i]
        c.lineWidth = 2.6; circlePath(c, m.x, m.y, MARKER_R - 1, jt[0], 0); c.stroke()
        c.lineWidth = 1.6; circlePath(c, m.x, m.y, MARKER_R + 0.5, jt[1], 2.1); c.stroke()
        c.fillStyle = RED_INK; c.font = `bold 22px ${HAND_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
        c.fillText(String(i + 1), m.x, m.y + 1)
        if (live2) {
          c.strokeStyle = PIN_COLORS[sel] ?? RED_INK; c.globalAlpha = 0.35 + 0.4 * pulse; c.lineWidth = 3
          c.beginPath(); c.arc(m.x, m.y, MARKER_R + 5 + 3 * pulse, 0, 6.2832); c.stroke()
        }
        c.globalAlpha = 1
      })

      // Spawn flashes (ink splash rings)
      const fl = flashes.current
      for (let i = fl.length - 1; i >= 0; i--) {
        const t = (now - fl[i].t) / FLASH_MS
        const m = markers[fl[i].cluster]
        if (t >= 1 || !m) { fl.splice(i, 1); continue }
        c.globalAlpha = 1 - t; c.strokeStyle = fl[i].color; c.lineWidth = 3
        c.beginPath(); c.arc(m.x, m.y, MARKER_R + 22 * t, 0, 6.2832); c.stroke()
        c.globalAlpha = 1
      }

      if (!v) {
        c.fillStyle = INK; c.font = `18px ${HAND_FONT}`; c.textAlign = 'center'
        c.fillText('Waiting for the defender...', w / 2, h / 2)
      }
    }

    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [portrait])

  const onPointerDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const i = hitPoint(sizeRef.current.markers, e.clientX - rect.left, e.clientY - rect.top, HIT_RADIUS)
    if (i >= 0) { e.preventDefault(); trySpawn(i) }
  }

  // ── Header / status text ──────────────────────────────────────────────────
  const hpFrac = view && view.maxHp ? Math.max(0, Math.min(1, view.hp / view.maxHp)) : 0
  let status = ''
  if (!view) status = 'Waiting'
  else if (view.phase === 'intermission') status = 'Intermission'
  else if (view.phase === 'playing') status = view.spawnLeft > 0 ? `Spawn ${Math.ceil(view.spawnLeft)}s` : 'Window over'
  else if (view.phase === 'wave_clear') status = 'Wave cleared'
  else if (view.phase === 'dead') status = 'Defender down'
  const closedFill = view?.phase === 'playing' && view.spawnLeft <= 0 && avail >= 1
  const selRow = units.find((u) => u.id === selected)
  const hint = !view ? '' : !open ? '' : !selected ? 'Pick a unit, then tap a marker'
    : selRow && selRow.status === 'broke' ? 'Not enough budget' : 'Tap a marker to spawn'

  return (
    <div className={`dv${touch ? ' dv--touch' : ''}${portrait ? ' dv--portrait' : ''}`} data-testid="director-view">
      <header className="dv-head">
        <span className="dv-tape" data-testid="dv-tape">ROUND {director.round ?? 1} &middot; WAVE {view?.wave ?? '-'}</span>
        <span className="dv-hp" title="Defender HP"><i style={{ width: `${hpFrac * 100}%` }} /></span>
        <span className="dv-score">{roundScore(director.rounds, director.defender)}</span>
        <span className="dv-grow" />
        <span className={`dv-stamp${view?.phase === 'playing' && view.spawnLeft > 0 && view.spawnLeft <= 5 ? ' dv-stamp--hot' : ''}`} data-testid="dv-status">{status}</span>
        <span className="dv-budget" data-testid="dv-budget"><small>BUDGET</small><b>{Math.floor(avail)}</b></span>
      </header>

      <div className="dv-body">
        <div className="dv-map" ref={wrapRef}>
          <canvas ref={canvasRef} onPointerDown={onPointerDown} data-testid="dv-canvas" />
          {closedFill && <div className="dv-note" data-testid="dv-fill">{Math.floor(avail)} left auto-fills as walkers</div>}
        </div>

        <aside className="dv-bar">
          <div className="dv-units">
            {units.map((u, i) => (
              <button
                key={u.id} type="button" data-testid={`dv-unit-${u.id}`}
                className={`dv-unit${selected === u.id ? ' is-sel' : ''}${u.status === 'locked' ? ' is-locked' : ''}${u.status === 'broke' ? ' is-broke' : ''}`}
                aria-disabled={u.status === 'locked'} aria-pressed={selected === u.id}
                onClick={() => pick(u.id)}
              >
                <i className="dv-sw" style={{ background: PIN_COLORS[u.id] }} />
                <span className="dv-key">{i + 1}</span>
                <span className="dv-name">{u.label}</span>
                {u.status === 'locked' ? <span className="dv-lock">W{u.wave}</span> : <span className="dv-cost">{u.cost}</span>}
              </button>
            ))}
          </div>
          <div className="dv-mods">
            {mods.map((m) => (
              <button
                key={m.id} type="button" data-testid={`dv-mod-${m.id}`}
                className={`dv-unit dv-mod${m.status === 'bought' ? ' is-sel' : ''}${m.status === 'locked' ? ' is-locked' : ''}${m.status === 'broke' ? ' is-broke' : ''}${m.status === 'closed' ? ' is-closed' : ''}`}
                aria-disabled={m.status !== 'ok'}
                onClick={() => tryMod(m.id)}
              >
                <span className="dv-name">{m.label}</span>
                {m.status === 'locked' ? <span className="dv-lock">W{m.wave}</span> : <span className="dv-cost">{m.cost}</span>}
              </button>
            ))}
          </div>
          {/* in the card strip, not on the map: on phones a map overlay covered spawn marker 1 */}
          {hint && <div className="dv-hint" data-testid="dv-hint">{hint}</div>}
        </aside>
      </div>
    </div>
  )
}

