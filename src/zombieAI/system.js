// ZombieSystem: owns every simulated zombie and ticks them all once per frame.
//
// Pure (no React, no R3F, no three.js), so it runs in Node: `src/__tests__/zombieAI.wave.test.js`
// plays a whole wave headless and the balance sim builds on it. The live game wires it up in
// components/ZombieManager.jsx (one useFrame: tick, then pose) with real sounds / particles via `io`.
//
//   const sys = new ZombieSystem({ store, map, io })
//   sys.player.x = ...; sys.player.z = ...     // the local player (the camera)
//   sys.tick(dt)                               // dt already clamped (<= 0.05) and times time.scale
//
// The store stays the source of truth for health / dying / the zombie list; the sim owns positions,
// timers and decisions and calls back into the store for the consequences (hitPlayer, hitPlank,
// breakWindow, hitZombieBurst, removeDyingZombie).
import { getZombieArchetype } from '../store'
import { makeIO } from './io'
import { createZombie } from './state'
import { tickZombie } from './tick'
import { recordHit } from './hitReact'
import { computeAuras } from './auras'
import { BURN_VISUAL_DURATION } from './constants'

export class ZombieSystem {
  constructor({ store, map, io }) {
    this.store = store
    this.map = map
    this.io = makeIO(io)
    this.list = []                 // sim zombies in store order (corpses included until the store drops them)
    this.byId = new Map()
    this.player = { x: 0, z: 0 }   // the local player
    this.remote = {}               // co-op guest: id -> { x, z } from the host's zombie_update
    this.cabinHW = map.HW
    this.cabinHD = map.HD
    this.wallH = map.WALL_H ?? 3.2
    this.doors = map.DOOR_DEFS ?? []
    this.bulletWalls = map.bulletWallSegments()
    this._furniture = new Set(map.FURNITURE_COLLIDERS ?? [])
    this._screamer = null          // archetype, read on first tick
    this.walls = []                // structure + boarded windows + closed doors, shared by every zombie
    this.ceilWalls = null          // the same without furniture (spiders on the ceiling), built on demand
    this._wallsPlanks = undefined
    this._wallsDoors = undefined
    this._lastZombies = null
    // Per-tick context, reused (no per-frame allocation)
    this.ctx = { dt: 0, phase: 'start', speed: 1.5, planks: {}, openDoors: null, selfOk: true, rp: null, lx: 0, lz: 0, auraSpeedMul: 1 }
  }

  // ── Lookup / registry ────────────────────────────────────────────────────
  get(id) { return this.byId.get(id) }

  // Idempotent: the pose component calls this on mount, the store sync calls it for new zombies.
  ensure(id, type, x, z) {
    type = type ?? 'walker'
    x = x ?? 0
    z = z ?? 0
    let zs = this.byId.get(id)
    if (zs && (zs.type !== type || zs.sx !== x || zs.sz !== z)) {
      // Same id, different zombie: a new run reuses ids from 0 and the old one was never synced away
      const at = this.list.indexOf(zs)
      zs = createZombie(id, type, x, z)
      this.byId.set(id, zs)
      if (at >= 0) this.list[at] = zs; else this.list.push(zs)
      return zs
    }
    if (!zs) {
      zs = createZombie(id, type, x, z)
      this.byId.set(id, zs)
      this.list.push(zs)
    }
    return zs
  }

  isWindowActive(wid) {
    return this.map.isWindowActive ? this.map.isWindowActive(wid, this.ctx.openDoors) : true
  }

  getCeilWalls() {
    if (!this.ceilWalls) this.ceilWalls = this.walls.filter((w) => !this._furniture.has(w))
    return this.ceilWalls
  }

  // { id: { x, z } } of every zombie that is not a settled corpse (what NetManager broadcasts and
  // what grenades / bolts use for blast radii)
  positions() {
    const out = {}
    const list = this.list
    for (let i = 0; i < list.length; i++) {
      const zs = list[i]
      if (!zs.corpse) out[zs.id] = { x: zs.x, z: zs.z }
    }
    return out
  }

  // Host's authoritative positions (co-op guest): each zombie converges toward them in tick()
  applyRemotePositions(posMap) {
    for (const id in posMap) this.remote[id] = posMap[id]
  }

  ignite(id) {
    const zs = this.byId.get(id)
    if (zs && !zs.corpse) zs.burn = BURN_VISUAL_DURATION
  }

  // Hit input (gun / knife / blast). Returns blood intensity: 0 regular, 1 kill, 2 headshot / deagle kill.
  hitReact(id, dx, dy, dz, head, weapon, dist) {
    return recordHit(this, this.byId.get(id), dx, dy, dz, head, weapon, dist)
  }

  reset() {
    this.list.length = 0
    this.byId.clear()
    this.remote = {}
    this._lastZombies = null
    this._wallsPlanks = undefined
    this._wallsDoors = undefined
  }

  // Mirror the store's zombie list: new ids get a sim zombie, vanished ids lose theirs, and every
  // zombie takes over the store's `dying` flag. Runs only when the store's array was replaced.
  sync(zombies) {
    this._lastZombies = zombies
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i]
      const zs = this.ensure(z.id, z.type, z.x, z.z)
      zs.dying = !!z.dying
    }
    if (this.list.length > zombies.length) {
      const live = new Set()
      for (let i = 0; i < zombies.length; i++) live.add(zombies[i].id)
      let w = 0
      for (let i = 0; i < this.list.length; i++) {
        const zs = this.list[i]
        if (live.has(zs.id)) this.list[w++] = zs
        else this.byId.delete(zs.id)
      }
      this.list.length = w
    }
  }

  // Draw hook: the live game calls each zombie's attached pose callback after the sim step.
  poseAll(dt) {
    const list = this.list
    for (let i = 0; i < list.length; i++) {
      const zs = list[i]
      if (zs.pose) zs.pose(zs, dt)
    }
  }

  tick(dt) {
    const st = this.store.getState()
    if (st.paused) return
    if (st.zombies !== this._lastZombies) this.sync(st.zombies)
    const list = this.list
    const n = list.length
    if (n === 0) return
    const ctx = this.ctx
    ctx.dt = dt
    ctx.phase = st.phase
    ctx.speed = st.getZombieSpeed()
    ctx.planks = st.windowPlanks
    ctx.openDoors = st.openDoors
    const role = st.mpRole
    ctx.selfOk = !role || st.coop[role].status === 'alive'
    const partnerOk = !role || st.coop[role === 'host' ? 'guest' : 'host'].status === 'alive'
    // The partner is a target only while a co-op link is live (a versus run has no partner in this world)
    ctx.rp = role && st.mpConnected && partnerOk ? this.io.remotePlayerPos() : null
    ctx.lx = this.player.x
    ctx.lz = this.player.z
    if (st.windowPlanks !== this._wallsPlanks || st.openDoors !== this._wallsDoors) {
      this._wallsPlanks = st.windowPlanks
      this._wallsDoors = st.openDoors
      this.walls = this.map.allWallSegments(st.windowPlanks, st.openDoors)
      this.ceilWalls = null
    }
    if (!this._screamer) { this._screamer = getZombieArchetype('screamer'); ctx.auraSpeedMul = this._screamer.auraSpeedMultiplier }
    computeAuras(list, this._screamer)
    for (let i = 0; i < n; i++) tickZombie(this, list[i], ctx)
  }
}
