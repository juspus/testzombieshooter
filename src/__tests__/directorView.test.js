import { describe, it, expect } from 'vitest'
import { makeState, DIR_UNITS } from '../director'
import {
  mapBounds, fitMap, project, unproject, hitCluster, yawToScreen, availableBudget, reconcilePending,
  buyWave, spawnOpen, modsOpen, unitRows, modRows, unitForKey, matchZombies, approachAngle,
} from '../directorView'

const state = (o = {}) => makeState({
  seed: 's', round: 1, wave: 3, phase: 'playing', budgetLeft: 10, spawnLeft: 12, hp: 100, maxHp: 100,
  player: { x: 0, z: 0, yaw: 0 }, zombies: [], planks: {}, ...o,
})

describe('projection', () => {
  const walls = [{ x: 0, z: 0, halfW: 9, halfD: 10 }]
  const clusters = [{ x: -17, z: 0 }, { x: 17, z: 0 }]
  const b = mapBounds(walls, clusters, 2)
  it('bounds cover walls and clusters with padding', () => {
    expect(b).toEqual({ minX: -19, maxX: 19, minZ: -12, maxZ: 12 })
  })
  it('fit keeps aspect ratio, centres, and round-trips', () => {
    const fit = fitMap(b, 800, 400, 10)
    expect(fit.scale).toBeCloseTo((400 - 20) / 24)          // height-limited
    const tl = project(fit, b.minX, b.minZ), br = project(fit, b.maxX, b.maxZ)
    expect(tl.y).toBeCloseTo(10); expect(br.y).toBeCloseTo(390)
    expect((tl.x + br.x) / 2).toBeCloseTo(400)
    const p = project(fit, 3, -4), u = unproject(fit, p.x, p.y)
    expect(u.x).toBeCloseTo(3); expect(u.z).toBeCloseTo(-4)
  })
  it('hit test picks the nearest marker within the radius', () => {
    const fit = fitMap(b, 800, 400, 10)
    const m = project(fit, 17, 0)
    expect(hitCluster(fit, clusters, m.x + 5, m.y - 5, 24)).toBe(1)
    expect(hitCluster(fit, clusters, 400, 200, 24)).toBe(-1)
    expect(hitCluster(fit, clusters, m.x + 30, m.y, 24)).toBe(-1)
  })
  it('yaw 0 looks north (up the screen)', () => {
    const d = yawToScreen(0)
    expect(d.dx).toBeCloseTo(0); expect(d.dy).toBeCloseTo(-1)
    expect(yawToScreen(Math.PI / 2).dx).toBeCloseTo(-1)
  })
})

describe('budget', () => {
  it('available = view budget minus pending, never negative', () => {
    expect(availableBudget(state({ budgetLeft: 10 }), [{ cost: 3, t: 0 }, { cost: 4, t: 0 }])).toBe(3)
    expect(availableBudget(state({ budgetLeft: 2 }), [{ cost: 5, t: 0 }])).toBe(0)
    expect(availableBudget(null, [])).toBe(0)
  })
  it('recent spends survive a new state, older ones are counted by it', () => {
    const p = [{ cost: 1, t: 1000 }, { cost: 2, t: 1500 }]
    expect(reconcilePending(p, 1600)).toEqual([{ cost: 2, t: 1500 }])
    expect(reconcilePending(p, 1600, { reset: true })).toEqual([])
    expect(reconcilePending([{ cost: 1, t: 0 }], 3000, { settleMs: 5000 })).toEqual([])   // max age
  })
})

describe('unit rules', () => {
  it('locks units of later waves and marks unaffordable ones', () => {
    const rows = unitRows(state({ wave: 3, budgetLeft: 2 }), [])
    const by = Object.fromEntries(rows.map((r) => [r.id, r.status]))
    expect(by.walker).toBe('ok'); expect(by.runner).toBe('ok')
    expect(by.exploder).toBe('broke')     // cost 3 > 2
    expect(by.brute).toBe('locked'); expect(by.boss).toBe('locked')
  })
  it('pending spends reduce affordability', () => {
    const v = state({ wave: 3, budgetLeft: 3 })
    expect(unitRows(v, [{ cost: 1, t: 0 }]).find((r) => r.id === 'exploder').status).toBe('broke')
  })
  it('intermission buys for the next wave', () => {
    const v = state({ phase: 'intermission', wave: 3, budgetLeft: 20, spawnLeft: 0 })
    expect(buyWave(v)).toBe(4)
    expect(unitRows(v, []).find((r) => r.id === 'brute').status).toBe('ok')
  })
  it('spawn window rules', () => {
    expect(spawnOpen(state())).toBe(true)
    expect(spawnOpen(state({ spawnLeft: 0 }))).toBe(false)
    expect(spawnOpen(state({ phase: 'intermission', spawnLeft: 0 }))).toBe(true)
    expect(spawnOpen(state({ phase: 'wave_clear' }))).toBe(false)
    expect(spawnOpen(null)).toBe(false)
  })
  it('modifiers: intermission only, wave-gated, one per wave', () => {
    const inter = state({ phase: 'intermission', wave: 2, budgetLeft: 10, spawnLeft: 0 })   // next wave 3
    const by = (v) => Object.fromEntries(modRows(v, []).map((m) => [m.id, m.status]))
    expect(modsOpen(inter)).toBe(true)
    expect(by(inter)).toEqual({ fog: 'ok', blackout: 'ok', bloodlust: 'locked' })
    expect(by(state())).toMatchObject({ fog: 'closed', blackout: 'closed' })
    expect(by({ ...inter, nextMod: 'fog' })).toMatchObject({ fog: 'bought', blackout: 'closed' })
    expect(by({ ...inter, budgetLeft: 4 })).toMatchObject({ fog: 'ok', blackout: 'broke' })
  })
  it('number keys map to units, not to locked ones', () => {
    const v = state({ wave: 2 })
    expect(unitForKey('1', v, []).id).toBe('walker')
    expect(unitForKey('3', v, []).id).toBe('runner')
    expect(unitForKey('4', v, [])).toBeNull()        // exploder unlocks on wave 3
    expect(unitForKey('0', v, [])).toBeNull()
    expect(unitForKey('9', state({ wave: 9 }), []).id).toBe(DIR_UNITS[8].id)
  })
})

describe('smoothing', () => {
  it('keeps the rendered position of a zombie that moved a little, same type only', () => {
    const prev = [{ x: 1, z: 1, type: 'walker' }, { x: 5, z: 5, type: 'runner' }]
    const next = matchZombies(prev, [
      { x: 1.4, z: 1, type: 'walker', hp: 1 }, { x: 5.2, z: 5, type: 'walker', hp: 1 }, { x: 20, z: 20, type: 'walker', hp: 1 },
    ])
    expect(next[0]).toMatchObject({ x: 1, tx: 1.4 })
    expect(next[1]).toMatchObject({ x: 5.2, tx: 5.2 })   // only a runner was nearby: snaps
    expect(next[2]).toMatchObject({ x: 20 })
  })
  it('angles approach the short way round', () => {
    const a = approachAngle(3.0, -3.0, 1, 0.5)
    expect(a).toBeGreaterThan(3.0)    // goes up through pi, not down through 0
  })
})
