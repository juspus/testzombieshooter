import { useEffect, useState } from 'react'
import { useGameStore } from '../store'
import { disconnect } from '../net'
import { readyUp } from '../directorRuntime'
import { DIRECTOR } from '../director'
import { BETWEEN_S, turnAt, score } from '../directorFlow'
import { Button } from './ui'
import { RematchButton, RESULT_TITLES } from './VersusResult'

const FONT = 'Courier New, monospace'
const COLORS = { win: '#88cc44', lose: '#ff4444', draw: '#ffd166' }

const turnLine = (t) => (t ? `${t.wavesCleared}/${DIRECTOR.WAVES_PER_TURN} waves · ${t.damageTaken} dmg${t.died ? ' · died' : ''}` : '-')

// The Director's own screens (outside the Canvas): the between-turns card, the match result and a
// one-line status for the defender. DirectorView (the director's map) is mounted beside it.
export default function DirectorFlow() {
  const stage = useGameStore((s) => (s.director?.active ? s.director.stage : 'off'))
  if (stage === 'between') return <BetweenCard />
  if (stage === 'over') return <ResultCard />
  if (stage === 'turn') return <DefenderStrip />
  return null
}

const overlay = {
  position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(6,8,10,0.96)', boxSizing: 'border-box', fontFamily: FONT, color: '#ddd',
  padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
}
const box = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 16, maxWidth: 'min(460px, 94vw)', textAlign: 'center' }
const small = { fontSize: 'max(var(--ui-fs-min), 13px)', letterSpacing: 2, color: '#aaa' }

function useExitLock() {
  useEffect(() => { try { document.exitPointerLock?.() } catch { /* ignore */ } }, [])
}

function Scoreboard({ d }) {
  const sc = score(d.rounds)
  const me = sc[d.side]
  const rival = sc[d.side === 'host' ? 'guest' : 'host']
  return <div data-testid="director-score" style={{ fontSize: 'clamp(22px, 6vmin, 36px)', fontWeight: 'bold', letterSpacing: 4 }}>{me} : {rival}</div>
}

function BetweenCard() {
  useExitLock()
  const d = useGameStore((s) => s.director)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t) }, [])
  const next = turnAt(d.turn + 1)
  const youDefend = next.defender === d.side
  const left = Math.max(0, Math.ceil(BETWEEN_S - (now - d.betweenAt) / 1000))
  const rivalSide = d.side === 'host' ? 'guest' : 'host'
  const rt = d.turns[d.round] ?? {}
  return (
    <div style={overlay} data-testid="director-between">
      <div style={box}>
        <div style={{ ...small, color: '#888' }}>ROUND {d.round} OF {DIRECTOR.ROUNDS} · TURN DONE</div>
        <Scoreboard d={d} />
        <div style={{ ...small, color: '#bbb' }}>You: {turnLine(rt[d.side])}</div>
        <div style={{ ...small, color: '#bbb' }}>Rival: {turnLine(rt[rivalSide])}</div>
        <div data-testid="director-next" style={{ fontSize: 'clamp(18px, 4.5vmin, 28px)', letterSpacing: 4, color: youDefend ? '#ffcc66' : '#66ccff', fontWeight: 'bold', marginTop: 8 }}>
          {youDefend ? 'YOU DEFEND NEXT' : 'YOU DIRECT NEXT'}
        </div>
        <div style={small}>Round {next.round} · starts in {left}</div>
        <Button variant="primary" size="lg" onClick={readyUp} disabled={d.ready.me} data-testid="director-ready">
          {d.ready.me ? 'Waiting…' : d.ready.rival ? 'Ready (rival ready)' : 'Ready'}
        </Button>
      </div>
    </div>
  )
}

function ResultCard() {
  useExitLock()
  const d = useGameStore((s) => s.director)
  const reason = useGameStore((s) => s.versus.reason)
  const result = d.result ?? 'draw'
  return (
    <div style={overlay} data-testid="director-result">
      <div style={box}>
        <div style={{ color: COLORS[result], fontSize: 'clamp(26px, 8vmin, 56px)', letterSpacing: 8, textTransform: 'uppercase', fontWeight: 'bold' }}>{RESULT_TITLES[result]}</div>
        <div style={small}>{reason === 'forfeit' ? 'Rival left' : 'Rounds'}</div>
        <Scoreboard d={d} />
        {[1, 2, 3].filter((r) => d.turns[r]).map((r) => (
          <div key={r} style={{ ...small, color: '#999' }}>
            R{r}: {d.rounds[r - 1] === 'tie' ? 'tie' : d.rounds[r - 1] === d.side ? 'won' : d.rounds[r - 1] ? 'lost' : '-'}
            {' · '}you {d.turns[r][d.side]?.wavesCleared ?? '-'} waves · rival {d.turns[r][d.side === 'host' ? 'guest' : 'host']?.wavesCleared ?? '-'}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
          <RematchButton />
          <Button size="lg" onClick={() => { disconnect(); window.location.reload() }} data-testid="director-menu">Menu</Button>
        </div>
      </div>
    </div>
  )
}

// Defender: one terse line under the HUD. The director builds the wave while this is on.
function DefenderStrip() {
  const d = useGameStore((s) => s.director)
  const phase = useGameStore((s) => s.phase)
  const wave = useGameStore((s) => s.wave)
  if (d.role !== 'defender') return null
  const text = phase === 'intermission'
    ? `ROUND ${d.round} · DEFEND · DIRECTOR BUILDING WAVE ${wave}${d.nextMod ? ` · ${d.nextMod.toUpperCase()}` : ''}`
    : d.windowLeft > 0 ? `ROUND ${d.round} · INCOMING ${Math.ceil(d.windowLeft)}` : `ROUND ${d.round} · DEFEND`
  return (
    <div data-testid="director-strip" style={{
      position: 'absolute', zIndex: 6, pointerEvents: 'none', left: 0, right: 0, top: 'max(44px, calc(env(safe-area-inset-top) + 38px))',
      textAlign: 'center', fontFamily: FONT, fontSize: 'max(var(--ui-fs-min), 12px)', letterSpacing: 3, color: '#ffcc66', textShadow: '0 1px 3px #000',
    }}>{text}</div>
  )
}
