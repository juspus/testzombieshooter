import { useEffect, useState } from 'react'
import { useGameStore } from '../store'
import { isConnected } from '../net'
import { useRematch, requestRematch } from '../versusRematch'
import { Button } from './ui'

const FONT = 'Courier New, monospace'
const COLORS = { win: '#88cc44', lose: '#ff4444', draw: '#ffd166' }

export const RESULT_TITLES = { win: 'You win', lose: 'You lose', draw: 'Draw' }

export function reasonText(result, reason) {
  if (reason === 'forfeit') return 'Rival left'
  if (result === 'win') return 'Rival down'
  if (result === 'lose') return 'You went down first'
  return 'Same wave, same kills'
}

/** True while the net link to the rival is open (polled; net.js has no subscription). */
export function useLinkUp() {
  const [up, setUp] = useState(isConnected)
  useEffect(() => {
    const t = setInterval(() => setUp(isConnected()), 500)
    return () => clearInterval(t)
  }, [])
  return up
}

/** Rematch button: hidden when the link is gone. Both players must press it. */
export function RematchButton({ size = 'lg', style }) {
  const up = useLinkUp()
  const { me, rival } = useRematch()
  if (!up) return null
  return (
    <Button variant="primary" size={size} onClick={requestRematch} disabled={me} style={style} data-testid="versus-rematch">
      {me ? 'Waiting…' : rival ? 'Rematch (rival ready)' : 'Rematch'}
    </Button>
  )
}

/** Death-screen block for a versus run (rendered by YouDied when runMode === 'versus'). */
export default function VersusResult() {
  const result = useGameStore((s) => s.versus.result)
  const reason = useGameStore((s) => s.versus.reason)
  const rival = useGameStore((s) => s.versus.opponent)
  if (!result) return null
  return (
    <div data-testid="versus-result" style={{ marginTop: 'clamp(6px, 1.5vmin, 14px)', textAlign: 'center', fontFamily: FONT }}>
      <div style={{ color: COLORS[result], fontSize: 'clamp(22px, 5vmin, 40px)', letterSpacing: 6, textTransform: 'uppercase', fontWeight: 'bold' }}>
        {RESULT_TITLES[result]}
      </div>
      <div style={{ color: '#999', fontSize: 14, letterSpacing: 2, marginTop: 4 }}>{reasonText(result, reason)}</div>
      {rival && (
        <div style={{ color: '#777', fontSize: 14, letterSpacing: 2, marginTop: 4 }}>
          Rival: wave {rival.wave} · {rival.kills} kills
        </div>
      )}
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}><RematchButton /></div>
    </div>
  )
}
