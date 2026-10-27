import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore, CALIBER_LABELS, ALL_WEAPONS, MAX_RESERVE } from '../store'
import * as WR from '../weaponRules'
import { armorMultiplier } from '../zombieSpecials'

const S = () => useGameStore.getState()
const seq = (...v) => { let i = 0; return () => v[i++ % v.length] }

describe('box weighting', () => {
  it('pool = every shop weapon + the crossbow exclusive', () => {
    for (const w of ['pistol', 'shotgun', 'ak47', 'deagle', 'flamethrower', 'crossbow']) expect(WR.BOX_WEIGHTS[w]).toBeGreaterThan(0)
    expect(ALL_WEAPONS).toContain('crossbow')
    expect(CALIBER_LABELS.crossbow).toBeTruthy()
  })
  it('rolls follow the weights and honour exclusions', () => {
    const total = Object.values(WR.BOX_WEIGHTS).reduce((a, b) => a + b, 0)
    const counts = {}
    const N = 5000
    let seed = 1
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < N; i++) { const w = WR.rollBoxWeapon(rng); counts[w] = (counts[w] ?? 0) + 1 }
    for (const [w, wt] of Object.entries(WR.BOX_WEIGHTS)) expect(counts[w] / N).toBeCloseTo(wt / total, 1)
    for (let i = 0; i < 200; i++) expect(WR.rollBoxWeapon(rng, ['shotgun', 'ak47'])).not.toMatch(/^(shotgun|ak47)$/)
  })
  it('uses before the bear are 8..12 and the last one is the bear', () => {
    expect(WR.rollBoxUses(() => 0)).toBe(8)
    expect(WR.rollBoxUses(() => 0.9999)).toBe(12)
    let st = { uses: 0, maxUses: 3 }
    expect(WR.boxRollOutcome(st).teddy).toBe(false)
    st = { uses: 2, maxUses: 3 }
    const o = WR.boxRollOutcome(st)
    expect(o.teddy).toBe(true)
    expect(o.weapon).toBeNull()
  })
})

describe('carrying slots (max 3 guns, CoD replace rule)', () => {
  const base = () => ({
    weapon: 'pistol', ownedWeapons: ['pistol'], bulletsInClip: 4, reserveBullets: 9,
    savedClips: { pistol: 0, ak47: 0, shotgun: 0, deagle: 0, flamethrower: 0, crossbow: 0 },
    savedReserves: { pistol: 0, ak47: 0, shotgun: 0, deagle: 0, flamethrower: 0, crossbow: 0 },
    upgradedWeapons: {},
  })
  it('adds into a free slot, parking the old weapon ammo', () => {
    const p = WR.giveWeapon(base(), 'crossbow')
    expect(p.ownedWeapons).toEqual(['pistol', 'crossbow'])
    expect(p.weapon).toBe('crossbow')
    expect(p.bulletsInClip).toBe(5)
    expect(p.reserveBullets).toBe(30)
    expect(p.savedClips.pistol).toBe(4)
    expect(p.savedReserves.pistol).toBe(9)
  })
  it('replaces the weapon in hand when 3 are carried', () => {
    const s = { ...base(), weapon: 'shotgun', ownedWeapons: ['pistol', 'shotgun', 'ak47'], bulletsInClip: 2, reserveBullets: 5, upgradedWeapons: { shotgun: true } }
    const p = WR.giveWeapon(s, 'deagle')
    expect(p.ownedWeapons).toEqual(['pistol', 'deagle', 'ak47'])
    expect(p.ownedWeapons).toHaveLength(WR.MAX_GUNS)
    expect(p.upgradedWeapons.shotgun).toBeUndefined()   // upgrade is lost with the gun
    expect(p.upgradedWeapons.deagle).toBe(false)
    expect(p.savedClips.shotgun).toBe(0)
    expect(p.savedReserves.shotgun).toBe(0)
    expect(p.bulletsInClip).toBe(7)
  })
  it('a weapon already carried is only refilled', () => {
    const s = { ...base(), ownedWeapons: ['pistol', 'ak47'], savedClips: { ...base().savedClips, ak47: 3 } }
    const p = WR.giveWeapon(s, 'ak47')
    expect(p.weapon).toBeUndefined()
    expect(p.savedClips.ak47).toBe(30)
  })
})

describe('teddy move', () => {
  const anchors = { main: { box: {} }, hall: { box: {} }, kitchen: { box: {} } }
  it('picks another open room, never the current one', () => {
    for (let i = 0; i < 20; i++) {
      const r = WR.pickBoxRoom(new Set(['main', 'hall']), 'hall', anchors, () => i / 20)
      expect(r).toBe('main')
    }
  })
  it('ignores sealed rooms and stays put when there is nowhere to go', () => {
    expect(WR.pickBoxRoom(new Set(['main', 'hall']), 'hall', anchors, () => 0.99)).toBe('main')
    expect(WR.pickBoxRoom(new Set(['hall']), 'hall', anchors)).toBe('hall')
  })
})

