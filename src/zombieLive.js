// The live ZombieSystem: the real store, the map picked for this page load, and real sounds,
// particles and network. ZombieManager.jsx ticks it; Zombie.jsx poses from it.
// io members are wrapped in arrows so nothing is read from a module until it is used (tests mock
// sounds / net partially). (The AI itself, src/zombieAI/*, has no idea any of this exists.)
import { useGameStore } from './store'
import { getMap, getInitialMapId } from './maps'
import { ZombieSystem } from './zombieAI'
import {
  playZombieFootstep, playPlankHit, playZombieGroan, playExploderHiss, playExplosion, playSpitWindup, playSpitLaunch,
  playSpiderSkitter, playSpiderShriek, playSpiderLand,
} from './sounds'
import { spawnImpact } from './impactParticles'
import { spawnFlash, spawnScorch, spawnGlob } from './specialFxPool'
import { send, isConnected } from './net'
import { getRemotePlayerPos } from './components/RemotePlayer'
import { onGameEvent } from './gameEvents'

// Map is chosen once (debug ?map= param) and fixed for the whole session.
export const ACTIVE_MAP = getMap(getInitialMapId())

export const zombieSystem = new ZombieSystem({
  store: useGameStore,
  map: ACTIVE_MAP,
  io: {
    audio: {
      groan: (x, y, z, pitch, dist) => playZombieGroan(x, y, z, pitch, dist),
      footstep: (x, y, z) => playZombieFootstep(x, y, z),
      plankHit: (...a) => playPlankHit(...a),
      exploderHiss: (...a) => playExploderHiss(...a),
      explosion: (...a) => playExplosion(...a),
      spitWindup: (...a) => playSpitWindup(...a),
      spitLaunch: (...a) => playSpitLaunch(...a),
      spiderSkitter: (...a) => playSpiderSkitter(...a),
      spiderShriek: (...a) => playSpiderShriek(...a),
      spiderLand: (...a) => playSpiderLand(...a),
    },
    fx: { flash: (...a) => spawnFlash(...a), scorch: (...a) => spawnScorch(...a), impact: (...a) => spawnImpact(...a), spit: (...a) => spawnGlob(...a) },
    net: { event: (event, data) => { if (isConnected()) send('game_event', { event, data }) } },
    now: () => performance.now(),
    remotePlayerPos: () => getRemotePlayerPos(),
  },
})

// A new run starts from an empty system. Zombie ids restart from 0 and a seeded run (Daily, versus, duel)
// spawns the same types at the same spots, so without this a same-id zombie of the new run would be matched
// to the previous run's sim zombie, corpse and all (ensure() only replaces one whose type or spawn differs).
// The store emits run_start from startGame / startSeededGame / startDaily; listening here keeps the store
// from importing zombieAI.
const _offRunStart = onGameEvent((e) => { if (e.name === 'run_start') zombieSystem.reset() })
// HMR re-evaluates this module: drop the old listener so it does not stack up.
import.meta.hot?.dispose(_offRunStart)

// Dev / preview only: browser tests
if (typeof window !== 'undefined' && import.meta.env.VITE_VERCEL_ENV !== 'production') window.__zombieSystem = zombieSystem
