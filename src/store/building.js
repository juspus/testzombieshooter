// Planks, windows and doors: boarding up, glass, buyable doors and the nav grid / collision they rebuild.
import { buildGrid } from '../walls'
import { playPlankBreak, playGlassShatter, playDoorOpen } from '../sounds'
import { spawnImpact } from '../impactParticles'
import { withLinksOpened, doorBuyStatus } from '../doors'
import { emitGameEvent } from '../gameEvents'
import { ACTIVE_MAP, DOOR_DEFS, playerCollisionWalls, allWallSegments } from './shared'

export const HITS_PER_PLANK = 5
export const PLANK_COST = 2.5
export const STRONG_PLANK_COST = 20
export const STRONG_HITS_PER_PLANK = 20

// Debris sprays outward (toward the interior) from a breaking plank.
function _plankBreakNormal(w) {
  const ns = w.wall === 'N' || w.wall === 'S'
  return { x: ns ? 0 : (w.wall === 'W' ? 1 : -1), y: 0.3, z: ns ? (w.wall === 'N' ? 1 : -1) : 0 }
}

export function countPlanks(windowPlanks) {
  return Object.values(windowPlanks).reduce((sum, count) => sum + count, 0)
}

// Planks, windows, doors: state and actions.
export const createBuildingSlice = (set, get) => ({
  walls: [],
  windowPlanks: {},       // { [windowId]: 1 | 2 }
  windowPlankStrong: {},  // { [windowId]: true } when planks at that window are reinforced
  strongPlanksMode: false,
  plankHits: {},          // { [windowId]: hitCount } toward next plank break
  brokenWindows: {},      // { [windowId]: true } — glass shattered, permanent for the run
  nearWindowId: -1,  // window the player is currently standing near (-1 = none)
  boardingProgress: 0,  // 0–1, fraction of 2s hold complete
  skipProgress: 0,      // 0–1, fraction of hold-T skip complete

  addPlank: (id) => {
    const { windowPlanks, windowPlankStrong, money, strongPlanksMode } = get()
    const current = windowPlanks[id] ?? 0
    if (current >= 2) return false
    if (windowPlankStrong[id] && !strongPlanksMode) return false  // can't add plain plank on strong window
    const cost = strongPlanksMode ? STRONG_PLANK_COST : PLANK_COST
    if (money < cost) return false
    const newPlanks = { ...windowPlanks, [id]: current + 1 }
    const newStrong = strongPlanksMode ? { ...windowPlankStrong, [id]: true } : windowPlankStrong
    buildGrid(allWallSegments(newPlanks, get().openDoors))
    set({ windowPlanks: newPlanks, windowPlankStrong: newStrong, money: money - cost })
    emitGameEvent('plank')   // Wave 4 progression
    return true
  },

  // Shatters a window's glass — first zombie to reach it or first bullet through
  // it triggers this. Permanent for the run (independent of plank state).
  breakWindow: (id) => {
    if (get().brokenWindows[id]) return
    set({ brokenWindows: { ...get().brokenWindows, [id]: true } })
    const w = ACTIVE_MAP.WINDOW_DEFS?.[id]
    playGlassShatter(w?.winX, 1.2, w?.winZ)
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
      buildGrid(allWallSegments(newPlanks, get().openDoors))
      const bw = ACTIVE_MAP.WINDOW_DEFS?.[id]
      playPlankBreak(bw?.winX, 1.2, bw?.winZ)
      if (bw) spawnImpact({ x: bw.winX, y: 1.2, z: bw.winZ }, _plankBreakNormal(bw), 'break')
      set({ windowPlanks: newPlanks, windowPlankStrong: newStrong, plankHits: { ...plankHits, [id]: 0 }, wavePlanksLost: wavePlanksLost + 1 })
    } else {
      set({ plankHits: { ...plankHits, [id]: hits } })
    }
  },

  toggleStrongPlanksMode: () => set({ strongPlanksMode: !get().strongPlanksMode }),

  setNearWindowId: (id) => set({ nearWindowId: id }),
  setBoardingProgress: (v) => set({ boardingProgress: v }),
  setSkipProgress: (v) => set({ skipProgress: v }),

  // ── Wave 3: buyable doors ───────────────────────────────────────────────────
  // Runs start sealed in the main room. `openDoors` is { [doorId]: true } (see
  // src/doors.js + DOOR_DEFS in the map). Opening rebuilds the nav grid + player
  // collision once; zombies re-path on their next PATH_INTERVAL tick.
  openDoors: {},
  nearDoorId: null,   // id of the closed, buyable door the player stands at (Player.jsx)
  doorProgress: 0,    // 0–1 hold-E progress (HUD bar)
  setNearDoorId: (id) => { if (get().nearDoorId !== id) set({ nearDoorId: id }) },
  setDoorProgress: (v) => set({ doorProgress: v }),

  // Opens a door without charging anyone (host/guest sync, debug). Returns false if already open.
  applyDoorOpen: (id, silent = false) => {
    const { openDoors, windowPlanks } = get()
    if (openDoors[id]) return false
    const def = DOOR_DEFS.find((d) => d.id === id)
    if (!def) return false
    const next = withLinksOpened(DOOR_DEFS, { ...openDoors, [id]: true })
    buildGrid(allWallSegments(windowPlanks, next))
    set({ openDoors: next, walls: playerCollisionWalls(next) })
    emitGameEvent('door_open', { id })   // Wave 4 progression
    if (!silent) playDoorOpen(def.x, 1.2, def.z)
    return true
  },

  // Local purchase: checks status + money, charges this client, opens the door.
  // (Co-op: money is per-player; Player.jsx routes guests through a host request.)
  buyDoor: (id) => {
    const { openDoors, money } = get()
    const def = DOOR_DEFS.find((d) => d.id === id)
    if (!def || doorBuyStatus(def, DOOR_DEFS, openDoors, money) !== 'ok') return false
    set({ money: money - def.cost })
    return get().applyDoorOpen(id)
  },
  // Host-side validation of a guest's request: open only (the guest pays on the ack).
  canOpenDoor: (id, money = Infinity) => {
    const def = DOOR_DEFS.find((d) => d.id === id)
    return !!def && doorBuyStatus(def, DOOR_DEFS, get().openDoors, money) === 'ok'
  },
  // Replace the whole door state (guest join / wave_start sync).
  setOpenDoors: (doors) => {
    const next = { ...(doors || {}) }
    const { windowPlanks } = get()
    buildGrid(allWallSegments(windowPlanks, next))
    set({ openDoors: next, walls: playerCollisionWalls(next) })
  },
})
