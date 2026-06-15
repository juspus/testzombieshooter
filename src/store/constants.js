export const CALIBER_LABELS = {
  pistol: '9mm',
  ak47: '5.45mm',
  shotgun: '12ga',
  deagle: '.50 AE',
}

// Ordered list of all weapons; used for scroll-wheel cycling
export const ALL_WEAPONS = ['pistol', 'shotgun', 'ak47', 'deagle']

export const CLIP_SIZE = 10
export const AK_CLIP = 30
export const AK_COST = 270
export const DEAGLE_CLIP = 7
export const DEAGLE_COST = 700
export const SHOTGUN_CLIP = 8
export const SHOTGUN_COST = 150
export const AMMO_PACK_COST = 10
export const AMMO_PACK_AMOUNT = 20
export const DEEP_POCKETS_AMMO_PACK_AMOUNT = 30

export const PERK_COSTS = {
  fast_hands: 80,
  deep_pockets: 80,
  iron_sights: 75,
  runners_breath: 90,
  carpenter: 65,
  knife_mastery: 70,
}

export const HITS_PER_PLANK = 5
export const PLANK_COST = 2.5
export const STRONG_PLANK_COST = 20
export const STRONG_HITS_PER_PLANK = 20

export const WAVE_REWARD = 15
export const ZOMBIE_KILL_REWARD = 1
export const HEADSHOT_KILL_BONUS = 0.5
export const KNIFE_KILL_BONUS = 2
export const NO_PLANK_LOSS_BONUS = 10
export const FAST_CLEAR_BONUS = 8

export const EMPTY_SAVED = { pistol: 0, ak47: 0, shotgun: 0, deagle: 0 }

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

export const intermissionForWave = (wave) => 10 + (wave - 1) * 5
export const zombiesForWave = (wave) => 5 + (wave - 1) * 3
export const bulletsForWave = (wave) => zombiesForWave(wave) + 5
export const speedForWave = (wave) => 1.5 + (wave - 1) * 0.05
export const fastClearParForWave = (wave) => 10 + wave * 2

export const clipSizeForWeapon = (w) =>
  w === 'ak47' ? AK_CLIP : w === 'deagle' ? DEAGLE_CLIP : w === 'shotgun' ? SHOTGUN_CLIP : CLIP_SIZE
