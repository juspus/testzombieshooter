import { buildGrid } from '../walls'
import { playerCollisionWalls, cabinWallSegments, allWallSegments } from '../cabin'
import {
  CLIP_SIZE, EMPTY_SAVED, WAVE_REWARD, ZOMBIE_KILL_REWARD,
  bulletsForWave, intermissionForWave, zombiesForWave, speedForWave,
} from './constants'
import { spawnZombies, countPlanks, buildWaveBonusSummary } from './zombieSpawning'
import { applyDebugOverrides } from './debugOverrides'

export const createWaveSlice = (set, get) => ({
  phase: 'start', // 'start' | 'intermission' | 'playing' | 'wave_clear' | 'dead'
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
  wavePlanksLost: 0,
  waveStartPlanks: 0,
  lastWaveBonuses: null,

  startGame: () => {
    const wave = 1
    const total = bulletsForWave(wave)
    const clip = Math.min(CLIP_SIZE, total)
    buildGrid(cabinWallSegments())
    const walls = playerCollisionWalls()
    set({
      phase: 'intermission',
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
      wave,
      kills: 0,
      waveKills: 0,
      intermissionLeft: intermissionForWave(wave),
      zombies: [],
      pendingSpawns: [],
      nextId: 0,
      bulletsInClip: clip,
      reserveBullets: total - clip,
      isReloading: false,
      waveElapsed: 0,
      waveHeadshots: 0,
      waveKnifeKills: 0,
      wavePlanksLost: 0,
      waveStartPlanks: 0,
      lastWaveBonuses: null,
      paused: false,
    })

    applyDebugOverrides(set, get)
  },

  nextWave: () => {
    const { wave: prevWave, windowPlanks, money, bulletsInClip, reserveBullets, waveKills: prevWaveKills, lastWaveBonuses } = get()
    const wave = prevWave + 1
    buildGrid(allWallSegments(windowPlanks))
    const walls = playerCollisionWalls()
    set({
      phase: 'intermission',
      money: money + WAVE_REWARD + (prevWaveKills * ZOMBIE_KILL_REWARD) + (lastWaveBonuses?.total ?? 0),
      shopOpen: false,
      walls,
      wave,
      plankHits: {},
      waveKills: 0,
      intermissionLeft: intermissionForWave(wave),
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
    })
  },

  hitZombie: (id, isHeadshot, source = 'gun') => {
    const { zombies, pendingSpawns, kills, waveKills, wave, waveElapsed, waveHeadshots, waveKnifeKills, wavePlanksLost, waveStartPlanks } = get()
    const zombie = zombies.find((z) => z.id === id)
    if (!zombie || zombie.dying) return

    const newHealth = isHeadshot ? zombie.health - 3 : zombie.health - 1

    if (newHealth <= 0) {
      const newKills = kills + 1
      const newWaveKills = waveKills + 1
      const newWaveHeadshots = waveHeadshots + (source === 'gun' && isHeadshot ? 1 : 0)
      const newWaveKnifeKills = waveKnifeKills + (source === 'knife' ? 1 : 0)
      // Immediately slot in the next pending zombie so the active count stays at the cap
      const nextPending = pendingSpawns.length > 0 ? pendingSpawns[0] : null
      const newPending = nextPending ? pendingSpawns.slice(1) : pendingSpawns
      // Mark killed zombie as dying (animation plays before removal)
      const newZombies = zombies.map((z) => z.id === id ? { ...z, health: 0, dying: true } : z)
      const withNext = nextPending ? [...newZombies, nextPending] : newZombies
      const activeCount = withNext.filter((z) => !z.dying).length
      const isGuest = get().mpRole === 'guest'
      const waveOver = !isGuest && activeCount === 0 && newPending.length === 0
      const statUpdate = {
        zombies: withNext,
        pendingSpawns: newPending,
        kills: newKills,
        waveKills: newWaveKills,
        waveHeadshots: newWaveHeadshots,
        waveKnifeKills: newWaveKnifeKills,
      }
      set(waveOver
        ? {
          ...statUpdate,
          phase: 'wave_clear',
          lastWaveBonuses: buildWaveBonusSummary({
            wave,
            waveKills: newWaveKills,
            waveHeadshots: newWaveHeadshots,
            waveKnifeKills: newWaveKnifeKills,
            wavePlanksLost,
            waveStartPlanks,
            waveElapsed,
          }),
        }
        : statUpdate
      )
      return true
    } else {
      set({ zombies: zombies.map((z) => z.id === id ? { ...z, health: newHealth } : z) })
      return false
    }
  },

  removeDyingZombie: (id) => {
    const { zombies, pendingSpawns, phase, wave, waveKills, waveHeadshots, waveKnifeKills, wavePlanksLost, waveStartPlanks, waveElapsed } = get()
    const newZombies = zombies.filter((z) => z.id !== id)
    const activeCount = newZombies.filter((z) => !z.dying).length
    const isGuest = get().mpRole === 'guest'
    const waveOver = !isGuest && activeCount === 0 && pendingSpawns.length === 0 && phase === 'playing'
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
        }),
      }
      : { zombies: newZombies }
    )
  },

  tick: (delta, guestMode = false) => {
    const { phase, intermissionLeft, wave, nextId, windowPlanks, waveElapsed, paused } = get()
    if (paused) return
    if (phase === 'playing') {
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
        const all = spawnZombies(wave, nextId)
        const cap = Math.min(25, all.length)
        set({
          phase: 'playing',
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

  die: () => {
    if (get().phase !== 'playing') return
    set({ phase: 'dead' })
  },

  skipIntermission: () => {
    if (get().phase !== 'intermission') return
    set({ intermissionLeft: 0 })
  },

  getZombieSpeed: () => speedForWave(get().wave),
  getZombiesForWave: () => zombiesForWave(get().wave),
})
