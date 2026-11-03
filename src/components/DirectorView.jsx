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
  UNIT_COLORS, UNIT_RADIUS, mapBounds, fitMap, project, hitCluster, yawToScreen,
  availableBudget, reconcilePending, buyWave, spawnOpen, unitRows, modRows,
  unitForKey, matchZombies, approach, approachAngle,
} from '../directorView'

let _spawnCounter = 0
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

const hpColor = (f) => (f > 0.6 ? '#7fd36b' : f > 0.3 ? '#f0c040' : '#ff4a3a')

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
    flashes.current.push({ cluster, t: performance.now(), color: UNIT_COLORS[sel] })
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
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const flashes = useRef([])
  const sprites = useRef({ zombies: [], px: 0, pz: 0, yaw: 0, init: false, view: null })
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1, fit: { scale: 1, ox: 0, oy: 0 } })

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current
    if (!wrap || !canvas) return undefined
    const ctx = canvas.getContext('2d')

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height))
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      sizeRef.current = { w, h, dpr, fit: fitMap(live.current.geo.bounds, w, h, 14) }
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
      const { view: v, selected: sel, open: isOpen, geo: g } = live.current
      const { w, h, dpr, fit } = sizeRef.current
      const sp = sprites.current

      // New snapshot: retarget sprites.
      if (sp.view !== v) {
        sp.view = v
        if (v) {
          sp.zombies = matchZombies(sp.zombies, (v.zombies ?? []).map(decodeZombie))
          if (!sp.init) { sp.px = v.player.x; sp.pz = v.player.z; sp.yaw = v.player.yaw; sp.init = true }
        } else { sp.zombies = []; sp.init = false }
      }
      if (v) {
        for (const z of sp.zombies) { z.x = approach(z.x, z.tx, dt); z.z = approach(z.z, z.tz, dt) }
        sp.px = approach(sp.px, v.player.x, dt); sp.pz = approach(sp.pz, v.player.z, dt)
        sp.yaw = approachAngle(sp.yaw, v.player.yaw, dt)
      }

      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.fillStyle = '#0a0c09'
      c.fillRect(0, 0, w, h)
      const s = fit.scale
      const P = (x, z) => project(fit, x, z)

      // Floor
      const wb = g.bounds
      const a = P(wb.minX + 2, wb.minZ + 2), b = P(wb.maxX - 2, wb.maxZ - 2)
      c.fillStyle = '#10140e'
      c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y)

      const rect = (seg) => c.fillRect(fit.ox + (seg.x - seg.halfW) * s, fit.oy + (seg.z - seg.halfD) * s, seg.halfW * 2 * s, seg.halfD * 2 * s)
      c.fillStyle = 'rgba(120,100,80,0.28)'
      for (const f of g.furniture) rect(f)
      c.fillStyle = '#8a7660'
      for (const seg of g.walls) rect(seg)

      // Windows + planks, and the dotted run from each spawn cluster to its window.
      const planks = v?.planks ?? {}
      c.font = `bold ${Math.max(11, Math.min(14, s * 0.9))}px 'Courier New', monospace`
      c.textAlign = 'center'; c.textBaseline = 'middle'
      for (const win of g.windows) {
        const n = planks[win.id] ?? 0
        const seg = g.windowBlock(win.id)
        c.fillStyle = n > 0 ? '#b07a3a' : '#c9503c'
        rect(seg)
        const lp = P(win.ix, win.iz)
        c.fillStyle = n > 0 ? '#f0d9a0' : '#ff8a78'
        c.fillText(String(n), lp.x, lp.y)
      }
      c.setLineDash([3, 4]); c.lineWidth = 1
      g.clusters.forEach((cl, i) => {
        const win = g.windows[cl.windowId ?? i]
        if (!win) return
        const m = P(cl.x, cl.z), e = P(win.ax, win.az)
        c.strokeStyle = 'rgba(255,255,255,0.14)'
        c.beginPath(); c.moveTo(m.x, m.y); c.lineTo(e.x, e.y); c.stroke()
      })
      c.setLineDash([])

      // Zombies
      for (const z of sp.zombies) {
        const p = P(z.x, z.z)
        const r = Math.max(3, Math.min(10, s * 0.4 * ((UNIT_RADIUS[z.type] ?? 3) / 3)))
        c.globalAlpha = 0.45 + 0.55 * Math.max(0, Math.min(1, z.hp))
        c.fillStyle = UNIT_COLORS[z.type] ?? '#9bbf6a'
        c.beginPath(); c.arc(p.x, p.y, r, 0, 6.2832); c.fill()
        c.globalAlpha = 1
        if (z.hp < 0.999) {
          c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(p.x - r, p.y - r - 5, r * 2, 3)
          c.fillStyle = hpColor(z.hp); c.fillRect(p.x - r, p.y - r - 5, r * 2 * Math.max(0, z.hp), 3)
        }
      }

      // Defender arrow
      if (v && sp.init) {
        const p = P(sp.px, sp.pz), d = yawToScreen(sp.yaw)
        const L = Math.max(9, Math.min(16, s * 0.9))
        c.fillStyle = '#ffffff'
        c.beginPath()
        c.moveTo(p.x + d.dx * L, p.y + d.dy * L)
        c.lineTo(p.x - d.dx * L * 0.7 - d.dy * L * 0.6, p.y - d.dy * L * 0.7 + d.dx * L * 0.6)
        c.lineTo(p.x - d.dx * L * 0.7 + d.dy * L * 0.6, p.y - d.dy * L * 0.7 - d.dx * L * 0.6)
        c.closePath(); c.fill()
        c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.5; c.stroke()
      }

      // Cluster markers (tap targets)
      const pulse = 0.5 + 0.5 * Math.sin(now / 220)
      const col = sel ? UNIT_COLORS[sel] : '#c8c0b6'
      g.clusters.forEach((cl, i) => {
        const p = P(cl.x, cl.z)
        const live2 = isOpen && sel
        c.globalAlpha = isOpen ? 1 : 0.35
        c.lineWidth = live2 ? 2.5 : 1.5
        c.strokeStyle = col
        c.fillStyle = 'rgba(0,0,0,0.55)'
        c.beginPath(); c.arc(p.x, p.y, 15, 0, 6.2832); c.fill(); c.stroke()
        if (live2) {
          c.globalAlpha = 0.25 + 0.35 * pulse
          c.beginPath(); c.arc(p.x, p.y, 15 + 5 * pulse, 0, 6.2832); c.stroke()
          c.globalAlpha = 1
        }
        c.fillStyle = col
        c.globalAlpha = isOpen ? 1 : 0.35
        c.font = "bold 14px 'Courier New', monospace"
        c.fillText(String(i + 1), p.x, p.y + 1)
        c.globalAlpha = 1
      })

      // Spawn flashes
      const fl = flashes.current
      for (let i = fl.length - 1; i >= 0; i--) {
        const t = (now - fl[i].t) / FLASH_MS
        if (t >= 1) { fl.splice(i, 1); continue }
        const p = P(g.clusters[fl[i].cluster].x, g.clusters[fl[i].cluster].z)
        c.globalAlpha = 1 - t; c.strokeStyle = fl[i].color; c.lineWidth = 3
        c.beginPath(); c.arc(p.x, p.y, 15 + 22 * t, 0, 6.2832); c.stroke()
        c.globalAlpha = 1
      }

      if (!v) {
        c.fillStyle = '#8a837c'; c.font = "14px 'Courier New', monospace"
        c.fillText('Waiting for the defender...', w / 2, h / 2)
      }
    }

    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [portrait])

  const onPointerDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const i = hitCluster(sizeRef.current.fit, live.current.geo.clusters, e.clientX - rect.left, e.clientY - rect.top, HIT_RADIUS)
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
        <span className="dv-tag">R{director.round ?? 1}</span>
        <span className="dv-tag">W{view?.wave ?? '-'}</span>
        <span className="dv-hp" title="Defender HP"><i style={{ width: `${hpFrac * 100}%`, background: hpColor(hpFrac) }} /></span>
        <span className="dv-tag dv-dim">{roundScore(director.rounds, director.defender)}</span>
        <span className="dv-grow" />
        <span className={`dv-status${view?.phase === 'playing' && view.spawnLeft > 0 && view.spawnLeft <= 5 ? ' dv-status--hot' : ''}`} data-testid="dv-status">{status}</span>
        <span className="dv-budget" data-testid="dv-budget"><small>BUDGET</small>{Math.floor(avail)}</span>
      </header>

      <div className="dv-body">
        <div className="dv-map" ref={wrapRef}>
          <canvas ref={canvasRef} onPointerDown={onPointerDown} data-testid="dv-canvas" />
          {closedFill && <div className="dv-note" data-testid="dv-fill">{Math.floor(avail)} left auto-fills as walkers</div>}
          {hint && <div className="dv-hint">{hint}</div>}
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
                <i className="dv-sw" style={{ background: UNIT_COLORS[u.id] }} />
                <span className="dv-key">{i + 1}</span>
                <span className="dv-name">{u.label}</span>
                <span className="dv-cost">{u.status === 'locked' ? `W${u.wave}` : u.cost}</span>
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
                <span className="dv-cost">{m.status === 'locked' ? `W${m.wave}` : m.cost}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

