import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../store'
import { levelFromXp, MAX_LEVEL } from '../progression'
import { nextLevelReward } from '../cosmetics'
import { xpToReach } from '../progressTracker'
import { dailyChallenges, weeklyChallenges, dayKey, weekKey, sliceFor, msUntilDailyReset, msUntilWeeklyReset, formatCountdown } from '../challenges'
import { achievementRows } from '../achievements'
import { playLevelUp } from '../progressSounds'

// Wave 4 progression UI: death-screen XP breakdown, start-screen level badge,
// challenge list and achievement list. Sizes use clamp() like the rest of the
// screens so 844x390 landscape phones fit; the lists scroll inside their panel.

const mono = 'Courier New, monospace'
const GOLD = '#ffd166'

// ── Level badge (start screen) ──────────────────────────────────────────────
export function LevelBadge({ onClick }) {
  const xp = useGameStore((s) => s.stats.xp)
  const lv = levelFromXp(xp)
  return (
    <button type="button" data-testid="level-badge" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.45)',
      border: '1px solid rgba(255,209,102,0.35)', borderRadius: 4, padding: '4px 10px',
      color: GOLD, fontFamily: mono, fontSize: 'clamp(9px, 1.9vmin, 13px)', letterSpacing: 2, cursor: onClick ? 'pointer' : 'default',
    }}>
      <span style={{ fontWeight: 'bold' }}>LV {lv.level}</span>
      <span style={{ width: 'clamp(60px, 14vmin, 110px)', height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${lv.pct * 100}%`, background: GOLD }} />
      </span>
      <span style={{ color: '#999', fontSize: '0.85em' }}>{lv.level >= MAX_LEVEL ? 'MAX' : `${lv.into}/${lv.need} XP`}</span>
    </button>
  )
}

// ── Challenges ──────────────────────────────────────────────────────────────
function useChallengeRows() {
  const stats = useGameStore((s) => s.stats)
  return useMemo(() => {
    const now = new Date()
    const dk = dayKey(now)
    const wk = weekKey(now)
    const dSlice = sliceFor(stats.challenges, 'daily', dk)
    const wSlice = sliceFor(stats.challenges, 'weekly', wk)
    const rowsFor = (list, slice) => list.map((c) => ({ ...c, progress: slice.done[c.id] ? c.target : Math.min(c.target, slice.progress[c.id] ?? 0), done: !!slice.done[c.id] }))
    return {
      daily: rowsFor(dailyChallenges(now), dSlice),
      weekly: rowsFor(weeklyChallenges(now), wSlice),
      dailyMs: msUntilDailyReset(now),
      weeklyMs: msUntilWeeklyReset(now),
    }
  }, [stats.challenges])
}

export function ChallengeTeaser({ onClick }) {
  const { daily, dailyMs } = useChallengeRows()
  const done = daily.filter((c) => c.done).length
  return (
    <button type="button" data-testid="challenge-teaser" onClick={onClick} style={{ ...linkBtn, color: done === daily.length ? '#88cc44' : '#bbb' }}>
      CHALLENGES {done}/{daily.length} · {formatCountdown(dailyMs)} ›
    </button>
  )
}

function ChallengeRow({ c }) {
  return (
    <div data-testid={`challenge-${c.id}`} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: c.done ? '#88cc44' : '#ddd' }}>
        <span>{c.done ? '✓ ' : ''}{c.text}</span>
        <span style={{ color: GOLD, whiteSpace: 'nowrap' }}>+{c.xp} XP</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
        <span style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: `${(c.progress / c.target) * 100}%`, background: c.done ? '#88cc44' : '#ff6a3a' }} />
        </span>
        <span style={{ color: '#888', fontSize: '0.85em', minWidth: 48, textAlign: 'right' }}>{c.progress}/{c.target}</span>
      </div>
    </div>
  )
}

export function ChallengesPanel() {
  const { daily, weekly, dailyMs, weeklyMs } = useChallengeRows()
  return (
    <div data-testid="challenges-panel" style={panelStyle}>
      <PanelHead>CHALLENGES</PanelHead>
      <div style={{ padding: 'clamp(6px, 1.4vmin, 12px) clamp(10px, 2vmin, 16px)', fontSize: 'clamp(9px, 1.8vmin, 13px)', letterSpacing: 1 }}>
        <SectionLabel right={formatCountdown(dailyMs)}>Daily</SectionLabel>
        {daily.map((c) => <ChallengeRow key={c.id} c={c} />)}
        <SectionLabel right={formatCountdown(weeklyMs)} style={{ marginTop: 10 }}>Weekly</SectionLabel>
        {weekly.map((c) => <ChallengeRow key={c.id} c={c} />)}
      </div>
    </div>
  )
}

// ── Achievements ────────────────────────────────────────────────────────────
export function AchievementsPanel() {
  const earned = useGameStore((s) => s.stats.achievements)
  const rows = achievementRows(earned)
  const got = rows.filter((r) => r.got).length
  return (
    <div data-testid="achievements-panel" style={panelStyle}>
      <PanelHead>ACHIEVEMENTS · {got}/{rows.length}</PanelHead>
      <div style={{ padding: 'clamp(4px, 1vmin, 10px) clamp(10px, 2vmin, 16px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', columnGap: 16 }}>
        {rows.map((r) => (
          <div key={r.id} data-testid={`ach-${r.id}`} style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: r.got ? 1 : 0.55, fontSize: 'clamp(9px, 1.7vmin, 12px)' }}>
            <div style={{ color: r.got ? GOLD : '#999', fontWeight: 'bold', letterSpacing: 1 }}>{r.got ? '★ ' : '☆ '}{r.name}</div>
            <div style={{ color: '#888', letterSpacing: 0.5 }}>{r.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Death-screen XP breakdown ───────────────────────────────────────────────
const ease = (t) => 1 - Math.pow(1 - t, 3)

export function DeathXpPanel() {
  const prog = useGameStore((s) => s.lastRunProgress)
  const rowEls = useRef([])
  const lvlEls = useRef([])
  const barRef = useRef(null)
  const levelRef = useRef(null)
  const xpRef = useRef(null)
  const totalRef = useRef(null)
  const flashRef = useRef(null)
  const skipRef = useRef(null)
  const [open, setOpen] = useState(false)   // breakdown rows: collapsed to the total until tapped

  useEffect(() => {
    if (!prog) return undefined
    const { rows, total, xpBefore, levelBefore, levelUps } = prog
    const DELAY = 900
    const DUR = Math.min(4200, 1400 + rows.length * 320)
    let raf = 0
    let start = null
    let lastLevel = levelBefore
    let finished = false

    const update = (t, quiet) => {
      const e = ease(t)
      const cur = xpBefore + total * e
      const lv = levelFromXp(cur)
      if (barRef.current) barRef.current.style.width = `${lv.pct * 100}%`
      if (levelRef.current) levelRef.current.textContent = `LV ${lv.level}`
      if (xpRef.current) xpRef.current.textContent = lv.need ? `${lv.into} / ${lv.need} XP` : 'MAX'
      if (totalRef.current) totalRef.current.textContent = `+${Math.round(total * e)} XP`
      rowEls.current.forEach((el, i) => { if (el) el.style.opacity = t >= (i + 0.5) / (rows.length + 0.5) ? '1' : '0' })
      lvlEls.current.forEach((el, i) => { if (el) el.style.opacity = lv.level >= levelUps[i].level ? '1' : '0' })
      if (lv.level > lastLevel) {
        lastLevel = lv.level
        if (!quiet && flashRef.current) {
          flashRef.current.textContent = `LEVEL UP! ${lv.level}`
          flashRef.current.animate([
            { opacity: 0, transform: 'scale(0.6)' },
            { opacity: 1, transform: 'scale(1.25)', offset: 0.25 },
            { opacity: 1, transform: 'scale(1)', offset: 0.7 },
            { opacity: 0, transform: 'scale(1)' },
          ], { duration: 1500, easing: 'ease-out' })
          playLevelUp()
        }
      }
    }
    const frame = (ts) => {
      if (start === null) start = ts + DELAY
      const t = Math.max(0, Math.min(1, (ts - start) / DUR))
      update(t, false)
      if (t < 1) raf = requestAnimationFrame(frame)
      else finished = true
    }
    update(0, true)
    raf = requestAnimationFrame(frame)
    // Tap anywhere on the panel to jump to the end state.
    skipRef.current = () => {
      if (finished) return
      finished = true
      cancelAnimationFrame(raf)
      update(1, true)
    }
    return () => { cancelAnimationFrame(raf); skipRef.current = null }
  }, [prog])

  if (!prog) return null
  const lv = levelFromXp(prog.xpAfter)
  const next = prog.nextUnlock ?? (lv.level < MAX_LEVEL ? (() => { const n = nextLevelReward(lv.level); return n && { ...n, xpToGo: xpToReach(n.level, prog.xpAfter) } })() : null)

  return (
    <div data-testid="death-xp" onClick={() => { skipRef.current?.(); setOpen((v) => !v) }} style={{
      position: 'relative', width: 'min(520px, 90vw)', marginTop: 'clamp(6px, 1.6vmin, 14px)',
      fontFamily: mono, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,209,102,0.25)', borderRadius: 4,
      padding: 'clamp(5px, 1.2vmin, 10px) clamp(8px, 2vmin, 14px)', cursor: 'pointer', userSelect: 'none',
    }}>
      <div style={{
        display: open ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', columnGap: 14, rowGap: 1,
        fontSize: 'clamp(9px, 1.7vmin, 12px)', letterSpacing: 1, color: '#bbb', minHeight: 14, marginBottom: 4,
      }}>
        {prog.rows.map((r, i) => (
          <div key={r.id} ref={(el) => { rowEls.current[i] = el }} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, opacity: 0, transition: 'opacity 0.2s' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
            <span style={{ color: GOLD }}>+{r.xp}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'clamp(4px, 1vmin, 8px)', color: GOLD, fontSize: 'clamp(10px, 2vmin, 14px)', letterSpacing: 2 }}>
        <span ref={levelRef} style={{ fontWeight: 'bold', minWidth: 48 }}>LV {prog.levelBefore}</span>
        <span style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 4, overflow: 'hidden' }}>
          <span ref={barRef} style={{ display: 'block', height: '100%', width: 0, background: GOLD }} />
        </span>
        <span ref={totalRef} style={{ minWidth: 64, textAlign: 'right', fontWeight: 'bold' }}>+0 XP</span>
        <span style={{ color: '#777' }}>{open ? '▾' : '▸'}</span>
      </div>
      <div ref={xpRef} style={{ textAlign: 'right', color: '#777', fontSize: 'clamp(8px, 1.5vmin, 11px)', letterSpacing: 1 }} />
      <div ref={flashRef} data-testid="level-up-flash" style={{
        position: 'absolute', left: 0, right: 0, top: '30%', textAlign: 'center', pointerEvents: 'none', opacity: 0,
        color: '#fff', fontWeight: 'bold', fontSize: 'clamp(18px, 4.5vmin, 34px)', letterSpacing: 4, textShadow: `0 0 18px ${GOLD}, 0 2px 0 #000`,
      }} />
      {prog.levelUps.map((u, i) => (
        <div key={u.level} ref={(el) => { lvlEls.current[i] = el }} data-testid={`levelup-${u.level}`} style={{
          opacity: 0, transition: 'opacity 0.3s', color: '#fff', fontSize: 'clamp(9px, 1.8vmin, 12px)', letterSpacing: 2, textAlign: 'center', marginTop: 2,
        }}>
          LV {u.level}{u.reward ? <> · <span style={{ color: GOLD }}>{u.reward}</span></> : null}
        </div>
      ))}
      <div data-testid="next-unlock" style={{ marginTop: 'clamp(3px, 0.8vmin, 6px)', textAlign: 'center', color: '#8fb8d8', fontSize: 'clamp(9px, 1.7vmin, 12px)', letterSpacing: 1 }}>
        {next ? `Next: ${next.text} · LV ${next.level}` : ''}
      </div>
      {(prog.achievements.length > 0 || prog.challenges.length > 0) && (
        <div style={{ textAlign: 'center', color: '#88cc44', fontSize: 'clamp(8px, 1.5vmin, 11px)', letterSpacing: 1, marginTop: 2 }}>
          {prog.challenges.length > 0 && `✓ ${prog.challenges.length}`}
          {prog.challenges.length > 0 && prog.achievements.length > 0 && ' · '}
          {prog.achievements.length > 0 && `★ ${prog.achievements.join(', ')}`}
        </div>
      )}
    </div>
  )
}

// ── bits ────────────────────────────────────────────────────────────────────
function PanelHead({ children }) {
  return (
    <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#ff3300', letterSpacing: 5, fontSize: 'clamp(8px, 1.6vmin, 11px)', fontWeight: 'bold', textAlign: 'center', position: 'sticky', top: 0, background: 'rgba(10,6,6,0.95)' }}>
      {children}
    </div>
  )
}
function SectionLabel({ children, right, style }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', letterSpacing: 3, textTransform: 'uppercase', fontSize: '0.85em', ...style }}>
      <span>{children}</span><span>{right}</span>
    </div>
  )
}

const panelStyle = {
  width: 'min(560px, 94vw)',
  maxHeight: '78vh',
  overflowY: 'auto',
  background: 'rgba(0,0,0,0.6)',
  border: '1px solid rgba(255,50,0,0.25)',
  borderRadius: 6,
  fontFamily: mono,
  WebkitOverflowScrolling: 'touch',
}
const linkBtn = {
  background: 'transparent', border: 'none', fontFamily: mono, cursor: 'pointer',
  fontSize: 'clamp(9px, 1.8vmin, 12px)', letterSpacing: 2, padding: 2,
}