describe('upgrade stats and naming', () => {
  it('names: base and upgraded for every weapon', () => {
    expect(WR.weaponName('pistol')).toBe('Pistol')
    expect(WR.weaponName('pistol', true)).toBe('Mustang')
    expect(WR.weaponName('ak47', true)).toBe('Red Fang')
    expect(WR.weaponName('shotgun', true)).toBe('Widowmaker')
    expect(WR.weaponName('deagle', true)).toBe('Hand Cannon')
    expect(WR.weaponName('flamethrower', true)).toBe("Dragon's Breath")
    expect(WR.weaponName('crossbow', true)).toBe('Wraith')
  })
  it('+50% mag and x2 damage', () => {
    expect(WR.clipSize('pistol', true)).toBe(15)
    expect(WR.clipSize('ak47', true)).toBe(45)
    expect(WR.clipSize('shotgun', true)).toBe(12)
    expect(WR.clipSize('deagle', true)).toBe(11)
    expect(WR.clipSize('crossbow', true)).toBe(8)
    expect(WR.clipSize('flamethrower', true)).toBe(0)
    expect(WR.damageMult('pistol')).toBe(1)
    expect(WR.damageMult('pistol', true)).toBe(2)
    expect(WR.damageMult('crossbow')).toBeGreaterThanOrEqual(16)   // one-shots a boss body hit
    expect(WR.damageMult('crossbow', true)).toBe(WR.damageMult('crossbow') * 2)
  })
})

