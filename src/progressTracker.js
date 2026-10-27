// Wave 4 progression runtime: listens to gameplay events (gameEvents.js) + store phase
// changes, feeds challenges / achievements, and settles XP when a run ends.
//
// Persistence: everything lives in the existing profile stats (`stats.xp`,
// `stats.achievements`, `stats.challenges`, `stats.lastRunDay`) and is written with
// persistProfile(), so signed-in players sync like every other stat. No new storage.
//
// Perf: handlers run on discrete events (kills, pickups, phase flips), never per frame,
// and do no allocation beyond the small event object. Storage writes happen only on
// challenge completion, achievement unlock, wave clear, run end and tab hide.

import { onGameEvent, pushToast } from './gameEvents'
import { useGameStore } from './store'
import { persistProfile } from './profilePersistence'
import { levelFromXp, calcRunXp, killXp, xpForLevel } from './progression'
import {
  dailyChallenges, weeklyChallenges, dayKey, weekKey, sliceFor, applyEvent,
} from './challenges'
import { evaluateAchievements, ACHIEVEMENT_BY_ID } from './achievements'
import { levelReward, nextLevelReward } from './cosmetics'
import { getMap, getInitialMapId } from './maps'
import { track } from './analytics'
import { playChallengeDone, playAchievement } from './progressSounds'

// ── Live run counters ───────────────────────────────────────────────────────
export function newRun() {
  return {
    wave: 1,
    kills: 0,
    killXp: 0,
    headshots: 0,
    knifeKills: 0,
    bossKills: 0,
    flameKills: 0,
    powerups: 0,
    doors: new Set(),
    wavesCleared: 0,
    modifierWaves: 0,
    wavePlanks: 0,        // planks bought since the last wave clear
    noBoardStreak: 0,     // consecutive cleared waves with no plank bought
    pistolOnly: true,
    completed: [],        // challenges finished this run: { id, scope, text, xp }
    newAchievements: [],  // ids earned this run
  }
}
export let run = newRun()

let nukeCount = 0
let burstCount = 0
let burstTs = -1e9
let grenadeCount = 0
let grenadeTs = -1e9
const BURST_GAP_MS = 40   // victims of one blast are killed in the same synchronous loop

const doorsTotal = () => (getMap(getInitialMapId()).DOOR_DEFS ?? []).filter((d) => !d.link).length

// ── Challenge working copy ──────────────────────────────────────────────────
// The store's stats.challenges object is replaced by sanitize/sync; we keep a mutable
// working copy and re-clone whenever the stored object (or the UTC period) changes.
let cs = null
let csSrc = null
let periodTs = 0
let periodKeys = { dk: '', wk: '' }

function periods() {
  const now = Date.now()
  if (now - periodTs > 20000) {
    const d = new Date(now)
    periodKeys = { dk: dayKey(d), wk: weekKey(d) }
    periodTs = now
  }
  return periodKeys
}

const cloneSlice = (s) => ({ key: s.key, progress: { ...s.progress }, done: { ...s.done } })

export function workingChallenges() {
  const st = useGameStore.getState().stats
  const { dk, wk } = periods()
  if (!cs || csSrc !== st.challenges || cs.dk !== dk || cs.wk !== wk) {
    cs = {
      dk, wk,
      daily: cloneSlice(sliceFor(st.challenges, 'daily', dk)),
      weekly: cloneSlice(sliceFor(st.challenges, 'weekly', wk)),
      dList: dailyChallenges(new Date()),
      wList: weeklyChallenges(new Date()),
    }
    csSrc = st.challenges
  }
  return cs
}

/** Write stats (merged with `patch`) to the store + profile. */
function commit(patch) {
  const s = useGameStore.getState()
  const stats = { ...s.stats, ...patch }
  useGameStore.setState({ stats })
  persistProfile(stats, s.cosmetics)
  return stats
}

function flushChallenges() {
  const w = workingChallenges()
  const challenges = { daily: w.daily, weekly: w.weekly }
  csSrc = challenges
  commit({ challenges })
}

// ── Event handling ──────────────────────────────────────────────────────────
function lifeCounters(stats) {
  return {
    totalKills: stats.totalKills + run.kills,
    totalHeadshots: stats.totalHeadshots + run.headshots,
    totalKnifeKills: stats.totalKnifeKills + run.knifeKills,
    bestWave: Math.max(stats.bestWave, run.wave),
    level: levelFromXp(stats.xp).level,
  }
}

