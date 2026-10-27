// Model Playground  (/?models, deep link /?models&m=<id>). Mobile-first viewer
// for every game model. Models come from ./registry.js.
import { useState, useRef, useEffect, useCallback } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CATEGORIES, ENTRIES, getEntry } from './registry'
import { countScene } from './sceneStats'
import LofiPass, { LOFI_EXPOSURE } from '../components/LofiPass'

const FONT = "'Courier New', Courier, monospace"
const ACCENT = '#ff4400'

// ─── Lighting presets ────────────────────────────────────────────────────────
const LIGHTS = {
  cabin: { label: 'Cabin night', bg: '#070a12', grid: ['#2a3550', '#141a2a'], ambient: ['#c8d8f0', 0.55], hemi: ['#3a5080', '#0a1808', 0.4],
    dir: [[-20, 35, -15], '#d0e0ff', 1.8], fill: null, point: [[2, 2.2, 2], '#ff9a50', 2.2, 9] },
  diner: { label: 'Diner', bg: '#16120e', grid: ['#4a3d2a', '#241d14'], ambient: ['#fff0d8', 0.6], hemi: ['#ffe8c0', '#2a2018', 0.5],
    dir: [[0, 6, 1], '#fff4e0', 1.5], fill: null, point: [[-2.5, 2.5, 2.5], '#9fffd8', 1.4, 10] },
  studio: { label: 'Studio', bg: '#9aa0a8', grid: ['#5a6068', '#808690'], ambient: ['#ffffff', 0.9], hemi: ['#ffffff', '#8a8f98', 0.5],
    dir: [[4, 6, 5], '#ffffff', 1.6], fill: [[-5, 3, -4], '#e8f0ff', 0.9], point: null },
}

function Lights({ preset }) {
  const L = LIGHTS[preset]
  return (
    <>
      <color attach="background" args={[L.bg]} />
      <ambientLight color={L.ambient[0]} intensity={L.ambient[1]} />
      <hemisphereLight args={[L.hemi[0], L.hemi[1], L.hemi[2]]} />
      <directionalLight position={L.dir[0]} color={L.dir[1]} intensity={L.dir[2]} />
      {L.fill && <directionalLight position={L.fill[0]} color={L.fill[1]} intensity={L.fill[2]} />}
      {L.point && <pointLight position={L.point[0]} color={L.point[1]} intensity={L.point[2]} distance={L.point[3]} />}
    </>
  )
}

// ─── Camera rig: applies the entry's default camera on select / reset ────────
function CameraRig({ entry, resetNonce }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const aspect = useThree((s) => s.size.width / s.size.height)
  useEffect(() => {
    if (!controls) return
    const { position, target, fit } = entry.defaultCamera
    // Portrait screens are narrow: back the camera off for width-limited models.
    const k = aspect < 1 ? (fit === 'width' ? Math.min(4, 1.7 / aspect) : 1.3) : 1
    camera.position.set(
      target[0] + (position[0] - target[0]) * k,
      target[1] + (position[1] - target[1]) * k,
      target[2] + (position[2] - target[2]) * k,
    )
    controls.target.set(target[0], target[1], target[2])
    controls.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id, resetNonce, controls])
  // Lift the frame centre so the model sits in the part of the screen the
  // bottom sheet doesn't cover (sheet is ~28% of a phone screen, ~25% on desktop).
  const { width, height } = useThree((s) => s.size)
  useEffect(() => {
    camera.setViewOffset(width, height, 0, height * (aspect < 1 ? 0.13 : 0.1), width, height)
    return () => camera.clearViewOffset()
  }, [camera, width, height, aspect])
  return null
}

function Stage({ entry, ctrl, onStats }) {
  const ref = useRef()
  useEffect(() => {
    // Models mount lazily (textures, RemotePlayer store flag) - measure after a beat.
    const id = setTimeout(() => onStats(countScene(ref.current)), 400)
    return () => clearTimeout(id)
  }, [entry.id, onStats])
  const C = entry.Component
  return (
    <group ref={ref}>
      <C ctrl={ctrl} {...(entry.props || {})} />
    </group>
  )
}

