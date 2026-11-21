// @vitest-environment node
// Zombie AI pieces: movement equivalence, screamer aura, id reuse, exploder and spider through the sim,
// seeded determinism, and the rule that src/zombieAI never imports React / R3F / three.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))
// the store plays sounds; there is no AudioContext in Node
vi.mock('../sounds')

import { useGameStore, getZombieArchetype } from '../store'
import { collidesWithWalls } from '../walls'
import * as cabin from '../maps/cabin'
import { applyMove, hasDirectPath } from '../zombieAI/movement'
import { computeAuras } from '../zombieAI/auras'
import { createZombie } from '../zombieAI/state'
import { SPIDER, EXPLODER } from '../zombieSpecials'
import { ZOMBIE_R, ARENA_BOUND } from '../zombieAI/constants'
import { makeSim, step, live, DT } from './zombieAI.helper'

const store = useGameStore
const zom = (id, type, x, z, over = {}) => ({ id, type, x, z, health: 5, maxHealth: 5, ...over })

// The reference implementations the old Zombie.jsx used (walls.js collidesWithWalls)
function refHasDirectPath(x1, z1, x2, z2, walls) {
  const dx = x2 - x1, dz = z2 - z1
  const dist = Math.sqrt(dx * dx + dz * dz)
  if (dist < 0.01) return true
  const steps = Math.max(2, Math.ceil(dist / (ZOMBIE_R * 0.5)))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    if (collidesWithWalls(x1 + dx * t, z1 + dz * t, ZOMBIE_R, walls)) return false
  }
  return true
}
function refApplyMove(pos, vx, vz, walls) {
  const R = ZOMBIE_R
  const nx = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.x + vx))
  const nz = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.z + vz))
  if (!collidesWithWalls(nx, nz, R, walls)) { pos.x = nx; pos.z = nz; return }
  if (!collidesWithWalls(nx, pos.z, R, walls)) { pos.x = nx; return }
  if (!collidesWithWalls(pos.x, nz, R, walls)) { pos.z = nz; return }
  let pushX = 0, pushZ = 0
  for (const w of walls) {
    const nearX = Math.max(w.x - w.halfW, Math.min(pos.x, w.x + w.halfW))
    const nearZ = Math.max(w.z - w.halfD, Math.min(pos.z, w.z + w.halfD))
    const dx = pos.x - nearX, dz = pos.z - nearZ
    const d2 = dx * dx + dz * dz
    if (d2 < R * R) { const d = Math.sqrt(d2) || 0.001; pushX += (dx / d) * (R - d); pushZ += (dz / d) * (R - d) }
  }
  pos.x = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.x + pushX))
  pos.z = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, pos.z + pushZ))
}

describe('zombieAI movement', () => {
  const walls = cabin.allWallSegments({ 3: 1, 4: 2 }, {})
  // deterministic pseudo-random points
  let seed = 12345
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const pt = () => ({ x: (rnd() - 0.5) * 38, z: (rnd() - 0.5) * 38 })

  it('hasDirectPath answers exactly like the full wall scan', () => {
    for (let i = 0; i < 3000; i++) {
      const a = pt(), b = rnd() < 0.2 ? { x: a.x + (rnd() - 0.5), z: a.z + (rnd() - 0.5) } : pt()
      expect(hasDirectPath(a.x, a.z, b.x, b.z, walls)).toBe(refHasDirectPath(a.x, a.z, b.x, b.z, walls))
    }
  })

  it('applyMove lands exactly where the old collision step did (incl. push-out)', () => {
    for (let i = 0; i < 3000; i++) {
      const p = pt()
      const a = { x: p.x, z: p.z }, b = { x: p.x, z: p.z }
      const vx = (rnd() - 0.5) * 0.4, vz = (rnd() - 0.5) * 0.4
      applyMove(a, vx, vz, walls)
      refApplyMove(b, vx, vz, walls)
      expect(a).toEqual(b)
    }
  })
})

