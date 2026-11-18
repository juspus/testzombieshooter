// Multiplayer lobby pieces: room code, version note and the host / join body (Co-op and Zombie Mail).
import { useState } from 'react'
import { VERSION_MISMATCH_TEXT } from '../../netProtocol'
import { isValidRoomCode } from '../../invite'
import InviteShare from '../InviteShare'
import { Button, SectionLabel } from '../ui'
import { VERSUS_MODES } from '../../versus'

// ── Multiplayer lobby ──────────────────────────────────────────────────────

// The partner's build speaks another protocol version (net.js handshake): say so instead of desyncing.
function VersionMismatchNote() {
  return (
    <div className="ui-stack" style={{ alignItems: 'center' }}>
      <div data-testid="version-mismatch" className="ui-note" role="alert" style={{ color: '#ff6666', textAlign: 'center' }}>{VERSION_MISMATCH_TEXT}</div>
      <Button size="sm" onClick={() => window.location.reload()}>Reload</Button>
    </div>
  )
}

function RoomCodeDisplay({ code }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard?.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div className="ui-section-label" style={{ justifyContent: 'center' }}>Room code</div>
      <div
        onClick={handleCopy}
        title="Click to copy"
        style={{
          display: 'inline-block',
          color: copied ? '#88cc44' : '#ffe066',
          fontSize: 'clamp(24px, 6vmin, 36px)',
          fontFamily: 'Courier New, monospace',
          letterSpacing: 10,
          textShadow: copied
            ? '0 0 20px rgba(136,204,68,0.6)'
            : '0 0 20px rgba(255,224,102,0.5)',
          cursor: 'pointer',
          userSelect: 'all',
          padding: '4px 4px 4px 14px',
          border: `1px solid ${copied ? 'rgba(136,204,68,0.4)' : 'rgba(255,224,102,0.2)'}`,
          borderRadius: 2,
          transition: 'color 0.2s, text-shadow 0.2s, border-color 0.2s',
        }}
      >
        {code}
      </div>
      <div style={{ color: copied ? '#88cc44' : '#555', fontSize: 11, letterSpacing: 3, marginTop: 6, transition: 'color 0.2s' }}>
        {copied ? 'COPIED' : 'CLICK TO COPY'}
      </div>
    </div>
  )
}

const ROOM_CODE_CHARS = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g
const statusIsError = (s) => s.startsWith('Room not') || s.startsWith('Failed')

// Host / join body shared by the Co-op panel and Versus > Zombie Mail (mode = what hosting starts).
// The StartScreen owns the room state and passes it in (it was a closure there, `lobbyBody(mode)`).
export function LobbyBody({ mode, coop, joinCode, setJoinCode, handleHost, handleJoin, status, roomCode, connected, mapMismatch, partnerMapId, versionMismatch, handleStartGame, lobbyMode, invite }) {
  return (
    <>
      {coop === 'idle' && (
        <div className="ui-stack">
          <SectionLabel>Host</SectionLabel>
          <Button block onClick={() => handleHost(mode)}>Host game</Button>
          <div className="ui-note">{mode === 'coop' ? 'You get a code and an invite link to send.' : mode === 'director' ? 'You get a code and an invite link. Take turns building waves and defending them.' : 'You get a code and an invite link. Same waves for both of you, each in your own world.'}</div>
          <SectionLabel>Join</SectionLabel>
          <div className="ui-field">
            <input
              className="ui-input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(ROOM_CODE_CHARS, '').slice(0, 5))}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="CODE"
              maxLength={5}
              aria-label="Room code"
              style={{ textAlign: 'center', letterSpacing: 6 }}
            />
            <Button onClick={handleJoin} disabled={!joinCode.trim()}>Join</Button>
          </div>
          {status && <div className="ui-note" style={{ color: statusIsError(status) ? '#ff6666' : undefined }}>{status}</div>}
        </div>
      )}

      {coop === 'host' && (
        <div className="ui-stack" style={{ alignItems: 'center' }}>
          {roomCode ? <RoomCodeDisplay code={roomCode} /> : null}
          {roomCode && !connected ? <InviteShare code={roomCode} /> : null}
          <div className="ui-note">{connected ? 'Partner connected' : roomCode ? 'Waiting for partner…' : status}</div>
          {connected && mapMismatch && (
            <div className="ui-note" style={{ color: '#cc9944', textAlign: 'center' }}>
              Partner is on {partnerMapId === 'diner' ? 'Diner' : 'Cabin'} — pick the same map
            </div>
          )}
          {connected && versionMismatch && <VersionMismatchNote />}
          {connected && <Button variant="primary" size="lg" block onClick={handleStartGame} disabled={mapMismatch || versionMismatch}>Start game</Button>}
        </div>
      )}

      {coop === 'guest' && (
        <div className="ui-stack" style={{ alignItems: 'center' }}>
          <div className="ui-note">{connected ? 'Connected — waiting for host to start' : status === '…' ? 'Connecting…' : 'Disconnected'}</div>
          {connected && lobbyMode !== 'coop' && <div className="ui-note" data-testid="lobby-mode">Mode: {VERSUS_MODES[lobbyMode]?.label}</div>}
          {connected && versionMismatch && <VersionMismatchNote />}
        </div>
      )}

      {coop === 'invite' && invite && (
        <div className="ui-stack" style={{ alignItems: 'center' }}>
          {!isValidRoomCode(invite.code) ? (
            <div data-testid="invite-error" className="ui-note" style={{ color: '#ff6666' }}>Invalid invite</div>
          ) : (
            <>
              <div className="ui-section-label" style={{ justifyContent: 'center' }}>Invited</div>
              {!connected && status !== '…' && (
                <Button variant="primary" size="lg" block onClick={() => handleJoin(invite.code)}>{`Join ${invite.code}`}</Button>
              )}
              {status && (
                <div data-testid="invite-status" className="ui-note" style={{ color: statusIsError(status) ? '#ff6666' : undefined, textAlign: 'center' }}>
                  {status === 'Connected' ? 'Connected — waiting for host to start' : status}
                </div>
              )}
              {connected && versionMismatch && <VersionMismatchNote />}
            </>
          )}
        </div>
      )}
    </>
  )
}
