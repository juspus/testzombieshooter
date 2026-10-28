import { describe, it, expect } from 'vitest'
import {
  MAIL_ITEMS, METER_MAX, MAIL_WARN_S, MAIL_GAP_S, mailItem, meterForKill, addMeter, canSend, spend,
  emptyQueue, enqueue, nextDue, land, warning, warningText,
} from '../mail'
import { ZOMBIE_ARCHETYPES } from '../store'
import { MODIFIERS } from '../modifiers'

describe('mail items', () => {
  it('has the five items with the agreed costs', () => {
    expect(MAIL_ITEMS.map((i) => [i.id, i.cost])).toEqual([['brute', 6], ['exploders', 8], ['spitters', 10], ['horde', 12], ['blackout', 15]])
  })
  it('uses real archetype and modifier ids', () => {
    for (const it of MAIL_ITEMS) {
      for (const t of it.types) expect(ZOMBIE_ARCHETYPES[t]).toBeTruthy()
      if (it.modifier) expect(MODIFIERS[it.modifier]).toBeTruthy()
    }
    expect(mailItem('brute').types).toEqual(['brute'])
    expect(mailItem('exploders').types).toEqual(['exploder', 'exploder', 'exploder'])
    expect(mailItem('spitters').types).toEqual(['spitter', 'spitter'])
    expect(mailItem('horde').types).toEqual(Array(8).fill('runner'))
    expect(mailItem('blackout').modifier).toBe('blackout')
  })
})

describe('meter', () => {
  it('pays 1 / 1.5 headshot / 2 knife', () => {
    expect(meterForKill({ source: 'gun' })).toBe(1)
    expect(meterForKill({ source: 'gun', headshot: true })).toBe(1.5)
    expect(meterForKill({ source: 'knife', headshot: true })).toBe(2)
  })
  it('caps at 30 and never goes negative', () => {
    expect(addMeter(29, 2)).toBe(METER_MAX)
    expect(addMeter(0, -3)).toBe(0)
  })
  it('canSend / spend', () => {
    expect(canSend(5.5, 'brute')).toBe(false)
    expect(canSend(6, 'brute')).toBe(true)
    expect(spend(7.5, 'brute')).toBe(1.5)
    expect(spend(5, 'brute')).toBe(5)
    expect(canSend(99, 'nope')).toBe(false)
  })
})

describe('delivery queue', () => {
  it('lands a delivery MAIL_WARN_S after it arrives', () => {
    const q = enqueue(emptyQueue(), { id: 'a', item: 'brute', edge: 'N', cluster: 0 }, 10)
    expect(q.list[0].landAt).toBe(10 + MAIL_WARN_S)
    expect(nextDue(q, 14.9)).toBe(null)
    expect(nextDue(q, 15).id).toBe('a')
  })
  it('spaces deliveries by MAIL_GAP_S', () => {
    let q = enqueue(emptyQueue(), { id: 'a', item: 'brute' }, 0)
    q = enqueue(q, { id: 'b', item: 'brute' }, 0)
    q = enqueue(q, { id: 'c', item: 'brute' }, 1)
    expect(q.list.map((e) => e.landAt)).toEqual([5, 5 + MAIL_GAP_S, 5 + 2 * MAIL_GAP_S])
  })
  it('keeps the gap after a landing', () => {
    let q = enqueue(emptyQueue(), { id: 'a', item: 'brute' }, 0)
    q = land(q, 'a', 5)
    q = enqueue(q, { id: 'b', item: 'brute' }, 5.5)
    expect(q.list[0].landAt).toBe(10.5)   // warning (5.5 + 5) is later than the 4 s gap (9)
    q = enqueue(emptyQueue(), { id: 'c' }, 0)
    q = land(q, 'c', 5)
    q = enqueue(q, { id: 'd' }, 0)
    expect(q.list[0].landAt).toBe(9)       // gap (5 + 4) beats the warning (0 + 5)
  })
  it('takes the earliest due entry first and removes it on land', () => {
    let q = enqueue(emptyQueue(), { id: 'a' }, 0)
    q = enqueue(q, { id: 'b' }, 0)
    expect(nextDue(q, 100).id).toBe('a')
    q = land(q, 'a', 100)
    expect(nextDue(q, 100).id).toBe('b')
    expect(q.lastLandAt).toBe(100)
  })
  it('warns about the earliest queued entry inside the window', () => {
    const q = enqueue(emptyQueue(), { id: 'a', item: 'brute', edge: 'N' }, 0)
    expect(warning(q, 0).id).toBe('a')
    expect(warning(emptyQueue(), 0)).toBe(null)
    expect(warningText({ item: 'brute', edge: 'N' })).toBe('MAIL: BRUTE · NORTH')
    expect(warningText({ item: 'blackout' })).toBe('MAIL: BLACKOUT')
  })
})
