import { applyMapChoice } from '../mapSelect'
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

/** Start-screen entry: "DAILY RUN" button + attempt status + time to the next daily. Solo only. */
export function DailyEntry({ Btn }) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* The daily is cabin-only (fixed seed): from another map, switch back and reload. */}
      <Btn onClick={() => { if (mapId === 'cabin') startDaily(!used); else applyMapChoice('cabin') }} style={{ marginTop: 4 }}>
        {mapId === 'cabin' ? 'DAILY RUN' : 'DAILY RUN (CABIN)'}
      </Btn>
      <div style={{ color: used ? '#887' : '#cc9944', fontSize: 'clamp(9px, 1.7vmin, 12px)', letterSpacing: 2, marginTop: 5, fontFamily: 'Courier New, monospace', textAlign: 'center' }}>
        {used ? "Today's daily: attempt used (practice)" : "Today's daily: ranked attempt available"}
        {' · next in '}{formatCountdown(msToNextDaily())}
      </div>
    </div>
  )
}

const TABS = [
  { id: 'all', label: 'ALL TIME' },
  { id: 'week', label: 'THIS WEEK' },
  { id: 'daily', label: 'DAILY' },
]
const COMING_SOON = {
  week: 'Weekly leaderboard coming soon',
  daily: 'Daily leaderboard coming soon',
  all: 'Leaderboard unavailable',
}

const GRID = '28px 1fr 60px 54px'

export function LeaderboardTabs({ highlightWave, highlightKills, initialTab = 'all' }) {
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

  const sub = tab === 'week' ? `Resets Monday 00:00 UTC · in ${formatCountdown(msToWeekReset())}`
    : tab === 'daily' ? `${dailyDate()} · next daily in ${formatCountdown(msToNextDaily())}` : null

  return (
    <div style={{
      width: 'min(420px, 92vw)',
      background: 'rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,50,0,0.25)',
      borderRadius: 6,
      fontFamily: 'Courier New, monospace',
      fontSize: 'clamp(9px, 1.9vmin, 13px)',
      overflow: 'hidden',
    }}>
      <div role="tablist" style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: '8px 4px',
              background: tab === t.id ? 'rgba(255,50,0,0.12)' : 'transparent',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid #ff3300' : '2px solid transparent',
              color: tab === t.id ? '#ff3300' : '#777',
              letterSpacing: 3,
              fontFamily: 'inherit',
              fontWeight: 'bold',
              fontSize: 'clamp(8px, 1.6vmin, 11px)',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub && <div style={{ color: '#666', textAlign: 'center', padding: '5px 8px 0', fontSize: 'clamp(7px, 1.4vmin, 10px)', letterSpacing: 2 }}>{sub}</div>}
      {state === 'error' && <div style={{ color: '#ff6644', textAlign: 'center', padding: 12, letterSpacing: 2 }}>Failed to load</div>}
      {state === 'unavailable' && <div style={{ color: '#887', textAlign: 'center', padding: 12, letterSpacing: 2 }}>{COMING_SOON[tab]}</div>}
      {state === 'loading' && <div style={{ color: '#555', textAlign: 'center', padding: 12, letterSpacing: 2 }}>Loading…</div>}
      {state === 'ok' && rows && rows.length === 0 && (
        <div style={{ color: '#555', textAlign: 'center', padding: 12, letterSpacing: 2 }}>{tab === 'all' ? 'No scores yet' : 'No scores yet — be the first'}</div>
      )}
      {state === 'ok' && rows && rows.length > 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 10px', padding: '5px 14px', color: '#555', fontSize: 'clamp(7px, 1.4vmin, 10px)', letterSpacing: 2, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span>#</span><span>NAME</span><span style={{ textAlign: 'right' }}>WAVE</span><span style={{ textAlign: 'right' }}>KILLS</span>
          </div>
          {rows.map((row, i) => {
            const isHighlight = hlWave != null && row.wave === hlWave && row.kills === hlKills
            return (
              <div key={row.id} style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: '0 10px',
                padding: 'clamp(3px, 0.8vmin, 5px) 14px',
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
