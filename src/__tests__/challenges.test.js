import { describe, it, expect } from 'vitest'
import {
  TEMPLATES, dailyChallenges, weeklyChallenges, dayKey, weekKey, applyEvent, sliceFor,
  mergeChallengeState, sanitizeChallengeState, msUntilDailyReset, msUntilWeeklyReset, formatCountdown,
} from '../challenges'

const D = (s) => new Date(`${s}T12:00:00Z`)

describe('generation', () => {
  it('has a pool of ~20 templates', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(20)
  })

  it('is deterministic per UTC date and differs between days', () => {
    expect(dailyChallenges(D('2026-10-27'))).toEqual(dailyChallenges(new Date('2026-10-27T00:00:01Z')))
    expect(dailyChallenges(D('2026-10-27'))).not.toEqual(dailyChallenges(D('2026-10-28')))
  })

  it('gives 3 distinct dailies and 1 weekly with the right XP', () => {
    for (let i = 0; i < 40; i++) {
      const date = new Date(Date.UTC(2026, 0, 1 + i))
      const d = dailyChallenges(date)
      expect(d).toHaveLength(3)
      expect(new Set(d.map((c) => c.tpl)).size).toBe(3)
      expect(d.every((c) => c.xp === 150 && c.target >= 1 && c.text.length > 5)).toBe(true)
      const w = weeklyChallenges(date)
      expect(w).toHaveLength(1)
      expect(w[0].xp).toBe(600)
    }
  })

  it('weekly is stable Mon-Sun (UTC) and changes on Monday', () => {
    expect(weekKey(D('2026-10-26'))).toBe('2026-10-26') // Monday
    expect(weekKey(D('2026-11-01'))).toBe('2026-10-26') // Sunday
    expect(weekKey(D('2026-11-02'))).toBe('2026-11-02')
    expect(weeklyChallenges(D('2026-10-26'))).toEqual(weeklyChallenges(D('2026-11-01')))
  })

  it('every template renders text for generated params (no NaN / undefined)', () => {
    for (let i = 0; i < 200; i++) {
      const date = new Date(Date.UTC(2026, 0, 1 + i))
      for (const c of [...dailyChallenges(date), ...weeklyChallenges(date)]) expect(c.text).not.toMatch(/undefined|NaN/)
    }
  })

  it('countdown helpers', () => {
    expect(msUntilDailyReset(new Date('2026-10-27T23:00:00Z'))).toBe(3600000)
    expect(msUntilWeeklyReset(new Date('2026-11-01T23:00:00Z'))).toBe(3600000) // Sunday -> Monday
    expect(formatCountdown(3600000 * 5 + 60000 * 7)).toBe('5h 07m')
    expect(dayKey(new Date('2026-01-05T23:59:59Z'))).toBe('2026-01-05')
  })
})

describe('progress', () => {
  const find = (tpl) => {
    for (let i = 0; i < 400; i++) {
      const c = dailyChallenges(new Date(Date.UTC(2026, 0, 1 + i))).find((x) => x.tpl === tpl)
      if (c) return c
    }
    throw new Error(`no ${tpl}`)
  }

  it('counts matching events and completes exactly once', () => {
    const ch = find('knife_kills')
    const slice = { key: ch.key, progress: {}, done: {} }
    let completed = []
    for (let i = 0; i < ch.target + 3; i++) {
      completed = completed.concat(applyEvent([ch], slice, { name: 'kill', source: 'knife', type: 'walker' }, {}))
    }
    expect(completed).toHaveLength(1)
    expect(slice.progress[ch.id]).toBe(ch.target)
    expect(slice.done[ch.id]).toBe(1)
  })

  it('ignores non-matching events', () => {
    const ch = find('knife_kills')
    const slice = { key: ch.key, progress: {}, done: {} }
    applyEvent([ch], slice, { name: 'kill', source: 'gun', type: 'walker' }, {})
    applyEvent([ch], slice, { name: 'powerup', type: 'nuke' }, {})
    expect(slice.progress[ch.id] ?? 0).toBe(0)
  })

  it('"without boarding" needs the wave cleared with no planks bought', () => {
    const ch = find('no_board')
    const w = ch.params.w
    const s1 = { key: ch.key, progress: {}, done: {} }
    expect(applyEvent([ch], s1, { name: 'wave_clear', wave: w }, { wavePlanks: 2 })).toHaveLength(0)
    expect(applyEvent([ch], s1, { name: 'wave_clear', wave: w + 1 }, { wavePlanks: 0 })).toHaveLength(0)
    expect(applyEvent([ch], s1, { name: 'wave_clear', wave: w }, { wavePlanks: 0 })).toHaveLength(1)
  })

  it('bedroom door challenge only before wave N', () => {
    const ch = find('bedroom_door')
    const s = { key: ch.key, progress: {}, done: {} }
    expect(applyEvent([ch], s, { name: 'door_open', id: 'bedroom', wave: ch.params.w }, {})).toHaveLength(0)
    expect(applyEvent([ch], s, { name: 'door_open', id: 'hall', wave: 1 }, {})).toHaveLength(0)
    expect(applyEvent([ch], s, { name: 'door_open', id: 'bedroom', wave: ch.params.w - 1 }, {})).toHaveLength(1)
  })

  it('grenade challenges count grenade kills / multi-kills only', () => {
    const ch = find('grenade_multi')
    const s = { key: ch.key, progress: {}, done: {} }
    expect(applyEvent([ch], s, { name: 'grenade', count: ch.params.n - 1 }, {})).toHaveLength(0)
    expect(applyEvent([ch], s, { name: 'burst', count: 9 }, {})).toHaveLength(0)
    expect(applyEvent([ch], s, { name: 'grenade', count: ch.params.n }, {})).toHaveLength(1)
  })

  it('sliceFor resets when the period key changes; merge keeps the better progress', () => {
    const state = { daily: { key: '2026-10-27', progress: { d0: 3 }, done: {} } }
    expect(sliceFor(state, 'daily', '2026-10-27').progress.d0).toBe(3)
    expect(sliceFor(state, 'daily', '2026-10-28')).toEqual({ key: '2026-10-28', progress: {}, done: {} })
    const m = mergeChallengeState(
      { daily: { key: '2026-10-27', progress: { d0: 3, d1: 1 }, done: {} } },
      { daily: { key: '2026-10-27', progress: { d0: 2, d1: 4 }, done: { d1: 1 } }, weekly: { key: '2026-10-26', progress: {}, done: {} } }
    )
    expect(m.daily.progress).toEqual({ d0: 3, d1: 4 })
    expect(m.daily.done).toEqual({ d1: 1 })
    expect(m.weekly.key).toBe('2026-10-26')
    expect(mergeChallengeState({ daily: { key: '2026-10-28', progress: {}, done: {} } }, { daily: { key: '2026-10-27', progress: { d0: 9 }, done: {} } }).daily.key).toBe('2026-10-28')
  })

  it('sanitize drops junk', () => {
    expect(sanitizeChallengeState({ daily: { key: 5 }, weekly: 'x' })).toEqual({})
    expect(sanitizeChallengeState(null)).toEqual({})
  })
})
