import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore, spawnZombies } from '../store'
import { runRandom, waveRandom, keyedRandom, startSeededRun, endSeededRun, isSeeded } from '../rng'
import { rollModifier } from '../modifiers'
import { rollPowerupDrop } from '../powerups'
import {
  dailyDate, weekStartUTC, msToWeekReset, msToNextDaily, formatCountdown, canStartDaily,
  readLocalDaily, writeLocalDaily, dailyAttemptUsed,
} from '../daily'
import { isMissingSchema, fetchLeaderboard, getSupabase } from '../supabase'

const S = () => useGameStore.getState()
afterEach(() => { endSeededRun(); vi.restoreAllMocks() })

describe('seeded RNG determinism', () => {
  it('same seed => identical spawn lists for every wave; different seed differs', () => {
    const lists = (seed) => {
      startSeededRun(seed)
      return [1, 3, 7, 10].map((w) => spawnZombies(w, 0))
    }
    const a = lists('2026-10-27'), b = lists('2026-10-27'), c = lists('2026-10-28')
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('spawns do not depend on Math.random or call order of other streams', () => {
    startSeededRun('d')
    const a = spawnZombies(5, 0)
    endSeededRun(); startSeededRun('d')
    runRandom('drop')(); runRandom('box')()           // unrelated draws in between
    vi.spyOn(Math, 'random').mockReturnValue(0.123)   // cosmetic noise
    const b = spawnZombies(5, 0)
    expect(b).toEqual(a)
  })

  it('box rolls, teddy counts, drops and modifiers replay identically', () => {
    const run = () => {
      useGameStore.setState({ mpRole: null, mpConnected: false })
      S().startDaily(false)
      const out = { boxes: [], drops: [], mods: [] }
      useGameStore.setState({ money: 99999 })
      for (let i = 0; i < 12; i++) {
        useGameStore.setState({ box: { ...S().box, phase: 'idle' } })
        out.boxes.push(S().buyBox())
      }
      const dr = runRandom('drop')
      for (let i = 0; i < 40; i++) out.drops.push(rollPowerupDrop(i % 9, null, dr))
      for (let w = 4; w < 30; w++) out.mods.push(rollModifier(w, null, waveRandom('mod', w)))
      out.maxUses = S().box.maxUses
      return out
    }
    expect(run()).toEqual(run())
  })

  it('keyedRandom is stable per key and independent of draw order', () => {
    startSeededRun('k')
    const a = [keyedRandom('aggro', 3), keyedRandom('aggro', 9)]
    startSeededRun('k')
    expect([keyedRandom('aggro', 9), keyedRandom('aggro', 3)]).toEqual([a[1], a[0]])
  })

  it('falls through to Math.random outside a seeded run', () => {
    expect(isSeeded()).toBe(false)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(runRandom('x')()).toBe(0.5)
    expect(waveRandom('spawn', 1)()).toBe(0.5)
    expect(keyedRandom('a', 1)).toBe(0.5)
  })
})

describe('startDaily', () => {
  beforeEach(() => { localStorage.clear(); useGameStore.setState({ mpRole: null, mpConnected: false }) })

  it('starts a seeded run: ranked first time, practice after', () => {
    expect(S().startDaily()).toBe(true)
    expect(S().runMode).toBe('daily')
    expect(S().dailyDate).toBe(dailyDate())
    expect(S().dailyRanked).toBe(true)
    expect(dailyAttemptUsed()).toBe(true)
    expect(isSeeded()).toBe(true)
    S().startDaily()
    expect(S().dailyRanked).toBe(false)
  })

  it('a normal start after a daily returns to Math.random', () => {
    S().startDaily()
    S().startGame()
    expect(S().runMode).toBe('normal')
    expect(S().dailyRanked).toBe(false)
    expect(isSeeded()).toBe(false)
  })

  it('is blocked in co-op (host or guest)', () => {
    expect(canStartDaily({ mpRole: 'host' })).toBe(false)
    expect(canStartDaily({ mpRole: 'guest' })).toBe(false)
    expect(canStartDaily({ mpConnected: true })).toBe(false)
    expect(canStartDaily({})).toBe(true)
    useGameStore.setState({ mpRole: 'host', runMode: 'normal' })
    expect(S().startDaily()).toBe(false)
    expect(S().runMode).toBe('normal')
    expect(isSeeded()).toBe(false)
  })

  it('two daily starts produce identical first-wave spawns', () => {
    const first = () => {
      S().startDaily(false)
      return spawnZombies(1, 0)
    }
    expect(first()).toEqual(first())
  })
})

describe('week / day maths (UTC)', () => {
  it('weekStartUTC is the preceding Monday 00:00 UTC', () => {
    // Wed 2026-10-28 15:30 UTC -> Mon 2026-10-26
    expect(new Date(weekStartUTC(Date.UTC(2026, 9, 28, 15, 30))).toISOString()).toBe('2026-10-26T00:00:00.000Z')
    // Monday 00:00 exactly stays; Sunday 23:59 belongs to the previous Monday
    expect(new Date(weekStartUTC(Date.UTC(2026, 9, 26, 0, 0))).toISOString()).toBe('2026-10-26T00:00:00.000Z')
    expect(new Date(weekStartUTC(Date.UTC(2026, 10, 1, 23, 59))).toISOString()).toBe('2026-10-26T00:00:00.000Z')
    // month/year rollover
    expect(new Date(weekStartUTC(Date.UTC(2027, 0, 2, 12))).toISOString()).toBe('2026-12-28T00:00:00.000Z')
  })
  it('countdowns', () => {
    const sun = Date.UTC(2026, 10, 1, 23, 0)
    expect(msToWeekReset(sun)).toBe(3600000)
    expect(msToNextDaily(Date.UTC(2026, 9, 27, 18, 0))).toBe(6 * 3600000)
    expect(formatCountdown(6 * 3600000 + 5 * 60000)).toBe('6h 5m')
    expect(formatCountdown(2 * 86400000 + 3 * 3600000)).toBe('2d 3h')
    expect(formatCountdown(-5)).toBe('0m')
  })
  it('local daily record only counts for its own day', () => {
    const t = Date.UTC(2026, 9, 27, 12)
    writeLocalDaily({ wave: 4 }, t)
    expect(readLocalDaily(t)?.wave).toBe(4)
    expect(readLocalDaily(t + 86400000)).toBeNull()
  })
})

describe('graceful degradation', () => {
  let supabase
  beforeAll(async () => { supabase = await getSupabase() })
  const fakeFrom = (byView) => vi.spyOn(supabase, 'from').mockImplementation((view) => {
    const res = byView[view]
    const q = { select: () => q, order: () => q, limit: () => q, gte: () => q, then: (ok) => ok(res) }
    return q
  })
  const missing = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.leaderboard_daily' in the schema cache" } }

  it('detects missing relation/column errors', () => {
    expect(isMissingSchema({ code: '42P01' })).toBe(true)
    expect(isMissingSchema({ code: 'PGRST204' })).toBe(true)
    expect(isMissingSchema({ message: 'relation "x" does not exist' })).toBe(true)
    expect(isMissingSchema({ code: '500', message: 'boom' })).toBe(false)
    expect(isMissingSchema(null)).toBe(false)
  })
  it('daily board with missing view rejects with "unavailable" (UI: coming soon)', async () => {
    fakeFrom({ leaderboard_daily: missing })
    await expect(fetchLeaderboard({ period: 'daily' })).rejects.toThrow('unavailable')
  })
  it('weekly board falls back to the all-time view when leaderboard_week is missing', async () => {
    const rows = [{ id: 1, name: 'a', wave: 3, kills: 9 }]
    fakeFrom({ leaderboard_week: missing, leaderboard: { data: rows, error: null } })
    await expect(fetchLeaderboard({ period: 'week' })).resolves.toEqual(rows)
  })
  it('real errors still surface as errors, not "unavailable"', async () => {
    fakeFrom({ leaderboard: { data: null, error: { code: '500', message: 'boom' } } })
    await expect(fetchLeaderboard({ period: 'all' })).rejects.toMatchObject({ message: 'boom' })
  })
})
