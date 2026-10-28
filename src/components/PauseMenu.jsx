import { useEffect, useState } from 'react'
import { useGameStore } from '../store'
import { usePauseUi, pauseGame, resumeGame, openSettings, closeSettings, installLifecycle, lifecycleInput } from '../pause'
import { useSettings, SENS_MIN, SENS_MAX, OPACITY_MIN, OPACITY_MAX } from '../settings'
import { getBrightness, setBrightness, BRIGHTNESS_MIN, BRIGHTNESS_MAX } from '../brightness'
import { installAudioUnlock } from '../sounds'

const FONT = 'Courier New, monospace'
const MIN_TAP = 44

function getIsTouch() {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  return Boolean(coarse || (navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) <= 900))
}

function useIsTouch() {
  const [v, setV] = useState(getIsTouch)
  useEffect(() => {
    const u = () => setV(getIsTouch())
    window.addEventListener('resize', u)
    window.addEventListener('orientationchange', u)
    return () => { window.removeEventListener('resize', u); window.removeEventListener('orientationchange', u) }
  }, [])
  return v
}

// Pause button, pause menu, settings panel, resume countdown, partner-away line and the
// WebGL-lost overlay. Mounted once from Game.jsx.
export default function PauseLayer() {
  const phase = useGameStore((s) => s.phase)
  const shopOpen = useGameStore((s) => s.shopOpen)
  const mpRole = useGameStore((s) => s.mpRole)
  const mpConnected = useGameStore((s) => s.mpConnected)
  const menu = usePauseUi((s) => s.menu)
  const count = usePauseUi((s) => s.count)
  const partnerAway = usePauseUi((s) => s.partnerAway)
  const glLost = usePauseUi((s) => s.glLost)
  const glFailed = usePauseUi((s) => s.glFailed)
  const touch = useIsTouch()
  const active = phase === 'playing' || phase === 'intermission'
  const guest = mpConnected && mpRole === 'guest'

  useEffect(() => {
    installAudioUnlock()
    return installLifecycle()
  }, [])

  const portrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth
  const showButton = touch && active && !menu && !shopOpen && !portrait && !glLost

  return (
    <>
      {showButton && (
        <button
          aria-label="Pause"
          style={S.pauseBtn}
          onClick={() => { if (guest) openSettings('game'); else pauseGame() }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span style={S.bar} /><span style={S.bar} />
        </button>
      )}
      {active && partnerAway && mpConnected && !menu && (
        <div style={S.away}>PARTNER AWAY</div>
      )}
      {menu && active && (
        <div style={S.root} onContextMenu={(e) => e.preventDefault()}>
          {menu === 'pause' && (
            <div style={S.col}>
              <div style={S.title}>PAUSED</div>
              <button style={S.btn} onClick={resumeGame}>RESUME</button>
              <button style={S.btn} onClick={() => openSettings('pause')}>SETTINGS</button>
            </div>
          )}
          {menu === 'countdown' && (
            <div style={S.col}>
              <div style={S.count}>{count}</div>
            </div>
          )}
          {menu === 'settings' && <SettingsPanel onBack={closeSettings} />}
        </div>
      )}
      {glLost && (
        <div style={{ ...S.root, zIndex: 80 }}>
          <div style={S.col}>
            <div style={S.title}>{glFailed ? 'GRAPHICS LOST' : 'RECONNECTING'}</div>
            {glFailed && <button style={S.btn} onClick={() => window.location.reload()}>RELOAD</button>}
          </div>
        </div>
      )}
    </>
  )
}

// Hold-to-skip for touch (same progress/logic as hold-T: Player.jsx reads lifecycleInput.skipHeld).
export function SkipHoldButton({ progress }) {
  useEffect(() => () => { lifecycleInput.skipHeld = false }, [])
  const down = (e) => {
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    lifecycleInput.skipHeld = true
  }
  const up = () => { lifecycleInput.skipHeld = false }
  return (
    <button
      style={S.skip}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span style={{ ...S.skipFill, width: `${Math.round(progress * 100)}%` }} />
      <span style={{ position: 'relative' }}>HOLD TO SKIP</span>
    </button>
  )
}

function Row({ label, value, children }) {
  return (
    <div style={S.row}>
      <div style={S.rowLabel}>{label}{value != null && <span style={S.rowVal}>{value}</span>}</div>
      {children}
    </div>
  )
}

function Slider({ min, max, step, value, onChange, label }) {
  return (
    <input
      type="range" aria-label={label} min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={S.range}
    />
  )
}

function Toggle({ on, onChange, label }) {
  return (
    <button aria-label={label} aria-pressed={on} style={{ ...S.toggle, ...(on ? S.toggleOn : null) }} onClick={() => onChange(!on)}>
      {on ? 'ON' : 'OFF'}
    </button>
  )
}

function SettingsPanel({ onBack }) {
  return (
    <div style={S.settings}>
      <div style={S.settingsHead}>
        <div style={S.title2}>SETTINGS</div>
        <button style={{ ...S.btn, width: 'auto', padding: '0 22px' }} onClick={onBack}>BACK</button>
      </div>
      <ControlSettings />
    </div>
  )
}

// The control/audio rows, shared by the pause settings above and the start menu's SETTINGS panel.
// `brightness={false}` leaves the brightness row out (the start menu has its own, under Display).
export function ControlSettings({ brightness = true }) {
  const st = useSettings()
  const set = st.setSetting
  const [bright, setBright] = useState(getBrightness)
  return (
    <div style={S.grid}>
        <Row label="LOOK SPEED" value={`${st.lookSensitivity.toFixed(2)}x`}>
          <Slider min={SENS_MIN} max={SENS_MAX} step={0.05} value={st.lookSensitivity} onChange={(v) => set('lookSensitivity', v)} label="Look speed" />
        </Row>
        <Row label="AIM ASSIST"><Toggle on={st.aimAssist} onChange={(v) => set('aimAssist', v)} label="Aim assist" /></Row>
        <Row label="AUTO-SHOOT"><Toggle on={st.autoShoot} onChange={(v) => set('autoShoot', v)} label="Auto-shoot" /></Row>
        {brightness && (
          <Row label="BRIGHTNESS" value={`${bright.toFixed(2)}x`}>
            <Slider min={BRIGHTNESS_MIN} max={BRIGHTNESS_MAX} step={0.05} value={bright} onChange={(v) => { setBrightness(v); setBright(v) }} label="Brightness" />
          </Row>
        )}
        <Row label="VOLUME" value={`${Math.round(st.volume * 100)}%`}>
          <Slider min={0} max={1} step={0.05} value={st.volume} onChange={(v) => set('volume', v)} label="Volume" />
        </Row>
        <Row label="BUTTON SIZE">
          <div style={{ display: 'flex', gap: 6 }}>
            {['normal', 'large'].map((k) => (
              <button key={k} aria-pressed={st.buttonSize === k} style={{ ...S.toggle, ...(st.buttonSize === k ? S.toggleOn : null) }} onClick={() => set('buttonSize', k)}>
                {k.toUpperCase()}
              </button>
            ))}
          </div>
        </Row>
        <Row label="BUTTON OPACITY" value={`${Math.round(st.buttonOpacity * 100)}%`}>
          <Slider min={OPACITY_MIN} max={OPACITY_MAX} step={0.05} value={st.buttonOpacity} onChange={(v) => set('buttonOpacity', v)} label="Button opacity" />
        </Row>
        <Row label="LEFT-HANDED"><Toggle on={st.leftHanded} onChange={(v) => set('leftHanded', v)} label="Left-handed" /></Row>
    </div>
  )
}

const SAFE = 'max(10px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left))'

const S = {
  pauseBtn: {
    position: 'absolute',
    left: 'max(12px, env(safe-area-inset-left))',
    top: 'max(10px, env(safe-area-inset-top))',
    width: MIN_TAP, height: MIN_TAP,
    zIndex: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    background: 'rgba(10,12,16,0.55)',
    border: '1px solid rgba(255,255,255,0.22)',
    borderRadius: 8,
    padding: 0,
    touchAction: 'none',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  bar: { width: 4, height: 16, background: 'rgba(235,240,245,0.85)', borderRadius: 1 },
  away: {
    position: 'absolute', top: 'max(44px, calc(env(safe-area-inset-top) + 34px))', left: '50%', transform: 'translateX(-50%)',
    zIndex: 8, pointerEvents: 'none', fontFamily: FONT, fontSize: 11, letterSpacing: 3, color: '#ffb347',
    background: 'rgba(0,0,0,0.55)', padding: '3px 10px', borderRadius: 3,
  },
  root: {
    position: 'absolute', inset: 0, zIndex: 60,
    background: 'rgba(0,0,0,0.82)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: SAFE, boxSizing: 'border-box',
    fontFamily: FONT, color: '#ddd',
    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none',
  },
  col: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, margin: 'auto' },
  title: { fontSize: 'clamp(28px, 9vmin, 52px)', fontWeight: 'bold', letterSpacing: 10, color: '#ffe066', textShadow: '0 0 30px rgba(255,224,102,0.5)' },
  title2: { fontSize: 18, fontWeight: 'bold', letterSpacing: 6, color: '#ffe066' },
  count: { fontSize: 'clamp(60px, 28vmin, 160px)', fontWeight: 'bold', color: '#ffe066', textShadow: '0 0 40px rgba(255,224,102,0.5)' },
  btn: {
    minHeight: MIN_TAP, width: 'min(260px, 70vw)', padding: '0 16px',
    background: 'rgba(20,16,10,0.9)', border: '1px solid #8a6a20', borderRadius: 6,
    color: '#ffe066', fontFamily: FONT, fontSize: 15, letterSpacing: 5, cursor: 'pointer',
  },
  settings: { width: 'min(640px, 100%)', margin: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  settingsHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '4px 18px' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: MIN_TAP },
  rowLabel: { fontSize: 12, letterSpacing: 3, color: '#aaa', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 },
  rowVal: { fontSize: 11, letterSpacing: 1, color: '#777' },
  range: { flex: 1, minWidth: 90, maxWidth: 170, height: MIN_TAP, accentColor: '#8a1a1a', margin: 0, touchAction: 'pan-y' },
  toggle: {
    minHeight: MIN_TAP, minWidth: 74, padding: '0 12px',
    background: 'rgba(30,30,30,0.9)', border: '1px solid #555', borderRadius: 6,
    color: '#888', fontFamily: FONT, fontSize: 12, letterSpacing: 2, cursor: 'pointer',
  },
  toggleOn: { color: '#ffe066', border: '1px solid #8a6a20', background: 'rgba(60,44,10,0.9)' },
  skip: {
    position: 'relative', overflow: 'hidden', pointerEvents: 'auto',
    minHeight: MIN_TAP, width: 170, marginTop: 4, padding: '0 14px',
    background: 'rgba(20,20,20,0.85)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6,
    color: '#ddd', fontFamily: FONT, fontSize: 13, letterSpacing: 3,
    touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  skipFill: { position: 'absolute', left: 0, top: 0, bottom: 0, background: 'rgba(170,170,170,0.35)', transition: 'width 0.05s linear' },
}
