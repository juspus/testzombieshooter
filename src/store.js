import { create } from 'zustand'
import { buildGrid } from './walls'
import { getMap, getInitialMapId } from './maps'
import { playPlankBreak, playGlassShatter } from './sounds'

// Map is chosen once (debug ?map= param) and fixed for the whole session.
const ACTIVE_MAP = getMap(getInitialMapId())
const { playerCollisionWalls, wallSegments, allWallSegments, SPAWN_CLUSTERS } = ACTIVE_MAP
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
const FLAMETHROWER_COST = 1500
const FLAMETHROWER_START_AMMO = 1000
const FLAMETHROWER_AMMO_PACK_COST = 100
const FLAMETHROWER_AMMO_PACK_AMOUNT = 1000

// Flamethrower tuning — sustained-damage spray weapon
export const FLAME_DPS = 0.5            // burn damage per second per zombie in the stream
export const FLAME_TICK_INTERVAL = 0.2  // how often burn damage is applied
export const FLAME_FUEL_PER_SEC = 100   // tank drains this many units/sec while spraying
export const FLAME_RANGE = 9            // max spray distance
export const FLAME_CONE_COS = 0.92      // ~23° half-angle cone
export const FLAME_BURN_DURATION = 2.0  // zombies keep burning (taking damage) this long after leaving the stream

export const CALIBER_LABELS = {
  pistol: '9mm',
  ak47: '5.45mm',
  shotgun: '12ga',
  deagle: '.50 AE',
  flamethrower: 'Napalm',
}

// Ordered list of all weapons; used for scroll-wheel cycling
export const ALL_WEAPONS = ['pistol', 'shotgun', 'ak47', 'deagle', 'flamethrower']
const PERK_COSTS = {
  fast_hands: 80,
  deep_pockets: 80,
  iron_sights: 75,
  runners_breath: 90,
  carpenter: 65,
  knife_mastery: 70,
}
const bulletsForWave = (wave) => zombiesForWave(wave) + 5
const zombiesForWave = (wave) => 5 + (wave - 1) * 3
const speedForWave = (wave) => 1.5 + (wave - 1) * 0.05

export const ZOMBIE_ARCHETYPES = {
  walker: { label: 'Walker', health: 2, speedMultiplier: 1, plankHits: 1 },
  runner: { label: 'Runner', health: 1, speedMultiplier: 1.65, plankHits: 1 },
  brute: { label: 'Brute', health: 7, speedMultiplier: 0.68, plankHits: 3 },
  screamer: { label: 'Screamer', health: 2, speedMultiplier: 0.92, plankHits: 1, auraRadius: 6, auraSpeedMultiplier: 1.35 },
  crawler: { label: 'Crawler', health: 2, speedMultiplier: 0.86, plankHits: 1, heightScale: 0.55 },
  boss: { label: 'Boss', health: 16, speedMultiplier: 0.58, plankHits: 5, heightScale: 1.45, boss: true },
}

const ZOMBIE_TYPE_UNLOCKS = [
  ['boss', 10],
  ['crawler', 3],
  ['screamer', 9],
  ['brute', 5],
  ['runner', 7],
]

export function getZombieArchetype(type = 'walker') {
  return ZOMBIE_ARCHETYPES[type] ?? ZOMBIE_ARCHETYPES.walker
}

export function zombieTypesForWave(wave) {
  return ZOMBIE_TYPE_UNLOCKS
    .filter(([, unlockWave]) => wave >= unlockWave)
    .map(([type]) => type)
}

function specialProbsForWave(wave) {
  const probs = []
  if (wave >= 3)  probs.push(['crawler',  Math.min(0.18, 0.05 + (wave - 3)  * 0.02)])
  if (wave >= 5)  probs.push(['brute',    Math.min(0.15, 0.04 + (wave - 5)  * 0.02)])
  if (wave >= 7)  probs.push(['runner',   Math.min(0.12, 0.03 + (wave - 7)  * 0.015)])
  if (wave >= 9)  probs.push(['screamer', Math.min(0.12, 0.03 + (wave - 9)  * 0.015)])
  return probs
}

function buildTypeList(wave, count) {
  const list = []
  if (wave >= 10) list.push('boss')
  const unlocked = zombieTypesForWave(wave).filter((t) => t !== 'boss')
  // Guarantee 1 of each unlocked archetype, shuffled into the front of the list
  const guaranteed = [...unlocked].sort(() => Math.random() - 0.5)
  list.push(...guaranteed)
  const probs = specialProbsForWave(wave)
  while (list.length < count) {
    const r = Math.random()
    let cumulative = 0
    let chosen = 'walker'
    for (const [type, prob] of probs) {
      cumulative += prob
      if (r < cumulative) { chosen = type; break }
    }
    list.push(chosen)
  }
  return list
}

