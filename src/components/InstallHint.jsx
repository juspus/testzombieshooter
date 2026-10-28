import { useEffect, useState } from 'react'
import { readEnv, shouldShowInstallHint, markInstallHintSeen } from '../installHint'

// One "Add to Home Screen" tip on the start screen, iOS Safari only, once per device.
// It lives inside the start screen's layout (never over a run). The flag is set on the first
// show, so it never comes back on a later visit even if it is not dismissed.
export default function InstallHint() {
  const [show, setShow] = useState(() => shouldShowInstallHint(readEnv()))
  useEffect(() => { if (show) markInstallHintSeen() }, [show])
  if (!show) return null
  return (
    <div data-testid="install-hint" onClick={() => setShow(false)} style={S.box}>
      <div>
        <div style={S.title}>FULLSCREEN MODE</div>
        <div style={S.text}>Share → Add to Home Screen for fullscreen</div>
      </div>
      <button type="button" aria-label="Dismiss" style={S.x} onClick={(e) => { e.stopPropagation(); setShow(false) }}>×</button>
    </div>
  )
}

const S = {
  box: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    width: 'min(560px, calc(100% - 28px))', padding: '6px 6px 6px 12px', borderRadius: 10,
    background: 'rgba(0,0,0,0.88)', border: '1px solid rgba(200,128,26,0.55)', cursor: 'pointer',
    fontFamily: 'Courier New, monospace', textAlign: 'left',
  },
  title: { color: '#c8801a', fontSize: 11, fontWeight: 'bold', letterSpacing: 3 },
  text: { color: '#ddd', fontSize: 11, lineHeight: 1.35 },
  x: {
    width: 44, height: 44, flex: '0 0 auto', borderRadius: 999, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)', color: '#f4efe4', fontSize: 20, lineHeight: 1, cursor: 'pointer',
  },
}
