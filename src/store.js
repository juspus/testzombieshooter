import { create } from 'zustand'
import { buildGrid } from './walls'
import { MAX_CORPSES } from './fxConfig'
import { getMap, getInitialMapId } from './maps'
import { playPlankBreak, playGlassShatter } from './sounds'
import { spawnImpact } from './impactParticles'
import {
  DEFAULT_COSMETICS,
  DEFAULT_STATS,
  getItem,
  isUnlocked,
  newUnlocksBetween,
  sanitizeCosmetics,
  sanitizeStats,
} from './cosmetics'
import { persistProfile } from './profilePersistence'
import { time as gameTime } from './timeScale'
import { armorMultiplier } from './zombieSpecials'
import { collidesWithWalls } from './walls'
import {
  POWERUP_DEFS, NUKE_REWARD, CARPENTER_REWARD,
  rollPowerupDrop, clampDropPoint, isPointReachable, getZombieWorldPos, getPlayerWorldPos,
  startEffect, tickEffects, clearEffects, clearDrops, addDrop,
} from './powerups'
import { withLinksOpened, doorBuyStatus, allDoorsOpen, openRoomSet } from './doors'
import { playDoorOpen } from './sounds'
import { rollModifier, modifiedZombieCount, modifiedZombieHealth, modifierBonus, debugForcedModifier } from './modifiers'
import * as WR from './weaponRules'

// Map is chosen once (debug ?map= param) and fixed for the whole session.
const ACTIVE_MAP = getMap(getInitialMapId())
// Debris sprays outward (toward the interior) from a breaking plank.
function _plankBreakNormal(w) {
  const ns = w.wall === 'N' || w.wall === 'S'
  return { x: ns ? 0 : (w.wall === 'W' ? 1 : -1), y: 0.3, z: ns ? (w.wall === 'N' ? 1 : -1) : 0 }
}
const { playerCollisionWalls, wallSegments, allWallSegments, SPAWN_CLUSTERS } = ACTIVE_MAP
const DOOR_DEFS = ACTIVE_MAP.DOOR_DEFS ?? []
const activeSpawnClusters = ACTIVE_MAP.activeSpawnClusters ?? (() => SPAWN_CLUSTERS)
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

export const BASE_HP = 20
export const BANDAGE_COST = 15
export const BANDAGE_HEAL = 5

// Head-slot armor. One equipped at a time; buying a new one replaces the old.
export const HELMET_DEFS = {
  bike_helmet:     { label: 'Bike Helmet',     hp: 5,   cost: 20 },
  military_helmet: { label: 'Military Helmet', hp: 20,  cost: 100 },
  knight_helmet:   { label: 'Knight Helmet',   hp: 100, cost: 200, visionLimit: true },
}

// Body-slot armor. One equipped at a time; buying a new one replaces the old.
export const BODY_ARMOR_DEFS = {
  biker_jacket:     { label: 'Biker Jacket',     hp: 15,  cost: 60 },
  bulletproof_vest: { label: 'Bulletproof Vest', hp: 100, cost: 200 },
  knight_armor:     { label: 'Knight Armor',     hp: 300, cost: 400, speedMultiplier: 0.7 },
}

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
  crossbow: 'Bolt',
}

// Ordered list of all weapons; used for scroll-wheel cycling
export const ALL_WEAPONS = ['pistol', 'shotgun', 'ak47', 'deagle', 'flamethrower', 'crossbow']
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
  walker: { label: 'Walker', health: 2, speedMultiplier: 1, plankHits: 1, playerDamage: 5 },
  runner: { label: 'Runner', health: 1, speedMultiplier: 1.65, plankHits: 1, playerDamage: 5 },
  brute: { label: 'Brute', health: 7, speedMultiplier: 0.68, plankHits: 3, playerDamage: 10 },
  screamer: { label: 'Screamer', health: 2, speedMultiplier: 0.92, plankHits: 1, auraRadius: 6, auraSpeedMultiplier: 1.35, playerDamage: 5 },
  crawler: { label: 'Crawler', health: 2, speedMultiplier: 0.86, plankHits: 1, heightScale: 0.55, playerDamage: 5 },
  // ── Wave 3 special archetypes (rules + tuning in zombieSpecials.js) ──
  exploder: { label: 'Exploder', health: 2, speedMultiplier: 0.95, plankHits: 1, playerDamage: 5, explodes: true },
  armored: { label: 'Armored', health: 5, speedMultiplier: 0.8, plankHits: 2, playerDamage: 8, armored: true },
  spitter: { label: 'Spitter', health: 2, speedMultiplier: 0.8, plankHits: 1, playerDamage: 4, ranged: true },
  boss: { label: 'Boss', health: 16, speedMultiplier: 0.58, plankHits: 5, heightScale: 1.45, boss: true, playerDamage: 25 },
}

