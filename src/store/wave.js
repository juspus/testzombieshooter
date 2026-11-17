// Wave and spawns: phase, wave counters, the zombie list, the intermission countdown, nextWave and tick.
import { buildGrid } from '../walls'
import { MAX_CORPSES } from '../fxConfig'
import { waveRandom } from '../rng'
import { rollModifier, modifiedZombieCount } from '../modifiers'
import { DIRECTOR, waveBudget } from '../director'
import { playerCollisionWalls, allWallSegments, activeSpawnClusters, intermissionForWave, zombiesForWave, speedForWave, dirDefending, dirWindowOpen } from './shared'
import { spawnZombies } from './spawns'
import { WAVE_REWARD, buildWaveBonusSummary } from './economy'
import { countPlanks } from './building'
import { cancelLastKillFx } from './combat'

let _corpseSeq = 0

// Wave and spawns: state and actions.
export const createWaveSlice = (set, get) => ({
  phase: 'start', // 'start' | 'intermission' | 'playing' | 'wave_clear' | 'dead'

  // ── Wave 3 wave modifiers ──
  // Modifier of the CURRENT `wave` (null | 'fog' | 'bloodlust' | 'blackout' | 'horde'). Rolled by the
  // host/solo when the wave's intermission begins (nextWave), so the intermission card can announce it.
  // Guests receive it via the next_wave / wave_start net events. Effects apply only while phase==='playing'.
  waveModifier: null,

  wave: 1,
  kills: 0,
  waveKills: 0,
  intermissionLeft: intermissionForWave(1),
  zombies: [],
  pendingSpawns: [],  // zombies queued to enter 10-per-frame
  nextId: 0,

  waveElapsed: 0,
  waveHeadshots: 0,
  waveKnifeKills: 0,

  runHeadshots: 0,    // run-total counters (cosmetic milestone stats only)
  runKnifeKills: 0,

  wavePlanksLost: 0,
  waveStartPlanks: 0,
  lastWaveBonuses: null,
  paused: false,

  // forcedMod: co-op guest passes the host's roll (null = none); undefined = roll here.
  nextWave: (forcedMod) => {
    const { wave: prevWave, windowPlanks, openDoors, money, bulletsInClip, reserveBullets, lastWaveBonuses } = get()
    const wave = prevWave + 1
    if (get().runMode === 'duel') {   // Seed Duel: cumulative kills at the end of the wave just cleared
      const d = get().duel
      const log = d.waveLog.slice(0, prevWave - 1)
      log[prevWave - 1] = get().kills
      set({ duel: { ...d, waveLog: log } })
    }
    const mailMod = get().mail.pendingModifier   // Zombie Mail Blackout from the rival
    const dirDef = dirDefending(get())   // The Director: the only modifier is the one the director buys (dir_mod)
    const waveModifier = dirDef ? null
      : forcedMod !== undefined ? forcedMod
      : mailMod ? mailMod
      : get().mpRole === 'guest' ? null : rollModifier(wave, get().waveModifier, waveRandom('mod', wave))
    buildGrid(allWallSegments(windowPlanks, openDoors))
    const walls = playerCollisionWalls(openDoors)
    set({
      phase: 'intermission',
      // Kill money (base + headshot / knife bonus) was already paid on each kill.
      money: money + WAVE_REWARD + (lastWaveBonuses?.total ?? 0),
      shopOpen: false,
      walls,
      wave,
      waveModifier,
      plankHits: {},
      waveKills: 0,
      intermissionLeft: dirDef ? DIRECTOR.INTERMISSION_S : intermissionForWave(wave),
      zombies: [],
      pendingSpawns: [],
      bulletsInClip,
      reserveBullets,
      isReloading: false,
      knifeCooldown: 0,
      waveElapsed: 0,
      waveHeadshots: 0,
      waveKnifeKills: 0,
      wavePlanksLost: 0,
      waveStartPlanks: 0,
      lastKillPending: false,
      mail: { ...get().mail, waveExtra: 0, pendingModifier: null },
      ...(dirDef ? { director: { ...get().director, budget: waveBudget(wave), windowLeft: 0, spawned: 0, nextMod: null, queued: [] } } : null),
    })
    cancelLastKillFx()
  },

  removeDyingZombie: (id) => {
    const { zombies, pendingSpawns, phase, wave, waveKills, waveHeadshots, waveKnifeKills, wavePlanksLost, waveStartPlanks, waveElapsed } = get()
    // ── Corpses ──────────────────────────────────────────────────────────────
    // A zombie whose death animation finished stays in `zombies` flagged
    // `corpse` (its component stays mounted, frozen — see Zombie.jsx) until the
    // wave ends (nextWave/startGame/wave_start reset `zombies`) or until more than
    // MAX_CORPSES exist, oldest first. Corpses are always `dying`, so every
    // active-count (`!z.dying`) ignores them.
    let newZombies = zombies.map((z) => z.id === id ? { ...z, corpse: true, corpseAt: ++_corpseSeq } : z)
    const corpses = newZombies.filter((z) => z.corpse)
    if (corpses.length > MAX_CORPSES) {
      let oldest = corpses[0]
      for (const c of corpses) if (c.corpseAt < oldest.corpseAt) oldest = c
      newZombies = newZombies.filter((z) => z.id !== oldest.id)
    }
    const activeCount = newZombies.filter((z) => !z.dying).length
    const isGuest = get().mpRole === 'guest'
    const waveOver = !isGuest && activeCount === 0 && pendingSpawns.length === 0 && phase === 'playing' && !get().lastKillPending && !dirWindowOpen(get())
    set(waveOver
      ? {
        zombies: newZombies,
        phase: 'wave_clear',
        lastWaveBonuses: buildWaveBonusSummary({
          wave,
          waveKills,
          waveHeadshots,
          waveKnifeKills,
          wavePlanksLost,
          waveStartPlanks,
          waveElapsed,
          modifier: get().waveModifier,
        }),
      }
      : { zombies: newZombies }
    )
  },

  tick: (delta, guestMode = false) => {
    const { phase, intermissionLeft, wave, nextId, windowPlanks, waveElapsed, paused } = get()
    if (paused) return
    if (phase === 'playing') {
      if (get().runMode === 'versus' && get().versus.mode === 'mail') get().mailTick(delta)
      if (dirDefending(get())) get().directorTick(delta)
      set({ waveElapsed: waveElapsed + delta })
      return
    }
    if (phase === 'intermission') {
      const next = intermissionLeft - delta
      if (next <= 0) {
        if (guestMode) {
          // Guest waits for host's wave_start event; just zero out the timer
          set({ intermissionLeft: 0 })
          return
        }
        if (dirDefending(get())) { get().directorStartWave(); return }   // The Director builds this wave
        const all = spawnZombies(wave, nextId, activeSpawnClusters(get().openDoors), get().waveModifier)
        const cap = Math.min(25, all.length)
        set({
          phase: 'playing',
          shopOpen: false,
          intermissionLeft: 0,
          zombies: all.slice(0, cap),
          pendingSpawns: all.slice(cap),
          nextId: nextId + all.length,
          waveElapsed: 0,
          waveHeadshots: 0,
          waveKnifeKills: 0,
          wavePlanksLost: 0,
          waveStartPlanks: countPlanks(windowPlanks),
        })
      } else {
        set({ intermissionLeft: next })
      }
    }
  },

  skipIntermission: () => {
    if (get().phase !== 'intermission') return
    if (dirDefending(get())) return   // the director needs the whole window to buy a modifier
    set({ intermissionLeft: 0 })
  },

  getZombieSpeed: () => speedForWave(get().wave),
  getZombiesForWave: () => {
    const s = get()
    // The Director: zombies spawned so far plus what the budget can still buy (at most 1 each).
    if (dirDefending(s)) return s.director.spawned + Math.max(0, Math.floor(s.director.budget))
    return modifiedZombieCount(zombiesForWave(s.wave), s.waveModifier) + s.mail.waveExtra
  },
})
