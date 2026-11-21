// Wave spawn positions. spawnZombies draws from waveRandom('spawn', wave) so seeded runs repeat.
import { waveRandom, keyedRandom } from '../rng'
import { modifiedZombieCount, modifiedZombieHealth } from '../modifiers'
import { SPAWN_CLUSTERS, zombiesForWave } from './shared'
import { getZombieArchetype, buildTypeList } from './zombieTypes'

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
  const rng = waveRandom('spawn', wave)   // per-wave stream: seeded in Daily Run, Math.random otherwise
  const typeList = buildTypeList(wave, count, rng)
  const zombies = []
  for (let i = 0; i < count; i++) {
    const cluster = clusters[i % clusters.length]
    const basis = getSpawnBasis(cluster.edge)
    const tangentJitter = (rng() - 0.5) * SPAWN_TANGENT_SPREAD
    const inwardJitter = rng() * 1.3
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

// Zombie Mail landing: the delivery's zombies at one spawn cluster. Jitter is keyed by (mail id,
// index) so the seeded wave streams (waveRandom) are never consumed.
export function buildMailZombies(entry, types, startId, cluster, modifier = null) {
  const basis = getSpawnBasis(cluster.edge)
  return types.map((type, i) => {
    const archetype = getZombieArchetype(type)
    const tangentJitter = (keyedRandom('mail-tan', `${entry.id}-${i}`) - 0.5) * SPAWN_TANGENT_SPREAD
    const spawnOffset = SPAWN_EDGE_OFFSET + keyedRandom('mail-in', `${entry.id}-${i}`) * 1.3
    return {
      id: startId + i,
      x: cluster.x + basis.tangentX * tangentJitter - basis.outwardX * spawnOffset,
      z: cluster.z + basis.tangentZ * tangentJitter - basis.outwardZ * spawnOffset,
      health: modifiedZombieHealth(archetype.health, modifier),
      maxHealth: modifiedZombieHealth(archetype.health, modifier),
      type,
      bossEntrance: false,
      mail: entry.id,
    }
  })
}

// The Director: add built zombies to the live list up to the 25 cap, the rest wait in pendingSpawns.
export function placeDirectorZombies(s, made) {
  const active = s.zombies.filter((z) => !z.dying).length
  const slots = Math.max(0, 25 - active)
  return { zombies: [...s.zombies, ...made.slice(0, slots)], pendingSpawns: [...s.pendingSpawns, ...made.slice(slots)] }
}
