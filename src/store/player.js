// Health, armour and perks: damage taken, death, the armour and bandage buys, the perk buys.
import { cancelLastKillFx } from './combat'
import { dirDefending } from './shared'

export const BASE_HP = 20
export const BANDAGE_COST = 15
export const BANDAGE_HEAL = 5

// Head-slot armor. One equipped at a time; buying a new one replaces the old.
export const HELMET_DEFS = {
  bike_helmet:     { label: 'Bike Helmet',     hp: 5,   cost: 20 },
  military_helmet: { label: 'Military Helmet', hp: 20,  cost: 100 },
  knight_helmet:   { label: 'Knight Helmet',   hp: 100, cost: 200, visionLimit: true },
}

// Body-slot armor. One equipped at a time; buying a new one replaces the old.
export const BODY_ARMOR_DEFS = {
  biker_jacket:     { label: 'Biker Jacket',     hp: 15,  cost: 60 },
  bulletproof_vest: { label: 'Bulletproof Vest', hp: 100, cost: 200 },
  knight_armor:     { label: 'Knight Armor',     hp: 300, cost: 400, speedMultiplier: 0.7 },
}

export const PERK_COSTS = {
  fast_hands: 80,
  deep_pockets: 80,
  iron_sights: 75,
  runners_breath: 90,
  carpenter: 65,
  knife_mastery: 70,
}

let _selfZeroHook = null
export function setSelfZeroHook(fn) { _selfZeroHook = fn }

// Health, armour, perks and death.
export const createPlayerSlice = (set, get) => ({
  perks: {},       // one-time perk unlocks bought from the supply chest

  hp: BASE_HP,
  maxHp: BASE_HP,
  helmet: null,      // head-slot armor id, see HELMET_DEFS
  bodyArmor: null,   // body-slot armor id, see BODY_ARMOR_DEFS
  hitEventId: 0,     // bumped on every hitPlayer() call; HUD watches this to trigger the damage decal

  die: () => {
    if (get().phase !== 'playing') return
    // The Director: dying ends the turn, not the run.
    if (dirDefending(get())) { get().directorEndTurn(true); return }
    set({ phase: 'dead', lastKillPending: false })
    if (get().runMode === 'duel') {
      const { wave, kills, duel } = get()
      set({ duel: { ...duel, final: { wave, kills } } })
    }
    cancelLastKillFx()
    // Single choke point for death: covers hitPlayer() and the co-op 'die'
    // net event (NetManager -> store.die()). runRecorded makes it once-only.
    get().recordRunEnd()
  },

  // Called by Zombie.jsx's attack_player state. Fully client-local: each
  // client already computes its own player's proximity/damage independently,
  // same as the pre-HP instant-kill check did — no net sync needed.
  // ax/az: attacker world position, for the directional damage indicator.
  hitPlayer: (damage, ax = 0, az = 0) => {
    const { phase, hp, hitEventId, mpRole, mpConnected, coop } = get()
    if (phase !== 'playing') return
    const inCoop = !!mpRole && mpConnected
    // W5: a downed / bled-out co-op player can't be hurt (zombies retarget the partner)
    if (inCoop && coop[mpRole].status !== 'alive') return
    const newHp = Math.max(0, hp - damage)
    set({ hp: newHp, hitEventId: hitEventId + 1, lastHitX: ax, lastHitZ: az })
    if (dirDefending(get())) set((s) => ({ director: { ...s.director, turnDamage: s.director.turnDamage + (hp - newHp) } }))
    if (newHp <= 0) {
      // W5: in co-op 0 HP means DOWN (coopRuntime registers the hook); solo is unchanged
      if (inCoop && _selfZeroHook) _selfZeroHook()
      else get().die()
    }
  },

  buyBandage: () => {
    const { money, hp, maxHp } = get()
    if (hp >= maxHp) return false
    if (money < BANDAGE_COST) return false
    set({ hp: Math.min(maxHp, hp + BANDAGE_HEAL), money: money - BANDAGE_COST })
    return true
  },

  buyHelmet: (id) => {
    const def = HELMET_DEFS[id]
    const { helmet, money, hp, maxHp } = get()
    if (!def || helmet === id) return false
    if (money < def.cost) return false
    const delta = def.hp - (helmet ? HELMET_DEFS[helmet].hp : 0)
    const newMax = maxHp + delta
    set({ helmet: id, money: money - def.cost, maxHp: newMax, hp: Math.min(newMax, Math.max(1, hp + delta)) })
    return true
  },

  buyBodyArmor: (id) => {
    const def = BODY_ARMOR_DEFS[id]
    const { bodyArmor, money, hp, maxHp } = get()
    if (!def || bodyArmor === id) return false
    if (money < def.cost) return false
    const delta = def.hp - (bodyArmor ? BODY_ARMOR_DEFS[bodyArmor].hp : 0)
    const newMax = maxHp + delta
    set({ bodyArmor: id, money: money - def.cost, maxHp: newMax, hp: Math.min(newMax, Math.max(1, hp + delta)) })
    return true
  },

  buyPerk: (perkId) => {
    const { money, perks } = get()
    const cost = PERK_COSTS[perkId]
    if (!cost || perks[perkId] || money < cost) return false
    set({ money: money - cost, perks: { ...perks, [perkId]: true } })
    return true
  },
})
