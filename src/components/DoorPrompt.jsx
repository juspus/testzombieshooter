import { useGameStore } from '../store'
import { getMap, getInitialMapId } from '../maps'
import { doorBuyStatus } from '../doors'

// Wave 3 buyable doors: "Hold E — Open door (€X)" prompt (red when you can't afford it).
// Mounted from HUD.jsx; subscribes only to the door fields so it never re-renders per frame
// except while the hold bar fills.
const DOOR_DEFS = getMap(getInitialMapId()).DOOR_DEFS ?? []

export default function DoorPrompt({ isMobile }) {
  const nearDoorId = useGameStore((s) => s.nearDoorId)
  const openDoors = useGameStore((s) => s.openDoors)
  const money = useGameStore((s) => s.money)
  const progress = useGameStore((s) => s.doorProgress)
  const nearChest = useGameStore((s) => s.nearChest)
  const def = nearDoorId ? DOOR_DEFS.find((d) => d.id === nearDoorId) : null
  if (!def || nearChest) return null
  const status = doorBuyStatus(def, DOOR_DEFS, openDoors, money)
  if (status !== 'ok' && status !== 'broke') return null
  const ok = status === 'ok'
  const cost = `€${def.cost}`
  return (
    <div
      data-testid="door-prompt"
      style={{ ...styles.prompt, ...(isMobile ? styles.mobilePrompt : {}), borderColor: ok ? '#6a5a20' : '#662211' }}
    >
      <span style={{ color: ok ? '#ffd24a' : '#ff6644' }}>
        {ok
          ? `DOOR ${isMobile ? '' : 'E  '}${cost}`
          : `DOOR ${cost}`}
      </span>
      {ok && (
        <div style={styles.bar}>
          <div style={{ ...styles.barFill, width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  )
}

const styles = {
  prompt: {
    position: 'absolute',
    bottom: 90,
    background: 'rgba(0,0,0,0.6)',
    fontSize: 14,
    letterSpacing: 2,
    fontFamily: 'Courier New, monospace',
    padding: '8px 18px 10px',
    borderRadius: 4,
    border: '1px solid',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 220,
  },
  mobilePrompt: { bottom: 8, fontSize: 9, letterSpacing: 1, padding: '3px 9px 4px', borderRadius: 3, gap: 3, minWidth: 0 },
  bar: { width: '100%', height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', background: '#ffd24a', borderRadius: 3, transition: 'width 0.05s linear' },
}
