import { useGameStore } from '../store'
import { MAP_CHOICES, LOADOUTS, isMapUnlocked, isLoadoutUnlocked, applyMapChoice } from '../mapSelect'

// Start-screen map + starting-loadout pickers. Locked choices show "Reach level N".
// Changing the map saves the choice and reloads: the map is resolved once at module load
// (see mapSelect.js), and nothing is in progress on the start screen. Only on the main
// view, i.e. before a co-op room is opened (a reload would drop the connection).

const mono = 'Courier New, monospace'

function Chip({ active, locked, disabled, onClick, label, sub, testid }) {
  return (
    <button
      type="button"
      data-testid={testid}
      data-active={active ? '1' : '0'}
      data-locked={locked ? '1' : '0'}
      disabled={disabled || locked}
      onClick={onClick}
      style={{
        background: active ? 'rgba(255,51,0,0.18)' : 'rgba(0,0,0,0.45)',
        border: `1px solid ${active ? '#ff3300' : '#444'}`,
        color: locked ? '#555' : active ? '#ffcc99' : '#aaa',
        fontFamily: mono, letterSpacing: 1, textTransform: 'uppercase',
        fontSize: 'clamp(9px, 1.7vmin, 12px)', padding: '4px 10px', minWidth: 0,
        cursor: locked || disabled ? 'default' : 'pointer', lineHeight: 1.25,
        opacity: disabled && !active ? 0.5 : 1,
      }}
    >
      <div>{locked ? '\u{1F512} ' : ''}{label}</div>
      {sub && <div style={{ fontSize: 'clamp(8px, 1.4vmin, 10px)', letterSpacing: 0, color: locked ? '#777' : '#888' }}>{sub}</div>}
    </button>
  )
}

export default function StartPicker() {
  const stats = useGameStore((s) => s.stats)
  const mapId = useGameStore((s) => s.mapId)
  const loadoutId = useGameStore((s) => s.loadoutId)
  const setLoadout = useGameStore((s) => s.setLoadout)

  const pickMap = (id) => {
    if (id === mapId || !isMapUnlocked(id, stats)) return
    applyMapChoice(id)
  }
  const selLoadout = LOADOUTS.find((l) => l.id === loadoutId && isLoadoutUnlocked(l.id, stats)) ?? LOADOUTS[0]
  const row = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }
  const label = { color: '#666', fontFamily: mono, fontSize: 'clamp(8px, 1.5vmin, 11px)', letterSpacing: 2, minWidth: 54, textAlign: 'right' }

  return (
    <div data-testid="start-picker" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', maxWidth: 'min(94vw, 720px)' }}>
      <div style={row}>
        <span style={label}>MAP</span>
        {MAP_CHOICES.map((m) => {
          const locked = !isMapUnlocked(m.id, stats)
          return (
            <Chip key={m.id} testid={`map-${m.id}`} label={m.label} active={m.id === mapId} locked={locked}
              sub={locked ? `LV ${m.reqLevel}` : null} onClick={() => pickMap(m.id)} />
          )
        })}
      </div>
      <div style={row}>
        <span style={label}>START</span>
        {LOADOUTS.map((l) => {
          const locked = !isLoadoutUnlocked(l.id, stats)
          return (
            <Chip key={l.id} testid={`loadout-${l.id}`} label={l.label} active={l.id === selLoadout.id} locked={locked}
              sub={locked ? `LV ${l.reqLevel}` : null} onClick={() => setLoadout(l.id)} />
          )
        })}
      </div>
    </div>
  )
}