const ZOMBIE_TYPE_UNLOCKS = [
  ['boss', 10],
  ['crawler', 3],
  ['exploder', 4],
  ['armored', 6],
  ['spitter', 8],
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

// Keeps the chance that a non-guaranteed slot is a special below this, so the
// Wave 3 archetypes thin out the walkers instead of just stacking on top.
const MAX_SPECIAL_SHARE = 0.55
export function specialProbsForWave(wave) {
  const probs = []
  if (wave >= 3)  probs.push(['crawler',  Math.min(0.18, 0.05 + (wave - 3)  * 0.02)])
  if (wave >= 4)  probs.push(['exploder', Math.min(0.10, 0.05 + (wave - 4)  * 0.01)])
  if (wave >= 5)  probs.push(['brute',    Math.min(0.15, 0.04 + (wave - 5)  * 0.02)])
  if (wave >= 6)  probs.push(['armored',  Math.min(0.10, 0.04 + (wave - 6)  * 0.01)])
  if (wave >= 7)  probs.push(['runner',   Math.min(0.12, 0.03 + (wave - 7)  * 0.015)])
  if (wave >= 8)  probs.push(['spitter',  Math.min(0.08, 0.03 + (wave - 8)  * 0.01)])
  if (wave >= 9)  probs.push(['screamer', Math.min(0.12, 0.03 + (wave - 9)  * 0.015)])
  const total = probs.reduce((a, [, p]) => a + p, 0)
  if (total > MAX_SPECIAL_SHARE) {
    const k = MAX_SPECIAL_SHARE / total
    for (const e of probs) e[1] *= k
  }
  return probs
}

export function buildTypeList(wave, count) {
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

// Clip size of a weapon, honouring the Upgrade Bench's +50% mag (see weaponRules.js).
const clipSizeForWeapon = (w, upgraded = false) => WR.clipSize(w, upgraded)

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

const EMPTY_SAVED = { pistol: 0, ak47: 0, shotgun: 0, deagle: 0, flamethrower: 0, crossbow: 0 }

export const useGameStore = create((set, get) => ({
  phase: 'start', // 'start' | 'intermission' | 'playing' | 'wave_clear' | 'dead'
  mapId: getInitialMapId(), // which map's visuals/skybox to render — fixed for the session
  // ── Wave 3 wave modifiers ──
  // Modifier of the CURRENT `wave` (null | 'fog' | 'bloodlust' | 'blackout' | 'horde'). Rolled by the
  // host/solo when the wave's intermission begins (nextWave), so the intermission card can announce it.
  // Guests receive it via the next_wave / wave_start net events. Effects apply only while phase==='playing'.
  waveModifier: null,
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
  runHeadshots: 0,    // run-total counters (cosmetic milestone stats only)
  runKnifeKills: 0,
  runRecorded: false, // guards recordRunEnd() against double-calls
  wavePlanksLost: 0,
  waveStartPlanks: 0,
  lastWaveBonuses: null,
  paused: false,
  hp: BASE_HP,
  maxHp: BASE_HP,
  helmet: null,      // head-slot armor id, see HELMET_DEFS
  bodyArmor: null,   // body-slot armor id, see BODY_ARMOR_DEFS
  hitEventId: 0,     // bumped on every hitPlayer() call; HUD watches this to trigger the damage decal

  // ── Wave 1 "Feel": hit markers, damage direction, last-kill slow-mo ──────────
  hitMarkerId: 0,         // bumped by registerHit(); HitMarker subscribes to this itself
  hitMarkerKind: 'hit',   // 'hit' | 'head' | 'kill' | 'headkill' | 'burn'
  lastHitX: 0,            // world pos of the zombie that last hit the player (damage indicator)
  lastHitZ: 0,
  lastKillId: 0,          // bumped when the final zombie of a wave dies (slow-mo + sting)
  lastKillPending: false, // host: wave_clear is held back for LAST_KILL_DELAY_MS

  // One marker per trigger pull — callers aggregate pellets / pierce targets first.
  // 'burn' (flamethrower ticks) is throttled so it never spams.
  registerHit: (kind) => {
    if (kind === 'burn') {
      const now = performance.now()
      if (now - _lastBurnMarkerAt < BURN_MARKER_INTERVAL_MS) return
      _lastBurnMarkerAt = now
    }
    set({ hitMarkerKind: kind, hitMarkerId: get().hitMarkerId + 1 })
  },

  // Slow-mo + sting. Runs on host (from the killing blow) and guest ('last_kill' event).
  startLastKillFx: () => {
    cancelLastKillFx()
    gameTime.scale = LAST_KILL_SCALE
    _lastKillTimers = [
      setTimeout(() => { gameTime.scale = 0.65 }, LAST_KILL_DELAY_MS - 250),
      setTimeout(() => { gameTime.scale = 1 }, LAST_KILL_DELAY_MS),
    ]
    set({ lastKillId: get().lastKillId + 1 })
  },
  endLastKillFx: () => { cancelLastKillFx() },

  // ── Wave 3 "Power-ups" ───────────────────────────────────────────────────────
  // Drops are rolled by the host/solo player only (applyZombieDamage -> maybeDropPowerup),
  // placed in the module pool in powerups.js, and applied on collect via applyPowerup().
  // Money / ammo / planks are per-client state, so in co-op every client applies the
  // effect to its own store when the host broadcasts `powerup_apply`.
  instaKillOn: false,     // Insta-Kill active (any hit kills). Remaining time: powerups.effects
  doubleMoneyOn: false,   // Double Money active
  powerupBannerId: 0,     // bumped on every pickup; PowerUpHud subscribes to this itself
  powerupBannerType: null,
  killsSinceDrop: 0,      // pity counter (see dropChance)
  lastDropType: null,

  // Spawn a pickup in the world (also the dev hook: __game.getState().dropPowerup('nuke', x, z)).
  dropPowerup: (type, x, z) => {
    if (!POWERUP_DEFS[type]) return null
    const p = _dropPoint(get, x, z)
    return addDrop({ type, x: p.x, z: p.z })
  },

  // Apply a collected power-up to THIS client's state.
  applyPowerup: (type) => {
    if (!POWERUP_DEFS[type]) return
    const st = get()
    const upd = { powerupBannerId: st.powerupBannerId + 1, powerupBannerType: type }
    if (type === 'insta_kill') { startEffect(type); upd.instaKillOn = true }
    else if (type === 'double_money') { startEffect(type); upd.doubleMoneyOn = true }
    else if (type === 'max_ammo') Object.assign(upd, _maxAmmoState(st))
    else if (type === 'carpenter') {
      // Boards every window to 2 planks and resets hit progress. New planks follow the
      // current strong-plank mode (same rule as addPlank); windows already holding strong
      // planks stay strong; existing plain planks are not auto-upgraded.
      const planks = { ...st.windowPlanks }
      const strong = { ...st.windowPlankStrong }
      const hits = { ...st.plankHits }
      for (const w of ACTIVE_MAP.WINDOW_DEFS ?? []) {
        if ((planks[w.id] ?? 0) < 2) {
          if ((planks[w.id] ?? 0) === 0) strong[w.id] = st.strongPlanksMode
          planks[w.id] = 2
        }
        hits[w.id] = 0
      }
      buildGrid(allWallSegments(planks, st.openDoors))
      Object.assign(upd, { windowPlanks: planks, windowPlankStrong: strong, plankHits: hits, money: st.money + CARPENTER_REWARD })
    } else if (type === 'nuke') {
      upd.money = st.money + NUKE_REWARD
    }
    set(upd)
    // Host/solo: kill every live zombie through the normal kill path (pending ones
    // slot in as usual). Guests just receive the dying flags via zombie_update.
    if (type === 'nuke' && st.mpRole !== 'guest') {
      for (const z of get().zombies) if (!z.dying) applyZombieDamage(get, set, z.id, 1e9, 'nuke', false)
    }
  },

  // Advance timed effects; called every frame by PowerUps.jsx (pause-aware there).
  tickPowerups: (dt) => {
    const expired = tickEffects(dt)
    if (expired.length === 0) return
    const upd = {}
    if (expired.includes('insta_kill')) upd.instaKillOn = false
    if (expired.includes('double_money')) upd.doubleMoneyOn = false
    set(upd)
  },

  resetPowerups: () => {
    clearEffects(); clearDrops()
    set({ instaKillOn: false, doubleMoneyOn: false, killsSinceDrop: 0, lastDropType: null, powerupBannerType: null })
  },

  startGame: () => {
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
    })
    cancelLastKillFx()
    get().resetPowerups()

    applyDebugOverrides(set, get)
  },

  // forcedMod: co-op guest passes the host's roll (null = none); undefined = roll here.
  nextWave: (forcedMod) => {
    const { wave: prevWave, windowPlanks, openDoors, money, bulletsInClip, reserveBullets, waveKills: prevWaveKills, lastWaveBonuses } = get()
    const wave = prevWave + 1
    const waveModifier = forcedMod !== undefined ? forcedMod
      : get().mpRole === 'guest' ? null : rollModifier(wave, get().waveModifier)
    buildGrid(allWallSegments(windowPlanks, openDoors))
    const walls = playerCollisionWalls(openDoors)
    set({
      phase: 'intermission',
      money: money + WAVE_REWARD + (prevWaveKills * ZOMBIE_KILL_REWARD) + (lastWaveBonuses?.total ?? 0),
      shopOpen: false,
      walls,
      wave,
      waveModifier,
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
      lastKillPending: false,
    })
    cancelLastKillFx()
  },

  consumeBullet: () => {
    const { bulletsInClip, isReloading } = get()
    if (isReloading || bulletsInClip <= 0) return false
    set({ bulletsInClip: bulletsInClip - 1 })
    return true
  },

  beginReload: () => {
    const { bulletsInClip, reserveBullets, isReloading, weapon, upgradedWeapons } = get()
    const clipSize = clipSizeForWeapon(weapon, !!upgradedWeapons[weapon])
    if (isReloading || reserveBullets === 0 || bulletsInClip === clipSize) return false
    set({ isReloading: true })
    return true
  },

  finishReload: () => {
    const { bulletsInClip, reserveBullets, weapon, upgradedWeapons } = get()
    const clipSize = clipSizeForWeapon(weapon, !!upgradedWeapons[weapon])
    const toLoad = Math.min(clipSize - bulletsInClip, reserveBullets)
    set({ bulletsInClip: bulletsInClip + toLoad, reserveBullets: reserveBullets - toLoad, isReloading: false })
  },

  // weapon/dist feed armour rules (armored zombies, see zombieSpecials.js) and are
  // optional: callers/net events that omit them are treated as a pistol body hit.
  // mult: weapon damage multiplier (upgraded x2, crossbow bolt) — see WR.damageMult
  hitZombie: (id, isHeadshot, source = 'gun', weapon = null, dist = Infinity, mult = 1) =>
    applyZombieDamage(get, set, id, (isHeadshot ? 3 : 1) * mult, source, isHeadshot, weapon, dist),

  // Exploder blast (host-side): area damage to another zombie, or the exploder itself (999).
  hitZombieBurst: (id, damage) => applyZombieDamage(get, set, id, damage, 'burst', false),

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
    const waveOver = !isGuest && activeCount === 0 && pendingSpawns.length === 0 && phase === 'playing' && !get().lastKillPending
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

  die: () => {
    if (get().phase !== 'playing') return
    set({ phase: 'dead', lastKillPending: false })
    cancelLastKillFx()
    // Single choke point for death: covers hitPlayer() and the co-op 'die'
    // net event (NetManager -> store.die()). runRecorded makes it once-only.
    get().recordRunEnd()
  },

  // Called by Zombie.jsx's attack_player state. Fully client-local: each
  // client already computes its own player's proximity/damage independently,
  // same as the pre-HP instant-kill check did — no net sync needed.
  // ax/az: attacker world position, for the directional damage indicator.
  hitPlayer: (damage, ax = 0, az = 0) => {
    const { phase, hp, hitEventId } = get()
    if (phase !== 'playing') return
    const newHp = Math.max(0, hp - damage)
    set({ hp: newHp, hitEventId: hitEventId + 1, lastHitX: ax, lastHitZ: az })
    if (newHp <= 0) get().die()
  },

  buyBandage: () => {
    const { money, hp, maxHp } = get()
    if (hp >= maxHp) return false
    if (money < BANDAGE_COST) return false
    set({ hp: Math.min(maxHp, hp + BANDAGE_HEAL), money: money - BANDAGE_COST })
    return true
  },

  buyHelmet: (id) => {
    const def = HELMET_DEFS[id]
    const { helmet, money, hp, maxHp } = get()
    if (!def || helmet === id) return false
    if (money < def.cost) return false
    const delta = def.hp - (helmet ? HELMET_DEFS[helmet].hp : 0)
    const newMax = maxHp + delta
    set({ helmet: id, money: money - def.cost, maxHp: newMax, hp: Math.min(newMax, Math.max(1, hp + delta)) })
    return true
  },

  buyBodyArmor: (id) => {
    const def = BODY_ARMOR_DEFS[id]
    const { bodyArmor, money, hp, maxHp } = get()
    if (!def || bodyArmor === id) return false
    if (money < def.cost) return false
    const delta = def.hp - (bodyArmor ? BODY_ARMOR_DEFS[bodyArmor].hp : 0)
    const newMax = maxHp + delta
    set({ bodyArmor: id, money: money - def.cost, maxHp: newMax, hp: Math.min(newMax, Math.max(1, hp + delta)) })
    return true
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
    buildGrid(allWallSegments(newPlanks, get().openDoors))
    set({ windowPlanks: newPlanks, windowPlankStrong: newStrong, money: money - cost })
    return true
  },

  // Shatters a window's glass — first zombie to reach it or first bullet through
  // it triggers this. Permanent for the run (independent of plank state).
  breakWindow: (id) => {
    if (get().brokenWindows[id]) return
    set({ brokenWindows: { ...get().brokenWindows, [id]: true } })
    const w = ACTIVE_MAP.WINDOW_DEFS?.[id]
    playGlassShatter(w?.winX, 1.2, w?.winZ)
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
      buildGrid(allWallSegments(newPlanks, get().openDoors))
      const bw = ACTIVE_MAP.WINDOW_DEFS?.[id]
      playPlankBreak(bw?.winX, 1.2, bw?.winZ)
      if (bw) spawnImpact({ x: bw.winX, y: 1.2, z: bw.winZ }, _plankBreakNormal(bw), 'break')
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
    if (nextWeapon === weapon || !ownedWeapons.includes(nextWeapon) || get().benchBusy) return
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
    // (Wave 3: shares giveWeapon with the Mystery Box — a full inventory replaces the weapon in hand.)
    const buyWeapon = (id, cost, clip, startReserve = 0) => {
      if (ownedWeapons.includes(id) || money < cost) return false
      set({ money: money - cost, ...WR.giveWeapon(get(), id, { reserve: startReserve }) })
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

  // ── Wave 3: buyable doors ───────────────────────────────────────────────────
  // Runs start sealed in the main room. `openDoors` is { [doorId]: true } (see
  // src/doors.js + DOOR_DEFS in the map). Opening rebuilds the nav grid + player
  // collision once; zombies re-path on their next PATH_INTERVAL tick.
  openDoors: {},
  nearDoorId: null,   // id of the closed, buyable door the player stands at (Player.jsx)
  doorProgress: 0,    // 0–1 hold-E progress (HUD bar)
  setNearDoorId: (id) => { if (get().nearDoorId !== id) set({ nearDoorId: id }) },
  setDoorProgress: (v) => set({ doorProgress: v }),

  // Opens a door without charging anyone (host/guest sync, debug). Returns false if already open.
  applyDoorOpen: (id, silent = false) => {
    const { openDoors, windowPlanks } = get()
    if (openDoors[id]) return false
    const def = DOOR_DEFS.find((d) => d.id === id)
    if (!def) return false
    const next = withLinksOpened(DOOR_DEFS, { ...openDoors, [id]: true })
    buildGrid(allWallSegments(windowPlanks, next))
    set({ openDoors: next, walls: playerCollisionWalls(next) })
    if (!silent) playDoorOpen(def.x, 1.2, def.z)
    return true
  },

  // Local purchase: checks status + money, charges this client, opens the door.
  // (Co-op: money is per-player; Player.jsx routes guests through a host request.)
  buyDoor: (id) => {
    const { openDoors, money } = get()
    const def = DOOR_DEFS.find((d) => d.id === id)
    if (!def || doorBuyStatus(def, DOOR_DEFS, openDoors, money) !== 'ok') return false
    set({ money: money - def.cost })
    return get().applyDoorOpen(id)
  },
  // Host-side validation of a guest's request: open only (the guest pays on the ack).
  canOpenDoor: (id, money = Infinity) => {
    const def = DOOR_DEFS.find((d) => d.id === id)
    return !!def && doorBuyStatus(def, DOOR_DEFS, get().openDoors, money) === 'ok'
  },
  // Replace the whole door state (guest join / wave_start sync).
  setOpenDoors: (doors) => {
    const next = { ...(doors || {}) }
    const { windowPlanks } = get()
    buildGrid(allWallSegments(windowPlanks, next))
    set({ openDoors: next, walls: playerCollisionWalls(next) })
  },


  // ── Wave 3: Mystery Box + Upgrade Bench (rules in src/weaponRules.js) ───────
  // Per-weapon upgrade flags, saved with the carried guns: { [weaponId]: true }.
  upgradedWeapons: {},
  benchBusy: null,       // weapon id while the bench holds the gun (viewmodel hidden), else null
  benchLeft: 0,          // seconds left on the current upgrade
  nearMachine: null,     // 'box' | 'bench' | null — the machine the player stands at (Player.jsx)
  machineProgress: 0,    // 0–1 hold-E progress for the prompt bar
  // Box: phase 'idle' | 'cycling' | 'ready' | 'teddy'. `at` = performance.now() of the last
  // phase change. `payer` = 'host' | 'guest' (solo = 'host'): only the payer may take the weapon.
  box: freshBox(),
  setNearMachine: (k) => { if (get().nearMachine !== k) set({ nearMachine: k }) },
  setMachineProgress: (v) => set({ machineProgress: v }),
  // Replace/merge box state (net sync; host broadcasts, guest applies).
  setBox: (b) => set({ box: { ...get().box, ...b } }),

  // Host/solo: roll a paid use for `payer`. Returns the outcome or null if the box is busy.
  // Does NOT charge (buyBox / the guest's ack do). `held` = weapons the payer carries (re-rolled away).
  boxRoll: (payer, held = [], rng = Math.random) => {
    const { box } = get()
    if (box.phase !== 'idle') return null
    const o = WR.boxRollOutcome(box, rng, held)
    set({ box: { ...box, uses: o.uses, phase: o.teddy ? 'teddy' : 'cycling', result: o.teddy ? 'teddy' : o.weapon, payer, at: performance.now() } })
    return o
  },
  // Local purchase (solo / host). Teddy rolls are free (refunded).
  buyBox: (rng = Math.random) => {
    const { money, ownedWeapons, box } = get()
    if (box.phase !== 'idle' || money < WR.BOX_COST) return null
    const o = get().boxRoll('host', ownedWeapons, rng)
    if (o && !o.teddy) set({ money: money - WR.BOX_COST })
    return o
  },
  // The payer takes the landed weapon. Returns the weapon id or null.
  takeBox: (role = 'host') => {
    const { box } = get()
    if (box.phase !== 'ready' || box.payer !== role || !box.result || box.result === 'teddy') return null
    const w = box.result
    set({ ...WR.giveWeapon(get(), w), box: { ...box, phase: 'idle', result: null, payer: null, at: performance.now() } })
    return w
  },
  // Time-driven phases. Returns 'moved' when the host/solo box relocated (caller broadcasts), else null.
  tickBox: (now = performance.now(), canMove = true) => {
    const { box } = get()
    const dt = now - box.at
    if (box.phase === 'cycling' && dt >= WR.BOX_CYCLE_MS) set({ box: { ...box, phase: 'ready', at: now } })
    else if (box.phase === 'ready' && dt >= WR.BOX_TAKE_MS) set({ box: { ...box, phase: 'idle', result: null, payer: null, at: now } })
    else if (box.phase === 'teddy' && dt >= WR.BOX_TEDDY_MS && canMove) { get().moveBox(); return 'moved' }
    return null
  },
  // After the bear: relocate to another OPEN room and reset the use counter (host/solo).
  moveBox: (rng = Math.random) => {
    const { box, openDoors } = get()
    const anchors = ACTIVE_MAP.ROOM_ANCHORS ?? {}
    const room = WR.pickBoxRoom(openRoomSet(DOOR_DEFS, openDoors), box.room, anchors, rng)
    set({ box: { room, uses: 0, maxUses: WR.rollBoxUses(rng), phase: 'idle', result: null, payer: null, at: performance.now() } })
  },

  // Upgrade Bench: pay, the gun vanishes into the bench for BENCH_TIME s, then returns upgraded.
  startUpgrade: () => {
    const s = get()
    if (!WR.canUpgrade(s) || s.money < WR.BENCH_COST) return false
    set({ money: s.money - WR.BENCH_COST, benchBusy: s.weapon, benchLeft: WR.BENCH_TIME, isReloading: false })
    return true
  },
  tickBench: (delta) => {
    const s = get()
    if (!s.benchBusy) return false
    const left = s.benchLeft - delta
    if (left > 0) { set({ benchLeft: left }); return false }
    const mult = s.perks?.deep_pockets ? 1.5 : 1
    set({ ...WR.upgradePatch(s, Math.round((MAX_RESERVE[s.weapon] ?? 0) * mult)), benchBusy: null, benchLeft: 0 })
    return true
  },

  getZombieSpeed: () => speedForWave(get().wave),
  getZombiesForWave: () => modifiedZombieCount(zombiesForWave(get().wave), get().waveModifier),

  // ── Multiplayer ──────────────────────────────────────────────────────────
  mpRole: null,       // 'host' | 'guest' | null
  mpConnected: false,
  remotePlayer: null, // { x, y, z, yaw, pitch }
  roomCode: null,

  setMpRole: (role, code = null) => set({ mpRole: role, roomCode: code }),
  setMpConnected: (v) => set({ mpConnected: v }),
  setRemotePlayer: (data) => set({ remotePlayer: data }),
  clearMp: () => set({ mpRole: null, mpConnected: false, remotePlayer: null, roomCode: null }),

  // ── Cosmetics / lifetime stats (visual only — never read by gameplay code) ─
  cosmetics: { ...DEFAULT_COSMETICS },  // equipped: { skin, crosshair, crosshairColor, knifeSkin }
  stats: { ...DEFAULT_STATS },          // lifetime: { bestWave, totalKills, runs, totalHeadshots, totalKnifeKills }
  entitlements: [],                     // owned skus, e.g. ['supporter_pack']
  lastRunUnlocks: [],                   // cosmetic items that unlocked during the run that just ended

  // kind: 'skin' | 'crosshair' | 'crosshairColor' | 'knifeSkin'. Returns true if equipped.
  setCosmetic: (kind, id) => {
    const { cosmetics, stats, entitlements } = get()
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_COSMETICS, kind)) return false
    const item = getItem(kind, id)
    if (!item || !isUnlocked(item, { entitlements, stats })) return false
    if (cosmetics[kind] === id) return true
    const next = { ...cosmetics, [kind]: id }
    set({ cosmetics: next })
    persistProfile(stats, next)
    return true
  },

  setEntitlements: (list) => set({ entitlements: Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [] }),
  setStats: (stats) => set({ stats: sanitizeStats(stats) }),
  setCosmetics: (obj) => set({ cosmetics: sanitizeCosmetics(obj) }),

  // Re-checks equipped items against current unlocks (e.g. after sign-out
  // clears entitlements); locked slots fall back to their default.
  revalidateCosmetics: () => {
    const { cosmetics, stats, entitlements } = get()
    const next = { ...cosmetics }
    let changed = false
    for (const kind of Object.keys(DEFAULT_COSMETICS)) {
      if (!isUnlocked(getItem(kind, cosmetics[kind]), { entitlements, stats })) {
        next[kind] = DEFAULT_COSMETICS[kind]
        changed = true
      }
    }
    if (changed) set({ cosmetics: next })
  },

  // Called once when the player dies: folds this run into lifetime stats,
  // works out which milestones just flipped, and persists. Idempotent per run.
  recordRunEnd: () => {
    const s = get()
    if (s.runRecorded) return
    const prev = s.stats
    const next = {
      bestWave: Math.max(prev.bestWave, s.wave),
      totalKills: prev.totalKills + s.kills,
      runs: prev.runs + 1,
      totalHeadshots: prev.totalHeadshots + s.runHeadshots,
      totalKnifeKills: prev.totalKnifeKills + s.runKnifeKills,
    }
    set({
      stats: next,
      runRecorded: true,
      lastRunUnlocks: newUnlocksBetween(prev, next, s.entitlements),
    })
    persistProfile(next, s.cosmetics)
  },
}))

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
    updates.reserveBullets = weapon === 'flamethrower' ? FLAMETHROWER_START_AMMO : clip * 3
    if (weapon === 'crossbow') updates.reserveBullets = WR.START_RESERVE.crossbow
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