describe('screamer aura', () => {
  const arch = getZombieArchetype('screamer')
  it('marks everything inside a live screamer radius once, never the screamer, never from a dead one', () => {
    const s = createZombie(1, 'screamer', 0, 0)
    const near = createZombie(2, 'walker', arch.auraRadius - 0.5, 0)
    const far = createZombie(3, 'walker', arch.auraRadius + 0.5, 0)
    const s2 = createZombie(4, 'screamer', 0, 1)            // a second screamer in range of `near`: no stacking
    const other = createZombie(5, 'screamer', 30, 30)
    const list = [s, near, far, s2, other]
    expect(computeAuras(list, arch)).toBe(true)
    expect(list.map((z) => z.aura)).toEqual([false, true, false, false, false])
    s.dying = true; s2.dying = true
    computeAuras(list, arch)
    expect(list.every((z) => !z.aura)).toBe(true)
  })

  it('speeds a zombie up by auraSpeedMultiplier in the sim', () => {
    const run = (withScreamer) => {
      store.getState().startSeededGame('duel', 'aura')
      store.setState({ phase: 'playing', hp: 1e6, maxHp: 1e6, wave: 1, zombies: [zom(1, 'walker', 0, 12), ...(withScreamer ? [zom(2, 'screamer', 1, 12)] : [])], pendingSpawns: [] })
      const { sys } = makeSim({ playerAt: { x: 0, z: -5 } })
      sys.tick(DT)
      const z = sys.get(1), z0 = z.z
      for (let i = 0; i < 30; i++) sys.tick(DT)
      return z0 - z.z
    }
    const plain = run(false), boosted = run(true)
    expect(boosted / plain).toBeCloseTo(arch.auraSpeedMultiplier, 1)
  })
})

describe('ZombieSystem bookkeeping', () => {
  it('a new run that reuses ids does not inherit the old zombie', () => {
    store.getState().startSeededGame('duel', 'reuse')
    store.setState({ phase: 'playing', zombies: [zom(0, 'walker', 15, 0)], pendingSpawns: [] })
    const { sys } = makeSim()
    sys.tick(DT)
    for (let i = 0; i < 60; i++) sys.tick(DT)
    const old = sys.get(0)
    expect(old.x).toBeLessThan(15)
    // the store jumps straight to a fresh run (same id, different zombie) without the system seeing an empty list
    store.setState({ zombies: [zom(0, 'runner', -15, 5)] })
    sys.tick(DT)
    const fresh = sys.get(0)
    expect(fresh).not.toBe(old)
    expect(fresh.type).toBe('runner')
    expect(fresh.x).toBeLessThan(-14)
    expect(sys.list).toHaveLength(1)
  })

  it('drops zombies the store no longer lists', () => {
    store.getState().startSeededGame('duel', 'drop')
    store.setState({ phase: 'playing', zombies: [zom(1, 'walker', 15, 0), zom(2, 'walker', 15, 3)], pendingSpawns: [] })
    const { sys } = makeSim()
    sys.tick(DT)
    expect(sys.list).toHaveLength(2)
    store.setState({ zombies: [zom(2, 'walker', 15, 3)] })
    sys.tick(DT)
    expect(sys.list.map((z) => z.id)).toEqual([2])
    expect(sys.get(1)).toBeUndefined()
  })
})

