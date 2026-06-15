import { CLIP_SIZE, ALL_WEAPONS, bulletsForWave, intermissionForWave, clipSizeForWeapon } from './constants'

// Debug-only URL params for fast manual testing: ?wave=5&money=500&weapon=ak47
// Disabled on Vercel production builds (VITE_VERCEL_ENV is set via vite.config.js define).
export function applyDebugOverrides(set, get) {
  if (import.meta.env.VITE_VERCEL_ENV === 'production') return
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  if (!params.has('wave') && !params.has('money') && !params.has('weapon')) return

  const updates = {}

  const wave = parseInt(params.get('wave'), 10)
  if (wave > 1) {
    const total = bulletsForWave(wave)
    const clip = Math.min(CLIP_SIZE, total)
    updates.wave = wave
    updates.intermissionLeft = intermissionForWave(wave)
    updates.bulletsInClip = clip
    updates.reserveBullets = total - clip
  }

  const money = parseInt(params.get('money'), 10)
  if (!isNaN(money)) updates.money = money

  const weapon = params.get('weapon')
  if (ALL_WEAPONS.includes(weapon) && weapon !== 'pistol') {
    const clip = clipSizeForWeapon(weapon)
    updates.weapon = weapon
    updates.ownedWeapons = [...get().ownedWeapons, weapon]
    updates.bulletsInClip = clip
    updates.reserveBullets = clip * 3
  }

  set(updates)
}