// ── Wave 1 "Feel" module state ───────────────────────────────────────────────
const LAST_KILL_DELAY_MS = 1100   // real-time slow-mo window before WAVE CLEARED
const LAST_KILL_SCALE = 0.3
const BURN_MARKER_INTERVAL_MS = 450
let _lastBurnMarkerAt = 0
let _lastKillTimers = []
let _lastKillToken = 0

function cancelLastKillFx() {
  _lastKillTimers.forEach(clearTimeout)
  _lastKillTimers = []
  _lastKillToken++   // invalidates a pending wave_clear timeout (restart / death)
  gameTime.scale = 1
}

let _corpseSeq = 0

// Shared damage application for hitZombie (gun/knife) and hitZombieFlame (burn ticks).
function applyZombieDamage(get, set, id, damage, source, isHeadshot, weapon = null, dist = Infinity) {
  const { zombies, pendingSpawns, kills, waveKills, wave, waveElapsed, waveHeadshots, waveKnifeKills, wavePlanksLost, waveStartPlanks } = get()
  const zombie = zombies.find((z) => z.id === id)
  if (!zombie || zombie.dying) return false
  const { runHeadshots, runKnifeKills } = get()

  // Insta-Kill: any hit (bullet, knife, burn tick) is lethal. Armour (armored zombies) scales the rest.
  const newHealth = get().instaKillOn ? 0 : zombie.health - damage * armorMultiplier(zombie.type, { head: isHeadshot, weapon, dist, source })

  if (newHealth <= 0) {
    const nuked = source === 'nuke'
    const newKills = kills + 1
    const newWaveKills = waveKills + (nuked ? 0 : 1)   // nuke kills pay no per-kill money
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
      runHeadshots: runHeadshots + (source === 'gun' && isHeadshot ? 1 : 0),
      runKnifeKills: runKnifeKills + (source === 'knife' ? 1 : 0),
    }
    if (!nuked) {
      // Double Money: pay the kill money again now (base + headshot / knife bonus).
      if (get().doubleMoneyOn) statUpdate.money = get().money + doubleMoneyExtra(source, isHeadshot)
      // Drop roll (host / solo only; never on the wave's last kill).
      if (!isGuest && !waveOver) maybeDropPowerup(get, set, zombie)
    }
    if (waveOver) {
      // Hold wave_clear back for LAST_KILL_DELAY_MS so the slow-mo plays out. The
      // host broadcasts wave_clear when phase flips, so the guest transitions
      // LAST_KILL_DELAY_MS later too (same fixed delay, no extra sync needed).
      const bonuses = buildWaveBonusSummary({
        wave,
        waveKills: newWaveKills,
        waveHeadshots: newWaveHeadshots,
        waveKnifeKills: newWaveKnifeKills,
        wavePlanksLost,
        waveStartPlanks,
        waveElapsed,
        modifier: get().waveModifier,
      })
      set({ ...statUpdate, lastKillPending: true })
      get().startLastKillFx()
      const token = ++_lastKillToken
      setTimeout(() => {
        if (token !== _lastKillToken) return
        if (get().phase === 'playing' && get().lastKillPending) {
          set({ phase: 'wave_clear', lastWaveBonuses: bonuses, lastKillPending: false })
        } else {
          set({ lastKillPending: false })
        }
      }, LAST_KILL_DELAY_MS)
    } else {
      set(statUpdate)
    }
    return true
  } else {
    set({ zombies: zombies.map((z) => z.id === id ? { ...z, health: newHealth } : z) })
    return false
  }
}

