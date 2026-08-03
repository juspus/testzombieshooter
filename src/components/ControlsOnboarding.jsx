import { useEffect, useState } from 'react'
import { useGameStore } from '../store'
import { isMobileDevice } from '../isMobile'

const STORAGE_KEY = 'cabinControlsTipSeen'
const AUTO_DISMISS_MS = 6000

function getTipSeen() {
  if (typeof window === 'undefined') return false
  return window.localStorage?.getItem(STORAGE_KEY) === '1'
}

// One-time first-run tip explaining controls (pointer lock on desktop,
// touch scheme on mobile). Shown once, on the first wave of the first
// solo/host run, then never again — dismissed by tap or after a timeout.
// Non-interactive overlay (pointer-events: none on the body) so it never
// blocks the click that engages pointer lock or the touch controls under it.
export default function ControlsOnboarding() {
  const phase = useGameStore((s) => s.phase)
  const wave = useGameStore((s) => s.wave)
  const [dismissed, setDismissed] = useState(getTipSeen)
  const [isMobile] = useState(isMobileDevice)

  const visible = !dismissed && (phase === 'intermission' || phase === 'playing') && wave === 1

  useEffect(() => {
    if (!visible) return
    const id = setTimeout(dismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(id)
  }, [visible])

  function dismiss() {
    window.localStorage?.setItem(STORAGE_KEY, '1')
    setDismissed(true)
  }

  if (!visible) return null

  return (
    <div style={styles.root} onClick={dismiss}>
      <div style={styles.panel}>
        {isMobile ? (
          <>
            <div style={styles.line}>Left stick — Move</div>
            <div style={styles.line}>Drag right side — Look &amp; Shoot</div>
            <div style={styles.line}>Bottom-right buttons — Reload / Swap</div>
          </>
        ) : (
          <>
            <div style={styles.line}>Click anywhere to lock your mouse</div>
            <div style={styles.line}>WASD — Move &nbsp;·&nbsp; Mouse — Aim &nbsp;·&nbsp; Click — Shoot</div>
          </>
        )}
        <div style={styles.dismissHint}>{isMobile ? 'Tap to dismiss' : 'Click to dismiss'}</div>
      </div>
    </div>
  )
}

const styles = {
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 'clamp(60px, 12vh, 120px)',
    zIndex: 20,
    pointerEvents: 'none',
  },
  panel: {
    pointerEvents: 'auto',
    cursor: 'pointer',
    background: 'rgba(0,0,0,0.72)',
    border: '1px solid rgba(255,224,102,0.35)',
    borderRadius: 8,
    padding: 'clamp(10px, 2vmin, 16px) clamp(14px, 3vmin, 22px)',
    color: '#e8e8e8',
    fontFamily: 'Courier New, monospace',
    fontSize: 'clamp(11px, 2.2vmin, 15px)',
    letterSpacing: 1,
    textAlign: 'center',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
  },
  line: {
    marginTop: 2,
  },
  dismissHint: {
    marginTop: 8,
    fontSize: 'clamp(9px, 1.6vmin, 11px)',
    color: '#888',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
}