describe('store integration: ammo pools', () => {
  beforeEach(() => {
    S().startGame()
    useGameStore.setState({ money: 5000 })
  })

  it('taking a box weapon parks the old pool and loads the new one', () => {
    useGameStore.setState({ bulletsInClip: 6, reserveBullets: 17 })
    useGameStore.setState({ box: { ...S().box, phase: 'ready', result: 'crossbow', payer: 'host', at: performance.now() } })
    expect(S().takeBox('host')).toBe('crossbow')
    const s = S()
    expect(s.weapon).toBe('crossbow')
    expect(s.ownedWeapons).toEqual(['pistol', 'crossbow'])
    expect(s.bulletsInClip).toBe(5)
    expect(s.reserveBullets).toBe(30)
    expect(s.savedClips.pistol).toBe(6)
    expect(s.savedReserves.pistol).toBe(17)
    expect(s.box.phase).toBe('idle')
    // switching back restores the pistol pool, crossbow pool is parked
    S().switchWeapon('pistol')
    expect(S().bulletsInClip).toBe(6)
    expect(S().reserveBullets).toBe(17)
    expect(S().savedClips.crossbow).toBe(5)
  })

  it('only the payer can take; a stale result cannot be taken', () => {
    useGameStore.setState({ box: { ...S().box, phase: 'ready', result: 'ak47', payer: 'guest', at: performance.now() } })
    expect(S().takeBox('host')).toBeNull()
    useGameStore.setState({ box: { ...S().box, phase: 'idle', result: null, payer: null } })
    expect(S().takeBox('host')).toBeNull()
  })

  it('4th gun replaces the one in hand; the shop follows the same rule', () => {
    useGameStore.setState({ ownedWeapons: ['pistol', 'shotgun', 'ak47'], weapon: 'ak47', bulletsInClip: 30, reserveBullets: 90 })
    S().buyItem('deagle')
    expect(S().ownedWeapons).toEqual(['pistol', 'shotgun', 'deagle'])
    expect(S().weapon).toBe('deagle')
  })

  it('buying the box charges once; the bear roll is free; busy box rejects', () => {
    const before = S().money
    useGameStore.setState({ box: { ...S().box, uses: 0, maxUses: 9 } })
    const o = S().buyBox(seq(0.5))
    expect(o.teddy).toBe(false)
    expect(S().money).toBe(before - WR.BOX_COST)
    expect(S().box.phase).toBe('cycling')
    expect(S().buyBox()).toBeNull()                 // busy
    expect(S().money).toBe(before - WR.BOX_COST)
    useGameStore.setState({ box: { ...S().box, phase: 'idle', uses: 8, maxUses: 9 } })
    const m = S().money
    expect(S().buyBox().teddy).toBe(true)
    expect(S().money).toBe(m)                       // refunded: never charged
    expect(S().box.phase).toBe('teddy')
  })

  it('box phases advance on the clock, and the bear moves the box to another open room', () => {
    useGameStore.setState({ openDoors: { hall: true, bedroom: true }, box: { ...S().box, room: 'hall', phase: 'cycling', result: 'ak47', payer: 'host', at: 1000 } })
    S().tickBox(1000 + WR.BOX_CYCLE_MS - 1)
    expect(S().box.phase).toBe('cycling')
    S().tickBox(1000 + WR.BOX_CYCLE_MS + 1)
    expect(S().box.phase).toBe('ready')
    const at = S().box.at
    S().tickBox(at + WR.BOX_TAKE_MS + 1)
    expect(S().box.phase).toBe('idle')              // sank back
    useGameStore.setState({ box: { ...S().box, phase: 'teddy', result: 'teddy', at: 0 } })
    expect(S().tickBox(WR.BOX_TEDDY_MS + 1, false)).toBeNull()   // guests wait for the host
    expect(S().box.phase).toBe('teddy')
    expect(S().tickBox(WR.BOX_TEDDY_MS + 1, true)).toBe('moved')
    expect(S().box.room).not.toBe('hall')
    expect(['main', 'bedroom']).toContain(S().box.room)
    expect(S().box.uses).toBe(0)
    expect(S().box.maxUses).toBeGreaterThanOrEqual(8)
    expect(S().box.phase).toBe('idle')
  })

  it('the box starts outside the start room', () => {
    expect(S().box.room).not.toBe('main')
  })

  it('bench: pays, holds the gun for BENCH_TIME, then upgrades mag/ammo once', () => {
    useGameStore.setState({ weapon: 'ak47', ownedWeapons: ['pistol', 'ak47'], bulletsInClip: 5, reserveBullets: 7 })
    const m = S().money
    expect(S().startUpgrade()).toBe(true)
    expect(S().money).toBe(m - WR.BENCH_COST)
    expect(S().benchBusy).toBe('ak47')
    S().switchWeapon('pistol')                       // blocked while busy
    expect(S().weapon).toBe('ak47')
    S().tickBench(WR.BENCH_TIME - 0.5)
    expect(S().benchBusy).toBe('ak47')
    S().tickBench(0.6)
    expect(S().benchBusy).toBeNull()
    expect(S().upgradedWeapons.ak47).toBe(true)
    expect(S().bulletsInClip).toBe(45)
    expect(S().reserveBullets).toBeGreaterThanOrEqual(MAX_RESERVE.ak47)
    expect(S().startUpgrade()).toBe(false)           // one level only
    expect(S().money).toBe(m - WR.BENCH_COST)
  })

  it('upgraded mags survive reload math; Max Ammo refills crossbow + upgraded clips', () => {
    useGameStore.setState({ weapon: 'crossbow', ownedWeapons: ['pistol', 'crossbow', 'ak47'], upgradedWeapons: { crossbow: true, ak47: true },
      bulletsInClip: 0, reserveBullets: 10, savedClips: { ...S().savedClips, ak47: 1 }, savedReserves: { ...S().savedReserves, ak47: 4 } })
    expect(S().beginReload()).toBe(true)
    S().finishReload()
    expect(S().bulletsInClip).toBe(8)               // upgraded crossbow mag = 8
    expect(S().reserveBullets).toBe(2)
    S().applyPowerup('max_ammo')
    expect(S().bulletsInClip).toBe(8)
    expect(S().reserveBullets).toBe(MAX_RESERVE.crossbow)
    expect(S().savedClips.ak47).toBe(45)
    expect(S().savedReserves.ak47).toBe(MAX_RESERVE.ak47)
  })

  it('upgraded damage multiplier is applied by hitZombie', () => {
    useGameStore.setState({ phase: 'playing', zombies: [{ id: 1, x: 0, z: 0, health: 7, type: 'brute' }], pendingSpawns: [] })
    S().hitZombie(1, false, 'gun', 'pistol', Infinity, WR.damageMult('pistol', true))
    expect(S().zombies.find((z) => z.id === 1).health).toBe(5)
    S().hitZombie(1, true, 'gun', 'pistol', Infinity, WR.damageMult('pistol', true))   // head 3 x2
    expect(S().zombies.find((z) => z.id === 1).dying).toBe(true)
  })

  it('a new run resets upgrades and the box', () => {
    useGameStore.setState({ upgradedWeapons: { pistol: true }, box: { ...S().box, uses: 5, room: 'bedroom' } })
    S().startGame()
    expect(S().upgradedWeapons).toEqual({})
    expect(S().box.uses).toBe(0)
  })
})

