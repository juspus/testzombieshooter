import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../supabase', () => ({
  fetchEntitlements: vi.fn(async () => []),
  loadProfileExtras: vi.fn(async () => null),
  saveProfileExtras: vi.fn(async () => {}),
}))

import { useGameStore } from '../store'
import { DEFAULT_COSMETICS, DEFAULT_STATS, sanitizeStats } from '../cosmetics'
import { emitGameEvent, onToast, withRemoteSource } from '../gameEvents'
import { initProgression, __resetProgressionForTests, run } from '../progressTracker'
import { achievementRows, ACHIEVEMENTS } from '../achievements'
import { loadLocalProfile, saveLocalProfile, PROFILE_KEY } from '../profilePersistence'
import { dailyChallenges } from '../challenges'
import { levelFromXp } from '../progression'

let toasts
let off

function resetStore() {
  useGameStore.setState({
    stats: sanitizeStats({}), cosmetics: { ...DEFAULT_COSMETICS }, phase: 'playing', wave: 1,
    kills: 0, runHeadshots: 0, runKnifeKills: 0, runRecorded: false, ownedWeapons: ['pistol'], lastRunProgress: null,
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-27T10:00:00Z'))
  __resetProgressionForTests()
  resetStore()
  initProgression()
  toasts = []
  off = onToast((t) => toasts.push(t))
  emitGameEvent('run_start')
})
afterEach(() => { off(); vi.useRealTimers() })

const kill = (o = {}) => emitGameEvent('kill', { type: 'walker', source: 'gun', head: false, weapon: 'pistol', ...o })
const stats = () => useGameStore.getState().stats

describe('achievements', () => {
  it('first kill unlocks First Blood, toasts and persists once', () => {
    kill()
    expect(stats().achievements.first_blood).toBeTruthy()
    expect(toasts.filter((t) => t.kind === 'achievement')).toHaveLength(1)
    kill()
    expect(toasts.filter((t) => t.title === 'First Blood')).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(PROFILE_KEY)).stats.achievements.first_blood).toBeTruthy()
  })

  it('boss killed with the knife, nuke 20+, bench upgrade, crossbow from the box', () => {
    kill({ type: 'boss', source: 'gun' })
    expect(stats().achievements.knife_boss).toBeUndefined()
    kill({ type: 'boss', source: 'knife', weapon: null })
    emitGameEvent('powerup', { type: 'nuke' })
    for (let i = 0; i < 19; i++) kill({ source: 'nuke', weapon: null })
    expect(stats().achievements.nuke_20).toBeUndefined()
    kill({ source: 'nuke', weapon: null })
    emitGameEvent('upgrade', { weapon: 'ak47' })
    emitGameEvent('box_take', { weapon: 'crossbow' })
    for (const id of ['knife_boss', 'nuke_20', 'upgrade', 'box_crossbow']) expect(stats().achievements[id], id).toBeTruthy()
  })

  it('exploder burst: 3 victims of one blast, the exploder itself does not count', () => {
    kill({ type: 'exploder', source: 'burst', big: true, weapon: null })
    kill({ source: 'burst', weapon: null })
    kill({ source: 'burst', weapon: null })
    expect(stats().achievements.burst3).toBeUndefined()
    kill({ source: 'burst', weapon: null })
    expect(stats().achievements.burst3).toBeTruthy()
  })

  it('wave milestones via wave_start, horde via wave_clear', () => {
    useGameStore.setState({ wave: 5 })
    emitGameEvent('wave_start', { wave: 5 })
    expect(stats().achievements.wave5).toBeTruthy()
    expect(stats().achievements.wave10).toBeUndefined()
    emitGameEvent('wave_clear', { wave: 5, modifier: 'horde' })
    expect(stats().achievements.horde).toBeTruthy()
  })

  it('every door opened in one run (cabin has 3 buyable doors)', () => {
    emitGameEvent('door_open', { id: 'hall' })
    emitGameEvent('door_open', { id: 'bedroom' })
    expect(stats().achievements.all_doors).toBeUndefined()
    emitGameEvent('door_open', { id: 'kitchen' })
    expect(stats().achievements.all_doors).toBeTruthy()
  })

  it('co-op partner events are ignored', () => {
    withRemoteSource(() => kill())
    expect(run.kills).toBe(0)
  })

  it('hidden rows read ??? until earned; 20+ visible and 5 hidden', () => {
    expect(ACHIEVEMENTS.filter((a) => !a.hidden).length).toBeGreaterThanOrEqual(20)
    expect(ACHIEVEMENTS.filter((a) => a.hidden)).toHaveLength(5)
    expect(achievementRows({}).find((r) => r.id === 'boss_rush').name).toBe('???')
    expect(achievementRows({ boss_rush: 1 }).find((r) => r.id === 'boss_rush').name).toBe('Boss Rush')
  })
})

