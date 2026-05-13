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
const DEEP_POCKETS_AMMO_PACK_AMOUNT = 30
const PERK_COSTS = {
  fast_hands: 80,
  deep_pockets: 60,
  iron_sights: 75,
  runners_breath: 90,
  carpenter: 65,
  knife_mastery: 70,
}
const bulletsForWave = (wave) => zombiesForWave(wave) + 5
const zombiesForWave = (wave) => 5 + (wave - 1) * 3
const speedForWave = (wave) => 1.5 + (wave - 1) * 0.05
const clipSizeForWeapon = (w) =>
  w === 'ak47' ? AK_CLIP : w === 'deagle' ? DEAGLE_CLIP : w === 'shotgun' ? SHOTGUN_CLIP : CLIP_SIZE

const HITS_PER_PLANK = 5
const PLANK_COST = 2.5
const STRONG_PLANK_COST = 20
const STRONG_HITS_PER_PLANK = 20
const WAVE_REWARD = 15
const ZOMBIE_KILL_REWARD = 1
const HEADSHOT_KILL_BONUS = 0.5
const KNIFE_KILL_BONUS = 2
const NO_PLANK_LOSS_BONUS = 10
const FAST_CLEAR_BONUS = 8
const fastClearParForWave = (wave) => 10 + wave * 2
export { CLIP_SIZE, AK_CLIP, AK_COST, DEAGLE_CLIP, DEAGLE_COST, SHOTGUN_CLIP, SHOTGUN_COST, AMMO_PACK_COST, AMMO_PACK_AMOUNT, DEEP_POCKETS_AMMO_PACK_AMOUNT, PERK_COSTS, HITS_PER_PLANK, PLANK_COST, STRONG_PLANK_COST, STRONG_HITS_PER_PLANK }

export const useGameStore = create((set, get) => ({
  phase: 'start', // 'start' | 'intermission' | 'playing' | 'wave_clear' | 'dead'
  money: 10,
  weapon: 'pistol',   // 'pistol' | 'ak47' | 'deagle'
  activeItem: 'gun',  // 'gun' | 'knife'
  perks: {},       // one-time perk unlocks bought from the supply chest
  knifeCooldown: 0,   // seconds remaining until knife ready again
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
    })
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

  hitZombie: (id, isHeadshot, source = 'gun') => {
    const { zombies, pendingSpawns, kills, waveKills, wave, waveElapsed, waveHeadshots, waveKnifeKills, wavePlanksLost, waveStartPlanks } = get()
    const zombie = zombies.find((z) => z.id === id)
    if (!zombie || zombie.dying) return

    const newHealth = isHeadshot ? 0 : zombie.health - 1

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
      const waveOver = activeCount === 0 && newPending.length === 0
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
    const waveOver = activeCount === 0 && pendingSpawns.length === 0 && phase === 'playing'
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

  tick: (delta) => {
    const { phase, intermissionLeft, wave, nextId, windowPlanks, waveElapsed } = get()
    if (phase === 'playing') {
      set({ waveElapsed: waveElapsed + delta })
      return
    }
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
    const { plankHits, windowPlanks, windowPlankStrong, wavePlanksLost } = get()
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
      set({ windowPlanks: newPlanks, windowPlankStrong: newStrong, plankHits: { ...plankHits, [id]: 0 }, wavePlanksLost: wavePlanksLost + 1 })
    } else {
      set({ plankHits: { ...plankHits, [id]: hits } })
    }
  },

  toggleItem: () => set((s) => ({ activeItem: s.activeItem === 'gun' ? 'knife' : 'gun' })),
  setKnifeCooldown: (v) => set({ knifeCooldown: v }),

  openShop: () => set({ shopOpen: true }),
  closeShop: () => set({ shopOpen: false }),

  buyItem: (itemId) => {
    const { money, weapon, reserveBullets, perks } = get()
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
      set({
        money: money - AMMO_PACK_COST,
        reserveBullets: reserveBullets + (perks.deep_pockets ? DEEP_POCKETS_AMMO_PACK_AMOUNT : AMMO_PACK_AMOUNT),
      })
      return true
    }
    return false
  },

  buyPerk: (perkId) => {
    const { money, perks } = get()
    const cost = PERK_COSTS[perkId]
    if (!cost || perks[perkId] || money < cost) return false
    set({ money: money - cost, perks: { ...perks, [perkId]: true } })
    return true
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

function countPlanks(windowPlanks) {
  return Object.values(windowPlanks).reduce((sum, count) => sum + count, 0)
}

function buildWaveBonusSummary({ wave, waveKills, waveHeadshots, waveKnifeKills, wavePlanksLost, waveStartPlanks, waveElapsed }) {
  const fastClearPar = fastClearParForWave(wave)
  const headshots = waveHeadshots * HEADSHOT_KILL_BONUS
  const knifeKills = waveKnifeKills * KNIFE_KILL_BONUS
  const noPlanksLost = waveStartPlanks > 0 && wavePlanksLost === 0 ? NO_PLANK_LOSS_BONUS : 0
  const fastClear = waveElapsed > 0 && waveElapsed <= fastClearPar ? FAST_CLEAR_BONUS : 0
  return {
    base: WAVE_REWARD,
    kills: waveKills * ZOMBIE_KILL_REWARD,
    headshots,
    knifeKills,
    noPlanksLost,
    fastClear,
    total: headshots + knifeKills + noPlanksLost + fastClear,
    elapsed: waveElapsed,
    fastClearPar,
    headshotsCount: waveHeadshots,
    knifeKillsCount: waveKnifeKills,
    planksLost: wavePlanksLost,
    startPlanks: waveStartPlanks,
  }
}

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
