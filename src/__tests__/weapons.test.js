import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))
// The shotgun schedules its pump sounds with setTimeout: keep them off the (absent) AudioContext.
vi.mock('../sounds', async (orig) => ({ ...(await orig()), playPumpAction: vi.fn(), playShellThonk: vi.fn(), startFlamethrowerSound: vi.fn(), stopFlamethrowerSound: vi.fn() }))

import { WEAPONS, ALL_WEAPONS as REG_ALL, getWeapon, ammoPackFor, reloadTimeFor } from '../weapons'
import { shotgun } from '../weapons/shotgun'
import { flamethrower, burningCount, FLAME } from '../weapons/flamethrower'
import { deagle } from '../weapons/deagle'
import { crossbow } from '../weapons/crossbow'
import * as sounds from '../sounds'
import * as Store from '../store'
import * as WR from '../weaponRules'
import { startSeededRun, endSeededRun, runRandom } from '../rng'

// The values every gun had before the registry existed (store.js, weaponRules.js constants).
// If one of these has to change on purpose, change it in the gun's file and here.
const BEFORE = {
  pistol:       { caliber: '9mm',    clip: 10, startReserve: 30,   maxReserve: 60,   cost: null, buyReserve: 0,    boxWeight: 6,  name: 'Pistol',       upgradedName: 'Mustang' },
  shotgun:      { caliber: '12ga',   clip: 8,  startReserve: 24,   maxReserve: 48,   cost: 150,  buyReserve: 0,    boxWeight: 18, name: 'Shotgun',      upgradedName: 'Widowmaker' },
  ak47:         { caliber: '5.45mm', clip: 30, startReserve: 90,   maxReserve: 150,  cost: 270,  buyReserve: 0,    boxWeight: 16, name: 'AK-47',        upgradedName: 'Red Fang' },
  deagle:       { caliber: '.50 AE', clip: 7,  startReserve: 21,   maxReserve: 42,   cost: 700,  buyReserve: 0,    boxWeight: 10, name: 'Desert Eagle', upgradedName: 'Hand Cannon' },
  flamethrower: { caliber: 'Napalm', clip: 0,  startReserve: 1000, maxReserve: 2000, cost: 1500, buyReserve: 1000, boxWeight: 6,  name: 'Flamethrower', upgradedName: "Dragon's Breath" },
  crossbow:     { caliber: 'Bolt',   clip: 5,  startReserve: 30,   maxReserve: 40,   cost: null, buyReserve: 0,    boxWeight: 16, name: 'Crossbow',     upgradedName: 'Wraith' },
}

