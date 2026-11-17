// Weapons and ammo: the equipped gun, per-weapon pools, reload, weapon switching, grenades.
// Gun numbers live in src/weapons/<gun>.js (the registry); this slice holds state and actions only.
import * as WR from '../weaponRules'
import { WEAPONS, ALL_WEAPONS, CALIBER_LABELS, MAX_RESERVE, FLAME, FLAME_START_AMMO, FLAME_AMMO_PACK, DEFAULT_AMMO_PACK } from '../weapons'
import { GRENADE, canBuyGrenade } from '../grenades'
import { isSelfDowned, clipSizeForWeapon, EMPTY_SAVED } from './shared'

// Gun numbers live in src/weapons/<gun>.js; these keep their old names (Shop, HUD and tests import them).
const CLIP_SIZE = WEAPONS.pistol.clip
const AK_CLIP = WEAPONS.ak47.clip
const AK_COST = WEAPONS.ak47.cost
const DEAGLE_CLIP = WEAPONS.deagle.clip
const DEAGLE_COST = WEAPONS.deagle.cost
const SHOTGUN_CLIP = WEAPONS.shotgun.clip
const SHOTGUN_COST = WEAPONS.shotgun.cost
const AMMO_PACK_COST = DEFAULT_AMMO_PACK.cost
const AMMO_PACK_AMOUNT = DEFAULT_AMMO_PACK.amount
const DEEP_POCKETS_AMMO_PACK_AMOUNT = DEFAULT_AMMO_PACK.deepAmount
const FLAMETHROWER_COST = WEAPONS.flamethrower.cost
const FLAMETHROWER_START_AMMO = FLAME_START_AMMO
const FLAMETHROWER_AMMO_PACK_COST = FLAME_AMMO_PACK.cost
const FLAMETHROWER_AMMO_PACK_AMOUNT = FLAME_AMMO_PACK.amount

// Flamethrower tuning — sustained-damage spray weapon (values live in src/weapons/flamethrower.js)
export const FLAME_DPS = FLAME.DPS                        // burn damage per second per zombie in the stream
export const FLAME_TICK_INTERVAL = FLAME.TICK_INTERVAL    // how often burn damage is applied
export const FLAME_FUEL_PER_SEC = FLAME.FUEL_PER_SEC      // tank drains this many units/sec while spraying
export const FLAME_RANGE = FLAME.RANGE                    // max spray distance
export const FLAME_CONE_COS = FLAME.CONE_COS              // ~23° half-angle cone
export const FLAME_BURN_DURATION = FLAME.BURN_DURATION    // zombies keep burning this long after leaving the stream

// Caliber labels, the ordered weapon list (scroll-wheel cycling) and Max Ammo reserves are derived
// from the weapon registry (src/weapons/index.js).
export { CALIBER_LABELS, ALL_WEAPONS, MAX_RESERVE }

export { CLIP_SIZE, AK_CLIP, AK_COST, DEAGLE_CLIP, DEAGLE_COST, SHOTGUN_CLIP, SHOTGUN_COST, AMMO_PACK_COST, AMMO_PACK_AMOUNT, DEEP_POCKETS_AMMO_PACK_AMOUNT, FLAMETHROWER_COST, FLAMETHROWER_START_AMMO, FLAMETHROWER_AMMO_PACK_COST, FLAMETHROWER_AMMO_PACK_AMOUNT }

// MAX_RESERVE (rounds a "full" Max Ammo refills to, per weapon; flamethrower = fuel units) comes from the weapon registry.

// Max Ammo for every owned weapon: clips topped up, reserves raised to MAX_RESERVE
// (x1.5 with Deep Pockets). Never lowers an existing reserve.
export function _maxAmmoState(st) {
  const mult = st.perks?.deep_pockets ? 1.5 : 1
  const full = (w) => Math.round(MAX_RESERVE[w] * mult)
  const savedClips = { ...st.savedClips }
  const savedReserves = { ...st.savedReserves }
  for (const w of st.ownedWeapons) {
    if (w === st.weapon) continue
    savedClips[w] = clipSizeForWeapon(w, !!st.upgradedWeapons?.[w])
    savedReserves[w] = Math.max(savedReserves[w] ?? 0, full(w))
  }
  return {
    bulletsInClip: Math.max(st.bulletsInClip, clipSizeForWeapon(st.weapon, !!st.upgradedWeapons?.[st.weapon])),
    reserveBullets: Math.max(st.reserveBullets, full(st.weapon)),
    savedClips,
    savedReserves,
  }
}

