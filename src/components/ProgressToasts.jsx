import { useEffect, useRef, useState } from 'react'
import { onToast } from '../gameEvents'
import { useGameStore } from '../store'
import { CheckIcon, StarIcon, ChevronIcon } from './Icons'

// Wave 4: challenge / achievement toasts. Events are rare (a few per run), so plain
// React state is fine here; the slide-in uses a CSS animation, nothing runs per frame.
const SHOW_MS = 3800
const MAX = 3
const COLORS = { challenge: '#88cc44', achievement: '#ffd166', level: '#7fd4ff' }
const ICONS = { challenge: CheckIcon, achievement: StarIcon, level: () => <ChevronIcon dir="up" /> }

export default function ProgressToasts() {
  const [items, setItems] = useState([])
  // The YOU DIED screen already lists the run's achievements, challenges and level-ups (DeathXpPanel);
  // a floating toast there sat on top of the title.
  const dead = useGameStore((s) => s.phase === 'dead')
  const seq = useRef(0)

  useEffect(() => onToast((t) => {
    const id = ++seq.current
    setItems((cur) => [...cur.slice(-(MAX - 1)), { ...t, id }])
    setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), SHOW_MS)
  }), [])

  if (!items.length || dead) return null
  return (
    <div data-testid="progress-toasts" style={styles.wrap}>
      <style>{'@keyframes cabinToastIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}'}</style>
      {items.map((t) => (
        <div key={t.id} style={{ ...styles.toast, borderColor: COLORS[t.kind] ?? '#888', animation: 'cabinToastIn 0.25s ease-out' }}>
          <span style={{ color: COLORS[t.kind], marginRight: 8, fontSize: '1.1em', display: 'inline-flex' }}>{ICONS[t.kind] ? (() => { const I = ICONS[t.kind]; return <I /> })() : null}</span>
          <span>
            <div style={{ color: COLORS[t.kind], fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' }}>{t.title}</div>
            {t.sub && <div style={{ color: '#ccc', letterSpacing: 1 }}>{t.sub}</div>}
          </span>
        </div>
      ))}
    </div>
  )
}

const styles = {
  wrap: {
    position: 'absolute',
    top: 'max(44px, calc(env(safe-area-inset-top) + 36px))',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    zIndex: 60,
    pointerEvents: 'none',
    fontFamily: 'Courier New, monospace',
    maxWidth: '86vw',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(0,0,0,0.78)',
    border: '1px solid',
    borderRadius: 4,
    padding: 'clamp(4px, 1vmin, 8px) clamp(8px, 2vmin, 14px)',
    fontSize: 'clamp(11px, 1.9vmin, 13px)',
  },
}
