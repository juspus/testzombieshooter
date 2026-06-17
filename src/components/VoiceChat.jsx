import { useEffect, useState, useRef } from 'react'
import { useGameStore } from '../store'
import { getPeer, getRemotePeerId } from '../net'
import { listenForCall, callHost, setPTT, onTalkingChange, teardownVoice } from '../voice'

export default function VoiceChat() {
  const mpConnected = useGameStore((s) => s.mpConnected)
  const mpRole      = useGameStore((s) => s.mpRole)
  const roomCode    = useGameStore((s) => s.roomCode)
  const [talking, setTalking]   = useState(false)
  const [micError, setMicError] = useState(false)
  const [isMobile]  = useState(() => navigator.maxTouchPoints > 0)
  const initialised = useRef(false)

  // Wire up voice when multiplayer connects
  useEffect(() => {
    if (!mpConnected || initialised.current) return
    initialised.current = true

    onTalkingChange(setTalking)

    const peer = getPeer()
    if (!peer) return

    if (mpRole === 'host') {
      listenForCall(peer)
    } else {
      // Guest calls host; host peer ID = roomCode
      callHost(peer, roomCode).catch(() => setMicError(true))
    }

    return () => {
      teardownVoice()
      initialised.current = false
    }
  }, [mpConnected, mpRole, roomCode])

  // V key PTT — desktop
  useEffect(() => {
    if (!mpConnected || isMobile) return
    const onDown = (e) => {
      if (e.code === 'KeyV' && !e.repeat) setPTT(true)
    }
    const onUp = (e) => {
      if (e.code === 'KeyV') setPTT(false)
    }
    document.addEventListener('keydown', onDown)
    document.addEventListener('keyup', onUp)
    return () => {
      document.removeEventListener('keydown', onDown)
      document.removeEventListener('keyup', onUp)
      setPTT(false)
    }
  }, [mpConnected, isMobile])

  if (!mpConnected) return null

  return (
    <>
      {/* Mic status indicator — top left */}
      <div style={styles.indicator}>
        <div style={{ ...styles.dot, background: micError ? '#ff4444' : talking ? '#00ff88' : 'rgba(255,255,255,0.25)' }} />
        <span style={{ ...styles.label, color: micError ? '#ff4444' : talking ? '#00ff88' : 'rgba(255,255,255,0.35)' }}>
          {micError ? 'MIC ERR' : talking ? 'TALKING' : isMobile ? 'MIC' : 'V — TALK'}
        </span>
      </div>

      {/* Mobile PTT button */}
      {isMobile && (
        <button
          style={{ ...styles.pttBtn, background: talking ? 'rgba(0,255,136,0.25)' : 'rgba(0,0,0,0.5)', borderColor: talking ? '#00ff88' : 'rgba(255,255,255,0.2)' }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setPTT(true) }}
          onPointerUp={() => setPTT(false)}
          onPointerCancel={() => setPTT(false)}
        >
          🎙
        </button>
      )}
    </>
  )
}

const styles = {
  indicator: {
    position: 'fixed',
    top: 20,
    left: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'Courier New, monospace',
    fontSize: 11,
    letterSpacing: 2,
    pointerEvents: 'none',
    zIndex: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background 0.1s',
  },
  label: {
    transition: 'color 0.1s',
  },
  pttBtn: {
    position: 'fixed',
    bottom: 'max(80px, calc(env(safe-area-inset-bottom) + 70px))',
    left: 16,
    width: 52,
    height: 52,
    borderRadius: '50%',
    border: '1px solid',
    fontSize: 22,
    cursor: 'pointer',
    zIndex: 10,
    touchAction: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.1s, border-color 0.1s',
  },
}
