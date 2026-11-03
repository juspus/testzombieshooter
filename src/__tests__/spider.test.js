import { describe, it, expect, vi } from 'vitest'
vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))
import { SPIDER, spiderStep, spiderCeilingAt, spiderCanMove, spiderAirborne, freshSpiderState } from '../zombieSpecials'
import { buildTypeList, zombieTypesForWave, ZOMBIE_ARCHETYPES } from '../store'
import { DOOR_DEFS, WALL_H } from '../maps/cabin'

const CEIL = WALL_H - SPIDER.BODY_Y
// Run the state machine for `secs` at 60 fps; returns the events in order.
function run(sp, secs, ctx) {
  const ev = []
  for (let t = 0; t < secs; t += 1 / 60) {
    const e = spiderStep(sp, 1 / 60, typeof ctx === 'function' ? ctx(sp) : ctx)
    if (e) ev.push(e)
  }
  return ev
}

describe('spider spawning', () => {
  it('unlocks at wave 11 and is guaranteed once from then on', () => {
    expect(ZOMBIE_ARCHETYPES.spider).toBeTruthy()
    expect(zombieTypesForWave(10)).not.toContain('spider')
    expect(zombieTypesForWave(11)).toContain('spider')
    expect(buildTypeList(10, 32)).not.toContain('spider')
    expect(buildTypeList(11, 35)).toContain('spider')
  })
})

describe('spider surface state machine', () => {
  it('stays on the floor outside the cabin', () => {
    const sp = freshSpiderState()
    expect(run(sp, 3, { inside: false, hdist: 0.5, ceilY: CEIL })).toEqual([])
    expect(sp.s).toBe('floor')
    expect(sp.y).toBe(SPIDER.BODY_Y)
    expect(spiderCanMove(sp)).toBe(true)
  })

  it('climbs to the ceiling once inside, upside down', () => {
    const sp = freshSpiderState()
    expect(run(sp, SPIDER.CLIMB_TIME + 0.1, { inside: true, hdist: 9, ceilY: CEIL })).toEqual(['climb'])
    expect(sp.s).toBe('ceil')
    expect(sp.y).toBeCloseTo(CEIL, 2)
    expect(sp.flip).toBeCloseTo(Math.PI, 5)
  })

  it('winds up above a player, drops, lands, then leaps back up', () => {
    const sp = freshSpiderState()
    run(sp, SPIDER.CLIMB_TIME + 0.1, { inside: true, hdist: 9, ceilY: CEIL })
    const seen = []
    const ctx = (s) => { if (!seen.length || seen[seen.length - 1] !== s.s) seen.push(s.s); return { inside: true, hdist: 0.3, ceilY: CEIL } }
    const ev = run(sp, 3, ctx)
    expect(ev.slice(0, 3)).toEqual(['windup', 'drop', 'land'])
    expect(seen.slice(0, 4)).toEqual(['ceil', 'windup', 'drop', 'floor'])
    // after FLOOR_TIME on the floor it goes back up (a quicker leap, not the slow climb)
    const sp2 = freshSpiderState()
    run(sp2, SPIDER.CLIMB_TIME + 0.1, { inside: true, hdist: 9, ceilY: CEIL })
    run(sp2, 3, (s) => ({ inside: true, hdist: s.s === 'floor' ? 9 : 0.3, ceilY: CEIL }))
    expect(sp2.s).toBe('floor')
    expect(run(sp2, SPIDER.FLOOR_TIME + 0.05, { inside: true, hdist: 9, ceilY: CEIL })).toEqual(['climb'])
    expect(sp2.dur).toBe(SPIDER.LEAP_TIME)
  })

  it('cancels the wind-up when the player gets away', () => {
    const sp = freshSpiderState()
    run(sp, SPIDER.CLIMB_TIME + 0.6, { inside: true, hdist: 9, ceilY: CEIL })   // climb + settle-in delay
    expect(spiderStep(sp, 1 / 60, { inside: true, hdist: 0.5, ceilY: CEIL })).toBe('windup')
    expect(spiderStep(sp, 1 / 60, { inside: true, hdist: SPIDER.CANCEL_RANGE + 0.1, ceilY: CEIL })).toBe('cancel')
    expect(sp.s).toBe('ceil')
    // no instant re-trigger: waits RETRY before winding up again
    expect(spiderStep(sp, 1 / 60, { inside: true, hdist: 0.5, ceilY: CEIL })).toBe(null)
  })

  it('does not freeze mid-air (airborne while climbing or falling)', () => {
    const sp = freshSpiderState()
    spiderStep(sp, 1 / 60, { inside: true, hdist: 9, ceilY: CEIL })
    expect(sp.s).toBe('up')
    expect(spiderAirborne(sp)).toBe(true)
    expect(spiderCanMove(sp)).toBe(false)
  })
})

describe('spider door lintels', () => {
  it('ducks under an interior doorway and uses the ceiling elsewhere', () => {
    const hall = DOOR_DEFS.find((d) => d.id === 'hall')   // X=-2 partition, gap along z
    expect(spiderCeilingAt(hall.x, hall.z, WALL_H, DOOR_DEFS)).toBe(SPIDER.DOORWAY_H)
    expect(spiderCeilingAt(hall.x + 0.5, hall.z + 0.5, WALL_H, DOOR_DEFS)).toBe(SPIDER.DOORWAY_H)
    expect(spiderCeilingAt(hall.x + 2, hall.z, WALL_H, DOOR_DEFS)).toBe(WALL_H)
    expect(spiderCeilingAt(4, -6, WALL_H, DOOR_DEFS)).toBe(WALL_H)
    expect(spiderCeilingAt(0, 0, 3.0, [])).toBe(3.0)   // diner: no interior doors
  })
})
