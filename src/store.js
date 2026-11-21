import { create } from 'zustand'
import { lastWave } from './directorFlow'
import { dirDefending } from './store/shared'
import { createRunSlice } from './store/run'
import { createWaveSlice } from './store/wave'
import { createCombatSlice } from './store/combat'
import { createPowerupsSlice } from './store/powerups'
import { createWeaponsSlice } from './store/weapons'
import { createMachinesSlice } from './store/machines'
import { createEconomySlice } from './store/economy'
import { createPlayerSlice } from './store/player'
import { createBuildingSlice } from './store/building'
import { createCoopSlice } from './store/coop'
import { createVersusSlice } from './store/versus'
import { createDirectorSlice } from './store/director'
import { createProfileSlice } from './store/profile'

// The game store is one Zustand store built from one slice per area (src/store/*.js). Each slice is
// (set, get) => ({ state and actions }); cross-slice calls go through get(). Every name the old
// single-file store exported is re-exported below, so `import ... from '../store'` is unchanged.
// A future unlocks slice plugs in here: write src/store/unlocks.js and spread createUnlocksSlice(set, get) below.

export const useGameStore = create((set, get) => ({
  ...createRunSlice(set, get),
  ...createWaveSlice(set, get),
  ...createCombatSlice(set, get),
  ...createPowerupsSlice(set, get),
  ...createWeaponsSlice(set, get),
  ...createMachinesSlice(set, get),
  ...createEconomySlice(set, get),
  ...createPlayerSlice(set, get),
  ...createBuildingSlice(set, get),
  ...createCoopSlice(set, get),
  ...createVersusSlice(set, get),
  ...createDirectorSlice(set, get),
  ...createProfileSlice(set, get),
}))

export { isSelfDowned } from './store/shared'
export { setSelfZeroHook, BASE_HP, BANDAGE_COST, BANDAGE_HEAL, HELMET_DEFS, BODY_ARMOR_DEFS, PERK_COSTS } from './store/player'
export {
  CLIP_SIZE, AK_CLIP, AK_COST, DEAGLE_CLIP, DEAGLE_COST, SHOTGUN_CLIP, SHOTGUN_COST,
  AMMO_PACK_COST, AMMO_PACK_AMOUNT, DEEP_POCKETS_AMMO_PACK_AMOUNT,
  FLAMETHROWER_COST, FLAMETHROWER_START_AMMO, FLAMETHROWER_AMMO_PACK_COST, FLAMETHROWER_AMMO_PACK_AMOUNT,
  FLAME_DPS, FLAME_TICK_INTERVAL, FLAME_FUEL_PER_SEC, FLAME_RANGE, FLAME_CONE_COS, FLAME_BURN_DURATION,
  CALIBER_LABELS, ALL_WEAPONS, MAX_RESERVE, _maxAmmoState,
} from './store/weapons'
export { HITS_PER_PLANK, PLANK_COST, STRONG_PLANK_COST, STRONG_HITS_PER_PLANK } from './store/building'
export { killMoney } from './store/economy'
export { ZOMBIE_ARCHETYPES, getZombieArchetype, zombieTypesForWave, specialProbsForWave, buildTypeList } from './store/zombieTypes'
export { spawnZombies, buildMailZombies } from './store/spawns'
export { mailClock } from './store/versus'

// The Director: a defended wave just cleared -> count it; after the turn's last wave the turn ends.
const DIRECTOR_TURN_END_MS = 2200
useGameStore.subscribe((s, prev) => {
  if (s.phase === 'wave_clear' && prev.phase !== 'wave_clear' && dirDefending(s)) {
    useGameStore.getState().directorWaveCleared()
    const { round, turn } = s.director
    if (s.wave >= lastWave(round)) {
      setTimeout(() => {
        const d = useGameStore.getState().director
        if (d.turn === turn && d.round === round) useGameStore.getState().directorEndTurn(false)
      }, DIRECTOR_TURN_END_MS)
    }
  }
})

// Dev/preview only: expose the store for browser-driven verification.
if (typeof window !== 'undefined' && import.meta.env.VITE_VERCEL_ENV !== 'production') {
  window.__game = useGameStore
}
