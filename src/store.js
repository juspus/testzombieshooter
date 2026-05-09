import { create } from 'zustand'
import { generateWalls, buildGrid } from './walls'

const WAVE_DURATION = 30
const CLIP_SIZE = 10
const bulletsForWave = (wave) => zombiesForWave(wave) * 2
const zombiesForWave = (wave) => 5 + (wave - 1) * 3
const speedForWave = (wave) => 1.5 + (wave - 1) * 0.15

export { CLIP_SIZE }

export const useGameStore = create((set, get) => ({
  phase: 'start', // 'start' | 'playing' | 'wave_clear' | 'game_over' | 'dead'
  walls: [],
  wave: 1,
  kills: 0,
  waveKills: 0,
  timeLeft: WAVE_DURATION,
  zombies: [],
  nextId: 0,
  bulletsInClip: CLIP_SIZE,
  reserveBullets: 0,
  isReloading: false,

  startGame: () => {
    const wave = 1
    const total = bulletsForWave(wave)
    const clip = Math.min(CLIP_SIZE, total)
    const walls = generateWalls()
    buildGrid(walls)
    set({
      phase: 'playing',
      walls,
      wave,
      kills: 0,
      waveKills: 0,
      timeLeft: WAVE_DURATION,
      zombies: spawnZombies(wave, 0),
      nextId: zombiesForWave(wave),
      bulletsInClip: clip,
      reserveBullets: total - clip,
      isReloading: false,
    })
  },

  nextWave: () => {
    const wave = get().wave + 1
    const nextId = get().nextId
    const total = bulletsForWave(wave)
    const clip = Math.min(CLIP_SIZE, total)
    set({
      phase: 'playing',
      wave,
      waveKills: 0,
      timeLeft: WAVE_DURATION,
      zombies: spawnZombies(wave, nextId),
      nextId: nextId + zombiesForWave(wave),
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
    const { phase, timeLeft } = get()
    if (phase !== 'playing') return
    const next = timeLeft - delta
    if (next <= 0) {
      set({ timeLeft: 0, phase: 'game_over' })
    } else {
      set({ timeLeft: next })
    }
  },

  die: () => {
    if (get().phase !== 'playing') return
    set({ phase: 'dead' })
  },

  getZombieSpeed: () => speedForWave(get().wave),
  getZombiesForWave: () => zombiesForWave(get().wave),
}))

function spawnZombies(wave, startId) {
  const count = zombiesForWave(wave)
  const zombies = []
  const radius = 18
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5
    const r = radius + Math.random() * 4
    zombies.push({
      id: startId + i,
      x: Math.cos(angle) * r,
      z: Math.sin(angle) * r,
      health: 2,
    })
  }
  return zombies
}
