// Seed Duel UI (src/duel.js): start-screen panel + challenge card, HUD rival stat, death-screen block.
import { useState } from 'react'
import { useGameStore } from '../store'
import { newRunSeed } from '../rng'
import { encodeDuel, buildDuelLink, compareDuel, ghostAt } from '../duel'
import { MAP_CHOICES } from '../mapSelect'
import { Button, Panel, SectionLabel } from './ui'
import { enterRunFullscreen } from '../fullscreen'

const mapLabel = (id) => MAP_CHOICES.find((m) => m.id === id)?.label ?? id
const NOTE = { fontSize: 'max(var(--ui-fs-min), 12px)' }

/** Start-screen DUEL panel body. `challenge` = decoded rival token (from ?duel=) or null. */
export function DuelPanel({ challenge, onBack, onDecline }) {
  const startSeededGame = useGameStore((s) => s.startSeededGame)
  const mapId = useGameStore((s) => s.mapId)
  const startFresh = () => { enterRunFullscreen(); startSeededGame('duel', newRunSeed()) }
  const accept = () => { enterRunFullscreen(); startSeededGame('duel', challenge.seed, { rival: challenge }) }

  if (challenge) {
    return (
      <Panel title="Seed Duel" testid="duel-panel">
        <div className="ui-stack" style={{ alignItems: 'center', textAlign: 'center' }} data-testid="duel-card">
          <div className="ui-section-label" style={{ justifyContent: 'center' }} data-testid="duel-card-title">{`${challenge.name} challenges you`}</div>
          <div data-testid="duel-card-result" style={{ fontSize: 'max(var(--ui-fs-min), 18px)', color: '#ffe066', letterSpacing: 1 }}>
            {`Wave ${challenge.final.wave} · ${challenge.final.kills} kill${challenge.final.kills !== 1 ? 's' : ''}`}
          </div>
          <div className="ui-note" style={NOTE} data-testid="duel-card-map">{`${mapLabel(challenge.map)} · same zombies, same drops`}</div>
          <Button variant="primary" size="lg" block onClick={accept} data-testid="duel-accept">Accept</Button>
          <Button variant="ghost" size="sm" onClick={onDecline} data-testid="duel-decline">Decline</Button>
        </div>
      </Panel>
    )
  }
  return (
    <Panel title="Seed Duel" action={<Button variant="ghost" size="sm" onClick={onBack}>Back</Button>} testid="duel-panel">
      <div className="ui-stack">
        <SectionLabel>Play a seed, send it</SectionLabel>
        <Button variant="primary" size="lg" block onClick={startFresh} data-testid="duel-start">Start a duel</Button>
        <div className="ui-note" style={NOTE}>{`${mapLabel(mapId)}. A friend plays your exact seed any time; higher wave wins.`}</div>
      </div>
    </Panel>
  )
}

/** HUD stat beside the player's own counts. Renders nothing without a rival. Pass the HUD's style objects. */
export function DuelHudStat({ statStyle, labelStyle, valueStyle }) {
  const rival = useGameStore((s) => (s.runMode === 'duel' ? s.duel.rival : null))
  const wave = useGameStore((s) => s.wave)
  const kills = useGameStore((s) => s.kills)
  if (!rival) return null
  const past = wave > rival.final.wave
  const ghost = ghostAt(rival, wave)
  const ahead = past || (ghost != null && kills >= ghost)
  return (
    <div style={statStyle} data-testid="duel-hud">
      <span style={labelStyle}>{past ? 'RIVAL' : `RIVAL W${wave}`}</span>
      <span style={{ ...valueStyle, color: ahead ? '#88dd55' : '#ff6644' }}>{past ? 'Past rival' : ghost}</span>
    </div>
  )
}

const RESULT_TEXT = { win: 'YOU WIN', lose: 'YOU LOSE', draw: 'DRAW' }
const RESULT_COLOR = { win: '#88dd55', lose: '#ff6644', draw: '#ffe066' }
const noteStyle = { fontFamily: 'Courier New, monospace', letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', fontSize: 'max(var(--ui-fs-min), 12px)' }

async function copyText(text) {
  try { if (navigator.clipboard) { await navigator.clipboard.writeText(text); return true } } catch { /* fall through */ }
  try {
    const t = document.createElement('textarea')
    t.value = text
    t.style.position = 'fixed'; t.style.opacity = '0'
    document.body.appendChild(t); t.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(t)
    return ok
  } catch { return false }
}

const isTouch = () => !!window.matchMedia?.('(pointer: coarse)').matches

/** Death-screen block for runMode === 'duel': result line, Send challenge, New duel. */
export function DuelDeath({ wave, kills, username }) {
  const duel = useGameStore((s) => s.duel)
  const runSeed = useGameStore((s) => s.runSeed)
  const mapId = useGameStore((s) => s.mapId)
  const startSeededGame = useGameStore((s) => s.startSeededGame)
  const [status, setStatus] = useState('')
  const [link, setLink] = useState('')
  const rival = duel.rival
  const mine = duel.final ?? { wave, kills }
  const res = rival ? compareDuel(mine, rival) : null

  const send = async () => {
    const token = encodeDuel({ seed: runSeed, map: mapId, name: username || 'Player', waves: duel.waveLog, final: mine })
    if (!token) { setStatus('Cannot build link'); return }
    const url = buildDuelLink(window.location.origin, token)
    setLink(url)
    if (isTouch() && navigator.share) {
      try {
        await navigator.share({ title: 'Seed Duel', text: `Beat wave ${mine.wave} (${mine.kills} kills) on the same seed.`, url })
        setStatus('Shared')
        return
      } catch (e) {
        if (e?.name === 'AbortError') { setStatus(''); return }
      }
    }
    setStatus((await copyText(url)) ? 'Link copied' : 'Copy failed')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(6px, 1.5vmin, 12px)' }} data-testid="duel-death">
      {rival && (
        <div data-testid="duel-result" style={{ ...noteStyle, color: RESULT_COLOR[res], maxWidth: '88vw' }}>
          {`${RESULT_TEXT[res]} · you W${mine.wave} ${mine.kills} · ${rival.name} W${rival.final.wave} ${rival.final.kills}`}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button variant="primary" size="lg" onClick={send} data-testid="duel-send">Send challenge</Button>
        <Button size="lg" onClick={() => startSeededGame('duel', newRunSeed())} data-testid="duel-new">New duel</Button>
      </div>
      <div style={{ ...noteStyle, minHeight: 16, color: '#777' }} data-testid="duel-status" data-link={link}>{status}</div>
    </div>
  )
}
