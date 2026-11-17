// YOU DIED screen: stats, XP, share and restart.
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../../store'
import { describeUnlock } from '../../cosmetics'
import { createRunShareToken } from '../../shareToken'
import { submitScore } from '../../supabase'
import { DeathXpPanel } from '../ProgressPanels'
import { LeaderboardTabs } from '../DailyPanels'
import { writeLocalDaily } from '../../daily'
import { Button } from '../ui'
import { scoreSubmittable } from '../../versus'
import { DuelDeath, VersusResult } from './lazyUi'

export function YouDied({ onRestart, mpRole, wave, kills, money, weapon, perks, username }) {
  const lastRunUnlocks = useGameStore((s) => s.lastRunUnlocks)
  const [opacity, setOpacity] = useState(0)
  const [btnVisible, setBtnVisible] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [scoreStatus, setScoreStatus] = useState('idle') // 'idle' | 'submitting' | 'done' | 'error'
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  // Daily Run: only the first run of the UTC day is ranked; the rest are practice (never submitted).
  const dailyMode = useGameStore((s) => s.runMode === 'daily')
  const duelMode = useGameStore((s) => s.runMode === 'duel')   // Seed Duel: never submitted, own result block
  const dailyRanked = useGameStore((s) => s.dailyRanked)
  const dailyDateStr = useGameStore((s) => s.dailyDate)
  const isPractice = (dailyMode && !dailyRanked) || scoreStatus === 'practice'
  const submittable = useGameStore((s) => scoreSubmittable(s.runMode))   // versus / duel runs never reach the leaderboard
  const versusRun = useGameStore((s) => s.runMode === 'versus')
  const sendScore = async (name) => {
    if (!scoreSubmittable(useGameStore.getState().runMode)) return
    if (dailyMode && !dailyRanked) { setScoreStatus('practice'); return }
    try {
      await submitScore({ name, wave, kills, mode: dailyMode ? 'daily' : 'normal', seedDate: dailyDateStr })
      if (dailyMode) writeLocalDaily({ wave, kills, name: name.trim().slice(0, 24) })
      setScoreStatus('done')
    } catch (e) {
      setScoreStatus(e?.message === 'daily_already_ranked' ? 'practice' : 'error')
    }
  }

  const runSummary = useMemo(() => ({
    wave,
    kills,
    money,
    weapon: formatWeaponName(weapon),
    perks: Object.keys(perks ?? {}).filter((key) => perks[key]).map(formatPerkName),
    gameUrl: getGameUrl(),
  }), [wave, kills, money, weapon, perks])

  useEffect(() => {
    let start = null
    const fade = (ts) => {
      if (!start) start = ts
      const t = Math.min((ts - start) / 1500, 1)
      setOpacity(t)
      if (t < 1) requestAnimationFrame(fade)
      else setTimeout(() => setBtnVisible(true), 400)
    }
    const raf = requestAnimationFrame(fade)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Auto-submit for logged-in users with a username
  useEffect(() => {
    if (!submittable || !btnVisible || !username || scoreStatus !== 'idle') return
    setScoreStatus('submitting')
    sendScore(username)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [btnVisible, username])

  const handleSubmitScore = async () => {
    if (!playerName.trim() || scoreStatus !== 'idle') return
    setScoreStatus('submitting')
    await sendScore(playerName)
  }

  const handleShare = async () => {
    const shareUrl = getRunShareUrl(runSummary)
    const shareData = {
      title: 'Cabin run results',
      text: `I reached wave ${runSummary.wave} with ${runSummary.kills} kill${runSummary.kills !== 1 ? 's' : ''} in Cabin.`,
      url: shareUrl,
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        setShareStatus('Shared')
      } else {
        await copyGameLink(shareUrl)
        setShareStatus('Link copied')
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        setShareStatus('')
        return
      }
      console.error('Unable to share run', error)
      await copyGameLink(shareUrl)
      setShareStatus('Link copied')
    }
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxSizing: 'border-box',
      padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      overflowY: 'auto',            // short landscape phones: the breakdown scrolls
      WebkitOverflowScrolling: 'touch',
      background: `rgba(0,0,0,${0.3 + opacity * 0.55})`,
      gap: 0,
      fontFamily: 'Garamond, Georgia, serif',
      transition: 'background 0.1s',
    }}>
      <div style={{ margin: 'auto 0', padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <h1 style={{
        color: `rgba(180,0,0,${opacity})`,
        fontSize: 'clamp(38px, 11vmin, 120px)',
        fontWeight: 'bold',
        letterSpacing: '0.15em',
        margin: 0,
        textShadow: `0 0 60px rgba(200,0,0,${opacity * 0.9}), 0 0 120px rgba(140,0,0,${opacity * 0.5})`,
        userSelect: 'none',
      }}>
        YOU DIED
      </h1>

      <div style={{
        opacity: opacity * 0.6,
        color: '#888',
        fontSize: 'max(var(--ui-fs-min), clamp(10px, 2vmin, 14px))',
        letterSpacing: 4,
        marginTop: 'clamp(6px, 1.5vmin, 16px)',
        fontFamily: 'Courier New, monospace',
        textTransform: 'uppercase',
      }}>
        Wave {wave} &nbsp;·&nbsp; {kills} kill{kills !== 1 ? 's' : ''}
      </div>

      <div style={{
        opacity: opacity * 0.7,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(80px, 1fr))',
        gap: 'clamp(5px, 1.5vmin, 12px)',
        width: 'min(480px, 88vw)',
        marginTop: 'clamp(8px, 2.5vmin, 28px)',
        fontFamily: 'Courier New, monospace',
      }}>
        <DeathStat label="Cash" value={`€${money.toFixed(2)}`} />
        <DeathStat label="Weapon" value={runSummary.weapon} />
        <DeathStat label="Perks" value={runSummary.perks.length || 'None'} />
      </div>

      {versusRun && <div style={{ opacity }}><Suspense fallback={null}><VersusResult /></Suspense></div>}
      <div style={{ opacity }}><DeathXpPanel /></div>

      {lastRunUnlocks?.length > 0 && (
        <div style={{
          opacity,
          marginTop: 'clamp(6px, 1.5vmin, 14px)',
          color: '#ffd166',
          fontSize: 'max(var(--ui-fs-min), clamp(10px, 2vmin, 13px))',
          letterSpacing: 3,
          fontFamily: 'Courier New, monospace',
          textTransform: 'uppercase',
          textAlign: 'center',
          maxWidth: '88vw',
        }}>
          UNLOCK: {lastRunUnlocks.map(describeUnlock).join(', ')}
        </div>
      )}

      <div style={{
        marginTop: 'clamp(10px, 3.5vmin, 56px)',
        opacity: btnVisible ? 1 : 0,
        transition: 'opacity 0.8s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'clamp(6px, 1.5vmin, 12px)',
      }}>

        {duelMode ? (
          <Suspense fallback={null}><DuelDeath wave={wave} kills={kills} username={username} /></Suspense>
        ) : !submittable ? null : isPractice ? (
          <div style={deathNoteStyle}>PRACTICE</div>
        ) : username ? (
          scoreStatus === 'done' ? (
            <div style={{ ...deathNoteStyle, color: '#88cc44' }}>SCORE SAVED</div>
          ) : scoreStatus === 'submitting' ? (
            <div style={{ ...deathNoteStyle, color: '#888' }}>saving…</div>
          ) : null
        ) : scoreStatus !== 'done' ? (
          <div className="ui-field" style={{ width: 'min(360px, 88vw)' }}>
            <input
              className="ui-input"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 24))}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitScore()}
              placeholder="Name for leaderboard"
              maxLength={24}
              disabled={scoreStatus === 'submitting'}
              style={{ color: '#ddd', letterSpacing: 2, fontSize: 13 }}
            />
            <Button onClick={handleSubmitScore} disabled={!playerName.trim() || scoreStatus === 'submitting'}>
              {scoreStatus === 'submitting' ? '…' : 'Submit'}
            </Button>
          </div>
        ) : (
          <div style={{ ...deathNoteStyle, color: '#88cc44' }}>SCORE SAVED</div>
        )}
        {scoreStatus === 'error' && (
          <div style={{ ...deathNoteStyle, color: '#ff6644' }}>SAVE FAILED</div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 'clamp(4px, 1vmin, 8px)' }}>
          {duelMode ? null : mpRole === 'guest' ? (
            <Button size="lg" disabled style={deathBtnStyle}>Waiting…</Button>
          ) : (
            <Button variant="primary" size="lg" onClick={onRestart} style={deathBtnStyle}>Retry</Button>
          )}
          {!duelMode && <Button size="lg" onClick={handleShare} style={deathBtnStyle}>Share</Button>}
          {/* Solo only: in co-op a reload would drop the partner. The reload resets every system for the menu. */}
          {!mpRole && (
            <Button size="lg" onClick={() => window.location.reload()} disabled={scoreStatus === 'submitting'} style={deathBtnStyle}>Menu</Button>
          )}
        </div>
        <div style={{ ...deathNoteStyle, minHeight: 16, color: '#777', fontSize: 12 }}>
          {shareStatus}
        </div>

        {submittable && <Button variant="ghost" size="sm" onClick={() => setShowLeaderboard((v) => !v)}>
          {showLeaderboard ? 'Hide leaderboard' : 'Leaderboard'}
        </Button>}
        {submittable && showLeaderboard && <LeaderboardTabs highlightWave={wave} highlightKills={kills} initialTab={dailyMode ? 'daily' : 'all'} />}
      </div>
      </div>
    </div>
  )
}

