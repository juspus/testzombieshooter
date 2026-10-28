import { useEffect, useState } from 'react'
import { useGameStore, mailClock } from '../store'
import { MAIL_ITEMS, METER_MAX, warning, warningText } from '../mail'
import { sendMail, useMailToast } from '../mailRuntime'
import { hintsActive } from '../hints'

// Zombie Mail HUD (versus runs only): the sender's bar (desktop; phones use the MAIL button in
// MobileControls), the 5 s incoming warning line, the "Sent" toast and the first-wave hint.
// Plain DOM outside the Canvas: no lights, no shadows, no per-frame work (200 ms poll for the
// warning countdown only while a versus run is live).

const FONT = 'Courier New, monospace'
const LIVE = new Set(['playing', 'intermission', 'wave_clear'])
const KEY_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']
const NOTICE_MS = 5000

export const isTouchHud = () => {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  return Boolean(coarse || (navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) <= 900))
}

export default function MailHud() {
  const live = useGameStore((s) => s.runMode === 'versus' && s.versus.active && s.versus.linked && !s.versus.result && LIVE.has(s.phase))
  const meter = useGameStore((s) => s.mail?.meter ?? 0)
  const phase = useGameStore((s) => s.phase)
  const wave = useGameStore((s) => s.wave)
  const toast = useMailToast((s) => s.toast)
  const [touch, setTouch] = useState(isTouchHud)
  const [warn, setWarn] = useState(null)   // { text, left } | null

  useEffect(() => {
    const update = () => setTouch(isTouchHud())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Keys 1-5 send (keys only, so it works under pointer lock).
  useEffect(() => {
    if (!live || touch) return undefined
    const onKey = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const i = KEY_CODES.indexOf(e.code)
      if (i < 0) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const s = useGameStore.getState()
      if (s.shopOpen || s.paused) return
      sendMail(MAIL_ITEMS[i].id)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [live, touch])

  // Incoming warning: the earliest queued delivery inside its 5 s window, or a recent notice.
  useEffect(() => {
    if (!live) { setWarn(null); return undefined }
    const read = () => {
      const s = useGameStore.getState()
      const m = s.mail
      const w = warning({ list: m.incoming, lastLandAt: m.lastLandAt }, mailClock.t)
      if (w) return { text: warningText(w), left: s.phase === 'playing' ? Math.max(0, Math.ceil(w.landAt - mailClock.t)) : null }
      if (m.notice && Date.now() - m.notice.at < NOTICE_MS) return { text: m.notice.text, left: null }
      return null
    }
    const apply = () => setWarn((prev) => {
      const n = read()
      return (prev?.text === n?.text && prev?.left === n?.left) ? prev : n
    })
    apply()
    const t = setInterval(apply, 200)
    return () => clearInterval(t)
  }, [live])

  if (!live) return null
  const showHint = wave === 1 && hintsActive() && (phase === 'playing' || phase === 'intermission')
  return (
    <div data-testid="mail-hud" style={S.root}>
      {warn && (
        <div data-testid="mail-warning" style={{ ...S.warn, top: touch ? 64 : 112 }}>
          {warn.text}{warn.left !== null && <span style={S.warnLeft}> {warn.left}</span>}
        </div>
      )}
      {toast && <div data-testid="mail-toast" style={{ ...S.toast, top: touch ? 100 : undefined, bottom: touch ? undefined : 150 }}>{toast.text}</div>}
      {showHint && (
        <div data-testid="mail-hint" style={{ ...S.hint, top: touch ? 130 : undefined, bottom: touch ? undefined : 78 }}>
          {touch ? 'Kills fill MAIL. Tap MAIL to send' : 'Kills fill MAIL. Send with 1-5'}
        </div>
      )}
      {!touch && (
        <div data-testid="mail-bar" style={S.bar}>
          <div style={S.meterRow}>
            <span style={S.label}>MAIL</span>
            <span style={S.track}><span style={{ ...S.fill, width: `${Math.min(1, meter / METER_MAX) * 100}%` }} /></span>
            <span data-testid="mail-meter" style={S.num}>{Math.floor(meter)}</span>
          </div>
          <div style={S.chips}>
            {MAIL_ITEMS.map((it) => {
              const ok = meter >= it.cost
              return (
                <span key={it.id} data-testid={`mail-item-${it.id}`} data-ready={ok ? '1' : '0'} style={{ ...S.chip, ...(ok ? S.chipOn : null) }}>
                  <span><b style={S.key}>{it.key}</b> {it.label.toUpperCase()}</span><span>{it.cost}</span>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  root: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, fontFamily: FONT },
  bar: { position: 'absolute', left: 40, bottom: 112, display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 8px', background: 'rgba(0,0,0,0.5)', border: '1px solid #333', borderRadius: 6 },
  meterRow: { display: 'flex', alignItems: 'center', gap: 8 },
  label: { fontSize: 11, letterSpacing: 2, color: '#aaa' },
  track: { width: 120, height: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 4, overflow: 'hidden', display: 'inline-block' },
  fill: { display: 'block', height: '100%', background: '#ffcc66', transition: 'width 0.15s' },
  num: { fontSize: 14, color: '#ffe066', fontWeight: 'bold', minWidth: 20 },
  chips: { display: 'flex', flexDirection: 'column', gap: 3 },
  chip: { fontSize: 11, color: '#666', letterSpacing: 1, padding: '1px 6px', display: 'flex', justifyContent: 'space-between', gap: 10, border: '1px solid #333', borderRadius: 4, whiteSpace: 'nowrap' },
  chipOn: { color: '#ffe9a8', borderColor: '#c8a23a', background: 'rgba(200,162,58,0.18)', textShadow: '0 0 6px rgba(255,200,80,0.5)' },
  key: { color: '#fff' },
  warn: { position: 'absolute', left: '50%', transform: 'translateX(-50%)', padding: '3px 12px', background: 'rgba(40,0,0,0.7)', border: '1px solid #aa3322', borderRadius: 4, color: '#ff8866', fontSize: 14, letterSpacing: 2, fontWeight: 'bold', whiteSpace: 'nowrap' },
  warnLeft: { color: '#fff' },
  toast: { position: 'absolute', left: '50%', transform: 'translateX(-50%)', padding: '3px 12px', background: 'rgba(0,0,0,0.65)', border: '1px solid #c8a23a', borderRadius: 4, color: '#ffe9a8', fontSize: 14, letterSpacing: 2, whiteSpace: 'nowrap' },
  hint: { position: 'absolute', left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.5)', fontSize: 12, letterSpacing: 2, whiteSpace: 'nowrap' },
}
