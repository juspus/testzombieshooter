import { useEffect, useState } from 'react'
import { useGameStore } from '../../store'
import { PROTOCOL_VERSION } from '../../netProtocol'
import { listOpenRuns } from '../../openRuns'
import { Button, SectionLabel } from '../ui'

// Solo runs opened to the public from the pause menu (lateJoin.js, openRuns.js): join one at its
// next wave countdown. Refreshes every 8 s while shown.
const OPEN_RUNS_REFRESH_MS = 8000
export default function OpenRunsList({ handleJoin }) {
  const mapId = useGameStore((s) => s.mapId)
  const [runs, setRuns] = useState(null)   // null = loading, [] = none
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    const load = () => listOpenRuns(mapId, PROTOCOL_VERSION).then(
      (r) => { if (alive) { setRuns(r); setError('') } },
      (e) => { if (alive) { setRuns([]); setError(e?.message === 'unavailable' ? 'Open runs are not available yet' : 'Could not load open runs') } },
    )
    load()
    const t = setInterval(load, OPEN_RUNS_REFRESH_MS)
    return () => { alive = false; clearInterval(t) }
  }, [mapId])
  return (
    <div className="ui-stack" data-testid="open-runs">
      <SectionLabel>Open runs</SectionLabel>
      {runs === null && <div className="ui-note">Looking…</div>}
      {runs && runs.length === 0 && <div className="ui-note">{error || 'No open runs right now. Open yours from the pause menu.'}</div>}
      {runs && runs.map((r) => (
        <div key={r.code} className="ui-field" style={{ alignItems: 'center' }} data-testid="open-run">
          <div style={{ flex: 1, letterSpacing: 2, fontSize: 'max(var(--ui-fs-min), 13px)' }}>WAVE {r.wave}<span style={{ color: 'var(--ui-dim)', marginLeft: 10, fontSize: 'max(var(--ui-fs-min), 11px)' }}>{r.code}</span></div>
          <Button onClick={() => handleJoin(r.code, 'list')}>Join</Button>
        </div>
      ))}
    </div>
  )
}
