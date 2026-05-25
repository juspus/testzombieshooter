import { useState, useRef, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { PistolModel, AKModel, DeagleModel, ShotgunModel } from './Gun'
import { HuntingKnifeModel } from './Knife'
import { ZombieBody } from './Zombie'
import {
  playGunshot, playReload, playEmptyClick, playZombieDie,
  playFootstep, playZombieFootstep, playPlankHit, playPlankBreak,
  playScreamerScreech, playPumpAction, playShellThonk, playKnifeSwing,
  startEerieMusic, stopEerieMusic,
} from '../sounds'

// ─── Sound definitions ────────────────────────────────────────────────────────
const SOUNDS = [
  { id: 'gunshot',      label: 'Gunshot',         fn: playGunshot,         anim: 'fire',       emoji: '💥', dur: 200  },
  { id: 'reload',       label: 'Reload',           fn: playReload,          anim: null,         emoji: '🔄', dur: 1100 },
  { id: 'empty',        label: 'Empty Click',      fn: playEmptyClick,      anim: null,         emoji: '🔔', dur: 100  },
  { id: 'pump',         label: 'Pump Action',      fn: playPumpAction,      anim: 'pump',       emoji: '🔫', dur: 250  },
  { id: 'knife_swing',  label: 'Knife Swing',      fn: playKnifeSwing,      anim: 'knife_swing',emoji: '🔪', dur: 280  },
  { id: 'shell',        label: 'Shell Thonk',      fn: playShellThonk,      anim: null,         emoji: '🪣', dur: 150  },
  { id: 'zombie_die',   label: 'Zombie Die',       fn: playZombieDie,       anim: 'zombie_die', emoji: '💀', dur: 600  },
  { id: 'zombie_step',  label: 'Zombie Step',      fn: playZombieFootstep,  anim: null,         emoji: '🧟', dur: 200  },
  { id: 'screech',      label: 'Screamer Screech', fn: playScreamerScreech, anim: 'zombie_die', emoji: '😱', dur: 800  },
  { id: 'footstep',     label: 'Footstep',         fn: playFootstep,        anim: null,         emoji: '👣', dur: 150  },
  { id: 'plank_hit',    label: 'Plank Hit',        fn: playPlankHit,        anim: null,         emoji: '🪵', dur: 200  },
  { id: 'plank_break',  label: 'Plank Break',      fn: playPlankBreak,      anim: null,         emoji: '💢', dur: 350  },
  { id: 'music_on',     label: 'Start Music',      fn: startEerieMusic,     anim: null,         emoji: '🎵', dur: 600  },
  { id: 'music_off',    label: 'Stop Music',       fn: stopEerieMusic,      anim: null,         emoji: '🔇', dur: 300  },
]

const WEAPON_MODELS = ['pistol', 'ak47', 'deagle', 'shotgun', 'knife']
const ZOMBIE_TYPES  = ['walker', 'runner', 'brute', 'screamer', 'crawler', 'boss']

// ─── 3-D weapon display ───────────────────────────────────────────────────────
function WeaponScene({ weapon, pendingAnimRef }) {
  const groupRef  = useRef()
  const pumpRef   = useRef()
  const recoil    = useRef(0)
  const pumpAnim  = useRef(0)
  const knifeT    = useRef(0)   // 1 → 0 during swing

  useFrame((_, delta) => {
    // Consume pending animation
    const anim = pendingAnimRef.current
    if (anim) {
      pendingAnimRef.current = null
      if (anim === 'fire'        && weapon !== 'knife') recoil.current = 1
      if (anim === 'pump'        && weapon === 'shotgun') pumpAnim.current = 1
      if (anim === 'knife_swing' && weapon === 'knife')   knifeT.current  = 1
    }

    // Decay recoil
    if (recoil.current > 0) recoil.current = Math.max(0, recoil.current - delta * 8)

    // Pump arc
    if (pumpAnim.current > 0) {
      pumpAnim.current = Math.max(0, pumpAnim.current - delta / 0.42)
      if (pumpRef.current) {
        const t = 1 - pumpAnim.current
        pumpRef.current.position.z = -0.24 + Math.sin(t * Math.PI) * 0.14
      }
    }

    // Knife swing
    if (knifeT.current > 0) knifeT.current = Math.max(0, knifeT.current - delta / 0.35)

    if (!groupRef.current) return
    const breath = Math.sin(Date.now() * 0.0008) * 0.004

    if (weapon === 'knife') {
      const t   = 1 - knifeT.current
      const arc = Math.sin(t * Math.PI)
      groupRef.current.position.set(0.22 - arc * 0.42, -0.16 + arc * 0.06, 0)
      groupRef.current.rotation.set(0.10 + arc * 0.20, 0.10 + arc * 0.25, -0.30 - arc * 1.80)
    } else {
      groupRef.current.rotation.x  = recoil.current * 0.18 + breath
      groupRef.current.rotation.y  = breath * 0.4
    }
  })

  const gunMat = (color, metalness = 0.7, roughness = 0.3) => (
    <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
  )

  return (
    <group ref={groupRef}>
      {weapon === 'pistol'  && <PistolModel  gunMat={gunMat} />}
      {weapon === 'ak47'    && <AKModel      gunMat={gunMat} />}
      {weapon === 'deagle'  && <DeagleModel  gunMat={gunMat} />}
      {weapon === 'shotgun' && <ShotgunModel gunMat={gunMat} pumpRef={pumpRef} />}
      {weapon === 'knife'   && <HuntingKnifeModel />}
    </group>
  )
}

// ─── 3-D zombie display with walk + death animation ───────────────────────────
function ZombieScene({ type, pendingAnimRef }) {
  const groupRef    = useRef()
  const leftArmRef  = useRef()
  const rightArmRef = useRef()
  const leftLegRef  = useRef()
  const rightLegRef = useRef()
  const walkCycle   = useRef(0)
  const deathT      = useRef(0)   // 1 → 0 during death fall
  const deadHold    = useRef(0)   // countdown while lying flat

  useFrame((_, delta) => {
    // Consume pending animation
    const anim = pendingAnimRef.current
    if (anim === 'zombie_die') {
      pendingAnimRef.current = null
      deathT.current  = 1
      deadHold.current = 1.5
    }

    // Death-fall
    if (deathT.current > 0) {
      deathT.current = Math.max(0, deathT.current - delta / 0.75)
      if (groupRef.current) {
        groupRef.current.rotation.x = (1 - deathT.current) * (Math.PI / 2)
      }
      return
    }

    // Wait flat, then reset upright
    if (deadHold.current > 0) {
      deadHold.current -= delta
      if (deadHold.current <= 0 && groupRef.current) {
        groupRef.current.rotation.x = 0
      }
      return
    }

    // Walk animation
    walkCycle.current += delta * 2
    const t = walkCycle.current
    if (leftLegRef.current)  leftLegRef.current.rotation.x  =  Math.sin(t) * 0.32
    if (rightLegRef.current) rightLegRef.current.rotation.x = -Math.sin(t) * 0.32
    if (leftArmRef.current)  leftArmRef.current.rotation.x  = -Math.sin(t) * 0.20
    if (rightArmRef.current) rightArmRef.current.rotation.x  =  Math.sin(t) * 0.20
  })

  return (
    <group ref={groupRef} position={[0, -0.9, 0]}>
      <ZombieBody
        type={type}
        id="testlab-display"
        leftArmRef={leftArmRef}
        rightArmRef={rightArmRef}
        leftLegRef={leftLegRef}
        rightLegRef={rightLegRef}
      />
    </group>
  )
}

// ─── Model canvas ─────────────────────────────────────────────────────────────
function ModelCanvas({ selectedModel, pendingAnimRef }) {
  const isZombie = ZOMBIE_TYPES.includes(selectedModel)
  const camPos   = isZombie ? [0, 0.5, 4.2] : [0, 0, 0.85]
  const camTarget = isZombie ? [0, 0, 0] : [0, 0, 0]

  return (
    <Canvas
      key={isZombie ? 'zombie' : 'weapon'}
      camera={{ position: camPos, fov: 45 }}
      style={{ background: '#0d0d14' }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 3]} intensity={1.4} />
      <directionalLight position={[-2, 2, -2]} intensity={0.35} color="#88aaff" />
      <pointLight position={[0, 2, 0]} intensity={0.5} color="#ffcc88" distance={6} />

      {isZombie ? (
        <ZombieScene
          key={selectedModel}
          type={selectedModel}
          pendingAnimRef={pendingAnimRef}
        />
      ) : (
        <WeaponScene
          key={selectedModel}
          weapon={selectedModel}
          pendingAnimRef={pendingAnimRef}
        />
      )}

      <OrbitControls target={camTarget} enablePan={false} />
      <gridHelper args={[4, 16, '#222222', '#1a1a1a']} position={[0, isZombie ? -0.9 : -0.25, 0]} />
    </Canvas>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root: {
    width: '100vw', height: '100vh',
    background: '#080808',
    color: '#ccc',
    fontFamily: "'Courier New', Courier, monospace",
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    userSelect: 'none',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '10px 20px',
    background: '#0f0f0f',
    borderBottom: '1px solid #222',
    flexShrink: 0,
  },
  title: {
    fontSize: 16, fontWeight: 700,
    letterSpacing: 5, color: '#ff4400',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 10, color: '#555',
    letterSpacing: 2, flex: 1,
    textTransform: 'uppercase',
  },
  backBtn: {
    background: 'transparent', border: '1px solid #333',
    color: '#777', padding: '5px 14px', cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    letterSpacing: 2, fontSize: 10, textTransform: 'uppercase',
    transition: 'border-color 0.15s, color 0.15s',
  },
  panels: {
    display: 'flex', flex: 1, overflow: 'hidden',
  },

  // Left soundboard panel
  leftPanel: {
    width: 280, flexShrink: 0,
    borderRight: '1px solid #1a1a1a',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  panelTitle: {
    padding: '8px 14px', fontSize: 9, letterSpacing: 3,
    color: '#555', textTransform: 'uppercase',
    borderBottom: '1px solid #1a1a1a', background: '#0a0a0a',
    flexShrink: 0,
  },
  soundGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: 6, padding: 10, overflowY: 'auto', flex: 1,
  },
  soundBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 5, padding: '10px 6px',
    background: '#0f0f0f', border: '1px solid #252525',
    color: '#888', cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    letterSpacing: 1, fontSize: 9, textTransform: 'uppercase',
    transition: 'all 0.12s',
    lineHeight: 1.2,
  },
  soundBtnActive: {
    background: '#150800', border: '1px solid #ff4400',
    color: '#ff7744', boxShadow: '0 0 10px rgba(255,68,0,0.35)',
  },
  soundEmoji: { fontSize: 20, lineHeight: 1 },

  // Right model viewer panel
  rightPanel: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  modelViewerBody: {
    flex: 1, display: 'flex', overflow: 'hidden',
  },
  sidebar: {
    width: 110, flexShrink: 0, padding: 10,
    borderRight: '1px solid #1a1a1a',
    display: 'flex', flexDirection: 'column', gap: 14,
    overflowY: 'auto',
    background: '#090909',
  },
  sidebarSection: {
    display: 'flex', flexDirection: 'column', gap: 3,
  },
  sidebarLabel: {
    fontSize: 8, letterSpacing: 2, color: '#444',
    marginBottom: 4, textTransform: 'uppercase',
  },
  modelBtn: {
    background: 'transparent', border: '1px solid #1e1e1e',
    color: '#555', padding: '6px 4px', cursor: 'pointer',
    fontFamily: "'Courier New', monospace", fontSize: 9,
    letterSpacing: 1, textTransform: 'uppercase',
    transition: 'all 0.12s', textAlign: 'center',
  },
  modelBtnActive: {
    background: '#150800', border: '1px solid #ff4400', color: '#ff7744',
  },
  canvasWrap: {
    flex: 1, position: 'relative',
  },
  canvasHint: {
    position: 'absolute', bottom: 10, left: '50%',
    transform: 'translateX(-50%)',
    fontSize: 9, color: '#333', letterSpacing: 2,
    pointerEvents: 'none', textTransform: 'uppercase', whiteSpace: 'nowrap',
  },
  animBar: {
    position: 'absolute', top: 10, right: 12,
    display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end',
  },
  animBtn: {
    background: '#111', border: '1px solid #333', color: '#888',
    padding: '5px 12px', cursor: 'pointer',
    fontFamily: "'Courier New', monospace", fontSize: 9,
    letterSpacing: 1, textTransform: 'uppercase',
    transition: 'all 0.12s',
  },
  modelLabel: {
    position: 'absolute', top: 12, left: 12,
    fontSize: 9, letterSpacing: 2, color: '#333',
    textTransform: 'uppercase', pointerEvents: 'none',
  },
}