function checkAchievements(evt) {
  const stats = useGameStore.getState().stats
  const ids = evaluateAchievements({ evt, run, life: lifeCounters(stats), doorsTotal: doorsTotal() }, stats.achievements)
  if (!ids.length) return
  const day = Math.floor(Date.now() / 86400000)
  const achievements = { ...stats.achievements }
  for (const id of ids) {
    achievements[id] = day
    run.newAchievements.push(id)
    const a = ACHIEVEMENT_BY_ID[id]
    pushToast('achievement', a.name, a.desc)
    playAchievement()
    track('achievement', { id, wave: run.wave })
  }
  commit({ achievements })
}

function feedChallenges(evt) {
  const w = workingChallenges()
  const done = [
    ...applyEvent(w.dList, w.daily, evt, run),
    ...applyEvent(w.wList, w.weekly, evt, run),
  ]
  if (!done.length) return
  for (const ch of done) {
    run.completed.push({ id: ch.id, scope: ch.scope, text: ch.text, xp: ch.xp })
    pushToast('challenge', `${ch.scope === 'weekly' ? 'Weekly' : 'Daily'} challenge complete`, `${ch.text}  +${ch.xp} XP`)
    playChallengeDone()
    track('challenge_complete', { id: ch.id, tpl: ch.tpl, scope: ch.scope, xp: ch.xp })
  }
  flushChallenges()
  for (const ch of done) handle({ name: 'challenge_done', scope: ch.scope, remote: false })
}

function handle(evt) {
  if (evt.remote && evt.name !== 'run_start') return   // co-op partner's kill: their profile, not ours
  switch (evt.name) {
    case 'run_start':
      run = newRun()
      nukeCount = 0
      burstCount = 0
      return
    case 'kill': {
      const head = evt.source === 'gun' && evt.head
      run.kills += 1
      run.killXp += killXp(evt.type)
      if (head) run.headshots += 1
      if (evt.source === 'knife') run.knifeKills += 1
      if (evt.source === 'flame') run.flameKills += 1
      if (evt.type === 'boss') run.bossKills += 1
      if (evt.source === 'nuke') {
        nukeCount += 1
        feedAll({ name: 'nuke', count: nukeCount })
      } else if (evt.source === 'grenade') {
        // All victims of one grenade die in the same synchronous loop.
        const now = performance.now()
        if (now - grenadeTs > BURST_GAP_MS) grenadeCount = 0
        grenadeTs = now
        grenadeCount += 1
        feedAll({ name: 'grenade', count: grenadeCount })
      } else if (evt.source === 'burst') {
        // All victims of one blast die in the same synchronous loop. The exploder's own
        // 999-damage kill (evt.big) is not a victim.
        const now = performance.now()
        if (now - burstTs > BURST_GAP_MS) burstCount = 0
        burstTs = now
        if (!evt.big) { burstCount += 1; feedAll({ name: 'burst', count: burstCount }) }
      }
      break
    }
    case 'plank':
      run.wavePlanks += 1
      return
    case 'powerup':
      run.powerups += 1
      if (evt.type === 'nuke') nukeCount = 0
      break
    case 'door_open':
      if (evt.id) run.doors.add(evt.id)
      evt = { ...evt, wave: useGameStore.getState().wave }
      break
    case 'box_take':
      run.pistolOnly = false
      break
    case 'wave_start': {
      if (useGameStore.getState().ownedWeapons.length > 1) run.pistolOnly = false
      run.wave = Math.max(run.wave, evt.wave)
      break
    }
    case 'wave_clear':
      run.wavesCleared += 1
      if (evt.modifier) run.modifierWaves += 1
      break
    default:
      break
  }
  feedAll(evt)
  if (evt.name === 'wave_clear') {
    run.noBoardStreak = run.wavePlanks === 0 ? run.noBoardStreak + 1 : 0
    run.wavePlanks = 0
    checkAchievements(evt)             // streak just updated
    flushChallenges()
  }
}

function feedAll(evt) {
  feedChallenges(evt)
  checkAchievements(evt)
}

// ── Run settlement (called by store.recordRunEnd) ───────────────────────────
/**
 * Fold this run's XP / achievements / challenge state into `nextStats` (the stats with
 * the run's counters already added). Returns { stats, summary } - summary feeds the
 * death-screen breakdown. Never throws.
 */
