import { useGameStore } from '../store'
import { machineAction } from '../machineInput'

// Wave 3: hold-E prompt for the Mystery Box / Upgrade Bench (same pattern as DoorPrompt).
// Subscribes to the few fields it needs; the bar fills with machineProgress.
export default function MachinePrompt({ isMobile }) {
  const kind = useGameStore((s) => s.nearMachine)
  const nearChest = useGameStore((s) => s.nearChest)
  const progress = useGameStore((s) => s.machineProgress)
  // Re-render on anything that changes the prompt text.
  const money = useGameStore((s) => s.money)
  const box = useGameStore((s) => s.box)
  const weapon = useGameStore((s) => s.weapon)
  const upgraded = useGameStore((s) => s.upgradedWeapons)
  const busy = useGameStore((s) => s.benchBusy)
  const activeItem = useGameStore((s) => s.activeItem)
  const mpRole = useGameStore((s) => s.mpRole)
  if (!kind || nearChest) return null
  const act = machineAction({ money, box, weapon, upgradedWeapons: upgraded, benchBusy: busy, activeItem, mpRole }, kind)
  if (!act) return null
  const borderBase = kind === 'bench' ? '#2a5a66' : '#6a5a20'
  if (act.action === 'upgraded') {
    return (
      <div data-testid="machine-prompt" style={{ ...styles.prompt, ...(isMobile ? styles.mobilePrompt : {}), borderColor: borderBase }}>
        <span style={{ color: '#58e6ff' }}>{act.name} ✓</span>
      </div>
    )
  }
  const k = isMobile ? '' : 'E  '
  let text
  if (act.action === 'buy') text = `${k}🎁 €${act.cost}`
  else if (act.action === 'take') text = `${k}take ${act.name}`
  else text = `${k}upgrade ${act.name}${act.cost ? ` · €${act.cost}` : ''}`
  if (!act.ok) text = act.cost ? `€${act.cost}` : text
  const color = !act.ok ? '#ff6644' : kind === 'bench' ? '#58e6ff' : '#ffd24a'
  return (
    <div
      data-testid="machine-prompt"
      style={{ ...styles.prompt, ...(isMobile ? styles.mobilePrompt : {}), borderColor: act.ok ? borderBase : '#662211' }}
    >
      <span style={{ color }}>{text}</span>
      {act.ok && (
        <div style={styles.bar}>
          <div style={{ ...styles.barFill, background: color, width: `${progress * 100}%` }} />
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
  barFill: { height: '100%', borderRadius: 3, transition: 'width 0.05s linear' },
}