// ─── Soundboard ───────────────────────────────────────────────────────────────
function Soundboard({ playing, onPlay }) {
  return (
    <div style={S.soundGrid}>
      {SOUNDS.map(sound => (
        <button
          key={sound.id}
          style={{ ...S.soundBtn, ...(playing === sound.id ? S.soundBtnActive : {}) }}
          onClick={() => onPlay(sound)}
        >
          <span style={S.soundEmoji}>{sound.emoji}</span>
          <span>{sound.label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── Model viewer ─────────────────────────────────────────────────────────────
function ModelViewer({ selected, onSelect, pendingAnimRef }) {
  const isZombie = ZOMBIE_TYPES.includes(selected)

  function triggerAnim() {
    if (isZombie) pendingAnimRef.current = 'zombie_die'
    else if (selected === 'knife') pendingAnimRef.current = 'knife_swing'
    else if (selected === 'shotgun') pendingAnimRef.current = 'pump'
    else pendingAnimRef.current = 'fire'
  }

  return (
    <div style={S.modelViewerBody}>
      {/* Sidebar selector */}
      <div style={S.sidebar}>
        <div style={S.sidebarSection}>
          <div style={S.sidebarLabel}>Weapons</div>
          {WEAPON_MODELS.map(w => (
            <button
              key={w}
              style={{ ...S.modelBtn, ...(selected === w ? S.modelBtnActive : {}) }}
              onClick={() => onSelect(w)}
            >
              {w === 'ak47' ? 'AK-47' : w === 'deagle' ? 'D.Eagle' : w.charAt(0).toUpperCase() + w.slice(1)}
            </button>
          ))}
        </div>
        <div style={S.sidebarSection}>
          <div style={S.sidebarLabel}>Zombies</div>
          {ZOMBIE_TYPES.map(z => (
            <button
              key={z}
              style={{ ...S.modelBtn, ...(selected === z ? S.modelBtnActive : {}) }}
              onClick={() => onSelect(z)}
            >
              {z.charAt(0).toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* 3D canvas */}
      <div style={S.canvasWrap}>
        <ModelCanvas selectedModel={selected} pendingAnimRef={pendingAnimRef} />
        <div style={S.modelLabel}>{selected.toUpperCase()}</div>
        <div style={S.animBar}>
          <button
            style={S.animBtn}
            onClick={triggerAnim}
            title="Trigger animation"
          >
            ▶ Animate
          </button>
        </div>
        <div style={S.canvasHint}>Drag to orbit · Scroll to zoom</div>
      </div>
    </div>
  )
}

// ─── Root TestLab ─────────────────────────────────────────────────────────────
export default function TestLab() {
  const [selected,  setSelected]  = useState('pistol')
  const [playing,   setPlaying]   = useState(null)
  const pendingAnimRef = useRef(null)

  const handlePlay = useCallback((sound) => {
    sound.fn()
    setPlaying(sound.id)
    if (sound.anim) pendingAnimRef.current = sound.anim
    setTimeout(() => setPlaying(prev => prev === sound.id ? null : prev), sound.dur + 200)
  }, [])

  return (
    <div style={S.root}>
      {/* ── Header ── */}
      <div style={S.header}>
        <span style={S.title}>🧟 Test Lab</span>
        <span style={S.subtitle}>Soundboard &amp; Model Viewer</span>
        <button
          style={S.backBtn}
          onClick={() => { window.location.href = '/' }}
        >
          ← Back to Game
        </button>
      </div>

      {/* ── Two-panel layout ── */}
      <div style={S.panels}>
        {/* Left — Soundboard */}
        <div style={S.leftPanel}>
          <div style={S.panelTitle}>🔊 Soundboard — click to play</div>
          <Soundboard playing={playing} onPlay={handlePlay} />
        </div>

        {/* Right — Model Viewer */}
        <div style={S.rightPanel}>
          <div style={S.panelTitle}>🎮 Model Viewer — {selected.toUpperCase()}</div>
          <ModelViewer
            selected={selected}
            onSelect={setSelected}
            pendingAnimRef={pendingAnimRef}
          />
        </div>
      </div>
    </div>
  )
}
