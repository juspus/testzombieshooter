// The Director (src/director.js, src/directorFlow.js, src/directorRuntime.js): turns, spawn window, scoring.
import { keyedRandom } from '../rng'
import { DIRECTOR, waveBudget, canBuy, unitDef, modDef, autoFill, firstDefender } from '../director'
import { turnIndex, validTurn, firstWave, cleanTurn, roundWinner, resultFor, resolveCluster } from '../directorFlow'
import { SPAWN_CLUSTERS, activeSpawnClusters, dirDefending, dirWindowOpen } from './shared'
import { buildMailZombies, placeDirectorZombies } from './spawns'
import { buildWaveBonusSummary } from './economy'
import { countPlanks } from './building'
import { cancelLastKillFx } from './combat'

// The Director (src/director.js, src/directorFlow.js, src/directorRuntime.js). One versus mode where
// one player defends their own world while the other builds its waves from a budget.
// role: 'defender' | 'director' | null (between turns / over); side: which player THIS client is;
// stage: 'off' | 'turn' | 'between' | 'over'; turn: index of the current/last turn (turnIndex);
// budget / windowLeft: the defender's wave budget left and seconds left to spend it (0 = closed);
// spawned: director zombies spawned this wave (HUD total); spawnSeen / modSeen: accepted message ids.
export const createDirector = () => ({
  active: false, role: null, round: 1, defender: 'host', view: null, turns: {}, rounds: [], result: null,
  side: 'host', stage: 'off', turn: 0,
  budget: 0, windowLeft: 0, spawned: 0, spawnSeen: [], modSeen: [], nextMod: null,
  queued: [], turnDamage: 0, turnCleared: 0, betweenAt: 0, ready: { me: false, rival: false },
})