describe('weapon registry', () => {
  it('lists every gun in the old order, one file each', () => {
    expect(Store.ALL_WEAPONS).toEqual(['pistol', 'shotgun', 'ak47', 'deagle', 'flamethrower', 'crossbow'])
    expect(REG_ALL).toEqual(Store.ALL_WEAPONS)
    for (const id of Store.ALL_WEAPONS) {
      const w = getWeapon(id)
      expect(w, id).toBeTruthy()
      expect(w.id).toBe(id)
      for (const k of ['name', 'upgradedName', 'caliber', 'fireMode', 'model']) expect(typeof w[k], `${id}.${k}`).toBe('string')
      for (const k of ['clip', 'startReserve', 'maxReserve', 'buyReserve', 'cooldown', 'autoShootInterval', 'boxWeight']) expect(typeof w[k], `${id}.${k}`).toBe('number')
      expect(w.reload.base).toBeGreaterThan(w.reload.fast)
      expect(typeof w.fire, `${id}.fire`).toBe('function')
      expect(typeof w.sounds.reload, `${id}.sounds.reload`).toBe('function')
      if (w.fireMode !== 'spray') expect(typeof w.sounds.shot, `${id}.sounds.shot`).toBe('function')
    }
    expect(Object.keys(WEAPONS)).toEqual(Store.ALL_WEAPONS)
  })

  it('every model named by a weapon is exported by Gun.jsx (checked in the source)', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync('src/components/Gun.jsx', 'utf8')
    for (const id of Store.ALL_WEAPONS) expect(src).toMatch(new RegExp(`export function ${getWeapon(id).model}\\b`))
  })

  it('matches the before-values table', () => {
    for (const id of Object.keys(BEFORE)) {
      const w = WEAPONS[id]
      for (const [k, v] of Object.entries(BEFORE[id])) expect(w[k], `${id}.${k}`).toEqual(v)
    }
    expect(Object.keys(BEFORE).sort()).toEqual([...Store.ALL_WEAPONS].sort())
  })

  it('the old exports equal the registry', () => {
    for (const id of Store.ALL_WEAPONS) {
      const b = BEFORE[id]
      expect(Store.CALIBER_LABELS[id]).toBe(b.caliber)
      expect(Store.MAX_RESERVE[id]).toBe(b.maxReserve)
      expect(WR.BASE_CLIP[id]).toBe(b.clip)
      expect(WR.START_RESERVE[id]).toBe(b.startReserve)
      expect(WR.BOX_WEIGHTS[id]).toBe(b.boxWeight)
      expect(WR.WEAPON_NAMES[id]).toBe(b.name)
      expect(WR.UPGRADED_NAMES[id]).toBe(b.upgradedName)
    }
    expect(Object.keys(WR.BOX_WEIGHTS)).toEqual(Store.ALL_WEAPONS)
    expect([Store.CLIP_SIZE, Store.AK_CLIP, Store.DEAGLE_CLIP, Store.SHOTGUN_CLIP]).toEqual([10, 30, 7, 8])
    expect([Store.AK_COST, Store.DEAGLE_COST, Store.SHOTGUN_COST, Store.FLAMETHROWER_COST]).toEqual([270, 700, 150, 1500])
    expect([Store.AMMO_PACK_COST, Store.AMMO_PACK_AMOUNT, Store.DEEP_POCKETS_AMMO_PACK_AMOUNT]).toEqual([10, 20, 30])
    expect([Store.FLAMETHROWER_START_AMMO, Store.FLAMETHROWER_AMMO_PACK_COST, Store.FLAMETHROWER_AMMO_PACK_AMOUNT]).toEqual([1000, 100, 1000])
    expect([Store.FLAME_DPS, Store.FLAME_TICK_INTERVAL, Store.FLAME_FUEL_PER_SEC, Store.FLAME_RANGE, Store.FLAME_CONE_COS, Store.FLAME_BURN_DURATION]).toEqual([0.5, 0.2, 100, 9, 0.92, 2.0])
    expect(WR.CROSSBOW).toEqual({ FIRE_INTERVAL: 0.45, RELOAD: 1.8, RELOAD_FAST_HANDS: 1.2, PIERCE: 6, RANGE: 50, PICKUP_RADIUS: 1, MAX_BOLTS: 24, BLAST_RADIUS: 2, BLAST_INNER: 0.6, BLAST_MAX: 4, BLAST_SHAKE: 0.25 })
    expect([WR.UPGRADE_CLIP_MULT, WR.UPGRADE_DAMAGE_MULT, WR.CROSSBOW_DAMAGE_MULT]).toEqual([1.5, 2, 20])
  })

  it('derived rules: clip sizes, damage multipliers, ammo packs, reload times, fire modes', () => {
    expect(WR.clipSize('ak47')).toBe(30)
    expect(WR.clipSize('ak47', true)).toBe(45)
    expect(WR.clipSize('flamethrower', true)).toBe(0)
    expect(WR.clipSize('nope')).toBe(10)
    expect(WR.damageMult('crossbow')).toBe(20)
    expect(WR.damageMult('crossbow', true)).toBe(40)
    expect(WR.damageMult('pistol', true)).toBe(2)
    expect(WR.damageMult('nope')).toBe(1)
    expect(ammoPackFor('ak47')).toEqual({ cost: 10, amount: 20, deepAmount: 30 })
    expect(ammoPackFor('crossbow')).toEqual({ cost: 10, amount: 20, deepAmount: 30 })
    expect(ammoPackFor('flamethrower')).toEqual({ cost: 100, amount: 1000, deepAmount: 1000 })
    expect([reloadTimeFor('pistol', false), reloadTimeFor('pistol', true)]).toEqual([1.5, 1])
    expect([reloadTimeFor('crossbow', false), reloadTimeFor('crossbow', true)]).toEqual([1.8, 1.2])
    expect(WR.crossbowReloadTime(true)).toBe(1.2)
    expect(WEAPONS.ak47.fireMode).toBe('auto')
    expect(WEAPONS.ak47.fireInterval).toBe(0.1)
    expect(WEAPONS.flamethrower.fireMode).toBe('spray')
    expect([WEAPONS.shotgun.cooldown, WEAPONS.crossbow.cooldown]).toEqual([0.5, 0.45])
    expect(WEAPONS.shotgun.autoShootInterval).toBe(0.6)
    expect([WEAPONS.deagle.pierce, WEAPONS.crossbow.pierce, WEAPONS.shotgun.pellets]).toEqual([3, 6, 12])
  })

  it('?weapon= debug start reserve equals the registry start reserve', () => {
    // Before: flamethrower 1000, crossbow 30, every other gun clip * 3.
    for (const id of Store.ALL_WEAPONS) {
      const before = id === 'flamethrower' ? 1000 : id === 'crossbow' ? 30 : WR.BASE_CLIP[id] * 3
      expect(WEAPONS[id].startReserve, id).toBe(before)
    }
  })
})

