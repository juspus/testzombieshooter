import { useState } from 'react'
import { buildInviteLink } from '../invite'

// W5 one-tap invite for the host lobby: shows the link and shares it (Web Share on phones,
// clipboard everywhere else).
export default function InviteShare({ code }) {
  const [note, setNote] = useState('')
  const link = buildInviteLink(window.location.origin, code)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setNote('LINK COPIED')
    } catch {
      setNote('COPY FAILED')
    }
    setTimeout(() => setNote(''), 2500)
  }
  const share = async () => {
    try {
      await navigator.share({ title: 'CABIN co-op', text: 'Join my CABIN game!', url: link })
    } catch (e) {
      if (e?.name !== 'AbortError') copy()   // share sheet unavailable / failed -> fall back
    }
  }

  const btn = {
    background: 'rgba(255,224,102,0.12)', border: '1px solid rgba(255,224,102,0.5)', color: '#ffe066',
    padding: '10px 18px', fontSize: 13, letterSpacing: 3, fontFamily: 'Courier New, monospace', cursor: 'pointer',
  }
  return (
    <div data-testid="invite-share" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div data-testid="invite-link" style={{
        color: '#aaa', fontSize: 12, fontFamily: 'Courier New, monospace', wordBreak: 'break-all',
        textAlign: 'center', maxWidth: 'min(88vw, 360px)', userSelect: 'all',
      }}>{link}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {canShare && <button data-testid="invite-share-btn" style={btn} onClick={share}>SHARE</button>}
        <button data-testid="invite-copy-btn" style={btn} onClick={copy}>COPY LINK</button>
      </div>
      <div style={{ color: '#88cc44', fontSize: 11, letterSpacing: 3, minHeight: 14 }}>{note}</div>
    </div>
  )
}
