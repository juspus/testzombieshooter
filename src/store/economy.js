// Money, the shop, and the pay rules: kill money, wave reward and the wave-clear bonus summary.
import { modifierBonus } from '../modifiers'
import * as WR from '../weaponRules'
import { WEAPONS, ammoPackFor } from '../weapons'
import { isSelfDowned } from './shared'

export const WAVE_REWARD = 15
export const ZOMBIE_KILL_REWARD = 1
export const HEADSHOT_KILL_BONUS = 0.5
export const KNIFE_KILL_BONUS = 2
export const NO_PLANK_LOSS_BONUS = 10
export const FAST_CLEAR_BONUS = 8
export const fastClearParForWave = (wave) => 10 + wave * 2

// ── Wave 3 "Power-ups" helpers ───────────────────────────────────────────────
// Money paid on each kill: base reward + headshot / knife bonus (x2 under Double Money).
// The wave-clear base reward and wave bonuses (no-planks-lost, fast clear, modifier)
// are paid in nextWave and NOT doubled.
export function killMoney(source, isHeadshot) {
  return ZOMBIE_KILL_REWARD
    + (source === 'gun' && isHeadshot ? HEADSHOT_KILL_BONUS : 0)
    + (source === 'knife' ? KNIFE_KILL_BONUS : 0)
}

export function buildWaveBonusSummary({ wave, waveKills, waveHeadshots, waveKnifeKills, wavePlanksLost, waveStartPlanks, waveElapsed, modifier = null }) {
  const fastClearPar = fastClearParForWave(wave)
  const headshots = waveHeadshots * HEADSHOT_KILL_BONUS
  const knifeKills = waveKnifeKills * KNIFE_KILL_BONUS
  const noPlanksLost = waveStartPlanks > 0 && wavePlanksLost === 0 ? NO_PLANK_LOSS_BONUS : 0
  const fastClear = waveElapsed > 0 && waveElapsed <= fastClearPar ? FAST_CLEAR_BONUS : 0
  const modBonus = modifierBonus(modifier)   // Wave 3 modifier waves pay extra
  return {
    base: WAVE_REWARD,
    kills: waveKills * ZOMBIE_KILL_REWARD,
    headshots,
    knifeKills,
    noPlanksLost,
    fastClear,
    modifier,
    modifierBonus: modBonus,
    // Kills / headshots / knife were paid on each kill; `total` is what nextWave pays on top of base.
    total: noPlanksLost + fastClear + modBonus,
    elapsed: waveElapsed,
    fastClearPar,
    headshotsCount: waveHeadshots,
    knifeKillsCount: waveKnifeKills,
    planksLost: wavePlanksLost,
    startPlanks: waveStartPlanks,
  }
}

// Money and the shop: state, openShop / closeShop, buyItem, the supply-chest proximity flag.
export const createEconomySlice = (set, get) => ({
  money: 10,

  shopOpen: false,
  nearChest: false,

  openShop: () => { if (!isSelfDowned(get())) set({ shopOpen: true }) },
  closeShop: () => set({ shopOpen: false }),

  buyItem: (itemId) => {
    const { money, weapon, reserveBullets, perks, ownedWeapons } = get()
    // Helper: save current weapon state then equip a newly bought weapon
    // (Shares giveWeapon with the Mystery Box; guns are never dropped during a run.)
    const buyWeapon = (id, cost, clip, startReserve = 0) => {
      if (ownedWeapons.includes(id) || money < cost) return false
      set({ money: money - cost, ...WR.giveWeapon(get(), id, { reserve: startReserve }) })
      return true
    }
    // Shop guns: any registry weapon with a price (ak47, deagle, shotgun, flamethrower).
    const shopGun = WEAPONS[itemId]
    if (shopGun && shopGun.cost != null) return buyWeapon(itemId, shopGun.cost, shopGun.clip, shopGun.buyReserve)
    if (itemId === 'grenade') return get().buyGrenade()
    if (itemId === 'ammo_pack') {
      const pack = ammoPackFor(weapon)
      if (money < pack.cost) return false
      const amount = perks.deep_pockets ? pack.deepAmount : pack.amount
      set({ money: money - pack.cost, reserveBullets: reserveBullets + amount })
      return true
    }
    return false
  },

  setNearChest: (v) => set({ nearChest: v }),
})