describe('shotgun fire: pellets stay on the seeded stream', () => {
  function runShot() {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100)
    camera.position.set(1, 1.6, 2)
    camera.updateMatrixWorld(true)
    const ends = []
    let casings = 0, pumps = 0
    const ctx = {
      camera, zombieRefs: {}, muzzle: new THREE.Vector3(), perks: {}, windowPlanks: {}, bulletWalls: [],
      dmgMult: 1, upg: false, weapon: 'shotgun',
      worldHit: new THREE.Vector3(), worldRec: { dist: 0 },
      worldImpact: () => false,
      shatter: () => {}, hitRay: () => null, los: () => false,
      trails: { add: (a, b) => ends.push(b.clone()) },
      gun: { pump: () => { pumps++ } }, ejectShell: () => { casings++ },
      registerHit: () => { throw new Error('no hit expected') },
    }
    shotgun.fire(ctx)
    return { ends, casings, pumps }
  }

  it('draws angle then radius per pellet from runRandom("spread"), 12 pellets, in order', () => {
    startSeededRun('weapons-test')
    const a = runShot()
    startSeededRun('weapons-test')
    const b = runShot()
    expect(a.ends.length).toBe(12)
    expect(a.casings).toBe(1)
    expect(a.pumps).toBe(1)
    a.ends.forEach((p, i) => expect(p.toArray()).toEqual(b.ends[i].toArray()))

    // Reference: the old inline algorithm in Player.jsx, on the same stream.
    startSeededRun('weapons-test')
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100)
    camera.position.set(1, 1.6, 2)
    camera.updateMatrixWorld(true)
    a.ends.forEach((end) => {
      const angle = runRandom('spread')() * Math.PI * 2
      const r = Math.sqrt(runRandom('spread')()) * 0.10
      const rc = new THREE.Raycaster()
      rc.setFromCamera({ x: Math.cos(angle) * r, y: Math.sin(angle) * r }, camera)
      const expected = camera.position.clone().addScaledVector(rc.ray.direction, 30)
      expect(end.distanceTo(expected)).toBeLessThan(1e-9)
    })
    endSeededRun()
  })
})

