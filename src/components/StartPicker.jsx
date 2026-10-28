import { useGameStore } from '../store'
import { MAP_CHOICES, LOADOUTS, isMapUnlocked, isLoadoutUnlocked, applyMapChoice } from '../mapSelect'
import { Option, SectionLabel, LockIcon } from './ui'

// Start-menu LOADOUT panel: map + starting-loadout pickers. Locked choices show "LV N".
// Changing the map saves the choice and reloads: the map is resolved once at module load
// (see mapSelect.js), and nothing is in progress on the start screen. The menu disables
// this panel while a co-op room is open (a reload would drop the connection).

function useSelectedLoadout() {
  const stats = useGameStore((s) => s.stats)
  const loadoutId = useGameStore((s) => s.loadoutId)
  return LOADOUTS.find((l) => l.id === loadoutId && isLoadoutUnlocked(l.id, stats)) ?? LOADOUTS[0]
}

/** "Cabin · Pistol" for the menu row. */
export function useLoadoutSummary() {
  const mapId = useGameStore((s) => s.mapId)
  const loadout = useSelectedLoadout()
  const map = MAP_CHOICES.find((m) => m.id === mapId) ?? MAP_CHOICES[0]
  return `${map.label} · ${loadout.label.replace(/ start$/i, '')}`
}

const lockSide = (level) => <><LockIcon /> LV {level}</>

export default function StartPicker() {
  const stats = useGameStore((s) => s.stats)
  const mapId = useGameStore((s) => s.mapId)
  const setLoadout = useGameStore((s) => s.setLoadout)
  const selLoadout = useSelectedLoadout()

  const pickMap = (id) => {
    if (id === mapId || !isMapUnlocked(id, stats)) return
    applyMapChoice(id)
  }

  return (
    <div data-testid="start-picker" role="radiogroup">
      <SectionLabel>Map</SectionLabel>
      {MAP_CHOICES.map((m) => {
        const locked = !isMapUnlocked(m.id, stats)
        const active = m.id === mapId
        return (
          <Option key={m.id} testid={`map-${m.id}`} label={m.label} sub={m.blurb} checked={active} locked={locked}
            side={locked ? lockSide(m.reqLevel) : active ? 'Selected' : null} onClick={() => pickMap(m.id)} />
        )
      })}
      <SectionLabel right="Not in Daily Run">Start with</SectionLabel>
      {LOADOUTS.map((l) => {
        const locked = !isLoadoutUnlocked(l.id, stats)
        const active = l.id === selLoadout.id
        return (
          <Option key={l.id} testid={`loadout-${l.id}`} label={l.label} sub={l.blurb} checked={active} locked={locked}
            side={locked ? lockSide(l.reqLevel) : active ? 'Selected' : null} onClick={() => setLoadout(l.id)} />
        )
      })}
    </div>
  )
}
