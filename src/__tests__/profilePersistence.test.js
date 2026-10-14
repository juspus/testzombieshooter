import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../supabase', () => ({
  fetchEntitlements: vi.fn(async () => ['supporter_pack']),
  loadProfileExtras: vi.fn(async () => null),
  saveProfileExtras: vi.fn(async () => {}),
}))

import { loadLocalProfile, saveLocalProfile, syncProfileWithCloud, PROFILE_KEY } from '../profilePersistence'
import { loadProfileExtras, saveProfileExtras } from '../supabase'
import { useGameStore } from '../store'
import { DEFAULT_COSMETICS, DEFAULT_STATS } from '../cosmetics'

const S = (o) => ({ ...DEFAULT_STATS, ...o })

beforeEach(() => {
  localStorage.clear()
  vi.mocked(loadProfileExtras).mockReset()
  vi.mocked(saveProfileExtras).mockClear()
  useGameStore.setState({ stats: { ...DEFAULT_STATS }, cosmetics: { ...DEFAULT_COSMETICS }, entitlements: [] })
})

describe('local profile', () => {
  it('round-trips and sanitizes', () => {
    saveLocalProfile({ stats: S({ bestWave: 3, totalKills: 9 }), cosmetics: { skin: 'bogus', crosshair: 'dot' } })
    const p = loadLocalProfile()
    expect(p.stats).toEqual(S({ bestWave: 3, totalKills: 9 }))
    expect(p.cosmetics).toEqual({ ...DEFAULT_COSMETICS, crosshair: 'dot' })
  })

  it('never throws on corrupt JSON or blocked storage', () => {
    localStorage.setItem(PROFILE_KEY, '{not json')
    expect(loadLocalProfile().stats).toEqual(DEFAULT_STATS)
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(loadLocalProfile().cosmetics).toEqual(DEFAULT_COSMETICS)
    spy.mockRestore()
    const spy2 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => saveLocalProfile({ stats: DEFAULT_STATS, cosmetics: DEFAULT_COSMETICS })).not.toThrow()
    spy2.mockRestore()
  })
})

describe('syncProfileWithCloud', () => {
  const user = { id: 'u1' }

  it('first login: sums independent anonymous + cloud stats and claims the local profile', async () => {
    saveLocalProfile({ stats: S({ bestWave: 4, totalKills: 30, runs: 2 }), cosmetics: DEFAULT_COSMETICS })
    useGameStore.setState({ stats: S({ bestWave: 4, totalKills: 30, runs: 2 }) })
    vi.mocked(loadProfileExtras).mockResolvedValue({ stats: S({ bestWave: 7, totalKills: 100, runs: 5 }), cosmetics: {} })
    await syncProfileWithCloud(user)
    expect(useGameStore.getState().stats).toEqual(S({ bestWave: 7, totalKills: 130, runs: 7 }))
    expect(loadLocalProfile().claimedBy).toBe('u1')
    expect(saveProfileExtras).toHaveBeenCalledTimes(1)
    expect(useGameStore.getState().entitlements).toEqual(['supporter_pack'])
  })

  it('second sync of the same account does not double count', async () => {
    const merged = S({ bestWave: 7, totalKills: 130, runs: 7 })
    saveLocalProfile({ stats: merged, cosmetics: DEFAULT_COSMETICS, claimedBy: 'u1' })
    useGameStore.setState({ stats: merged })
    vi.mocked(loadProfileExtras).mockResolvedValue({ stats: merged, cosmetics: {} })
    await syncProfileWithCloud(user)
    expect(useGameStore.getState().stats).toEqual(merged)
  })

  it('ignores local stats claimed by a different account', async () => {
    saveLocalProfile({ stats: S({ bestWave: 50, totalKills: 5000 }), cosmetics: DEFAULT_COSMETICS, claimedBy: 'other' })
    useGameStore.setState({ stats: S({ bestWave: 50, totalKills: 5000 }) })
    vi.mocked(loadProfileExtras).mockResolvedValue({ stats: S({ bestWave: 2, totalKills: 5 }), cosmetics: {} })
    await syncProfileWithCloud(user)
    expect(useGameStore.getState().stats).toEqual(S({ bestWave: 2, totalKills: 5 }))
  })

  it('cloud cosmetics win when non-empty; empty cloud keeps local', async () => {
    useGameStore.setState({ cosmetics: { ...DEFAULT_COSMETICS, crosshairColor: 'amber' } })
    vi.mocked(loadProfileExtras).mockResolvedValue({ stats: {}, cosmetics: { crosshair: 'dot' } })
    await syncProfileWithCloud(user)
    expect(useGameStore.getState().cosmetics).toEqual({ ...DEFAULT_COSMETICS, crosshair: 'dot' })

    useGameStore.setState({ cosmetics: { ...DEFAULT_COSMETICS, crosshairColor: 'amber' } })
    vi.mocked(loadProfileExtras).mockResolvedValue({ stats: {}, cosmetics: {} })
    await syncProfileWithCloud(user)
    expect(useGameStore.getState().cosmetics.crosshairColor).toBe('amber')
  })

  it('never throws when the cloud is down', async () => {
    vi.mocked(loadProfileExtras).mockRejectedValue(new Error('offline'))
    await expect(syncProfileWithCloud(user)).resolves.toBeUndefined()
    await expect(syncProfileWithCloud(null)).resolves.toBeUndefined()
  })
})
