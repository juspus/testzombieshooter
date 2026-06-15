import { buildGrid } from '../walls'
import { allWallSegments } from '../cabin'
import { playPlankBreak } from '../sounds'
import { PERK_COSTS, HITS_PER_PLANK, PLANK_COST, STRONG_PLANK_COST, STRONG_HITS_PER_PLANK } from './constants'

export const createEconomySlice = (set, get) => ({
  money: 10,
  perks: {},       // one-time perk unlocks bought from the supply chest
  walls: [],
  windowPlanks: {},       // { [windowId]: 1 | 2 }
  windowPlankStrong: {},  // { [windowId]: true } when planks at that window are reinforced
  strongPlanksMode: false,
  plankHits: {},          // { [windowId]: hitCount } toward next plank break

  addPlank: (id) => {
    const { windowPlanks, windowPlankStrong, money, strongPlanksMode } = get()
    const current = windowPlanks[id] ?? 0
    if (current >= 2) return false
    const cost = strongPlanksMode ? STRONG_PLANK_COST : PLANK_COST
    if (money < cost) return false
    const newPlanks = { ...windowPlanks, [id]: current + 1 }
    const newStrong = strongPlanksMode ? { ...windowPlankStrong, [id]: true } : windowPlankStrong
    buildGrid(allWallSegments(newPlanks))
    set({ windowPlanks: newPlanks, windowPlankStrong: newStrong, money: money - cost })
    return true
  },

  upgradePlanks: (id) => {
    const { windowPlanks, windowPlankStrong, money } = get()
    const count = windowPlanks[id] ?? 0
    if (count === 0 || windowPlankStrong[id]) return false
    const cost = STRONG_PLANK_COST * count
    if (money < cost) return false
    set({ windowPlankStrong: { ...windowPlankStrong, [id]: true }, money: money - cost })
    return true
  },

  hitPlank: (id) => {
    const { plankHits, windowPlanks, windowPlankStrong, wavePlanksLost } = get()
    if ((windowPlanks[id] ?? 0) === 0) return
    const hitsNeeded = windowPlankStrong[id] ? STRONG_HITS_PER_PLANK : HITS_PER_PLANK
    const hits = (plankHits[id] ?? 0) + 1
    if (hits >= hitsNeeded) {
      const newPlanks = { ...windowPlanks, [id]: windowPlanks[id] - 1 }
      const newStrong = newPlanks[id] === 0
        ? { ...windowPlankStrong, [id]: false }
        : windowPlankStrong
      buildGrid(allWallSegments(newPlanks))
      playPlankBreak()
      set({ windowPlanks: newPlanks, windowPlankStrong: newStrong, plankHits: { ...plankHits, [id]: 0 }, wavePlanksLost: wavePlanksLost + 1 })
    } else {
      set({ plankHits: { ...plankHits, [id]: hits } })
    }
  },

  toggleStrongPlanksMode: () => set({ strongPlanksMode: !get().strongPlanksMode }),

  buyPerk: (perkId) => {
    const { money, perks } = get()
    const cost = PERK_COSTS[perkId]
    if (!cost || perks[perkId] || money < cost) return false
    set({ money: money - cost, perks: { ...perks, [perkId]: true } })
    return true
  },
})
