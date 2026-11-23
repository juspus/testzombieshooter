// Cosmetics and lifetime stats (visual only), and folding a finished run into them.
import { persistProfile } from '../profilePersistence'
import { DEFAULT_COSMETICS, DEFAULT_STATS, getItem, isUnlocked, newUnlocksBetween, sanitizeCosmetics, sanitizeStats } from '../cosmetics'
import { settleRun } from '../progressTracker'

// Cosmetics, lifetime stats and recordRunEnd.
export const createProfileSlice = (set, get) => ({
  runRecorded: false, // guards recordRunEnd() against double-calls

  // ── Cosmetics / lifetime stats (visual only — never read by gameplay code) ─
  cosmetics: { ...DEFAULT_COSMETICS },  // equipped: { skin, crosshair, crosshairColor, knifeSkin }
  stats: { ...DEFAULT_STATS },          // lifetime: { bestWave, totalKills, runs, totalHeadshots, totalKnifeKills }
  entitlements: [],                     // owned skus, e.g. ['supporter_pack']
  lastRunUnlocks: [],                   // cosmetic items that unlocked during the run that just ended
  lastRunProgress: null,                // Wave 4: XP breakdown / level-ups of the run that just ended (settleRun)

  // kind: 'skin' | 'crosshair' | 'crosshairColor' | 'knifeSkin'. Returns true if equipped.
  setCosmetic: (kind, id) => {
    const { cosmetics, stats, entitlements } = get()
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_COSMETICS, kind)) return false
    const item = getItem(kind, id)
    if (!item || !isUnlocked(item, { entitlements, stats })) return false
    if (cosmetics[kind] === id) return true
    const next = { ...cosmetics, [kind]: id }
    set({ cosmetics: next })
    persistProfile(stats, next)
    return true
  },

  setEntitlements: (list) => set({ entitlements: Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [] }),
  setStats: (stats) => set({ stats: sanitizeStats(stats) }),
  setCosmetics: (obj) => set({ cosmetics: sanitizeCosmetics(obj) }),

  // Re-checks equipped items against current unlocks (e.g. after sign-out
  // clears entitlements); locked slots fall back to their default.
  revalidateCosmetics: () => {
    const { cosmetics, stats, entitlements } = get()
    const next = { ...cosmetics }
    let changed = false
    for (const kind of Object.keys(DEFAULT_COSMETICS)) {
      if (!isUnlocked(getItem(kind, cosmetics[kind]), { entitlements, stats })) {
        next[kind] = DEFAULT_COSMETICS[kind]
        changed = true
      }
    }
    if (changed) set({ cosmetics: next })
  },

  // Called once when the player dies: folds this run into lifetime stats,
  // works out which milestones just flipped, and persists. Idempotent per run.
  recordRunEnd: () => {
    const s = get()
    if (s.runRecorded) return
    const prev = s.stats
    // After a death retry (runSave.js) the run was already counted up to its checkpoint.
    const b = s.statsBase
    const base = {
      ...prev,
      bestWave: Math.max(prev.bestWave, s.wave),
      totalKills: prev.totalKills + Math.max(0, s.kills - (b?.kills ?? 0)),
      runs: prev.runs + (b ? 0 : 1),
      totalHeadshots: prev.totalHeadshots + Math.max(0, s.runHeadshots - (b?.runHeadshots ?? 0)),
      totalKnifeKills: prev.totalKnifeKills + Math.max(0, s.runKnifeKills - (b?.runKnifeKills ?? 0)),
    }
    // Wave 4: XP / level / achievements / challenge state for this run (progressTracker.js)
    const { stats: next, summary } = settleRun(base, prev, s)
    set({
      stats: next,
      runRecorded: true,
      lastRunProgress: summary,
      lastRunUnlocks: newUnlocksBetween(prev, next, s.entitlements),
    })
    persistProfile(next, s.cosmetics)
  },
})
