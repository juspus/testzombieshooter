// PARTNER PAUSED overlay for a co-op guest.

export function PausedOverlay() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.72)',
      gap: 12,
      fontFamily: 'Courier New, monospace',
      pointerEvents: 'none',
    }}>
      <div style={{
        fontSize: 52,
        fontWeight: 'bold',
        letterSpacing: 12,
        color: '#ffe066',
        textShadow: '0 0 30px rgba(255,224,102,0.5)',
      }}>
        PAUSED
      </div>
      <div style={{ color: '#888', fontSize: 13, letterSpacing: 4 }}>
        HOST SWITCHED TABS
      </div>
    </div>
  )
}