export function settleRun(nextStats, prevStats, storeRun = null) {
  try {
    // Tracker never started (tests, very early loads): fall back to the store's own run counters.
    if (!inited && storeRun) {
      run.kills = storeRun.kills
      run.killXp = storeRun.kills
      run.headshots = storeRun.runHeadshots
      run.wavesCleared = Math.max(0, storeRun.wave - 1)
      run.wave = storeRun.wave
    }
    const today = dayKey(new Date())
    const first = prevStats.lastRunDay !== today
    const { rows, total } = calcRunXp({
      killXp: run.killXp,
      headshots: run.headshots,
      wavesCleared: run.wavesCleared,
      modifierWaves: run.modifierWaves,
      challenges: run.completed.map((c) => ({ xp: c.xp, label: `${c.scope === 'weekly' ? 'Weekly' : 'Daily'}: ${c.text}` })),
      firstRunOfDay: first,
    })
    const xpBefore = prevStats.xp
    const xpAfter = xpBefore + total
    const before = levelFromXp(xpBefore)
    const after = levelFromXp(xpAfter)

    const w = workingChallenges()
    let stats = {
      ...nextStats,
      xp: xpAfter,
      lastRunDay: today,
      challenges: { daily: w.daily, weekly: w.weekly },
    }
    csSrc = stats.challenges

    // Lifetime achievements that only the settled stats can satisfy (e.g. player level).
    const ids = evaluateAchievements(
      { evt: { name: 'run_end' }, run, life: { ...lifeCounterFromSettled(stats), level: after.level }, doorsTotal: doorsTotal() },
      stats.achievements
    )
    if (ids.length) {
      const day = Math.floor(Date.now() / 86400000)
      const achievements = { ...stats.achievements }
      for (const id of ids) {
        achievements[id] = day
        run.newAchievements.push(id)
        const a = ACHIEVEMENT_BY_ID[id]
        pushToast('achievement', a.name, a.desc)
        track('achievement', { id, wave: run.wave })
      }
      stats = { ...stats, achievements }
    }

    const levelUps = []
    for (let n = before.level + 1; n <= after.level; n++) {
      const r = levelReward(n)
      levelUps.push({ level: n, reward: r ? r.text : '' })
      track('level_up', { level: n, xp: xpAfter })
    }
    const next = nextLevelReward(after.level)
    const summary = {
      rows, total, xpBefore, xpAfter,
      levelBefore: before.level, levelAfter: after.level,
      levelUps,
      nextUnlock: next ? { level: next.level, text: next.text, xpToGo: xpToReach(next.level, xpAfter) } : null,
      achievements: run.newAchievements.map((id) => ACHIEVEMENT_BY_ID[id]?.name).filter(Boolean),
      challenges: run.completed.map((c) => c.text),
      unlockNames: [],
    }
    return { stats, summary }
  } catch (err) {
    console.warn('[progress] settle failed', err)
    return { stats: nextStats, summary: null }
  }
}

function lifeCounterFromSettled(stats) {
  return { totalKills: stats.totalKills, totalHeadshots: stats.totalHeadshots, totalKnifeKills: stats.totalKnifeKills, bestWave: stats.bestWave }
}

export const xpToReach = (level, xp) => Math.max(0, xpForLevel(level) - xp)

// ── Init ────────────────────────────────────────────────────────────────────
let inited = false
let unsub = []

export function initProgression() {
  if (inited || typeof useGameStore?.getState !== 'function') return
  inited = true
  unsub.push(onGameEvent(handle))
  let prev = useGameStore.getState().phase
  unsub.push(useGameStore.subscribe((s) => {
    if (s.phase === prev) return
    const was = prev
    prev = s.phase
    try {
      if (s.phase === 'playing' && was === 'intermission') handle({ name: 'wave_start', wave: s.wave, modifier: s.waveModifier, remote: false })
      else if (s.phase === 'wave_clear' && was === 'playing') handle({ name: 'wave_clear', wave: s.wave, modifier: s.waveModifier, remote: false })
    } catch (err) { console.warn('[progress] phase handler failed', err) }
  }))
  if (typeof document !== 'undefined') {
    const onHide = () => { if (document.visibilityState === 'hidden' && cs) { try { flushChallenges() } catch { /* ignore */ } } }
    document.addEventListener('visibilitychange', onHide)
    unsub.push(() => document.removeEventListener('visibilitychange', onHide))
  }
}

export function __resetProgressionForTests() {
  unsub.forEach((f) => f())
  unsub = []
  inited = false
  run = newRun()
  cs = null
  csSrc = null
  periodTs = 0
  nukeCount = burstCount = grenadeCount = 0
  burstTs = grenadeTs = -1e9
}
