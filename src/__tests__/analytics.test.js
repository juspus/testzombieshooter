import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const inserts = []
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: (rows) => { inserts.push(rows); return Promise.resolve({ error: null }) } })),
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(),
    },
  },
}))

import { track, initAnalytics, __setEnabledForTests } from '../analytics'
import { useGameStore } from '../store'

beforeEach(() => {
  vi.useFakeTimers()
  inserts.length = 0
  localStorage.clear()
  __setEnabledForTests(true)
})
afterEach(() => {
  __setEnabledForTests(null)
  vi.useRealTimers()
})

describe('track', () => {
  it('batches 10 events into one insert', () => {
    for (let i = 0; i < 10; i++) track('e' + i, { i })
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toHaveLength(10)
    const row = inserts[0][0]
    expect(row).toMatchObject({ name: 'e0', props: { i: 0 }, user_id: null })
    expect(row.anon_id).toBeTruthy()
    expect(row.session_id).toBeTruthy()
    expect(['mobile', 'desktop']).toContain(row.client)
    expect(localStorage.getItem('cabin.anon.v1')).toBe(row.anon_id)
  })

  it('flushes after 5s', () => {
    track('a')
    expect(inserts).toHaveLength(0)
    vi.advanceTimersByTime(5000)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toHaveLength(1)
  })

  it('clamps name and drops oversized props', () => {
    track('x'.repeat(100), { big: 'y'.repeat(3000) })
    vi.advanceTimersByTime(5000)
    expect(inserts[0][0].name).toHaveLength(64)
    expect(inserts[0][0].props).toEqual({})
  })

  it('respects opt-out', () => {
    localStorage.setItem('cabin.analytics.optout', '1')
    track('a')
    vi.advanceTimersByTime(5000)
    expect(inserts).toHaveLength(0)
  })

  it('is a no-op when disabled', () => {
    __setEnabledForTests(false)
    track('a')
    vi.advanceTimersByTime(5000)
    expect(inserts).toHaveLength(0)
  })
})

describe('store transitions', () => {
  it('emits game_start, shop_open, death', () => {
    useGameStore.setState({ phase: 'start', shopOpen: false })
    initAnalytics()
    useGameStore.setState({ phase: 'intermission', mapId: 'cabin', mpRole: null })
    useGameStore.setState({ shopOpen: true, wave: 3 })
    useGameStore.setState({ phase: 'dead', wave: 3, kills: 7, money: 12.6, weapon: 'pistol', perks: { fast_hands: true, x: false } })
    // restart from the death screen starts a new run (new run_id)
    useGameStore.setState({ phase: 'intermission' })
    vi.advanceTimersByTime(5000)
    const rows = inserts.flat()
    const names = rows.map((r) => r.name)
    expect(names).toEqual(['session_start', 'game_start', 'shop_open', 'death', 'game_start'])
    expect(rows[4].props.run_id).not.toBe(rows[1].props.run_id)
    const runId = rows[1].props.run_id
    expect(runId).toBeTruthy()
    expect(rows[1].props).toEqual({ map: 'cabin', mp: 'solo', run_id: runId })
    vi.setSystemTime(Date.now())
    expect(rows[3].props).toMatchObject({ wave: 3, kills: 7, money: 13, weapon: 'pistol', perks: ['fast_hands'], run_id: runId })
    expect(typeof rows[3].props.secs).toBe('number')
  })
})