// ── Wave 3 "Power-ups" helpers ───────────────────────────────────────────────
// Extra money granted per kill while Double Money is active (mirrors the per-kill
// reward + headshot/knife bonuses that are otherwise paid at wave end). The wave-clear
// base reward and wave bonuses (no-planks-lost, fast clear) are NOT doubled.
export function doubleMoneyExtra(source, isHeadshot) {
  return ZOMBIE_KILL_REWARD
    + (source === 'gun' && isHeadshot ? HEADSHOT_KILL_BONUS : 0)
    + (source === 'knife' ? KNIFE_KILL_BONUS : 0)
}

// Reserve rounds a "full" Max Ammo refills to, per weapon (flamethrower = fuel units).
export const MAX_RESERVE = { pistol: 60, shotgun: 48, ak47: 150, deagle: 42, flamethrower: 2000, crossbow: 30 }

// Max Ammo for every owned weapon: clips topped up, reserves raised to MAX_RESERVE
// (x1.5 with Deep Pockets). Never lowers an existing reserve.
export function _maxAmmoState(st) {
  const mult = st.perks?.deep_pockets ? 1.5 : 1
  const full = (w) => Math.round(MAX_RESERVE[w] * mult)
  const savedClips = { ...st.savedClips }
  const savedReserves = { ...st.savedReserves }
  for (const w of st.ownedWeapons) {
    if (w === st.weapon) continue
    savedClips[w] = clipSizeForWeapon(w, !!st.upgradedWeapons?.[w])
    savedReserves[w] = Math.max(savedReserves[w] ?? 0, full(w))
  }
  return {
    bulletsInClip: Math.max(st.bulletsInClip, clipSizeForWeapon(st.weapon, !!st.upgradedWeapons?.[st.weapon])),
    reserveBullets: Math.max(st.reserveBullets, full(st.weapon)),
    savedClips,
    savedReserves,
  }
}

