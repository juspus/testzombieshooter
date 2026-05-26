import { useState, useRef, useCallback, useEffect } from 'react'
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

// ─── Data ────────────────────────────────────────────────────────────────────
const SOUNDS = [
  { id: 'pistol_shot',  label: 'Pistol Shot',   fn: () => playGunshot('pistol'),  anim: 'fire', emoji: '🔫', dur: 200  },
  { id: 'shotgun_shot', label: 'Shotgun Shot',  fn: () => playGunshot('shotgun'), anim: 'fire', emoji: '💥', dur: 500  },
  { id: 'reload',      label: 'Reload',           fn: playReload,         anim: null,          emoji: '🔄', dur: 1100 },
  { id: 'empty',       label: 'Empty Click',      fn: playEmptyClick,     anim: null,          emoji: '🔔', dur: 100  },
  { id: 'pump',        label: 'Pump Action',      fn: playPumpAction,     anim: 'pump',        emoji: '🔫', dur: 250  },
  { id: 'knife_swing', label: 'Knife Swing',      fn: playKnifeSwing,     anim: 'knife_swing', emoji: '🔪', dur: 280  },
  { id: 'shell',       label: 'Shell Thonk',      fn: playShellThonk,     anim: null,          emoji: '🪣', dur: 150  },
  { id: 'zombie_die',  label: 'Zombie Die',        fn: playZombieDie,      anim: 'zombie_die',  emoji: '💀', dur: 600  },
  { id: 'zombie_step', label: 'Zombie Step',       fn: playZombieFootstep, anim: null,          emoji: '🧟', dur: 200  },
  { id: 'screech',     label: 'Screech',           fn: playScreamerScreech,anim: 'zombie_die',  emoji: '😱', dur: 800  },
  { id: 'footstep',    label: 'Footstep',          fn: playFootstep,       anim: null,          emoji: '👣', dur: 150  },
  { id: 'plank_hit',   label: 'Plank Hit',         fn: playPlankHit,       anim: null,          emoji: '🪵', dur: 200  },
  { id: 'plank_break', label: 'Plank Break',       fn: playPlankBreak,     anim: null,          emoji: '💢', dur: 350  },
  { id: 'music_on',    label: 'Start Music',       fn: startEerieMusic,    anim: null,          emoji: '🎵', dur: 600  },
  { id: 'music_off',   label: 'Stop Music',        fn: stopEerieMusic,     anim: null,          emoji: '🔇', dur: 300  },
]

const WEAPON_MODELS = ['pistol', 'ak47', 'deagle', 'shotgun', 'knife']
const ZOMBIE_TYPES  = ['walker', 'runner', 'brute', 'screamer', 'crawler', 'boss']
const WEAPON_LABELS = { pistol: 'Pistol', ak47: 'AK-47', deagle: 'D.Eagle', shotgun: 'Shotgun', knife: 'Knife' }

// ─── Mobile detection hook ────────────────────────────────────────────────────
function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const fn = () => setMob(window.innerWidth < 640)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mob
}

