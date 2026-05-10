import { create } from 'zustand'
import { buildGrid } from './walls'
import { playerCollisionWalls, cabinWallSegments, allWallSegments, SPAWN_CLUSTERS } from './cabin'
import { playPlankBreak } from './sounds'

const INTERMISSION_DURATION = 10
const CLIP_SIZE = 10
const bulletsForWave = (wave) => zombiesForWave(wave) * 2
const zombiesForWave = (wave) => 5 + (wave - 1) * 3
const speedForWave = (wave) => 1.5 + (wave - 1) * 0.15

const HITS_PER_PLANK = 5   // zombie hits to break one plank
export { CLIP_SIZE, HITS_PER_PLANK }

export const useGameStore = create((set, get) => ({
  phase: 'start', // 'start' | 'intermission' | 'playing' | 'wave_clear' | 'dead'
  walls: [],
  windowPlanks: {},  // { [windowId]: 1 | 2 }
  plankHits: {},     // { [windowId]: hitCount } toward next plank break
  nearWindowId: -1,  // window the player is currently standing near (-1 = none)
  boardingProgress: 0,  // 0–1, fraction of 2s hold complete
  wave: 1,
  kills: 0,
  waveKills: 0,
  intermissionLeft: INTERMISSION_DURATION,
  zombies: [],
  nextId: 0,
  bulletsInClip: CLIP_SIZE,
  reserveBullets: 0,
  isReloading: false,

  startGame: () => {
    const wave = 1
    const total = bulletsForWave(wave)
    const clip = Math.min(CLIP_SIZE, total)
    buildGrid(cabinWallSegments())
    const walls = playerCollisionWalls()
    set({
      phase: 'intermission',
      walls,
      windowPlanks: {},
      plankHits: {},
      wave,
      kills: 0,
      waveKills: 0,
      intermissionLeft: INTERMISSION_DURATION,
      zombies: [],
      nextId: 0,
      bulletsInClip: clip,
      reserveBullets: total - clip,
      isReloading: false,
    })
  },

  nextWave: () => {
    const { wave: prevWave, nextId, windowPlanks } = get()
    const wave = prevWave + 1
    const total = bulletsForWave(wave)
    const clip = Math.min(CLIP_SIZE, total)
    buildGrid(allWallSegments(windowPlanks))
    const walls = playerCollisionWalls()
    set({
      phase: 'intermission',
      walls,
      wave,
      plankHits: {},
      waveKills: 0,
      intermissionLeft: INTERMISSION_DURATION,
      zombies: [],
      bulletsInClip: clip,
      reserveBullets: total - clip,
      isReloading: false,
    })
  },

  consumeBullet: () => {
    const { bulletsInClip, isReloading } = get()
    if (isReloading || bulletsInClip <= 0) return false
    set({ bulletsInClip: bulletsInClip - 1 })
    return true
  },

  beginReload: () => {
    const { bulletsInClip, reserveBullets, isReloading } = get()
    if (isReloading || reserveBullets === 0 || bulletsInClip === CLIP_SIZE) return false
    set({ isReloading: true })
    return true
  },

  addBullets: (count) => {
    set({ reserveBullets: get().reserveBullets + count })
  },

  finishReload: () => {
    const { bulletsInClip, reserveBullets } = get()
    const toLoad = Math.min(CLIP_SIZE - bulletsInClip, reserveBullets)
    set({ bulletsInClip: bulletsInClip + toLoad, reserveBullets: reserveBullets - toLoad, isReloading: false })
  },

  hitZombie: (id, isHeadshot) => {
    const { zombies, kills, waveKills } = get()
    const zombie = zombies.find((z) => z.id === id)
    if (!zombie) return

    const newHealth = isHeadshot ? 0 : zombie.health - 1

    if (newHealth <= 0) {
      const remaining = zombies.filter((z) => z.id !== id)
      const newKills = kills + 1
      const newWaveKills = waveKills + 1
      set(remaining.length === 0
        ? { zombies: remaining, kills: newKills, waveKills: newWaveKills, phase: 'wave_clear' }
        : { zombies: remaining, kills: newKills, waveKills: newWaveKills }
      )
      return true
    } else {
      set({ zombies: zombies.map((z) => z.id === id ? { ...z, health: newHealth } : z) })
      return false
    }
  },

  tick: (delta) => {
    const { phase, intermissionLeft, wave, nextId } = get()
    if (phase === 'intermission') {
      const next = intermissionLeft - delta
      if (next <= 0) {
        set({
          phase: 'playing',
          intermissionLeft: 0,
          zombies: spawnZombies(wave, nextId),
          nextId: nextId + zombiesForWave(wave),
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

  addPlank: (id) => {
    const { windowPlanks } = get()
    const current = windowPlanks[id] ?? 0
    if (current >= 2) return false
    const newPlanks = { ...windowPlanks, [id]: current + 1 }
    buildGrid(allWallSegments(newPlanks))
    set({ windowPlanks: newPlanks })
    return true
  },

  hitPlank: (id) => {
    const { plankHits, windowPlanks } = get()
    if ((windowPlanks[id] ?? 0) === 0) return
    const hits = (plankHits[id] ?? 0) + 1
    if (hits >= HITS_PER_PLANK) {
      const newPlanks = { ...windowPlanks, [id]: windowPlanks[id] - 1 }
      buildGrid(allWallSegments(newPlanks))
      playPlankBreak()
      set({ windowPlanks: newPlanks, plankHits: { ...plankHits, [id]: 0 } })
    } else {
      set({ plankHits: { ...plankHits, [id]: hits } })
    }
  },

  setNearWindowId: (id) => set({ nearWindowId: id }),
  setBoardingProgress: (v) => set({ boardingProgress: v }),

  getZombieSpeed: () => speedForWave(get().wave),
  getZombiesForWave: () => zombiesForWave(get().wave),
}))

function spawnZombies(wave, startId) {
  const count = zombiesForWave(wave)
  const zombies = []
  for (let i = 0; i < count; i++) {
    const cluster = SPAWN_CLUSTERS[i % SPAWN_CLUSTERS.length]
    const angle = Math.random() * Math.PI * 2
    const r = 1.0 + Math.random() * 3.0
    zombies.push({
      id: startId + i,
      x: cluster.x + Math.cos(angle) * r,
      z: cluster.z + Math.sin(angle) * r,
      health: 2,
    })
  }
  return zombies
}