describe('specials through the sim', () => {
  beforeEach(() => { store.getState().startSeededGame('duel', 'specials') })

  it('an exploder reaching the player primes, bursts, hurts them and dies', () => {
    store.setState({ phase: 'playing', hp: 100, maxHp: 100, zombies: [zom(1, 'exploder', 3, 0, { health: 2, maxHealth: 2 })], pendingSpawns: [] })
    const { sys, log } = makeSim({ playerAt: { x: 0, z: 0 } })
    for (let i = 0; i < 6 * 30 && !log.explosion; i++) step(sys)
    expect(log.hiss).toBe(1)
    expect(log.explosion).toBe(1)
    expect(store.getState().hp).toBeLessThan(100)
    expect(store.getState().hp).toBeGreaterThanOrEqual(100 - EXPLODER.PLAYER_MAX)
    expect(store.getState().zombies.find((z) => z.id === 1).dying).toBe(true)
    for (let i = 0; i < 3 * 30; i++) step(sys)
    expect(sys.get(1).corpse).toBe(true)
  })

  it('a spider climbs, crawls over the player, winds up, drops and pounces', () => {
    store.setState({ phase: 'playing', hp: 100, maxHp: 100, zombies: [zom(1, 'spider', 2, 0, { health: 3, maxHealth: 3 })], pendingSpawns: [] })
    const { sys, log } = makeSim({ playerAt: { x: 0, z: 0 } })
    const seen = new Set()
    let hp0 = 100
    for (let i = 0; i < 12 * 30; i++) {
      step(sys)
      const zs = sys.get(1)
      seen.add(zs.spd.s)
      if (zs.spd.s === 'ceil') expect(zs.y).toBeGreaterThan(2)
      if (store.getState().hp < hp0) break
    }
    for (const s of ['floor', 'up', 'ceil', 'windup', 'drop']) expect(seen.has(s)).toBe(true)
    expect(log.shriek).toBeGreaterThan(0)
    expect(log.land).toBeGreaterThan(0)
    expect(store.getState().hp).toBe(100 - SPIDER.POUNCE_DAMAGE)
    hp0 = 0
  })

  it('a dying spider falls, rolls and settles', () => {
    store.setState({ phase: 'playing', hp: 100, maxHp: 100, zombies: [zom(1, 'spider', 2, 0, { health: 3, maxHealth: 3 })], pendingSpawns: [] })
    const { sys } = makeSim({ playerAt: { x: 20, z: 20 } })
    for (let i = 0; i < 3 * 30; i++) step(sys)
    store.getState().hitZombie(1, true, 'gun', 'deagle', 3)
    for (let i = 0; i < 3 * 30; i++) step(sys)
    const zs = sys.get(1)
    expect(zs.corpse).toBe(true)
    expect(zs.y).toBeCloseTo(SPIDER.CORPSE_Y, 5)
    expect(live(store)).toHaveLength(0)
  })
})

describe('determinism', () => {
  // wave 9: walkers, runners, brutes, exploders, armored, spitters (stream draws), screamers
  const run = (seedStr, secs) => {
    store.getState().startSeededGame('duel', seedStr)
    store.setState({ money: 1000, hp: 1e9, maxHp: 1e9, wave: 9 })
    store.getState().addPlank(3); store.getState().addPlank(4)
    const { sys } = makeSim({ playerAt: { x: 3.5, z: 0 } })
    store.getState().skipIntermission()
    store.getState().tick(0.1)
    for (let i = 0; i < secs * 30; i++) step(sys)
    return sys.list.map((z) => [z.id, z.type, z.x, z.z, z.y, z.yaw, z.dying])
  }
  it('the same seed gives the same zombie positions after N seconds of fixed-delta ticks', () => {
    const a = run('det-seed', 40), b = run('det-seed', 40)
    expect(a.length).toBeGreaterThan(10)
    expect(b).toEqual(a)
    const c = run('other-seed', 40)
    expect(c).not.toEqual(a)
  })
})

describe('purity', () => {
  it('src/zombieAI imports nothing from React, R3F, three or components', () => {
    const dir = path.resolve(__dirname, '../zombieAI')
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
    expect(files.length).toBeGreaterThan(8)
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
      for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        const spec = m[1]
        expect(spec, `${f} imports ${spec}`).not.toMatch(/^(react|react-dom|three|@react-three\/|zustand\/react)/)
        expect(spec, `${f} imports ${spec}`).not.toMatch(/components\//)
        expect(spec, `${f} imports ${spec}`).not.toMatch(/\.jsx$/)
      }
    }
  })
})
