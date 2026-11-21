// Headless harness for the zombie AI (src/zombieAI): the real store and the real cabin map, no React,
// no three.js, no browser. Shared by zombieAI.*.test.js and the balance sim that builds on it.
import { useGameStore } from '../store'
import { ZombieSystem } from '../zombieAI'
import * as cabin from '../maps/cabin'

export const DT = 1 / 30

// An io that records what the AI asked for instead of playing it.
export function recorderIO() {
  const log = { groan: 0, footstep: 0, plankHit: 0, hiss: 0, explosion: 0, spitWindup: 0, spit: 0, skitter: 0, shriek: 0, land: 0, impact: 0, net: [] }
  return {
    log,
    io: {
      audio: {
        groan: () => { log.groan++; return true },
        footstep: () => { log.footstep++ },
        plankHit: () => { log.plankHit++ },
        exploderHiss: () => { log.hiss++ },
        explosion: () => { log.explosion++ },
        spitWindup: () => { log.spitWindup++ },
        spitLaunch: () => { log.spit++ },
        spiderSkitter: () => { log.skitter++ },
        spiderShriek: () => { log.shriek++ },
        spiderLand: () => { log.land++ },
      },
      fx: { impact: () => { log.impact++ } },
      net: { event: (name, data) => { log.net.push([name, data]) } },
      now: () => 0,
    },
  }
}

// Fresh run on the cabin map. `playerAt` is where the (stationary) local player stands.
export function makeSim({ playerAt = { x: 3.5, z: 0 } } = {}) {
  const store = useGameStore
  const rec = recorderIO()
  const sys = new ZombieSystem({ store, map: cabin, io: rec.io })
  sys.player.x = playerAt.x
  sys.player.z = playerAt.z
  return { sys, store, log: rec.log }
}

// One frame of the game loop the way ZombieManager runs it: store tick, then the zombie AI.
export function step(sys, dt = DT) {
  sys.store.getState().tick(dt)
  sys.tick(dt)
}

export function live(store) {
  return store.getState().zombies.filter((z) => !z.dying)
}

export const insideCabin = (zs) => Math.abs(zs.x) < cabin.HW && Math.abs(zs.z) < cabin.HD
