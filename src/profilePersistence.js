// Persistence for lifetime stats + equipped cosmetics.
//
// Anonymous players: localStorage `cabin.profile.v1` = { stats, cosmetics, claimedBy }.
// Signed-in players: the same data lives in `profiles.stats/cosmetics`; the
// local copy is kept as a mirror so the game still works offline.
//
// Nothing here may throw: localStorage can be blocked, the network can fail.
// Cosmetics are never gameplay-critical, so every failure is a console.warn.

import {
  DEFAULT_COSMETICS,
  DEFAULT_STATS,
  sanitizeCosmetics,
  sanitizeStats,
  mergeStats,
  maxStats,
  isEmptyCosmetics,
} from './cosmetics'
import { fetchEntitlements, loadProfileExtras, saveProfileExtras } from './supabase'
// Circular import (store -> profilePersistence -> store) is safe: the store is
// only touched inside functions, never at module-evaluation time.
import { useGameStore } from './store'

export const PROFILE_KEY = 'cabin.profile.v1'

/**
 * Read the local profile. Always returns sanitized
 * `{ stats, cosmetics, claimedBy }` (defaults when missing/corrupt/blocked).
 * `claimedBy` is the user id this local profile was last synced to (or null).
 */
export function loadLocalProfile() {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        stats: sanitizeStats(parsed?.stats),
        cosmetics: sanitizeCosmetics(parsed?.cosmetics),
        claimedBy: typeof parsed?.claimedBy === 'string' ? parsed.claimedBy : null,
      }
    }
  } catch (err) {
    console.warn('[profile] could not read local profile', err)
  }
  return { stats: { ...DEFAULT_STATS }, cosmetics: { ...DEFAULT_COSMETICS }, claimedBy: null }
}

/** Write the local profile. Keeps `claimedBy` from the existing copy unless given. */
export function saveLocalProfile({ stats, cosmetics, claimedBy } = {}) {
  try {
    const prev = claimedBy === undefined ? loadLocalProfile().claimedBy : claimedBy
    window.localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({
        stats: sanitizeStats(stats),
        cosmetics: sanitizeCosmetics(cosmetics),
        claimedBy: prev ?? null,
      })
    )
  } catch (err) {
    console.warn('[profile] could not write local profile', err)
  }
}

/** Load the local profile and push it into the store (call once on app mount). */
export function hydrateStoreFromLocal() {
  try {
    const { stats, cosmetics } = loadLocalProfile()
    const s = useGameStore.getState()
    s.setStats(stats)
    s.setCosmetics(cosmetics)
  } catch (err) {
    console.warn('[profile] hydrate failed', err)
  }
}

/**
 * Called by the store after a run ends / a cosmetic is equipped.
 * Mirrors to localStorage immediately and fires a best-effort cloud update
 * (a no-op for anonymous players: saveProfileExtras returns early without a user).
 */
export function persistProfile(stats, cosmetics) {
  saveLocalProfile({ stats, cosmetics })
  try {
    Promise.resolve(saveProfileExtras({ stats, cosmetics })).catch((err) =>
      console.warn('[profile] cloud save failed', err)
    )
  } catch (err) {
    console.warn('[profile] cloud save failed', err)
  }
}

/**
 * Run on login.
 *  1. Load cloud stats/cosmetics.
 *  2. Merge with the local copy:
 *     - local never uploaded (claimedBy null): independent runs -> mergeStats (sum counters, max bestWave)
 *     - local already synced to THIS user: same lineage -> maxStats (summing would double count)
 *     - local claimed by a different account: ignore its stats (not this user's progress)
 *     Cosmetics: cloud wins if non-empty, otherwise local.
 *  3. Write the result back to both places, push into the store.
 *  4. Fetch entitlements -> store.
 * Never throws.
 */
export async function syncProfileWithCloud(user) {
  if (!user?.id) return
  const store = useGameStore.getState()
  let local = loadLocalProfile()
  let cloud = null
  try {
    cloud = await loadProfileExtras()
  } catch (err) {
    console.warn('[profile] could not load cloud profile', err)
  }

  try {
    // Use the live store stats (they include runs finished since the page loaded).
    const localStats = maxStats(local.stats, useGameStore.getState().stats)
    let stats
    if (!cloud) {
      stats = localStats
    } else if (local.claimedBy === user.id) {
      stats = maxStats(localStats, cloud.stats)
    } else if (local.claimedBy) {
      stats = sanitizeStats(cloud.stats)
    } else {
      stats = mergeStats(localStats, cloud.stats)
    }
    const cosmetics = cloud && !isEmptyCosmetics(cloud.cosmetics)
      ? sanitizeCosmetics(cloud.cosmetics)
      : sanitizeCosmetics(useGameStore.getState().cosmetics ?? local.cosmetics)

    saveLocalProfile({ stats, cosmetics, claimedBy: user.id })
    store.setStats(stats)
    store.setCosmetics(cosmetics)
    if (cloud) {
      try {
        await saveProfileExtras({ stats, cosmetics })
      } catch (err) {
        console.warn('[profile] could not upload merged profile', err)
      }
    }
  } catch (err) {
    console.warn('[profile] sync failed', err)
  }

  try {
    store.setEntitlements(await fetchEntitlements())
  } catch (err) {
    console.warn('[profile] could not fetch entitlements', err)
  }
}
