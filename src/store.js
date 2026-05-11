import { create } from 'zustand'
import { buildGrid } from './walls'
import { playerCollisionWalls, cabinWallSegments, allWallSegments, SPAWN_CLUSTERS } from './cabin'
import { playPlankBreak } from './sounds'
//
const intermissionForWave = (wave) => 10 + (wave - 1) * 5
const CLIP_SIZE = 10
const AK_CLIP = 30
const AK_COST = 270
const DEAGLE_CLIP = 7
const DEAGLE_COST = 700
const SHOTGUN_CLIP = 8
const SHOTGUN_COST = 150
const AMMO_PACK_COST = 10
const AMMO_PACK_AMOUNT = 20
const bulletsForWave = (wave) => zombiesForWave(wave) + 5
const zombiesForWave = (wave) => 5 + (wave - 1) * 3
const speedForWave = (wave) => 1.5 + (wave - 1) * 0.15
const clipSizeForWeapon = (w) =>
  w === 'ak47' ? AK_CLIP : w === 'deagle' ? DEAGLE_CLIP : w === 'shotgun' ? SHOTGUN_CLIP : CLIP_SIZE

const HITS_PER_PLANK = 5
const PLANK_COST = 2.5
const STRONG_PLANK_COST = 20
const STRONG_HITS_PER_PLANK = 20
const WAVE_REWARD = 15
export { CLIP_SIZE, AK_CLIP, AK_COST, DEAGLE_CLIP, DEAGLE_COST, SHOTGUN_CLIP, SHOTGUN_COST, AMMO_PACK_COST, AMMO_PACK_AMOUNT, HITS_PER_PLANK, PLANK_COST, STRONG_PLANK_COST, STRONG_HITS_PER_PLANK }

