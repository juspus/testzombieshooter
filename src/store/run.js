// Run setup: starting a run (normal, daily, seeded), the starting loadout, and the dev debug params.
import { buildGrid } from '../walls'
import { startSeededRun, endSeededRun } from '../rng'
import { dailyDate, dailyAttemptUsed, writeLocalDaily, canStartDaily } from '../daily'
import { emitGameEvent } from '../gameEvents'
import { effectiveLoadout, loadoutPatch, readPref, writePref, LOADOUT_PREF_KEY } from '../mapSelect'
import { debugForcedModifier } from '../modifiers'
import { allDoorsOpen } from '../doors'
import { createCoop } from '../coopDown'
import { getInitialMapId } from '../maps'
import { ALL_WEAPONS, WEAPONS } from '../weapons'
import { DOOR_DEFS, SPAWN_CLUSTERS, playerCollisionWalls, allWallSegments, intermissionForWave, bulletsForWave, clipSizeForWeapon, EMPTY_SAVED } from './shared'
import { CLIP_SIZE } from './weapons'
import { BASE_HP } from './player'
import { createVersus, mailClock, createMail } from './versus'
import { createDirector } from './director'
import { freshMachineState } from './machines'
import { cancelLastKillFx } from './combat'
import { spawnZombies } from './spawns'

let _pendingRun = null   // { mode, seed, ... } set by startDaily / startSeededGame, consumed by startGame

// Debug-only URL params for fast manual testing: ?wave=5&money=500&weapon=ak47
// Disabled on Vercel production builds (VITE_VERCEL_ENV is set via vite.config.js define).
function applyDebugOverrides(set, get) {
  if (import.meta.env.VITE_VERCEL_ENV === 'production') return
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  // ?doors=open — start with every door open (dev/preview only, like ?wave=/?money=).
  if (params.get('doors') === 'open' || params.has('bench')) applyDoorsOpen(set, get)
  if (params.has('bench')) applyBench(set)
  const forcedMod = debugForcedModifier()   // ?mod= — forces the first wave's modifier
  if (forcedMod) set({ waveModifier: forcedMod })
  if (!params.has('wave') && !params.has('money') && !params.has('weapon')) return

  const updates = {}

  const wave = parseInt(params.get('wave'), 10)
  if (wave > 1) {
    const total = bulletsForWave(wave)
    const clip = Math.min(CLIP_SIZE, total)
    updates.wave = wave
    updates.intermissionLeft = intermissionForWave(wave)
    updates.bulletsInClip = clip
    updates.reserveBullets = total - clip
  }

  const money = parseInt(params.get('money'), 10)
  if (!isNaN(money)) updates.money = money

  const weapon = params.get('weapon')
  if (ALL_WEAPONS.includes(weapon) && weapon !== 'pistol') {
    const clip = clipSizeForWeapon(weapon)
    updates.weapon = weapon
    updates.ownedWeapons = [...get().ownedWeapons, weapon]
    updates.bulletsInClip = clip
    updates.reserveBullets = WEAPONS[weapon].startReserve   // flamethrower 1000 fuel, crossbow 30, others 3 clips
  }

  set(updates)
}

function applyDoorsOpen(set, get) {
  const next = allDoorsOpen(DOOR_DEFS)
  buildGrid(allWallSegments(get().windowPlanks, next))
  set({ openDoors: next, walls: playerCollisionWalls(next) })
}

// ?bench — fixed stress scene for comparing builds on a real phone: wave 10, 25 live
// zombies (rest queued), huge HP so the scene stays put. Player placement lives in
// PerfOverlay.jsx (needs the camera). Combine with ?perf.
function applyBench(set) {
  const wave = 10
  // Seeded RNG so spawn jitter/types are identical on every load and every build.
  const realRandom = Math.random
  let seed = 0xC0FFEE
  Math.random = () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  let all
  try { all = spawnZombies(wave, 0, SPAWN_CLUSTERS) } finally { Math.random = realRandom }
  const cap = Math.min(25, all.length)
  const total = bulletsForWave(wave)
  const clip = Math.min(CLIP_SIZE, total)
  set({
    phase: 'playing',
    wave,
    zombies: all.slice(0, cap),
    pendingSpawns: all.slice(cap),
    nextId: all.length,
    waveElapsed: 0,
    bulletsInClip: clip,
    reserveBullets: total - clip,
    hp: 1e6,
    maxHp: 1e6,
  })
}

