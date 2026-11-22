// Continue a run: a wave-start checkpoint for solo normal runs, kept in localStorage.
//
// Taken every time a run enters an intermission (wave 1 included; retaken when startGame /
// resumeRun bump `runId` at the end of their setup), so it holds the run as it
// was when that wave's countdown began: money, guns and ammo, perks, armour, doors, planks,
// glass, bench, box room, score. Two ways back in:
//   - Resume (Start screen "Continue"): after a closed tab, crash or reload. Free when the save
//     was taken between waves; a save left mid-wave (the tab closed during a fight) marks the
//     run continued, so closing the tab is not a free way out of a lost wave.
//   - Retry (death screen "Retry wave N"): once per run. Marks the run continued.
// A continued run still pays XP and lifetime stats, but its score never reaches the boards.
// Daily, versus, duel, director and co-op runs are never saved (seeded or shared worlds).
//
// Lifetime stats: a death already folded the run into them (recordRunEnd), so a retry sets
// `statsBase` to the checkpoint's counters and the next recordRunEnd adds only what came after.
// The progress tracker's XP counters are saved with the checkpoint (resume) or start at zero
// (retry, since the death already settled them); see 'run_resume' in progressTracker.js.
import { run as trackerRun } from './progressTracker'
import { ALL_WEAPONS } from './weapons'

export const RUN_SAVE_KEY = 'cabin.runSave.v1'
const VERSION = 1

// Store keys copied into the checkpoint verbatim.
export const SNAPSHOT_KEYS = [
  'wave', 'money', 'kills', 'runHeadshots', 'runKnifeKills', 'nextId',
  'weapon', 'ownedWeapons', 'savedClips', 'savedReserves', 'bulletsInClip', 'reserveBullets',
  'upgradedWeapons', 'benchBusy', 'benchLeft', 'grenades',
  'perks', 'hp', 'maxHp', 'helmet', 'bodyArmor',
  'openDoors', 'windowPlanks', 'windowPlankStrong', 'brokenWindows', 'strongPlanksMode',
  'waveModifier', 'killsSinceDrop', 'lastDropType',
]
// Progress-tracker counters carried across a reload (numbers / booleans only).
const COUNTER_KEYS = ['kills', 'killXp', 'headshots', 'knifeKills', 'bossKills', 'flameKills', 'powerups', 'wavesCleared', 'modifierWaves', 'noBoardStreak', 'pistolOnly']

/** True for a run this module may save: solo, normal, unseeded, not the Director. */
export function isSavableRun(s) {
  return s.runMode === 'normal' && !s.mpRole && s.runSeed == null && !s.director?.active
}

/** Plain-JSON checkpoint of the store `s` (call at the start of an intermission). */
export function takeSnapshot(s, counters = null) {
  const state = {}
  for (const k of SNAPSHOT_KEYS) state[k] = s[k]
  const b = s.box
  state.box = b ? { room: b.room, uses: b.uses, maxUses: b.maxUses } : null
  const c = {}
  if (counters) for (const k of COUNTER_KEYS) if (counters[k] !== undefined) c[k] = counters[k]
  return {
    v: VERSION,
    mapId: s.mapId,
    savedAt: Date.now(),
    wave: s.wave,
    state: JSON.parse(JSON.stringify(state)),
    counters: c,
    retryUsed: !!s.runRetryUsed,
    continued: !!s.runContinued,
    statsBase: s.statsBase ?? null,
    midWave: false,
    dead: false,
  }
}

/** Sanity-check a parsed save; returns it (weapons cleaned) or null. */
export function validateSave(save) {
  if (!save || typeof save !== 'object' || save.v !== VERSION) return null
  const st = save.state
  if (!st || typeof st !== 'object' || !Number.isInteger(st.wave) || st.wave < 1) return null
  if (typeof st.money !== 'number' || !Array.isArray(st.ownedWeapons)) return null
  const owned = st.ownedWeapons.filter((w) => ALL_WEAPONS.includes(w))
  if (!owned.includes('pistol')) owned.unshift('pistol')
  const weapon = owned.includes(st.weapon) ? st.weapon : 'pistol'
  return { ...save, state: { ...st, ownedWeapons: owned, weapon } }
}

/** How a save comes back: 'retry' after a death, 'continued' after a mid-wave exit, else 'resume'. */
export function resumeKind(save) {
  if (save.dead) return 'retry'
  return save.midWave ? 'continued' : 'resume'
}

/** The save the Start screen may offer for map `mapId`, or null (a dead save whose retry is spent is never kept). */
export function continuableSave(save, mapId) {
  const v = validateSave(save)
  if (!v || v.mapId !== mapId) return null
  if (v.dead && v.retryUsed) return null
  return v
}

// ── Storage ──────────────────────────────────────────────────────────────────
export function readSave() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RUN_SAVE_KEY) : null
    return raw ? validateSave(JSON.parse(raw)) : null
  } catch { return null }
}
function writeSave(save) {
  try { localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(save)) } catch { /* private mode / full: the run just isn't saved */ }
}
export function clearSave() {
  try { localStorage.removeItem(RUN_SAVE_KEY) } catch { /* ignore */ }
}

// ── Live wiring ──────────────────────────────────────────────────────────────
// The checkpoint of the run in progress (null when the run is not savable).
let current = null

/** The death screen's retry, if this run has one left. */
export function retryAvailable(s) {
  return !!current && current.dead && !current.retryUsed && current.mapId === s.mapId && s.phase === 'dead'
}

/** Restart the dead run from its checkpoint (death screen). Returns false when no retry is left. */
export function retryFromCheckpoint(store) {
  const s = store.getState()
  if (!retryAvailable(s)) return false
  s.resumeRun(current, 'retry')
  return true
}

/** Start screen "Continue". Returns false when there is nothing to continue. */
export function continueSavedRun(store) {
  const s = store.getState()
  const save = continuableSave(readSave(), s.mapId)
  if (!save) return false
  s.resumeRun(save, resumeKind(save))
  return true
}

let unsub = null
/** Subscribe to phase changes (Game.jsx calls this once). Writes only on phase flips, never per frame. */
export function initRunSave(store) {
  if (unsub || typeof store?.getState !== 'function') return
  let prev = store.getState().phase
  let prevRunId = store.getState().runId
  unsub = store.subscribe((s) => {
    const newRun = s.runId !== prevRunId   // a run was just set up (also a restart from an intermission)
    prevRunId = s.runId
    if (s.phase === prev && !newRun) return
    const was = prev
    prev = s.phase
    if (s.phase === 'intermission' && (was !== 'intermission' || newRun)) {
      if (!isSavableRun(s)) { current = null; return }
      current = takeSnapshot(s, trackerRun)
      writeSave(current)
    } else if (!current) {
      return
    } else if (s.phase === 'playing' && was === 'intermission') {
      current = { ...current, midWave: true }
      writeSave(current)
    } else if (s.phase === 'wave_clear') {
      current = { ...current, midWave: false }
      writeSave(current)
    } else if (s.phase === 'dead') {
      current = { ...current, dead: true, midWave: false }
      if (current.retryUsed) { clearSave(); return }
      writeSave(current)
    }
  })
}

export function __resetRunSaveForTests() {
  unsub?.()
  unsub = null
  current = null
}

if (import.meta.hot) import.meta.hot.dispose(() => { unsub?.(); unsub = null })