// The Director: state and actions.
export const createDirectorSlice = (set, get) => ({
  director: createDirector(),

  // ── The Director (src/director.js): turns, spawn window, scoring ──────────────
  // Start of a match (both players). `side` is which player THIS client is. Round 1: host defends.
  startDirector: (side) => {
    set({ director: { ...createDirector(), active: true, side: side === 'guest' ? 'guest' : 'host', stage: 'turn' } })
    get().beginDirectorTurn(1, firstDefender(1))
  },

  // Begin one turn. The defender gets a fresh intermission on the round's first wave (their run
  // carries over: money, weapons, planks, perks); the director's own world is frozen and empty.
  // Idempotent per turn: a repeat for the turn that is already running is ignored.
  beginDirectorTurn: (round, defender) => {
    const s = get()
    const d = s.director
    if (!d.active || !validTurn(round, defender) || d.result) return false
    const turn = turnIndex(round, defender)
    if (d.stage === 'turn' && d.turn === turn && d.round === round && d.role) return false
    const role = defender === d.side ? 'defender' : 'director'
    const wave = firstWave(round)
    cancelLastKillFx()
    get().resetPowerups()
    set({
      director: {
        ...d, round, defender, role, turn, stage: 'turn', view: null,
        budget: waveBudget(wave), windowLeft: 0, spawned: 0, spawnSeen: [], modSeen: [], nextMod: null, queued: [],
        turnDamage: 0, turnCleared: 0, betweenAt: 0, ready: { me: false, rival: false },
      },
      phase: 'intermission',
      wave,
      zombies: [],
      pendingSpawns: [],
      waveModifier: null,
      shopOpen: false,
      lastKillPending: false,
      isReloading: false,
      waveKills: 0,
      waveElapsed: 0,
      waveHeadshots: 0,
      waveKnifeKills: 0,
      wavePlanksLost: 0,
      waveStartPlanks: 0,
      plankHits: {},
      lastWaveBonuses: null,
      intermissionLeft: DIRECTOR.INTERMISSION_S,
      hp: s.maxHp,
      paused: role !== 'defender',
    })
    return true
  },

  // Defender: the intermission ran out. Nothing spawns by itself; the spawn window opens.
  directorStartWave: () => {
    const s = get()
    if (!dirDefending(s)) return false
    // Spawns the director pre-placed during the intermission land now.
    const clusters = activeSpawnClusters(s.openDoors)
    const made = []
    s.director.queued.forEach((q, i) => {
      const ci = Math.max(0, resolveCluster(q.cluster, SPAWN_CLUSTERS, clusters))
      made.push(...buildMailZombies({ id: `d${q.key}` }, [q.type], s.nextId + i, clusters[ci], s.waveModifier))
    })
    const placed = placeDirectorZombies({ zombies: [], pendingSpawns: [] }, made)
    set({
      phase: 'playing',
      shopOpen: false,
      intermissionLeft: 0,
      ...placed,
      nextId: s.nextId + made.length,
      waveElapsed: 0,
      waveHeadshots: 0,
      waveKnifeKills: 0,
      wavePlanksLost: 0,
      waveStartPlanks: countPlanks(s.windowPlanks),
      director: { ...s.director, windowLeft: DIRECTOR.SPAWN_WINDOW_S, queued: [] },
    })
    return true
  },

  // Per-frame (from tick) while a defended wave is playing: runs the spawn window clock.
  directorTick: (delta) => {
    const s = get()
    if (!dirWindowOpen(s)) return
    const left = s.director.windowLeft - delta
    if (left > 0) set({ director: { ...s.director, windowLeft: left } })
    else get().directorCloseWindow()
  },

  // The window is over: spend what is left as walkers spread over the clusters, then check for a clear.
  directorCloseWindow: () => {
    const s = get()
    if (!dirDefending(s) || s.phase !== 'playing' || s.director.windowLeft <= 0) return false
    const fill = autoFill(s.director.budget)
    const clusters = activeSpawnClusters(s.openDoors)
    const made = []
    fill.forEach((type, i) => {
      const ci = Math.min(clusters.length - 1, Math.floor(keyedRandom('dir-fill', `${s.wave}-${i}`) * clusters.length))
      made.push(...buildMailZombies({ id: `fill${s.wave}-${i}` }, [type], s.nextId + i, clusters[ci] ?? clusters[0], s.waveModifier))
    })
    set({
      ...placeDirectorZombies(s, made),
      nextId: s.nextId + made.length,
      director: { ...s.director, windowLeft: 0, budget: 0, spawned: s.director.spawned + made.length },
    })
    get().directorCheckClear()
    return true
  },

  // Wave clear once the window is over and every zombie is dead (the normal paths hold back while it is open).
  directorCheckClear: () => {
    const s = get()
    if (!dirDefending(s) || s.phase !== 'playing' || s.director.windowLeft > 0 || s.lastKillPending) return false
    if (s.pendingSpawns.length || s.zombies.some((z) => !z.dying)) return false
    set({
      phase: 'wave_clear',
      lastWaveBonuses: buildWaveBonusSummary({
        wave: s.wave, waveKills: s.waveKills, waveHeadshots: s.waveHeadshots, waveKnifeKills: s.waveKnifeKills,
        wavePlanksLost: s.wavePlanksLost, waveStartPlanks: s.waveStartPlanks, waveElapsed: s.waveElapsed, modifier: s.waveModifier,
      }),
    })
    return true
  },

  // dir_spawn from the director. Returns 'ok' or why it was refused.
  directorSpawn: ({ id, type, cluster } = {}) => {
    const s = get()
    const d = s.director
    const pre = dirDefending(s) && s.phase === 'intermission'   // pre-placed: lands when the wave starts
    if (!pre && (!dirWindowOpen(s) || s.phase !== 'playing')) return 'closed'
    if ((typeof id !== 'string' && typeof id !== 'number') || id === '') return 'bad'
    const key = String(id)
    if (d.spawnSeen.includes(key)) return 'dup'
    const unit = unitDef(type)
    if (!canBuy(unit, s.wave, d.budget)) return 'rejected'
    const clusters = activeSpawnClusters(s.openDoors)
    const ci = resolveCluster(cluster, SPAWN_CLUSTERS, clusters)
    if (ci < 0) return 'bad'
    if (pre) {
      set({ director: { ...d, budget: d.budget - unit.cost, spawned: d.spawned + 1, spawnSeen: [...d.spawnSeen, key], queued: [...d.queued, { key, type: unit.id, cluster }] } })
      return 'ok'
    }
    const made = buildMailZombies({ id: `d${key}` }, [unit.id], s.nextId, clusters[ci], s.waveModifier)
    set({
      ...placeDirectorZombies(s, made),
      nextId: s.nextId + 1,
      director: { ...d, budget: d.budget - unit.cost, spawned: d.spawned + 1, spawnSeen: [...d.spawnSeen, key] },
    })
    return 'ok'
  },

  // dir_mod: a modifier for the NEXT wave, bought from its budget; only in the intermission before it.
  directorMod: ({ id, mod } = {}) => {
    const s = get()
    const d = s.director
    if (!dirDefending(s) || s.phase !== 'intermission') return 'closed'
    if ((typeof id !== 'string' && typeof id !== 'number') || id === '') return 'bad'
    const key = String(id)
    if (d.modSeen.includes(key)) return 'dup'
    if (d.nextMod) return 'rejected'   // one per wave
    const def = modDef(mod)
    if (!canBuy(def, s.wave, d.budget)) return 'rejected'
    set({ waveModifier: def.id, director: { ...d, budget: d.budget - def.cost, nextMod: def.id, modSeen: [...d.modSeen, key] } })
    return 'ok'
  },

  // A wave was fully cleared (phase flipped to wave_clear, see the subscription below).
  directorWaveCleared: () => {
    const s = get()
    if (!dirDefending(s)) return false
    set({ director: { ...s.director, turnCleared: s.director.turnCleared + 1 } })
    return true
  },

  // Defender: the turn is over (last wave cleared, or died). Returns the result, null when no turn runs.
  directorEndTurn: (died = false) => {
    const s = get()
    const d = s.director
    if (!dirDefending(s)) return null
    const result = { wavesCleared: Math.min(DIRECTOR.WAVES_PER_TURN, d.turnCleared), damageTaken: Math.round(d.turnDamage), died: !!died }
    cancelLastKillFx()
    set({
      phase: 'intermission', zombies: [], pendingSpawns: [], waveModifier: null, shopOpen: false,
      lastKillPending: false, isReloading: false, hp: s.maxHp, paused: true,
    })
    get().recordDirectorTurn(d.round, d.side, result)
    return result
  },

  // Store one finished turn (mine, or the rival's dir_turn). Idempotent. Moves to the between-turns
  // card; once both turns of a round are in, scores the round and ends the match when decided.
  recordDirectorTurn: (round, side, turnResult) => {
    const s = get()
    const d = s.director
    const res = cleanTurn(turnResult)
    if (!d.active || !res || (side !== 'host' && side !== 'guest') || d.turns[round]?.[side]) return false
    const turns = { ...d.turns, [round]: { host: null, guest: null, ...d.turns[round], [side]: res } }
    let rounds = d.rounds
    const w = roundWinner(turns, round)
    if (w && rounds.length === round - 1) rounds = [...rounds, w]
    set({ director: { ...d, turns, rounds, role: null, stage: 'between', windowLeft: 0, budget: 0, betweenAt: Date.now(), ready: { me: false, rival: false } }, paused: true })
    const outcome = resultFor(rounds, d.side)
    if (outcome) get().finishVersus(outcome, 'director')
    return true
  },

  // dir_turn from the rival defender (the current turn only).
  receiveDirectorTurn: ({ round, wavesCleared, damageTaken, died } = {}) => {
    const d = get().director
    if (!d.active || d.stage !== 'turn' || d.role !== 'director' || round !== d.round) return false
    return get().recordDirectorTurn(round, d.defender, { wavesCleared, damageTaken, died })
  },

  // dir_next from the host: begin the turn right after the one that just finished.
  directorNext: ({ round, defender } = {}) => {
    const d = get().director
    if (!d.active || d.stage !== 'between' || d.result || !validTurn(round, defender)) return false
    if (turnIndex(round, defender) !== d.turn + 1) return false
    return get().beginDirectorTurn(round, defender)
  },

  setDirectorReady: (who) => set((s) => ({ director: { ...s.director, ready: { ...s.director.ready, [who]: true } } })),

  // Director side: remember the defender's latest dir_state (current turn only).
  setDirectorView: (view) => {
    const d = get().director
    if (!d.active || d.role !== 'director' || !view || view.round !== d.round) return false
    set({ director: { ...d, view } })
    return true
  },
})
