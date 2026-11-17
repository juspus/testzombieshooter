import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { registerFx, trails, gun, bolts, grenades, blood, knife, shells, flameSpray } from '../fxBus'
import {
  zombieRefs, registerZombieRef, unregisterZombieRef, registerHoleAdder, unregisterHoleAdder, addBulletHole,
  setFlameHitHandler, getFlameHitHandler, clearZombieRegistry,
} from '../zombieRegistry'

describe('fxBus', () => {
  it('is a no-op while nothing is mounted (the old `Component.fn?.()` behaviour)', () => {
    expect(() => {
      trails.add({}, {}); shells.eject({}, {}); flameSpray.spray({}, {}, 2); blood.spawn({}, {}, 0, false); blood.clear()
      bolts.fire({}, {}, {}); bolts.clear(); grenades.throw({}); grenades.release({}, 0); grenades.clear()
      gun.fire(); gun.pump(); gun.setFlameActive(true); knife.swing()
    }).not.toThrow()
    expect(gun.getMuzzlePosition()).toBeUndefined()
  })

  it('routes a call to the registered implementation and passes the arguments through', () => {
    const add = vi.fn()
    const off = registerFx(trails, { add })
    trails.add('a', 'b')
    expect(add).toHaveBeenCalledWith('a', 'b')
    off()
    trails.add('c', 'd')
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('returns what the implementation returns (muzzle position)', () => {
    const off = registerFx(gun, { getMuzzlePosition: () => 'muzzle' })
    expect(gun.getMuzzlePosition()).toBe('muzzle')
    off()
    expect(gun.getMuzzlePosition()).toBeUndefined()
  })

  it('a stale cleanup never removes a newer registration (remount, StrictMode, HMR)', () => {
    const first = vi.fn(), second = vi.fn()
    const offFirst = registerFx(knife, { swing: first })
    const offSecond = registerFx(knife, { swing: second })   // the new instance registers before the old cleanup lands
    offFirst()
    knife.swing()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    offSecond()
    knife.swing()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('one cleanup resets every member its call set', () => {
    const fire = vi.fn(), pump = vi.fn()
    const off = registerFx(gun, { fire, pump, getMuzzlePosition: () => 1 })
    gun.fire(); gun.pump()
    expect(gun.getMuzzlePosition()).toBe(1)
    off()
    gun.fire(); gun.pump()
    expect(fire).toHaveBeenCalledTimes(1)
    expect(pump).toHaveBeenCalledTimes(1)
    expect(gun.getMuzzlePosition()).toBeUndefined()
  })
})

describe('zombieRegistry', () => {
  beforeEach(() => clearZombieRegistry())

  it('keeps the live group of each zombie and forgets it on unregister', () => {
    const g = {}
    registerZombieRef(3, g)
    expect(zombieRefs[3]).toBe(g)
    unregisterZombieRef(3, g)
    expect(zombieRefs[3]).toBeUndefined()
  })

  it('an old cleanup cannot remove the group a re-mounted zombie registered', () => {
    const oldG = {}, newG = {}
    registerZombieRef(7, oldG)
    registerZombieRef(7, newG)
    unregisterZombieRef(7, oldG)
    expect(zombieRefs[7]).toBe(newG)
  })

  it('the map is one live object: a reader holding it sees later changes', () => {
    const held = zombieRefs
    registerZombieRef(1, 'x')
    expect(held[1]).toBe('x')
  })

  it('routes bullet holes to the zombie they hit, and not after it unregisters', () => {
    const add = vi.fn(() => 'ok')
    registerHoleAdder(2, add)
    expect(addBulletHole(2, 'p', 'n')).toBe('ok')
    expect(add).toHaveBeenCalledWith('p', 'n')
    expect(addBulletHole(99, 'p', 'n')).toBeUndefined()
    const other = vi.fn()
    registerHoleAdder(2, other)
    unregisterHoleAdder(2, add)      // stale cleanup
    addBulletHole(2, 'p', 'n')
    expect(other).toHaveBeenCalledTimes(1)
    unregisterHoleAdder(2)           // corpse settled
    expect(addBulletHole(2, 'p', 'n')).toBeUndefined()
  })

  it('the flame hit handler is set while Player is mounted and cleared by its own cleanup only', () => {
    const a = vi.fn(), b = vi.fn()
    const offA = setFlameHitHandler(a)
    const offB = setFlameHitHandler(b)
    offA()
    expect(getFlameHitHandler()).toBe(b)
    offB()
    expect(getFlameHitHandler()).toBeNull()
  })
})

// A component used to be a bag for side doors: `Gun.fire = () => ...` assigned during render, found
// only by grepping, left stale by a remount or a hot reload. They live in fxBus.js / zombieRegistry.js
// now; this keeps it that way.
describe('no component carries properties', () => {
  const SRC = resolve(__dirname, '..')
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : walk(p)
    return /\.(jsx|js)$/.test(f) ? [p] : []
  })
  // PascalCase target (Gun, Player, BloodFX), not a CONSTANT_CASE context object like FIRE or a namespace like THREE
  const COMPONENT_ASSIGN = /^[ \t]*([A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*)\.\w+[ \t]*=[^=]/gm

  it('no component file assigns a property on a component', () => {
    const offenders = []
    for (const file of walk(join(SRC, 'components')).concat(walk(join(SRC, 'playground')))) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(COMPONENT_ASSIGN)) offenders.push(`${relative(SRC, file)}: ${m[0].trim()}`)
    }
    expect(offenders).toEqual([])
  })

  it('the pattern catches the old side doors', () => {
    for (const line of ['Gun.fire = () => {', '  Player.registerZombieRef = (id, ref) => {}', 'FlameSpray.zombieRefs = zombieRefs.current']) {
      expect(new RegExp(COMPONENT_ASSIGN.source, 'm').test(line)).toBe(true)
    }
    for (const line of ['FIRE.camera = camera', 'const x = Gun.fire', 'if (Gun.fire == 1) {']) {
      expect(new RegExp(COMPONENT_ASSIGN.source, 'm').test(line)).toBe(false)
    }
  })
})