const clipSizeForWeapon = (w) =>
  w === 'ak47' ? AK_CLIP : w === 'deagle' ? DEAGLE_CLIP : w === 'shotgun' ? SHOTGUN_CLIP : w === 'flamethrower' ? 0 : CLIP_SIZE

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
export { CLIP_SIZE, AK_CLIP, AK_COST, DEAGLE_CLIP, DEAGLE_COST, SHOTGUN_CLIP, SHOTGUN_COST, AMMO_PACK_COST, AMMO_PACK_AMOUNT, DEEP_POCKETS_AMMO_PACK_AMOUNT, PERK_COSTS, HITS_PER_PLANK, PLANK_COST, STRONG_PLANK_COST, STRONG_HITS_PER_PLANK, FLAMETHROWER_COST, FLAMETHROWER_START_AMMO, FLAMETHROWER_AMMO_PACK_COST, FLAMETHROWER_AMMO_PACK_AMOUNT }

const EMPTY_SAVED = { pistol: 0, ak47: 0, shotgun: 0, deagle: 0, flamethrower: 0 }

export const useGameStore = create((set, get) => ({
  phase: 'start', // 'start' | 'intermission' | 'playing' | 'wave_clear' | 'dead'
  mapId: getInitialMapId(), // which map's visuals/skybox to render — fixed for the session
  money: 10,
  weapon: 'pistol',        // currently equipped weapon
  ownedWeapons: ['pistol'], // all purchased weapons (determines scroll-cycle pool)
  // Per-weapon ammo saved when the weapon is not active.
  // The active weapon's live ammo is always in bulletsInClip / reserveBullets.
  savedClips:    { ...EMPTY_SAVED },
  savedReserves: { ...EMPTY_SAVED },
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
  brokenWindows: {},      // { [windowId]: true } — glass shattered, permanent for the run
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
  paused: false,

  startGame: () => {
    const wave = 1
    const total = bulletsForWave(wave)
    const clip = Math.min(CLIP_SIZE, total)
    buildGrid(wallSegments())
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
      brokenWindows: {},
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

  hitZombie: (id, isHeadshot, source = 'gun') =>
    applyZombieDamage(get, set, id, isHeadshot ? 3 : 1, source, isHeadshot),

  // Fractional damage-over-time hit (flamethrower burn tick)
  hitZombieFlame: (id, damage) => applyZombieDamage(get, set, id, damage, 'flame', false),

  consumeFuel: (amount) => {
    const { reserveBullets } = get()
    if (reserveBullets <= 0) return false
    set({ reserveBullets: Math.max(0, reserveBullets - amount) })
    return true
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

  die: () => {
    if (get().phase !== 'playing') return
    set({ phase: 'dead' })
  },

  addPlank: (id) => {
    const { windowPlanks, windowPlankStrong, money, strongPlanksMode } = get()
    const current = windowPlanks[id] ?? 0
    if (current >= 2) return false
    if (windowPlankStrong[id] && !strongPlanksMode) return false  // can't add plain plank on strong window
    const cost = strongPlanksMode ? STRONG_PLANK_COST : PLANK_COST
    if (money < cost) return false
    const newPlanks = { ...windowPlanks, [id]: current + 1 }
    const newStrong = strongPlanksMode ? { ...windowPlankStrong, [id]: true } : windowPlankStrong
    buildGrid(allWallSegments(newPlanks))
    set({ windowPlanks: newPlanks, windowPlankStrong: newStrong, money: money - cost })
    return true
  },

  // Shatters a window's glass — first zombie to reach it or first bullet through
  // it triggers this. Permanent for the run (independent of plank state).
  breakWindow: (id) => {
    if (get().brokenWindows[id]) return
    set({ brokenWindows: { ...get().brokenWindows, [id]: true } })
    playGlassShatter()
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

  // Scroll-wheel weapon switch — saves current clip/reserve, loads next weapon's saved values
  switchWeapon: (nextWeapon) => {
    const { weapon, bulletsInClip, reserveBullets, savedClips, savedReserves, ownedWeapons } = get()
    if (nextWeapon === weapon || !ownedWeapons.includes(nextWeapon)) return
    set({
      weapon: nextWeapon,
      bulletsInClip:  savedClips[nextWeapon],
      reserveBullets: savedReserves[nextWeapon],
      savedClips:    { ...savedClips,    [weapon]: bulletsInClip  },
      savedReserves: { ...savedReserves, [weapon]: reserveBullets },
      isReloading: false,
    })
  },

  openShop: () => set({ shopOpen: true }),
  closeShop: () => set({ shopOpen: false }),

  buyItem: (itemId) => {
    const { money, weapon, bulletsInClip, reserveBullets, perks, ownedWeapons, savedClips, savedReserves } = get()
    // Helper: save current weapon state then equip a newly bought weapon
    const buyWeapon = (id, cost, clip, startReserve = 0) => {
      if (ownedWeapons.includes(id) || money < cost) return false
      set({
        money: money - cost,
        weapon: id,
        bulletsInClip: clip,
        reserveBullets: startReserve,
        ownedWeapons: [...ownedWeapons, id],
        savedClips:    { ...savedClips,    [weapon]: bulletsInClip  },
        savedReserves: { ...savedReserves, [weapon]: reserveBullets },
        isReloading: false,
      })
      return true
    }
    if (itemId === 'ak47')    return buyWeapon('ak47',    AK_COST,     AK_CLIP)
    if (itemId === 'deagle')  return buyWeapon('deagle',  DEAGLE_COST, DEAGLE_CLIP)
    if (itemId === 'shotgun') return buyWeapon('shotgun', SHOTGUN_COST, SHOTGUN_CLIP)
    if (itemId === 'flamethrower') return buyWeapon('flamethrower', FLAMETHROWER_COST, 0, FLAMETHROWER_START_AMMO)
    if (itemId === 'ammo_pack') {
      if (weapon === 'flamethrower') {
        if (money < FLAMETHROWER_AMMO_PACK_COST) return false
        set({ money: money - FLAMETHROWER_AMMO_PACK_COST, reserveBullets: reserveBullets + FLAMETHROWER_AMMO_PACK_AMOUNT })
        return true
      }
      if (money < AMMO_PACK_COST) return false
      const amount = perks.deep_pockets ? DEEP_POCKETS_AMMO_PACK_AMOUNT : AMMO_PACK_AMOUNT
      set({ money: money - AMMO_PACK_COST, reserveBullets: reserveBullets + amount })
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

  // ── Multiplayer ──────────────────────────────────────────────────────────
  mpRole: null,       // 'host' | 'guest' | null
  mpConnected: false,
  remotePlayer: null, // { x, y, z, yaw, pitch }
  roomCode: null,

  setMpRole: (role, code = null) => set({ mpRole: role, roomCode: code }),
  setMpConnected: (v) => set({ mpConnected: v }),
  setRemotePlayer: (data) => set({ remotePlayer: data }),
  clearMp: () => set({ mpRole: null, mpConnected: false, remotePlayer: null, roomCode: null }),
}))

// Debug-only URL params for fast manual testing: ?wave=5&money=500&weapon=ak47
// Disabled on Vercel production builds (VITE_VERCEL_ENV is set via vite.config.js define).
function applyDebugOverrides(set, get) {
  if (import.meta.env.VITE_VERCEL_ENV === 'production') return
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
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
    updates.reserveBullets = weapon === 'flamethrower' ? FLAMETHROWER_START_AMMO : clip * 3
  }

  set(updates)
}

// Shared damage application for hitZombie (gun/knife) and hitZombieFlame (burn ticks).
function applyZombieDamage(get, set, id, damage, source, isHeadshot) {
  const { zombies, pendingSpawns, kills, waveKills, wave, waveElapsed, waveHeadshots, waveKnifeKills, wavePlanksLost, waveStartPlanks } = get()
  const zombie = zombies.find((z) => z.id === id)
  if (!zombie || zombie.dying) return false

  const newHealth = zombie.health - damage

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
}

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

const SPAWN_EDGE_OFFSET = 0.9
const SPAWN_TANGENT_SPREAD = 4.0

function getSpawnBasis(edge) {
  switch (edge) {
    case 'N': return { outwardX: 0, outwardZ: -1, tangentX: 1, tangentZ: 0 }
    case 'S': return { outwardX: 0, outwardZ:  1, tangentX: 1, tangentZ: 0 }
    case 'E': return { outwardX: 1, outwardZ:  0, tangentX: 0, tangentZ: 1 }
    case 'W': return { outwardX: -1, outwardZ: 0, tangentX: 0, tangentZ: 1 }
    default: return { outwardX: 0, outwardZ: 1, tangentX: 1, tangentZ: 0 }
  }
}

function spawnZombies(wave, startId) {
  const count = zombiesForWave(wave)
  const typeList = buildTypeList(wave, count)
  const zombies = []
  for (let i = 0; i < count; i++) {
    const cluster = SPAWN_CLUSTERS[i % SPAWN_CLUSTERS.length]
    const basis = getSpawnBasis(cluster.edge)
    const tangentJitter = (Math.random() - 0.5) * SPAWN_TANGENT_SPREAD
    const inwardJitter = Math.random() * 1.3
    const type = typeList[i]
    const archetype = getZombieArchetype(type)
    const spawnOffset = SPAWN_EDGE_OFFSET + inwardJitter
    const bossEntranceOffset = archetype.boss ? 6 : 0
    zombies.push({
      id: startId + i,
      x: cluster.x + basis.tangentX * tangentJitter - basis.outwardX * spawnOffset + basis.outwardX * bossEntranceOffset,
      z: cluster.z + basis.tangentZ * tangentJitter - basis.outwardZ * spawnOffset + basis.outwardZ * bossEntranceOffset,
      health: archetype.health,
      maxHealth: archetype.health,
      type,
      bossEntrance: archetype.boss,
    })
  }
  return zombies
}