function Reference({ entry, grid, showGrid, showHuman }) {
  const y = entry.floorY ?? 0
  return (
    <>
      {showGrid && <gridHelper args={[10, 40, grid[0], grid[1]]} position={[0, y, 0]} />}
      {showHuman && (
        <mesh position={[-0.9, y + 0.9, 0]}>
          <boxGeometry args={[0.5, 1.8, 0.3]} />
          <meshBasicMaterial color="#3fd0ff" wireframe />
        </mesh>
      )}
    </>
  )
}

// ─── UI bits ─────────────────────────────────────────────────────────────────
const chip = (active, extra) => ({
  flexShrink: 0, minHeight: 40, padding: '8px 14px',
  background: active ? '#1f0b00' : '#141414',
  border: `1px solid ${active ? ACCENT : '#2e2e2e'}`,
  color: active ? '#ff8a5a' : '#8a8a8a',
  fontFamily: FONT, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
  cursor: 'pointer', whiteSpace: 'nowrap', borderRadius: 4,
  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  ...extra,
})
const row = { display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 12px', scrollbarWidth: 'none' }

function Chips({ items, isActive, onPick }) {
  return (
    <div style={row} className="pg-row">
      {items.map((it) => (
        <button key={it.id} data-testid={`chip-${it.id}`} style={chip(isActive(it))} onClick={() => onPick(it)}>{it.label}</button>
      ))}
    </div>
  )
}

function readInitial() {
  const m = new URLSearchParams(window.location.search).get('m')
  return getEntry(m) ?? ENTRIES[0]
}

export default function ModelPlayground() {
  const [entry, setEntry] = useState(readInitial)
  const [category, setCategory] = useState(() => readInitial().category)
  const [anim, setAnim] = useState(null)
  const [light, setLight] = useState('cabin')
  const [turntable, setTurntable] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showHuman, setShowHuman] = useState(false)
  const [lofi, setLofi] = useState(false)
  const [open, setOpen] = useState(true)
  const [stats, setStats] = useState(null)
  const [resetNonce, setResetNonce] = useState(0)
  const ctrl = useRef({ id: null, n: 0 })

  // Select a model: reset animation + reference box, sync the URL for sharing.
  const select = useCallback((e) => {
    setEntry(e)
    setCategory(e.category)
    setStats(null)
    const first = e.animations[0]?.id ?? null
    ctrl.current = { id: first, n: 0 }
    setAnim(first)
    setShowHuman(!!e.humanScale)
    try { window.history.replaceState(null, '', `?models&m=${e.id}`) } catch { /* ignore */ }
  }, [])

  useEffect(() => { select(entry) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const playAnim = (a) => {
    ctrl.current = { id: a.id, n: ctrl.current.n + 1 }
    if (a.loop) setAnim(a.id)
  }

  // Double-tap / double-click anywhere on the canvas resets the camera.
  const tap = useRef({ t: 0, x: 0, y: 0, dx: 0, dy: 0 })
  const onDown = (e) => { tap.current.dx = e.clientX; tap.current.dy = e.clientY }
  const onUp = (e) => {
    const k = tap.current
    if (Math.hypot(e.clientX - k.dx, e.clientY - k.dy) > 10) { k.t = 0; return }
    const now = performance.now()
    if (now - k.t < 320 && Math.hypot(e.clientX - k.x, e.clientY - k.y) < 40) { setResetNonce((n) => n + 1); k.t = 0 } else { k.t = now; k.x = e.clientX; k.y = e.clientY }
  }

  const inCat = ENTRIES.filter((e) => e.category === category)
  const L = LIGHTS[light]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', color: '#ccc', fontFamily: FONT,
      display: 'flex', flexDirection: 'column', overflow: 'hidden', userSelect: 'none',
    }}>
      <style>{'.pg-row::-webkit-scrollbar{display:none}'}</style>

      {/* Canvas fills the screen; UI floats above it */}
      <div style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
        onPointerDown={onDown} onPointerUp={onUp} onDoubleClick={() => setResetNonce((n) => n + 1)}>
        <Canvas camera={{ fov: 45, near: 0.02, far: 100, position: [2, 1.5, 3] }} dpr={[1, 2]} data-testid="pg-canvas">
          <Lights preset={light} />
          <Stage key={entry.id} entry={entry} ctrl={ctrl} onStats={setStats} />
          <Reference entry={entry} grid={L.grid} showGrid={showGrid} showHuman={showHuman} />
          <OrbitControls makeDefault enablePan={false} enableDamping minDistance={0.25} maxDistance={14}
            autoRotate={turntable} autoRotateSpeed={2.2} />
          <CameraRig entry={entry} resetNonce={resetNonce} />
          {lofi && <LofiPass exposure={LOFI_EXPOSURE.cabin} />}
        </Canvas>
      </div>

      {/* Top bar */}
      <div style={{
        position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8,
        padding: 'max(8px, env(safe-area-inset-top)) 12px 8px', pointerEvents: 'none',
        background: 'linear-gradient(#000c, #0000)',
      }}>
        <a href="/" style={{ ...chip(false), pointerEvents: 'auto', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>← Game</a>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div data-testid="pg-title" style={{ color: '#ff7744', fontWeight: 700, letterSpacing: 2, fontSize: 14, textTransform: 'uppercase', textShadow: '0 1px 3px #000' }}>{entry.label}</div>
          <div data-testid="pg-info" style={{ color: '#aab', fontSize: 11, letterSpacing: 1, textShadow: '0 1px 3px #000' }}>
            {stats ? `${stats.tris.toLocaleString()} tris · ${stats.meshes} meshes` : 'measuring…'}
          </div>
        </div>
        <a href="/?testlab" style={{ ...chip(false), pointerEvents: 'auto', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>Sounds</a>
      </div>

      <div style={{ flex: 1 }} />

      {/* Bottom sheet */}
      <div style={{
        position: 'relative', zIndex: 1, alignSelf: 'center', width: '100%', maxWidth: 760,
        background: 'rgba(8,8,10,0.88)', backdropFilter: 'blur(6px)',
        borderTop: '1px solid #2a2a2a', borderRadius: '14px 14px 0 0',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <button onClick={() => setOpen(!open)} aria-label="Toggle panel" data-testid="pg-handle" style={{
          background: 'none', border: 'none', height: 26, cursor: 'pointer', touchAction: 'manipulation',
        }}>
          <span style={{ display: 'block', width: 44, height: 4, borderRadius: 2, background: '#444', margin: '0 auto' }} />
        </button>
        {open && (
          <>
            <Chips items={CATEGORIES} isActive={(c) => c.id === category}
              onPick={(c) => { setCategory(c.id); const f = ENTRIES.find((e) => e.category === c.id); if (f) select(f) }} />
            <Chips items={inCat} isActive={(e) => e.id === entry.id} onPick={select} />
            {entry.animations.length > 0 && (
              <Chips items={entry.animations} isActive={(a) => a.loop && a.id === anim} onPick={playAnim} />
            )}
            <div style={row} className="pg-row">
              {Object.entries(LIGHTS).map(([id, l]) => (
                <button key={id} data-testid={`light-${id}`} style={chip(light === id)} onClick={() => setLight(id)}>{l.label}</button>
              ))}
              <button data-testid="tog-turntable" style={chip(turntable)} onClick={() => setTurntable(!turntable)}>Turntable</button>
              <button data-testid="tog-grid" style={chip(showGrid)} onClick={() => setShowGrid(!showGrid)}>Grid</button>
              <button data-testid="tog-lofi" style={chip(lofi)} onClick={() => setLofi(!lofi)}>Lo-fi</button>
              <button data-testid="tog-human" style={chip(showHuman)} onClick={() => setShowHuman(!showHuman)}>1.8 m</button>
              <button style={chip(false)} onClick={() => setResetNonce((n) => n + 1)}>Reset cam</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