describe('challenges in a run', () => {
  const dailyWith = (tpl) => {
    for (let i = 0; i < 400; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i, 10))
      const c = dailyChallenges(d).find((x) => x.tpl === tpl)
      if (c) return { date: d, c }
    }
    throw new Error('none')
  }

  it('completes, toasts, pays XP at run end and persists the progress', () => {
    const { date, c } = dailyWith('kills')
    vi.setSystemTime(date)
    __resetProgressionForTests()
    initProgression()
    emitGameEvent('run_start')
    for (let i = 0; i < c.target; i++) kill()
    expect(toasts.some((t) => t.kind === 'challenge')).toBe(true)
    expect(JSON.parse(localStorage.getItem(PROFILE_KEY)).stats.challenges.daily.done[c.id]).toBe(1)

    useGameStore.setState({ wave: 3, kills: c.target, phase: 'playing' })
    useGameStore.getState().die()
    const prog = useGameStore.getState().lastRunProgress
    expect(prog.rows.some((r) => r.label.includes(c.text))).toBe(true)
    expect(prog.total).toBeGreaterThanOrEqual(150)
    expect(stats().xp).toBe(prog.xpAfter)
    expect(stats().lastRunDay).toBe(date.toISOString().slice(0, 10))
  })
})

describe('run settlement', () => {
  it('awards XP, levels up, and always names the next unlock', () => {
    for (let i = 0; i < 30; i++) kill({ head: i < 10 })
    for (const wv of [1, 2, 3]) {
      useGameStore.setState({ wave: wv })
      emitGameEvent('wave_start', { wave: wv })
      emitGameEvent('wave_clear', { wave: wv, modifier: wv === 3 ? 'fog' : null })
    }
    useGameStore.setState({ wave: 4, kills: 30, runHeadshots: 10 })
    useGameStore.getState().die()
    const p = useGameStore.getState().lastRunProgress
    // 30 kills + 10 headshots + waves 10+20+30 + 25 modifier + 50 first run of the day
    // (a daily challenge may also complete on this date: exclude those rows)
    expect(p.rows.filter((r) => !r.id.startsWith('challenge')).reduce((a, r) => a + r.xp, 0)).toBe(30 + 10 + 60 + 25 + 50)
    expect(p.levelBefore).toBe(1)
    expect(p.levelAfter).toBe(levelFromXp(p.total).level)
    expect(p.levelUps[0].level).toBe(2)
    expect(p.nextUnlock.text).toBeTruthy()
    expect(p.nextUnlock.xpToGo).toBeGreaterThan(0)
    expect(stats().runs).toBe(1)
  })

  it('first-run-of-day bonus only once per UTC day', () => {
    useGameStore.setState({ wave: 1, kills: 1 })
    useGameStore.getState().die()
    expect(useGameStore.getState().lastRunProgress.rows.some((r) => r.id === 'firstRun')).toBe(true)
    useGameStore.getState().startGame()
    useGameStore.setState({ phase: 'playing', wave: 1, kills: 1 })
    useGameStore.getState().die()
    expect(useGameStore.getState().lastRunProgress.rows.some((r) => r.id === 'firstRun')).toBe(false)
  })
})

describe('profile persistence round trip', () => {
  it('xp, achievements, challenges and lastRunDay survive save -> load', () => {
    const s = sanitizeStats({
      xp: 777, achievements: { first_blood: 20000 }, lastRunDay: '2026-10-27', runs: 2,
      challenges: { daily: { key: '2026-10-27', progress: { d0: 4 }, done: { d1: 1 } } },
    })
    saveLocalProfile({ stats: s, cosmetics: DEFAULT_COSMETICS })
    expect(loadLocalProfile().stats).toEqual(s)
  })

  it('legacy profile without xp gets a one-time estimate; fresh profile stays 0', () => {
    expect(sanitizeStats({ runs: 3, bestWave: 8, totalKills: 250 }).xp).toBe(250 + 280)
    expect(sanitizeStats({ runs: 3, bestWave: 8, totalKills: 250, xp: 0 }).xp).toBe(0)
    expect(DEFAULT_STATS.xp).toBe(0)
  })
})