export const useGameStore = create((set, get) => ({
  phase: 'start', // 'start' | 'intermission' | 'playing' | 'wave_clear' | 'dead'
  money: 10,
  weapon: 'pistol',   // 'pistol' | 'ak47' | 'deagle'
  shopOpen: false,
  nearChest: false,
  walls: [],
  windowPlanks: {},       // { [windowId]: 1 | 2 }
  windowPlankStrong: {},  // { [windowId]: true } when planks at that window are reinforced
  strongPlanksMode: false,
  plankHits: {},          // { [windowId]: hitCount } toward next plank break
  nearWindowId: -1,  // window the player is currently standing near (-1 = none)
  boardingProgress: 0,  // 0–1, fraction of 2s hold complete
  skipProgress: 0,      // 0–1, fraction of hold-T skip complete
  wave: 1,
  kills: 0,
  waveKills: 0,
  intermissionLeft: intermissionForWave(1),
  zombies: [],
  pendingSpawns: [],  // zombies queued to enter 10-per-frame
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
      money: 5000,
      weapon: 'pistol',
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
    })
  },

  nextWave: () => {
    const { wave: prevWave, nextId, windowPlanks, money, bulletsInClip, reserveBullets } = get()
    const wave = prevWave + 1
    buildGrid(allWallSegments(windowPlanks))
    const walls = playerCollisionWalls()
    set({
      phase: 'intermission',
      money: money + WAVE_REWARD,
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
    })
  },

  consumeBullet: () => {
    const { bulletsInClip, isReloading } = get()
    if (isReloading || bulletsInClip <= 0) return false
    set({ bulletsInClip: bulletsInClip - 1 })
    return true
  },

  beginReload: () => {
    const { bulletsInClip, reserveBullets, isReloading, weapon } = get()
    const clipSize = clipSizeForWeapon(weapon)
    if (isReloading || reserveBullets === 0 || bulletsInClip === clipSize) return false
    set({ isReloading: true })
    return true
  },

  finishReload: () => {
    const { bulletsInClip, reserveBullets, weapon } = get()
    const clipSize = clipSizeForWeapon(weapon)
    const toLoad = Math.min(clipSize - bulletsInClip, reserveBullets)
    set({ bulletsInClip: bulletsInClip + toLoad, reserveBullets: reserveBullets - toLoad, isReloading: false })
  },

  hitZombie: (id, isHeadshot) => {
    const { zombies, pendingSpawns, kills, waveKills } = get()
    const zombie = zombies.find((z) => z.id === id)
    if (!zombie) return

    const newHealth = isHeadshot ? 0 : zombie.health - 1

    if (newHealth <= 0) {
      const remaining = zombies.filter((z) => z.id !== id)
      const newKills = kills + 1
      const newWaveKills = waveKills + 1
      // Immediately slot in the next pending zombie so the active count stays at the cap
      const nextPending = pendingSpawns.length > 0 ? pendingSpawns[0] : null
      const newZombies = nextPending ? [...remaining, nextPending] : remaining
      const newPending = nextPending ? pendingSpawns.slice(1) : pendingSpawns
      const waveOver = newZombies.length === 0 && newPending.length === 0
      set(waveOver
        ? { zombies: newZombies, pendingSpawns: newPending, kills: newKills, waveKills: newWaveKills, phase: 'wave_clear' }
        : { zombies: newZombies, pendingSpawns: newPending, kills: newKills, waveKills: newWaveKills }
      )
      return true
    } else {
      set({ zombies: zombies.map((z) => z.id === id ? { ...z, health: newHealth } : z) })
      return false
    }
  },

  tick: (delta) => {
    const { phase, intermissionLeft, wave, nextId, zombies, pendingSpawns } = get()
    if (phase === 'intermission') {
      const next = intermissionLeft - delta
      if (next <= 0) {
        const all = spawnZombies(wave, nextId)
        const cap = Math.min(25, all.length)
        set({
          phase: 'playing',
          intermissionLeft: 0,
          zombies: all.slice(0, cap),
          pendingSpawns: all.slice(cap),
          nextId: nextId + all.length,
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
    const { plankHits, windowPlanks, windowPlankStrong } = get()
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
      set({ windowPlanks: newPlanks, windowPlankStrong: newStrong, plankHits: { ...plankHits, [id]: 0 } })
    } else {
      set({ plankHits: { ...plankHits, [id]: hits } })
    }
  },

  openShop: () => set({ shopOpen: true }),
  closeShop: () => set({ shopOpen: false }),

  buyItem: (itemId) => {
    const { money, weapon, reserveBullets } = get()
    if (itemId === 'ak47') {
      if (weapon === 'ak47' || money < AK_COST) return false
      set({ money: money - AK_COST, weapon: 'ak47', bulletsInClip: AK_CLIP, reserveBullets: 0 })
      return true
    }
    if (itemId === 'deagle') {
      if (weapon === 'deagle' || money < DEAGLE_COST) return false
      set({ money: money - DEAGLE_COST, weapon: 'deagle', bulletsInClip: DEAGLE_CLIP, reserveBullets: 0 })
      return true
    }
    if (itemId === 'shotgun') {
      if (weapon === 'shotgun' || money < SHOTGUN_COST) return false
      set({ money: money - SHOTGUN_COST, weapon: 'shotgun', bulletsInClip: SHOTGUN_CLIP, reserveBullets: 0 })
      return true
    }
    if (itemId === 'ammo_pack') {
      if (money < AMMO_PACK_COST) return false
      set({ money: money - AMMO_PACK_COST, reserveBullets: reserveBullets + AMMO_PACK_AMOUNT })
      return true
    }
    return false
  },

  skipIntermission: () => {
    if (get().phase !== 'intermission') return
    set({ intermissionLeft: 0 })
  },

  toggleStrongPlanksMode: () => set({ strongPlanksMode: !get().strongPlanksMode }),

  setNearWindowId: (id) => set({ nearWindowId: id }),
  setBoardingProgress: (v) => set({ boardingProgress: v }),
  setSkipProgress: (v) => set({ skipProgress: v }),
  setNearChest: (v) => set({ nearChest: v }),

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