// Run setup: map, loadout, startGame, daily and seeded starts.
export const createRunSlice = (set, get) => ({
  mapId: getInitialMapId(), // which map's visuals/skybox to render — fixed for the session

  // ── Starting loadout (mapSelect.js) ──
  // Persisted pick; startGame applies it if the level reward is unlocked. Per player (co-op:
  // each side uses its own); Daily Run ignores it.
  loadoutId: readPref(LOADOUT_PREF_KEY) || 'pistol',
  setLoadout: (id) => { writePref(LOADOUT_PREF_KEY, id); set({ loadoutId: id }) },

  startGame: () => {
    // Seeded runs (startDaily / startSeededGame) leave a one-shot _pendingRun; any other
    // start is a normal run.
    const pending = _pendingRun
    _pendingRun = null
    const daily = pending?.mode === 'daily' ? pending : null
    // Any start that is not a versus run leaves the versus slice clean (solo after a match).
    if (pending?.mode !== 'versus') set({ versus: createVersus() })
    mailClock.t = 0
    if (pending) startSeededRun(pending.seed)
    else endSeededRun()
    // A run that never reached die() (e.g. a co-op guest whose 'die' event was
    // dropped, or a restart from intermission) still counts toward lifetime stats.
    const prevRun = get()
    if (prevRun.phase !== 'start' && prevRun.phase !== 'dead' && !prevRun.runRecorded) {
      get().recordRunEnd()
    }
    const wave = 1
    const total = bulletsForWave(wave)
    const clip = Math.min(CLIP_SIZE, total)
    // Wave 3 doors: every run starts sealed (debug ?doors=open overrides below).
    buildGrid(allWallSegments({}, {}))
    const walls = playerCollisionWalls({})
    set({
      phase: 'intermission',
      openDoors: {},
      nearDoorId: null,
      doorProgress: 0,
      ...freshMachineState(),
      money: 10,
      weapon: 'pistol',
      ownedWeapons: ['pistol'],
      savedClips:    { ...EMPTY_SAVED },
      savedReserves: { ...EMPTY_SAVED },
      activeItem: 'gun',
      perks: {},
      knifeCooldown: 0,
      shopOpen: false,
      walls,
      windowPlanks: {},
      windowPlankStrong: {},
      strongPlanksMode: false,
      plankHits: {},
      brokenWindows: {},
      wave,
      kills: 0,
      waveKills: 0,
      intermissionLeft: intermissionForWave(wave),
      zombies: [],
      pendingSpawns: [],
      nextId: 0,
      mail: createMail(),
      director: createDirector(),
      bulletsInClip: clip,
      reserveBullets: total - clip,
      isReloading: false,
      waveElapsed: 0,
      waveHeadshots: 0,
      waveKnifeKills: 0,
      runHeadshots: 0,
      runKnifeKills: 0,
      runRecorded: false,
      lastRunUnlocks: [],
      lastRunProgress: null,
      wavePlanksLost: 0,
      waveStartPlanks: 0,
      lastWaveBonuses: null,
      waveModifier: null,
      paused: false,
      hp: BASE_HP,
      maxHp: BASE_HP,
      helmet: null,
      bodyArmor: null,
      hitEventId: 0,
      lastKillPending: false,
      coop: createCoop(),   // W5: everyone starts standing
      runMode: pending ? pending.mode : 'normal',
      duel: { rival: pending?.mode === 'duel' ? pending.rival ?? null : null, waveLog: [], final: null },
      runSeed: pending ? pending.seed : null,
      dailyDate: daily ? daily.date : null,
      dailyRanked: daily ? daily.ranked : false,
      runRetryUsed: false,
      runContinued: false,
      statsBase: null,
    })
    cancelLastKillFx()
    get().resetPowerups()
    emitGameEvent('run_start')   // Wave 4 progression
    get().resetGrenades()

    // Starting loadout layered over the pistol start (no-op for the default and for every
    // seeded run: Daily and versus players all start on the same pistol).
    const lo = effectiveLoadout(get().loadoutId, get().stats, !!pending)
    if (lo.id !== 'pistol') {
      const cur = get()
      set(loadoutPatch(lo, { bulletsInClip: cur.bulletsInClip, reserveBullets: cur.reserveBullets, savedClips: cur.savedClips, savedReserves: cur.savedReserves }))
    }

    applyDebugOverrides(set, get)
    set({ runId: get().runId + 1 })   // last: runSave.js checkpoints the finished setup (loadout, debug params)
  },

  // ── Continue a run (src/runSave.js) ──
  runId: 0,              // bumped when a run is set up (startGame / resumeRun), after everything else
  runRetryUsed: false,   // this run spent its one death retry
  runContinued: false,   // retried or resumed mid-wave: the score stays off the boards
  statsBase: null,       // { kills, runHeadshots, runKnifeKills } already folded into lifetime stats (after a retry)

  // Rebuild a solo normal run from a wave-start checkpoint, back in that wave's intermission.
  // kind: 'resume' (between waves, after a reload), 'continued' (left mid-wave), 'retry' (after a death).
  resumeRun: (save, kind = 'resume') => {
    const st = save.state
    _pendingRun = null
    set({ versus: createVersus() })
    mailClock.t = 0
    endSeededRun()
    const retry = kind === 'retry'
    const openDoors = st.openDoors ?? {}
    const windowPlanks = st.windowPlanks ?? {}
    buildGrid(allWallSegments(windowPlanks, openDoors))
    const base = freshMachineState()
    set({
      ...st,
      phase: 'intermission',
      openDoors,
      windowPlanks,
      windowPlankStrong: st.windowPlankStrong ?? {},
      brokenWindows: st.brokenWindows ?? {},
      walls: playerCollisionWalls(openDoors),
      nearDoorId: null,
      doorProgress: 0,
      ...base,
      upgradedWeapons: st.upgradedWeapons ?? {},
      benchBusy: st.benchBusy ?? null,
      benchLeft: st.benchLeft ?? 0,
      box: st.box ? { ...base.box, ...st.box } : base.box,
      savedClips: { ...EMPTY_SAVED, ...st.savedClips },
      savedReserves: { ...EMPTY_SAVED, ...st.savedReserves },
      activeItem: 'gun',
      knifeCooldown: 0,
      shopOpen: false,
      plankHits: {},
      waveKills: 0,
      intermissionLeft: intermissionForWave(st.wave),
      zombies: [],
      pendingSpawns: [],
      mail: createMail(),
      director: createDirector(),
      isReloading: false,
      waveElapsed: 0,
      waveHeadshots: 0,
      waveKnifeKills: 0,
      runRecorded: false,
      lastRunUnlocks: [],
      lastRunProgress: null,
      wavePlanksLost: 0,
      waveStartPlanks: 0,
      lastWaveBonuses: null,
      paused: false,
      hitEventId: 0,
      lastKillPending: false,
      coop: createCoop(),
      runMode: 'normal',
      duel: { rival: null, waveLog: [], final: null },
      runSeed: null,
      dailyDate: null,
      dailyRanked: false,
      runRetryUsed: retry || !!save.retryUsed,
      runContinued: retry || kind === 'continued' || !!save.continued,
      // A death already counted everything up to it: count only what comes after the checkpoint.
      statsBase: retry ? { kills: st.kills, runHeadshots: st.runHeadshots, runKnifeKills: st.runKnifeKills } : (save.statsBase ?? null),
    })
    cancelLastKillFx()
    get().resetPowerups()
    set({ killsSinceDrop: st.killsSinceDrop ?? 0, lastDropType: st.lastDropType ?? null })
    emitGameEvent('run_start')
    // XP counters: a retry starts at zero (the death settled them), a resume picks them back up.
    emitGameEvent('run_resume', { wave: st.wave, counters: retry ? {} : (save.counters ?? {}) })
    set({ runId: get().runId + 1 })
  },

  // ── Daily seeded run ──
  // Same spawns/drops/box rolls for everyone that UTC day. Solo only. The first daily of a
  // UTC day is "ranked" (score submitted); later ones are practice. Returns false if blocked.
  runMode: 'normal',     // 'normal' | 'daily' | 'versus' (Zombie Mail) | 'duel' (Seed Duel)
  duel: { rival: null, waveLog: [], final: null },   // Seed Duel (src/duel.js): rival token, cumulative kills per cleared wave, final result
  runSeed: null,         // seed string of a seeded run (rng.js), null for a normal run
  dailyDate: null,       // 'YYYY-MM-DD' of the active daily
  dailyRanked: false,
  startDaily: (rankedOverride) => {
    const st = get()
    if (!canStartDaily({ mpRole: st.mpRole, mpConnected: st.mpConnected, mapId: st.mapId })) return false
    const date = dailyDate()
    const ranked = rankedOverride ?? !dailyAttemptUsed()
    if (ranked) writeLocalDaily({})   // burn the attempt at run start so quitting doesn't refund it
    _pendingRun = { mode: 'daily', seed: date, date, ranked }
    get().startGame()
    return true
  },

  // Versus runs (src/versus.js): same seed on both sides, default loadout, no leaderboard.
  // mode: 'versus' | 'duel'. Callers handle their own checks (lobby, duel link).
  startSeededGame: (mode, seed, opts) => {
    _pendingRun = { mode, seed: String(seed), rival: opts?.rival ?? null }
    get().startGame()
  },
})
