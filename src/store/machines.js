// Mystery Box and Upgrade Bench (rules in src/weaponRules.js).
import { runRandom } from '../rng'
import { emitGameEvent } from '../gameEvents'
import { openRoomSet } from '../doors'
import * as WR from '../weaponRules'
import { MAX_RESERVE } from '../weapons'
import { ACTIVE_MAP, DOOR_DEFS } from './shared'

// ── Wave 3 machines: fresh per-run state ─────────────────────────────────────
export function freshBox() {
  return { room: ACTIVE_MAP.ROOM_ANCHORS?.[WR.BOX_START_ROOM] ? WR.BOX_START_ROOM : 'main', uses: 0, maxUses: WR.rollBoxUses(runRandom('box')), phase: 'idle', result: null, payer: null, at: 0 }
}
export function freshMachineState() {
  return { upgradedWeapons: {}, benchBusy: null, benchLeft: 0, nearMachine: null, machineProgress: 0, box: freshBox() }
}

// Mystery Box and Upgrade Bench.
export const createMachinesSlice = (set, get) => ({
  // ── Wave 3: Mystery Box + Upgrade Bench (rules in src/weaponRules.js) ───────
  // Per-weapon upgrade flags, saved with the carried guns: { [weaponId]: true }.
  upgradedWeapons: {},
  benchBusy: null,       // weapon id while the bench holds the gun (viewmodel hidden), else null
  benchLeft: 0,          // seconds left on the current upgrade
  nearMachine: null,     // 'box' | 'bench' | null — the machine the player stands at (Player.jsx)
  machineProgress: 0,    // 0–1 hold-E progress for the prompt bar
  // Box: phase 'idle' | 'cycling' | 'ready' | 'teddy'. `at` = performance.now() of the last
  // phase change. `payer` = 'host' | 'guest' (solo = 'host'): only the payer may take the weapon.
  box: freshBox(),
  setNearMachine: (k) => { if (get().nearMachine !== k) set({ nearMachine: k }) },
  setMachineProgress: (v) => set({ machineProgress: v }),
  // Replace/merge box state (net sync; host broadcasts, guest applies).
  setBox: (b) => set({ box: { ...get().box, ...b } }),

  // Host/solo: roll a paid use for `payer`. Returns the outcome or null if the box is busy.
  // Does NOT charge (buyBox / the guest's ack do). `held` = weapons the payer carries (re-rolled away).
  boxRoll: (payer, held = [], rng = runRandom('box')) => {
    const { box } = get()
    if (box.phase !== 'idle') return null
    const o = WR.boxRollOutcome(box, rng, held)
    set({ box: { ...box, uses: o.uses, phase: o.teddy ? 'teddy' : 'cycling', result: o.teddy ? 'teddy' : o.weapon, payer, at: performance.now() } })
    return o
  },
  // Local purchase (solo / host). Teddy rolls are free (refunded).
  buyBox: (rng = runRandom('box')) => {
    const { money, ownedWeapons, box } = get()
    if (box.phase !== 'idle' || money < WR.BOX_COST) return null
    const o = get().boxRoll('host', ownedWeapons, rng)
    if (o && !o.teddy) set({ money: money - WR.BOX_COST })
    return o
  },
  // The payer takes the landed weapon. Returns the weapon id or null.
  takeBox: (role = 'host') => {
    const { box } = get()
    if (box.phase !== 'ready' || box.payer !== role || !box.result || box.result === 'teddy') return null
    const w = box.result
    set({ ...WR.giveWeapon(get(), w), box: { ...box, phase: 'idle', result: null, payer: null, at: performance.now() } })
    emitGameEvent('box_take', { weapon: w })   // Wave 4 progression
    return w
  },
  // Time-driven phases. Returns 'moved' when the host/solo box relocated (caller broadcasts), else null.
  tickBox: (now = performance.now(), canMove = true) => {
    const { box } = get()
    const dt = now - box.at
    if (box.phase === 'cycling' && dt >= WR.BOX_CYCLE_MS) set({ box: { ...box, phase: 'ready', at: now } })
    else if (box.phase === 'ready' && dt >= WR.BOX_TAKE_MS) set({ box: { ...box, phase: 'idle', result: null, payer: null, at: now } })
    else if (box.phase === 'teddy' && dt >= WR.BOX_TEDDY_MS && canMove) { get().moveBox(); return 'moved' }
    return null
  },
  // After the bear: relocate to another OPEN room and reset the use counter (host/solo).
  moveBox: (rng = runRandom('box')) => {
    const { box, openDoors } = get()
    const anchors = ACTIVE_MAP.ROOM_ANCHORS ?? {}
    const room = WR.pickBoxRoom(openRoomSet(DOOR_DEFS, openDoors), box.room, anchors, rng)
    set({ box: { room, uses: 0, maxUses: WR.rollBoxUses(rng), phase: 'idle', result: null, payer: null, at: performance.now() } })
  },

  // Upgrade Bench: pay, the gun vanishes into the bench for BENCH_TIME s, then returns upgraded.
  startUpgrade: () => {
    const s = get()
    if (!WR.canUpgrade(s) || s.money < WR.BENCH_COST) return false
    set({ money: s.money - WR.BENCH_COST, benchBusy: s.weapon, benchLeft: WR.BENCH_TIME, isReloading: false })
    return true
  },
  tickBench: (delta) => {
    const s = get()
    if (!s.benchBusy) return false
    const left = s.benchLeft - delta
    if (left > 0) { set({ benchLeft: left }); return false }
    const mult = s.perks?.deep_pockets ? 1.5 : 1
    set({ ...WR.upgradePatch(s, Math.round((MAX_RESERVE[s.weapon] ?? 0) * mult)), benchBusy: null, benchLeft: 0 })
    emitGameEvent('upgrade', { weapon: s.weapon })   // Wave 4 progression
    return true
  },
})
