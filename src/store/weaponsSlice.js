import {
  CLIP_SIZE, AK_CLIP, AK_COST, DEAGLE_CLIP, DEAGLE_COST, SHOTGUN_CLIP, SHOTGUN_COST,
  AMMO_PACK_COST, AMMO_PACK_AMOUNT, DEEP_POCKETS_AMMO_PACK_AMOUNT,
  EMPTY_SAVED, clipSizeForWeapon,
} from './constants'

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

  consumeBullet: () => {
    const { bulletsInClip, isReloading } = get()
    if (isReloading || bulletsInClip <= 0) return false
    set({ bulletsInClip: bulletsInClip - 1 })
    return true
  },

  beginReload: () => {
    const { bulletsInClip, reserveBullets, isReloading, weapon } = get()
    const clipSize = clipSizeForWeapon(weapon)
    if (isReloading || reserveBullets === 0 || bulletsInClip === clipSize) return false
    set({ isReloading: true })
    return true
  },

  finishReload: () => {
    const { bulletsInClip, reserveBullets, weapon } = get()
    const clipSize = clipSizeForWeapon(weapon)
    const toLoad = Math.min(clipSize - bulletsInClip, reserveBullets)
    set({ bulletsInClip: bulletsInClip + toLoad, reserveBullets: reserveBullets - toLoad, isReloading: false })
  },

  toggleItem: () => set((s) => ({ activeItem: s.activeItem === 'gun' ? 'knife' : 'gun' })),
  setKnifeCooldown: (v) => set({ knifeCooldown: v }),

  // Scroll-wheel weapon switch — saves current clip/reserve, loads next weapon's saved values
  switchWeapon: (nextWeapon) => {
    const { weapon, bulletsInClip, reserveBullets, savedClips, savedReserves, ownedWeapons } = get()
    if (nextWeapon === weapon || !ownedWeapons.includes(nextWeapon)) return
    set({
      weapon: nextWeapon,
      bulletsInClip:  savedClips[nextWeapon],
      reserveBullets: savedReserves[nextWeapon],
      savedClips:    { ...savedClips,    [weapon]: bulletsInClip  },
      savedReserves: { ...savedReserves, [weapon]: reserveBullets },
      isReloading: false,
    })
  },

  buyItem: (itemId) => {
    const { money, weapon, bulletsInClip, reserveBullets, perks, ownedWeapons, savedClips, savedReserves } = get()
    // Helper: save current weapon state then equip a newly bought weapon
    const buyWeapon = (id, cost, clip) => {
      if (ownedWeapons.includes(id) || money < cost) return false
      set({
        money: money - cost,
        weapon: id,
        bulletsInClip: clip,
        reserveBullets: 0,
        ownedWeapons: [...ownedWeapons, id],
        savedClips:    { ...savedClips,    [weapon]: bulletsInClip  },
        savedReserves: { ...savedReserves, [weapon]: reserveBullets },
        isReloading: false,
      })
      return true
    }
    if (itemId === 'ak47')    return buyWeapon('ak47',    AK_COST,     AK_CLIP)
    if (itemId === 'deagle')  return buyWeapon('deagle',  DEAGLE_COST, DEAGLE_CLIP)
    if (itemId === 'shotgun') return buyWeapon('shotgun', SHOTGUN_COST, SHOTGUN_CLIP)
    if (itemId === 'ammo_pack') {
      if (money < AMMO_PACK_COST) return false
      const amount = perks.deep_pockets ? DEEP_POCKETS_AMMO_PACK_AMOUNT : AMMO_PACK_AMOUNT
      set({ money: money - AMMO_PACK_COST, reserveBullets: reserveBullets + amount })
      return true
    }
    return false
  },
})