// A fake world for the fire functions: zombies are points, the ray hits those within 0.3 m of it.
function fakeCtx(zombiePoints, extra = {}) {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100)
  camera.updateMatrixWorld(true)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera({ x: 0, y: 0 }, camera)
  const refs = {}
  zombiePoints.forEach((p, i) => { refs[i + 1] = { id: i + 1, p: new THREE.Vector3(...p), getWorldPosition(v) { return v.copy(this.p) } } })
  const log = { hits: [], trails: [], net: [], markers: [], bolts: [], fx: [], kills: [] }
  const ctx = {
    camera, raycaster, zombieRefs: refs, muzzle: new THREE.Vector3(0, -0.1, -0.4), perks: {}, windowPlanks: {}, bulletWalls: [],
    dmgMult: 1, upg: false, weapon: 'deagle', aimAssist: false,
    worldHit: new THREE.Vector3(), worldRec: { dist: 0 }, worldImpact: () => false,
    shatter: () => {},
    hitRay: (rc, ref) => {
      const to = ref.p.clone().sub(rc.ray.origin)
      const d = to.dot(rc.ray.direction)
      if (d <= 0) return null
      const off = to.sub(rc.ray.direction.clone().multiplyScalar(d)).length()
      return off < 0.3 ? { distance: d, point: ref.p.clone(), isHead: false } : null
    },
    los: () => false,
    hitZombie: (id, head, source, weapon, dist, mult) => { log.hits.push({ id, head, weapon, mult }); return id === 1 },
    deathSound: (id) => log.kills.push(id),
    ironSights: () => false, netSend: (e, d) => log.net.push([e, d]), fxNet: () => ({}), hitFx: (...a) => log.fx.push(a),
    registerHit: (k) => log.markers.push(k), kick: vi.fn(),
    trails: { add: (a, b) => log.trails.push([a.clone(), b.clone()]) },
    bolts: { fire: (a, b, o) => log.bolts.push(o) },
    gun: { setFlameActive: vi.fn(), getMuzzlePosition: () => new THREE.Vector3(0, -0.1, -0.3) },
    flameSpray: { spray: vi.fn() },
    zombies: () => [{ id: 1, type: 'walker' }, { id: 2, type: 'armored' }, { id: 3, type: 'walker' }, { id: 4, type: 'boss' }],
    isUpgraded: () => false, ignite: vi.fn(), consumeFuel: vi.fn(), hitZombieFlame: vi.fn(() => false), delta: 0.05,
    ...extra,
  }
  return { ctx, log }
}