// The equipped weapon, per-weapon clip and reserve, reloading, switching, grenades.
export const createWeaponsSlice = (set, get) => ({
  weapon: 'pistol',        // currently equipped weapon
  ownedWeapons: ['pistol'], // all purchased weapons (determines scroll-cycle pool)
  // Per-weapon ammo saved when the weapon is not active.
  // The active weapon's live ammo is always in bulletsInClip / reserveBullets.
  savedClips:    { ...EMPTY_SAVED },
  savedReserves: { ...EMPTY_SAVED },
  activeItem: 'gun',  // 'gun' | 'knife'

  knifeCooldown: 0,   // seconds remaining until knife ready again

  bulletsInClip: CLIP_SIZE,
  reserveBullets: 0,
  isReloading: false,

  // ── Wave 3 "Grenades" ────────────────────────────────────────────────────────
  // Inventory only (carry rules live in grenades.js); the throw sim and blast are in
  // components/Grenades.jsx. Per-client state like money: the Shop is the only source.
  grenades: GRENADE.START,
  grenadeCooking: false,   // true while G / the mobile button is held (HUD cook bar)
  resetGrenades: () => set({ grenades: GRENADE.START, grenadeCooking: false }),
  setGrenadeCooking: (v) => { if (get().grenadeCooking !== v) set({ grenadeCooking: v }) },
  // Spend one grenade for a throw; false when empty.
  useGrenade: () => {
    const n = get().grenades
    if (n <= 0) return false
    set({ grenades: n - 1 })
    return true
  },
  buyGrenade: () => {
    const { grenades, money } = get()
    if (!canBuyGrenade(grenades, money)) return false
    set({ grenades: grenades + 1, money: money - GRENADE.COST })
    return true
  },

  consumeBullet: () => {
    const { bulletsInClip, isReloading } = get()
    if (isReloading || bulletsInClip <= 0) return false
    set({ bulletsInClip: bulletsInClip - 1 })
    return true
  },

  beginReload: () => {
    const { bulletsInClip, reserveBullets, isReloading, weapon, upgradedWeapons } = get()
    const clipSize = clipSizeForWeapon(weapon, !!upgradedWeapons[weapon])
    if (isReloading || reserveBullets === 0 || bulletsInClip === clipSize) return false
    set({ isReloading: true })
    return true
  },

  // ── Crossbow bolt pick-ups (client-local; see Bolts.jsx) ──
  // +1 crossbow reserve (the held one, or the parked pool). False when not carried / at cap.
  collectBolt: () => {
    const st = get()
    if (!st.ownedWeapons.includes('crossbow')) return false
    const cap = Math.round(MAX_RESERVE.crossbow * (st.perks?.deep_pockets ? 1.5 : 1))
    if (st.weapon === 'crossbow') {
      const n = WR.collectBoltReserve(st.reserveBullets, cap)
      if (n === null) return false
      set({ reserveBullets: n })
    } else {
      const n = WR.collectBoltReserve(st.savedReserves.crossbow ?? 0, cap)
      if (n === null) return false
      set({ savedReserves: { ...st.savedReserves, crossbow: n } })
    }
    return true
  },

  finishReload: () => {
    const { bulletsInClip, reserveBullets, weapon, upgradedWeapons } = get()
    const clipSize = clipSizeForWeapon(weapon, !!upgradedWeapons[weapon])
    const toLoad = Math.min(clipSize - bulletsInClip, reserveBullets)
    set({ bulletsInClip: bulletsInClip + toLoad, reserveBullets: reserveBullets - toLoad, isReloading: false })
  },

  consumeFuel: (amount) => {
    const { reserveBullets } = get()
    if (reserveBullets <= 0) return false
    set({ reserveBullets: Math.max(0, reserveBullets - amount) })
    return true
  },

  toggleItem: () => set((s) => (isSelfDowned(s) ? {} : { activeItem: s.activeItem === 'gun' ? 'knife' : 'gun' })),
  setKnifeCooldown: (v) => set({ knifeCooldown: v }),

  // Scroll-wheel weapon switch — saves current clip/reserve, loads next weapon's saved values
  switchWeapon: (nextWeapon, opts) => {
    const { weapon, bulletsInClip, reserveBullets, savedClips, savedReserves, ownedWeapons } = get()
    if (nextWeapon === weapon || !ownedWeapons.includes(nextWeapon) || get().benchBusy) return
    if (!opts?.force && isSelfDowned(get())) return   // W5: downed players are stuck with their sidearm
    set({
      weapon: nextWeapon,
      bulletsInClip:  savedClips[nextWeapon],
      reserveBullets: savedReserves[nextWeapon],
      savedClips:    { ...savedClips,    [weapon]: bulletsInClip  },
      savedReserves: { ...savedReserves, [weapon]: reserveBullets },
      isReloading: false,
    })
  },
})
