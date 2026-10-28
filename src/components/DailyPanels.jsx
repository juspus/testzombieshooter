import { applyMapChoice } from '../mapSelect'
import { Tabs } from './ui'
import { useEffect, useState } from 'react'
import { useGameStore } from '../store'
import { fetchLeaderboard, fetchDailyAttemptUsed } from '../supabase'
import {
  dailyDate, dailyAttemptUsed, writeLocalDaily, readLocalDaily,
  msToNextDaily, msToWeekReset, formatCountdown,
} from '../daily'

// Re-render every 30 s so the countdowns stay fresh without per-frame work.
function useMinuteTick() {
  const [, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), 30000)
    return () => clearInterval(id)
  }, [])
}

/** Start-menu DAILY RUN row: attempt status, time to the next daily, and the click action. Solo only. */
export function useDailyEntry() {
  useMinuteTick()
  const startDaily = useGameStore((s) => s.startDaily)
  const [used, setUsed] = useState(() => dailyAttemptUsed())
  const mapId = useGameStore((s) => s.mapId)

  // The server may know about an attempt from another device/browser.
  useEffect(() => {
    let alive = true
    fetchDailyAttemptUsed(dailyDate()).then((u) => {
      if (!alive || !u) return
      writeLocalDaily({})
      setUsed(true)
    })
    return () => { alive = false }
  }, [])

  const onCabin = mapId === 'cabin'
  return {
    used,
    meta: `${used ? 'Practice' : 'Ranked'} · ${onCabin ? formatCountdown(msToNextDaily()) : 'Cabin'}`,
    // The daily is cabin-only (fixed seed): from another map, switch back and reload.
    start: () => { if (onCabin) startDaily(!used); else applyMapChoice('cabin') },
  }
}

const TABS = [
  { id: 'all', label: 'ALL TIME' },
  { id: 'week', label: 'THIS WEEK' },
  { id: 'daily', label: 'DAILY' },
]
const COMING_SOON = {
  week: 'Coming soon',
  daily: 'Coming soon',
  all: 'Unavailable',
}

const GRID = '28px 1fr 60px 54px'

/** `bare`: no outer frame (the start menu's PROGRESS panel provides one). */
export function LeaderboardTabs({ highlightWave, highlightKills, initialTab = 'all', bare = false }) {
  useMinuteTick()
  const [tab, setTab] = useState(initialTab)
  const [rows, setRows] = useState(null)
  const [state, setState] = useState('loading') // 'loading' | 'ok' | 'error' | 'unavailable'

  useEffect(() => {
    let alive = true
    setRows(null)
    setState('loading')
    fetchLeaderboard({ period: tab })
      .then((r) => { if (alive) { setRows(r); setState('ok') } })
      .catch((e) => { if (alive) setState(e?.message === 'unavailable' ? 'unavailable' : 'error') })
    return () => { alive = false }
  }, [tab])

  // Highlight: the death-screen score, or this browser's own ranked daily.
  const mine = tab === 'daily' ? readLocalDaily() : null
  const hlWave = highlightWave ?? mine?.wave
  const hlKills = highlightKills ?? mine?.kills

  const sub = tab === 'week' ? formatCountdown(msToWeekReset())
    : tab === 'daily' ? `${dailyDate()} · ${formatCountdown(msToNextDaily())}` : null

  return (
    <div style={bare ? { fontSize: 'clamp(9px, 1.9vmin, 13px)' } : {
      width: 'min(420px, 92vw)',
      background: 'rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,50,0,0.25)',
      borderRadius: 3,
      fontFamily: 'Courier New, monospace',
      fontSize: 'clamp(9px, 1.9vmin, 13px)',
      overflow: 'hidden',
    }}>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {sub && <div style={{ color: '#666', textAlign: 'center', padding: '5px 8px 0', fontSize: 'clamp(7px, 1.4vmin, 10px)', letterSpacing: 2 }}>{sub}</div>}
      {state === 'error' && <div style={{ color: '#ff6644', textAlign: 'center', padding: 12, letterSpacing: 2 }}>Failed</div>}
      {state === 'unavailable' && <div style={{ color: '#887', textAlign: 'center', padding: 12, letterSpacing: 2 }}>{COMING_SOON[tab]}</div>}
      {state === 'loading' && <div style={{ color: '#555', textAlign: 'center', padding: 12, letterSpacing: 2 }}>Loading…</div>}
      {state === 'ok' && rows && rows.length === 0 && (
        <div style={{ color: '#555', textAlign: 'center', padding: 12, letterSpacing: 2 }}>{tab === 'all' ? 'No scores yet' : 'No scores yet'}</div>
      )}
      {state === 'ok' && rows && rows.length > 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 10px', padding: bare ? '5px 0' : '5px 14px', color: '#555', fontSize: 'clamp(7px, 1.4vmin, 10px)', letterSpacing: 2, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span>#</span><span>NAME</span><span style={{ textAlign: 'right' }}>WAVE</span><span style={{ textAlign: 'right' }}>KILLS</span>
          </div>
          {rows.map((row, i) => {
            const isHighlight = hlWave != null && row.wave === hlWave && row.kills === hlKills
            return (
              <div key={row.id} style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: '0 10px',
                padding: bare ? 'clamp(3px, 0.8vmin, 5px) 0' : 'clamp(3px, 0.8vmin, 5px) 14px',
                color: isHighlight ? '#ffe066' : i === 0 ? '#fff' : '#aaa',
                background: isHighlight ? 'rgba(255,224,102,0.06)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
              }}>
                <span style={{ color: i === 0 ? '#ff3300' : '#555' }}>{i + 1}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.is_supporter && <span title="Supporter" aria-label="Supporter" style={{ color: '#ffd166' }}>★ </span>}
                  {row.name}
                </span>
                <span style={{ textAlign: 'right' }}>{row.wave}</span>
                <span style={{ textAlign: 'right', color: '#888' }}>{row.kills}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