describe('gun fire functions (fake world)', () => {
  it('deagle: pierces three zombies nearest first, every hit a headshot, one marker', () => {
    const { ctx, log } = fakeCtx([[0, 0, -9], [0, 0, -3], [0, 0, -6], [0, 0, -12], [4, 0, -4]])
    deagle.fire(ctx)
    expect(log.hits.map((h) => h.id)).toEqual([2, 3, 1])
    expect(log.hits.every((h) => h.head === true && h.weapon === 'deagle' && h.mult === 1)).toBe(true)
    expect(log.net.length).toBe(3)
    expect(log.net[0][0]).toBe('hit_zombie')
    expect(log.net[0][1]).toMatchObject({ id: 2, isHeadshot: true, source: 'gun', mult: 1 })
    expect(log.kills).toEqual([1])
    expect(log.markers).toEqual(['headkill'])
    expect(log.trails.length).toBe(1)
  })

  it('crossbow: pierces up to six, per-type multiplier, a bolt that hits no wall just flies on', () => {
    const pts = [1, 2, 3, 4].map((i) => [0, 0, -i * 2])
    const { ctx, log } = fakeCtx(pts)
    crossbow.fire(ctx)
    expect(log.hits.map((h) => h.id)).toEqual([1, 2, 3, 4])
    // walker 20, armored 4, walker 20, boss 2
    expect(log.hits.map((h) => h.mult)).toEqual([20, 4, 20, 2])
    expect(log.markers).toEqual(['kill'])
    expect(log.bolts.length).toBe(1)
    expect(log.bolts[0]).toMatchObject({ wraith: false, stick: false, attachId: -1 })
  })

  it('crossbow: the Wraith doubles the multiplier and a capped line attaches to the sixth', () => {
    const pts = [1, 2, 3, 4, 5, 6, 7].map((i) => [0, 0, -i * 2])
    const { ctx, log } = fakeCtx(pts, { upg: true, zombies: () => pts.map((_, i) => ({ id: i + 1, type: 'walker' })) })
    crossbow.fire(ctx)
    expect(log.hits.length).toBe(6)
    expect(log.hits.every((h) => h.mult === 40)).toBe(true)
    expect(log.bolts[0]).toMatchObject({ wraith: true, stick: false, attachId: -2 })
  })

  it('flamethrower: drains fuel, lights the spray once, ticks burn on zombies in the cone, ends cleanly', () => {
    const { ctx, log } = fakeCtx([[0, -0.1, -3], [6, 0, -1]], { hitZombieFlame: vi.fn(() => false) })
    sounds.startFlamethrowerSound.mockClear()
    sounds.stopFlamethrowerSound.mockClear()
    flamethrower.fire(ctx)
    flamethrower.fire(ctx)
    expect(ctx.consumeFuel).toHaveBeenCalledTimes(2)
    expect(ctx.consumeFuel.mock.calls[0][0]).toBeCloseTo(FLAME.FUEL_PER_SEC * 0.05, 9)
    expect(ctx.gun.setFlameActive).toHaveBeenCalledWith(true)
    expect(ctx.flameSpray.spray).toHaveBeenCalledTimes(2)
    expect(ctx.kick).toHaveBeenCalledWith('flamethrower')
    expect(sounds.startFlamethrowerSound).toHaveBeenCalledTimes(1)
    flamethrower.burn(ctx, true)            // first call ticks at once
    expect(ctx.hitZombieFlame).toHaveBeenCalledTimes(1)
    expect(ctx.hitZombieFlame.mock.calls[0][0]).toBe(1)   // only the zombie in the cone
    expect(ctx.hitZombieFlame.mock.calls[0][1]).toBeCloseTo(FLAME.DPS * FLAME.TICK_INTERVAL, 9)
    expect(log.markers).toEqual(['burn'])
    expect(log.net[0]).toEqual(['hit_zombie_flame', { id: 1, damage: ctx.hitZombieFlame.mock.calls[0][1] }])
    expect(burningCount()).toBe(1)
    // trigger released: it keeps burning for BURN_DURATION, one tick per TICK_INTERVAL
    flamethrower.stop(ctx)
    expect(sounds.stopFlamethrowerSound).toHaveBeenCalledTimes(1)
    expect(ctx.gun.setFlameActive).toHaveBeenLastCalledWith(false)
    ctx.delta = FLAME.TICK_INTERVAL
    for (let i = 0; i < 12; i++) flamethrower.burn(ctx, false)
    // 2.0 s / 0.2 s = 10 ticks; floating point in the countdown can add one more
    expect(ctx.hitZombieFlame.mock.calls.length).toBeGreaterThanOrEqual(FLAME.BURN_DURATION / FLAME.TICK_INTERVAL)
    expect(ctx.hitZombieFlame.mock.calls.length).toBeLessThanOrEqual(FLAME.BURN_DURATION / FLAME.TICK_INTERVAL + 1)
    expect(burningCount()).toBe(0)
  })

  it('flamethrower: the Upgrade Bench doubles the burn tick', () => {
    const { ctx } = fakeCtx([[0, -0.1, -3]], { isUpgraded: () => true })
    flamethrower.burn(ctx, true)
    expect(ctx.hitZombieFlame.mock.calls[0][1]).toBeCloseTo(FLAME.DPS * FLAME.TICK_INTERVAL * 2, 9)
    flamethrower.stop(ctx)
    ctx.delta = FLAME.TICK_INTERVAL
    for (let i = 0; i < 12; i++) flamethrower.burn(ctx, false)
    expect(burningCount()).toBe(0)
  })
})