// ─── 3-D: Weapon ─────────────────────────────────────────────────────────────
function WeaponScene({ weapon, pendingAnimRef }) {
  const groupRef = useRef()
  const pumpRef  = useRef()
  const recoil   = useRef(0)
  const pumpAnim = useRef(0)
  const knifeT   = useRef(0)

  useFrame((_, delta) => {
    const anim = pendingAnimRef.current
    if (anim) {
      pendingAnimRef.current = null
      if (anim === 'fire'        && weapon !== 'knife') recoil.current = 1
      if (anim === 'pump'        && weapon === 'shotgun') pumpAnim.current = 1
      if (anim === 'knife_swing' && weapon === 'knife')   knifeT.current  = 1
    }
    if (recoil.current > 0) recoil.current = Math.max(0, recoil.current - delta * 8)
    if (pumpAnim.current > 0) {
      pumpAnim.current = Math.max(0, pumpAnim.current - delta / 0.42)
      if (pumpRef.current) {
        const t = 1 - pumpAnim.current
        pumpRef.current.position.z = -0.24 + Math.sin(t * Math.PI) * 0.14
      }
    }
    if (knifeT.current > 0) knifeT.current = Math.max(0, knifeT.current - delta / 0.35)
    if (!groupRef.current) return
    const breath = Math.sin(Date.now() * 0.0008) * 0.004
    if (weapon === 'knife') {
      const t = 1 - knifeT.current
      const arc = Math.sin(t * Math.PI)
      groupRef.current.position.set(0.22 - arc * 0.42, -0.16 + arc * 0.06, 0)
      groupRef.current.rotation.set(0.10 + arc * 0.20, 0.10 + arc * 0.25, -0.30 - arc * 1.80)
    } else {
      groupRef.current.rotation.x = recoil.current * 0.18 + breath
      groupRef.current.rotation.y = breath * 0.4
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

// ─── 3-D: Zombie ─────────────────────────────────────────────────────────────
function ZombieScene({ type, pendingAnimRef }) {
  const groupRef    = useRef()
  const leftArmRef  = useRef()
  const rightArmRef = useRef()
  const leftLegRef  = useRef()
  const rightLegRef = useRef()
  const walkCycle   = useRef(0)
  const deathT      = useRef(0)
  const deadHold    = useRef(0)

  useFrame((_, delta) => {
    if (pendingAnimRef.current === 'zombie_die') {
      pendingAnimRef.current = null
      deathT.current   = 1
      deadHold.current = 1.5
    }
    if (deathT.current > 0) {
      deathT.current = Math.max(0, deathT.current - delta / 0.75)
      if (groupRef.current) groupRef.current.rotation.x = (1 - deathT.current) * (Math.PI / 2)
      return
    }
    if (deadHold.current > 0) {
      deadHold.current -= delta
      if (deadHold.current <= 0 && groupRef.current) groupRef.current.rotation.x = 0
      return
    }
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
        type={type} id="testlab-display"
        leftArmRef={leftArmRef} rightArmRef={rightArmRef}
        leftLegRef={leftLegRef} rightLegRef={rightLegRef}
      />
    </group>
  )
}

// ─── Model canvas ─────────────────────────────────────────────────────────────
function ModelCanvas({ selectedModel, pendingAnimRef }) {
  const isZombie = ZOMBIE_TYPES.includes(selectedModel)
  return (
    <Canvas
      key={isZombie ? 'zombie' : 'weapon'}
      camera={{ position: isZombie ? [0, 0.5, 4.2] : [0, 0, 0.85], fov: 45 }}
      style={{ background: '#0d0d14' }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 3]} intensity={1.4} />
      <directionalLight position={[-2, 2, -2]} intensity={0.35} color="#88aaff" />
      <pointLight position={[0, 2, 0]} intensity={0.5} color="#ffcc88" distance={6} />
      {isZombie
        ? <ZombieScene key={selectedModel} type={selectedModel} pendingAnimRef={pendingAnimRef} />
        : <WeaponScene key={selectedModel} weapon={selectedModel} pendingAnimRef={pendingAnimRef} />
      }
      <OrbitControls target={[0, 0, 0]} enablePan={false} />
      <gridHelper args={[4, 16, '#222222', '#1a1a1a']} position={[0, isZombie ? -0.9 : -0.25, 0]} />
    </Canvas>
  )
}

// ─── Soundboard ───────────────────────────────────────────────────────────────
function Soundboard({ playing, onPlay, isMobile }) {
  const cols   = isMobile ? 3 : 2
  const btnPad = isMobile ? '14px 6px' : '10px 6px'
  const emoji  = isMobile ? 26 : 20
  const font   = isMobile ? 10 : 9

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: isMobile ? 8 : 6,
      padding: isMobile ? 12 : 10,
      overflowY: 'auto',
      flex: 1,
      // Prevent rubber-band scroll bleed on iOS
      WebkitOverflowScrolling: 'touch',
    }}>
      {SOUNDS.map(sound => {
        const active = playing === sound.id
        return (
          <button
            key={sound.id}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 5, padding: btnPad,
              background: active ? '#150800' : '#0f0f0f',
              border: `1px solid ${active ? '#ff4400' : '#252525'}`,
              color: active ? '#ff7744' : '#888',
              boxShadow: active ? '0 0 10px rgba(255,68,0,0.35)' : 'none',
              cursor: 'pointer',
              fontFamily: "'Courier New', monospace",
              letterSpacing: 1, fontSize: font,
              textTransform: 'uppercase',
              transition: 'all 0.12s',
              lineHeight: 1.3,
              // iOS: min touch target
              minHeight: isMobile ? 64 : 'auto',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}
            onClick={() => onPlay(sound)}
          >
            <span style={{ fontSize: emoji, lineHeight: 1 }}>{sound.emoji}</span>
            <span>{sound.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Model strip (mobile horizontal scroller) ─────────────────────────────────
function ModelStrip({ selected, onSelect }) {
  return (
    <div style={{
      display: 'flex', overflowX: 'auto', gap: 6,
      padding: '8px 10px', flexShrink: 0,
      borderBottom: '1px solid #1a1a1a', background: '#090909',
      WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none',        // Firefox
    }}>
      <style>{`.strip-hide-bar::-webkit-scrollbar { display: none }`}</style>
      {/* Weapons */}
      {WEAPON_MODELS.map(w => {
        const active = selected === w
        return (
          <button key={w} onClick={() => onSelect(w)} style={{
            flexShrink: 0,
            padding: '8px 14px',
            background: active ? '#150800' : '#111',
            border: `1px solid ${active ? '#ff4400' : '#2a2a2a'}`,
            color: active ? '#ff7744' : '#666',
            fontFamily: "'Courier New', monospace",
            fontSize: 11, letterSpacing: 1,
            textTransform: 'uppercase', cursor: 'pointer',
            whiteSpace: 'nowrap',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
            minHeight: 40,
          }}>{WEAPON_LABELS[w]}</button>
        )
      })}
      {/* Divider */}
      <div style={{ width: 1, flexShrink: 0, background: '#2a2a2a', margin: '4px 2px' }} />
      {/* Zombies */}
      {ZOMBIE_TYPES.map(z => {
        const active = selected === z
        return (
          <button key={z} onClick={() => onSelect(z)} style={{
            flexShrink: 0,
            padding: '8px 14px',
            background: active ? '#150800' : '#111',
            border: `1px solid ${active ? '#ff4400' : '#2a2a2a'}`,
            color: active ? '#ff7744' : '#666',
            fontFamily: "'Courier New', monospace",
            fontSize: 11, letterSpacing: 1,
            textTransform: 'uppercase', cursor: 'pointer',
            whiteSpace: 'nowrap',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
            minHeight: 40,
          }}>{z.charAt(0).toUpperCase() + z.slice(1)}</button>
        )
      })}
    </div>
  )
}

// ─── Model viewer sidebar (desktop) ──────────────────────────────────────────
function ModelSidebar({ selected, onSelect }) {
  const btn = (key, label, active) => (
    <button key={key} onClick={() => onSelect(key)} style={{
      background: 'transparent',
      border: `1px solid ${active ? '#ff4400' : '#1e1e1e'}`,
      color: active ? '#ff7744' : '#555',
      padding: '7px 4px', cursor: 'pointer',
      fontFamily: "'Courier New', monospace",
      fontSize: 9, letterSpacing: 1,
      textTransform: 'uppercase',
      transition: 'all 0.12s', textAlign: 'center',
    }}>{label}</button>
  )
  return (
    <div style={{
      width: 110, flexShrink: 0, padding: 10,
      borderRight: '1px solid #1a1a1a',
      display: 'flex', flexDirection: 'column', gap: 14,
      overflowY: 'auto', background: '#090909',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 8, letterSpacing: 2, color: '#444', marginBottom: 4, textTransform: 'uppercase' }}>Weapons</div>
        {WEAPON_MODELS.map(w => btn(w, WEAPON_LABELS[w], selected === w))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 8, letterSpacing: 2, color: '#444', marginBottom: 4, textTransform: 'uppercase' }}>Zombies</div>
        {ZOMBIE_TYPES.map(z => btn(z, z.charAt(0).toUpperCase() + z.slice(1), selected === z))}
      </div>
    </div>
  )
}

// ─── Model viewer (whole right side) ─────────────────────────────────────────
function ModelViewer({ selected, onSelect, pendingAnimRef, isMobile }) {
  const isZombie = ZOMBIE_TYPES.includes(selected)

  function triggerAnim() {
    if (isZombie)           pendingAnimRef.current = 'zombie_die'
    else if (selected === 'knife')   pendingAnimRef.current = 'knife_swing'
    else if (selected === 'shotgun') pendingAnimRef.current = 'pump'
    else                             pendingAnimRef.current = 'fire'
  }

  const hint = isMobile ? 'Drag to orbit · Pinch to zoom' : 'Drag to orbit · Scroll to zoom'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Mobile: horizontal strip | Desktop: nothing (sidebar is rendered below) */}
      {isMobile && <ModelStrip selected={selected} onSelect={onSelect} />}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Desktop sidebar */}
        {!isMobile && <ModelSidebar selected={selected} onSelect={onSelect} />}

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ModelCanvas selectedModel={selected} pendingAnimRef={pendingAnimRef} />

          {/* Model name label */}
          <div style={{
            position: 'absolute', top: 10, left: 12,
            fontSize: isMobile ? 10 : 9, letterSpacing: 2, color: '#333',
            textTransform: 'uppercase', pointerEvents: 'none',
          }}>
            {selected.toUpperCase()}
          </div>

          {/* Animate button */}
          <button
            onClick={triggerAnim}
            style={{
              position: 'absolute',
              top: isMobile ? 'auto' : 10,
              bottom: isMobile ? 48 : 'auto',
              right: 12,
              background: '#111', border: '1px solid #333', color: '#888',
              padding: isMobile ? '10px 18px' : '5px 12px',
              cursor: 'pointer',
              fontFamily: "'Courier New', monospace",
              fontSize: isMobile ? 12 : 9,
              letterSpacing: 1, textTransform: 'uppercase',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}
          >
            ▶ Animate
          </button>

          {/* Orbit hint */}
          <div style={{
            position: 'absolute', bottom: 10, left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 9, color: '#333', letterSpacing: 1,
            pointerEvents: 'none', textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            {hint}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function TestLab() {
  const isMobile     = useIsMobile()
  const [tab,        setTab]     = useState('sounds')   // mobile only
  const [selected,   setSelected]  = useState('pistol')
  const [playing,    setPlaying]   = useState(null)
  const pendingAnimRef = useRef(null)

  const handlePlay = useCallback((sound) => {
    sound.fn()
    setPlaying(sound.id)
    if (sound.anim) pendingAnimRef.current = sound.anim
    setTimeout(() => setPlaying(prev => prev === sound.id ? null : prev), sound.dur + 200)
  }, [])

  // ── Mobile tab bar ──────────────────────────────────────────────────────────
  const tabBar = isMobile && (
    <div style={{
      display: 'flex', flexShrink: 0,
      borderBottom: '1px solid #1a1a1a', background: '#0a0a0a',
    }}>
      {[['sounds', '🔊 Sounds'], ['models', '🎮 Models']].map(([id, label]) => (
        <button key={id} onClick={() => setTab(id)} style={{
          flex: 1, padding: '12px 0',
          background: tab === id ? '#150800' : 'transparent',
          border: 'none',
          borderBottom: `2px solid ${tab === id ? '#ff4400' : 'transparent'}`,
          color: tab === id ? '#ff7744' : '#555',
          fontFamily: "'Courier New', monospace",
          fontSize: 12, letterSpacing: 2, cursor: 'pointer',
          textTransform: 'uppercase',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
        }}>{label}</button>
      ))}
    </div>
  )

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#080808', color: '#ccc',
      fontFamily: "'Courier New', Courier, monospace",
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', userSelect: 'none',
      // Safe area for notched phones
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: isMobile ? '10px 14px' : '10px 20px',
        background: '#0f0f0f', borderBottom: '1px solid #222',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: isMobile ? 14 : 16, fontWeight: 700,
          letterSpacing: isMobile ? 3 : 5, color: '#ff4400',
          textTransform: 'uppercase', flexShrink: 0,
        }}>🧟 Test Lab</span>
        {!isMobile && (
          <span style={{ fontSize: 10, color: '#555', letterSpacing: 2, flex: 1, textTransform: 'uppercase' }}>
            Soundboard &amp; Model Viewer
          </span>
        )}
        <button
          style={{
            marginLeft: 'auto',
            background: 'transparent', border: '1px solid #333',
            color: '#777', padding: isMobile ? '8px 12px' : '5px 14px',
            cursor: 'pointer', fontFamily: "'Courier New', monospace",
            letterSpacing: 1, fontSize: isMobile ? 11 : 10,
            textTransform: 'uppercase',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
          }}
          onClick={() => { window.location.href = '/' }}
        >
          ← {isMobile ? 'Back' : 'Back to Game'}
        </button>
      </div>

      {/* ── Mobile tab bar ── */}
      {tabBar}

      {/* ── Content ── */}
      {isMobile ? (
        // Mobile: show one panel at a time
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {tab === 'sounds' ? (
            <>
              <div style={{ padding: '6px 12px', fontSize: 9, letterSpacing: 2, color: '#555', background: '#0a0a0a', borderBottom: '1px solid #1a1a1a', textTransform: 'uppercase', flexShrink: 0 }}>
                Tap to play — sounds trigger model animation
              </div>
              <Soundboard playing={playing} onPlay={handlePlay} isMobile />
            </>
          ) : (
            <>
              <div style={{ padding: '6px 12px', fontSize: 9, letterSpacing: 2, color: '#555', background: '#0a0a0a', borderBottom: '1px solid #1a1a1a', textTransform: 'uppercase', flexShrink: 0 }}>
                {selected.toUpperCase()} — drag to orbit
              </div>
              <ModelViewer
                selected={selected} onSelect={setSelected}
                pendingAnimRef={pendingAnimRef} isMobile
              />
            </>
          )}
        </div>
      ) : (
        // Desktop: two panels side by side
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left — Soundboard */}
          <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', fontSize: 9, letterSpacing: 3, color: '#555', textTransform: 'uppercase', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a', flexShrink: 0 }}>
              🔊 Soundboard — click to play
            </div>
            <Soundboard playing={playing} onPlay={handlePlay} isMobile={false} />
          </div>

          {/* Right — Model Viewer */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', fontSize: 9, letterSpacing: 3, color: '#555', textTransform: 'uppercase', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a', flexShrink: 0 }}>
              🎮 Model Viewer — {selected.toUpperCase()}
            </div>
            <ModelViewer
              selected={selected} onSelect={setSelected}
              pendingAnimRef={pendingAnimRef} isMobile={false}
            />
          </div>
        </div>
      )}
    </div>
  )
}
