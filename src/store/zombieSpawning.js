import { SPAWN_CLUSTERS } from '../cabin'
import {
  getZombieArchetype, zombieTypesForWave, zombiesForWave, fastClearParForWave,
  WAVE_REWARD, ZOMBIE_KILL_REWARD, HEADSHOT_KILL_BONUS, KNIFE_KILL_BONUS,
  NO_PLANK_LOSS_BONUS, FAST_CLEAR_BONUS,
} from './constants'

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

export function spawnZombies(wave, startId) {
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

export function countPlanks(windowPlanks) {
  return Object.values(windowPlanks).reduce((sum, count) => sum + count, 0)
}

export function buildWaveBonusSummary({ wave, waveKills, waveHeadshots, waveKnifeKills, wavePlanksLost, waveStartPlanks, waveElapsed }) {
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