describe('repeating crossbow', () => {
  it('magazine / reserve / timings', () => {
    expect(WR.clipSize('crossbow')).toBe(5)
    expect(WR.START_RESERVE.crossbow).toBe(30)
    expect(MAX_RESERVE.crossbow).toBe(40)
    expect(WR.CROSSBOW.FIRE_INTERVAL).toBe(0.45)
    expect(WR.crossbowReloadTime(false)).toBe(1.8)
    expect(WR.crossbowReloadTime(true)).toBe(1.2)
    expect(WR.CROSSBOW.PIERCE).toBe(6)
  })

  it('bolts one-shot ordinary zombies, hurt tough ones without killing the boss', () => {
    const hp = { walker: 2, runner: 1, brute: 7, armored: 5, boss: 16 }
    for (const t of ['walker', 'runner', 'crawler', 'exploder', 'screamer', 'spitter']) expect(WR.boltMult(t) * 1).toBeGreaterThanOrEqual(2)
    for (const t of ['brute', 'armored']) {
      expect(WR.boltMult(t)).toBeLessThan(hp[t])       // body: heavy, not lethal
      expect(WR.boltMult(t) * 3).toBeGreaterThanOrEqual(hp[t])   // head kills
    }
    expect(WR.boltMult('boss') * 3).toBeLessThan(hp.boss)        // not even a headshot
    expect(WR.boltMult('boss')).toBeGreaterThanOrEqual(2)
    expect(WR.boltMult('walker', true)).toBe(WR.boltMult('walker') * 2)
    expect(armorMultiplier('armored', { weapon: 'crossbow', head: false, source: 'gun' })).toBe(1)
    expect(armorMultiplier('armored', { weapon: 'pistol', head: false, source: 'gun' })).toBeLessThan(1)
  })

  const zs = (n, type = 'walker') => Array.from({ length: n }, (_, i) => ({ id: i + 1, x: 0, z: -i, health: 2, type }))
  it('one bolt kills a line of zombies through hitZombie', () => {
    useGameStore.setState({ phase: 'playing', zombies: zs(6), pendingSpawns: [] })
    for (let id = 1; id <= 6; id++) expect(S().hitZombie(id, false, 'gun', 'crossbow', id, WR.boltMult('walker'))).toBe(true)
    expect(S().zombies.filter((z) => !z.dying).length).toBe(0)
  })

  it('a boss survives a bolt in the head; an armored zombie takes full damage', () => {
    useGameStore.setState({ phase: 'playing', zombies: [{ id: 1, health: 16, type: 'boss' }, { id: 2, health: 5, type: 'armored' }], pendingSpawns: [] })
    expect(S().hitZombie(1, true, 'gun', 'crossbow', 5, WR.boltMult('boss'))).toBe(false)
    expect(S().zombies.find((z) => z.id === 1).health).toBe(10)
    expect(S().hitZombie(2, false, 'gun', 'crossbow', 5, WR.boltMult('armored'))).toBe(false)
    expect(S().zombies.find((z) => z.id === 2).health).toBe(1)   // no 0.25 armour scaling
  })

  it('collecting bolts: +1 reserve, capped at MAX_RESERVE (Deep Pockets x1.5), parked pool too', () => {
    useGameStore.setState({ weapon: 'crossbow', ownedWeapons: ['pistol', 'crossbow'], reserveBullets: 10, perks: {} })
    expect(S().collectBolt()).toBe(true)
    expect(S().reserveBullets).toBe(11)
    useGameStore.setState({ reserveBullets: MAX_RESERVE.crossbow })
    expect(S().collectBolt()).toBe(false)
    useGameStore.setState({ perks: { deep_pockets: true } })
    expect(S().collectBolt()).toBe(true)
    expect(S().reserveBullets).toBe(MAX_RESERVE.crossbow + 1)
    useGameStore.setState({ weapon: 'pistol', perks: {}, savedReserves: { ...S().savedReserves, crossbow: 5 } })
    expect(S().collectBolt()).toBe(true)
    expect(S().savedReserves.crossbow).toBe(6)
    useGameStore.setState({ ownedWeapons: ['pistol'] })
    expect(S().collectBolt()).toBe(false)   // no crossbow carried
    expect(WR.collectBoltReserve(39, 40)).toBe(40)
    expect(WR.collectBoltReserve(40, 40)).toBeNull()
  })

  it('Wraith blast: small radius, kills walkers close, spares brutes', () => {
    expect(WR.boltBlastDamage(0)).toBe(WR.CROSSBOW.BLAST_MAX)
    expect(WR.boltBlastDamage(WR.CROSSBOW.BLAST_RADIUS)).toBe(0)
    expect(WR.boltBlastDamage(1.2)).toBeGreaterThanOrEqual(2)
    expect(WR.boltBlastDamage(1.9)).toBeLessThan(2)
    expect(WR.CROSSBOW.BLAST_MAX).toBeLessThan(7)
    expect(WR.CROSSBOW.BLAST_RADIUS).toBe(2)
    // 'bolt' source blast kills a walker via hitZombieBurst
    useGameStore.setState({ phase: 'playing', zombies: zs(1), pendingSpawns: [] })
    expect(S().hitZombieBurst(1, WR.boltBlastDamage(0.5), 'bolt')).toBe(true)
  })
})