// Where a drop lands: inside the playable interior, off interior walls, and on a
// reachable spot (isPointReachable — the hook the buyable-doors work implements).
// Blocked / unreachable spots slide toward the player's current position.
// Doors: a point inside a still-sealed room is not a valid drop spot.
function _roomIsOpen(get, x, z) {
  const defs = ACTIVE_MAP.DOOR_DEFS
  if (!defs?.length || !ACTIVE_MAP.roomAt) return true
  return openRoomSet(defs, get().openDoors).has(ACTIVE_MAP.roomAt(x, z))
}

function _dropPoint(get, x, z) {
  const walls = get().walls
  const pl = getPlayerWorldPos()
  return clampDropPoint(x, z, {
    hw: ACTIVE_MAP.HW, hd: ACTIVE_MAP.HD,
    anchorX: pl ? pl.x : 0, anchorZ: pl ? pl.z : 0,
    isFree: (px, pz) => !collidesWithWalls(px, pz, 0.6, walls) && _roomIsOpen(get, px, pz) && isPointReachable(px, pz),
  })
}

function maybeDropPowerup(get, set, zombie) {
  if (get().phase !== 'playing') return
  const count = get().killsSinceDrop + 1
  const r = rollPowerupDrop(count, get().lastDropType)
  if (!r.drop) { set({ killsSinceDrop: count }); return }
  set({ killsSinceDrop: 0, lastDropType: r.type })
  const zp = getZombieWorldPos(zombie.id) ?? zombie
  get().dropPowerup(r.type, zp.x, zp.z)
}

