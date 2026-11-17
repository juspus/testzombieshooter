// Zombie archetype table and the per-wave type mix (pure; the spawner in spawns.js uses it).

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
  // Ceiling crawler: drops on the player from above (SPIDER in zombieSpecials.js). playerDamage = floor claws.
  spider: { label: 'Spider', health: 3, speedMultiplier: 1.1, plankHits: 1, playerDamage: 4, climbs: true },
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
  ['spider', 11],
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
  if (wave >= 11) probs.push(['spider',   Math.min(0.10, 0.04 + (wave - 11) * 0.01)])
  const total = probs.reduce((a, [, p]) => a + p, 0)
  if (total > MAX_SPECIAL_SHARE) {
    const k = MAX_SPECIAL_SHARE / total
    for (const e of probs) e[1] *= k
  }
  return probs
}

export function buildTypeList(wave, count, rng = Math.random) {
  const list = []
  if (wave >= 10) list.push('boss')
  const unlocked = zombieTypesForWave(wave).filter((t) => t !== 'boss')
  // Guarantee 1 of each unlocked archetype, shuffled into the front of the list
  const guaranteed = [...unlocked]
  for (let i = guaranteed.length - 1; i > 0; i--) {   // Fisher-Yates (seedable, engine-independent)
    const j = Math.floor(rng() * (i + 1))
    ;[guaranteed[i], guaranteed[j]] = [guaranteed[j], guaranteed[i]]
  }
  list.push(...guaranteed)
  const probs = specialProbsForWave(wave)
  while (list.length < count) {
    const r = rng()
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