function DeathStat({ label, value }) {
  return (
    <div style={{
      border: '1px solid rgba(180,0,0,0.35)',
      background: 'rgba(0,0,0,0.35)',
      padding: 'clamp(5px, 1.2vmin, 10px) clamp(6px, 1.5vmin, 12px)',
      textAlign: 'center',
      textTransform: 'uppercase',
    }}>
      <div style={{ color: '#666', fontSize: 'max(var(--ui-fs-min), clamp(8px, 1.4vmin, 10px))', letterSpacing: 2 }}>{label}</div>
      <div style={{ color: '#ccc', fontSize: 'clamp(11px, 2.5vmin, 16px)', letterSpacing: 2, marginTop: 'clamp(2px, 0.5vmin, 4px)' }}>{value}</div>
    </div>
  )
}

const deathBtnStyle = { minWidth: 'clamp(110px, 22vmin, 170px)' }
const deathNoteStyle = {
  color: '#aaa',
  fontSize: 'max(var(--ui-fs-min), clamp(10px, 2vmin, 13px))',
  letterSpacing: 3,
  fontFamily: 'Courier New, monospace',
  textAlign: 'center',
  textTransform: 'uppercase',
}

function getGameUrl() {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${window.location.pathname}`
}

function getRunShareUrl(summary) {
  if (typeof window === 'undefined') return ''

  const url = new URL('/api/share', window.location.origin)
  url.searchParams.set('r', createRunShareToken(summary))
  return url.toString()
}

function formatWeaponName(weapon) {
  const names = { pistol: 'Pistol', ak47: 'AK-47', deagle: 'Deagle', shotgun: 'Shotgun' }
  return names[weapon] ?? weapon
}

function formatPerkName(perk) {
  return perk.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

async function copyGameLink(gameUrl) {
  if (!gameUrl) return
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(gameUrl)
    return
  }

  const input = document.createElement('textarea')
  input.value = gameUrl
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  input.remove()
}