function countPlanks(windowPlanks) {
  return Object.values(windowPlanks).reduce((sum, count) => sum + count, 0)
}

function buildWaveBonusSummary({ wave, waveKills, waveHeadshots, waveKnifeKills, wavePlanksLost, waveStartPlanks, waveElapsed, modifier = null }) {
  const fastClearPar = fastClearParForWave(wave)
  const headshots = waveHeadshots * HEADSHOT_KILL_BONUS
  const knifeKills = waveKnifeKills * KNIFE_KILL_BONUS
  const noPlanksLost = waveStartPlanks > 0 && wavePlanksLost === 0 ? NO_PLANK_LOSS_BONUS : 0
  const fastClear = waveElapsed > 0 && waveElapsed <= fastClearPar ? FAST_CLEAR_BONUS : 0
  const modBonus = modifierBonus(modifier)   // Wave 3 modifier waves pay extra
  return {
    base: WAVE_REWARD,
    kills: waveKills * ZOMBIE_KILL_REWARD,
    headshots,
    knifeKills,
    noPlanksLost,
    fastClear,
    modifier,
    modifierBonus: modBonus,
    total: headshots + knifeKills + noPlanksLost + fastClear + modBonus,
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

export function spawnZombies(wave, startId, clusters = SPAWN_CLUSTERS, modifier = null) {
  const count = modifiedZombieCount(zombiesForWave(wave), modifier)
  const typeList = buildTypeList(wave, count)
  const zombies = []
  for (let i = 0; i < count; i++) {
    const cluster = clusters[i % clusters.length]
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
      health: modifiedZombieHealth(archetype.health, modifier),
      maxHealth: modifiedZombieHealth(archetype.health, modifier),
      type,
      bossEntrance: archetype.boss,
    })
  }
  return zombies
}

// Dev/preview only: expose the store for browser-driven verification.
if (typeof window !== 'undefined' && import.meta.env.VITE_VERCEL_ENV !== 'production') {
  window.__game = useGameStore
}

// ── Wave 3 machines: fresh per-run state ─────────────────────────────────────
function freshBox() {
  return { room: ACTIVE_MAP.ROOM_ANCHORS?.[WR.BOX_START_ROOM] ? WR.BOX_START_ROOM : 'main', uses: 0, maxUses: WR.rollBoxUses(), phase: 'idle', result: null, payer: null, at: 0 }
}
function freshMachineState() {
  return { upgradedWeapons: {}, benchBusy: null, benchLeft: 0, nearMachine: null, machineProgress: 0, box: freshBox() }
}
