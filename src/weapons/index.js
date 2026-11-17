// Weapon registry: one file per gun (src/weapons/<gun>.js), combined here.
//
// The numbers and fire behaviour of every gun live in its own file. This module derives the
// lookup tables the rest of the game already used (CALIBER_LABELS, ALL_WEAPONS, BASE_CLIP, ...):
// store.js and weaponRules.js re-export them under their old names, so no caller changes.
// Adding a gun is one new file plus one line in ORDER below (and a model in components/Gun.jsx).
//
// Do not import components or the store from a weapon file (see common.js).
import { pistol } from './pistol'
import { shotgun } from './shotgun'
import { ak47 } from './ak47'
import { deagle } from './deagle'
import { flamethrower } from './flamethrower'
import { crossbow } from './crossbow'
import { DEFAULT_AMMO_PACK } from './common'

// Order matters: scroll-wheel cycling, Mystery Box roll order and Max Ammo all follow it.
const ORDER = [pistol, shotgun, ak47, deagle, flamethrower, crossbow]

export const WEAPONS = Object.fromEntries(ORDER.map((w) => [w.id, w]))
export const ALL_WEAPONS = ORDER.map((w) => w.id)
export const getWeapon = (id) => WEAPONS[id] ?? null

const table = (pick) => Object.fromEntries(ORDER.map((w) => [w.id, pick(w)]))

export const CALIBER_LABELS = table((w) => w.caliber)
export const BASE_CLIP = table((w) => w.clip)
export const START_RESERVE = table((w) => w.startReserve)
export const MAX_RESERVE = table((w) => w.maxReserve)
export const WEAPON_NAMES = table((w) => w.name)
export const UPGRADED_NAMES = table((w) => w.upgradedName)
export const BOX_WEIGHTS = table((w) => w.boxWeight)

// Shop ammo pack for a weapon: { cost, amount, deepAmount }.
export const ammoPackFor = (id) => WEAPONS[id]?.ammoPack ?? DEFAULT_AMMO_PACK

// Reload time (s) for a weapon, with or without the Fast Hands perk.
export const reloadTimeFor = (id, fastHands) => {
  const r = (WEAPONS[id] ?? pistol).reload
  return fastHands ? r.fast : r.base
}

export { DEFAULT_AMMO_PACK }
export { FLAME, FLAME_START_AMMO, FLAME_AMMO_PACK } from './flamethrower'
export { CROSSBOW, CROSSBOW_DAMAGE_MULT, crossbowReloadTime, boltMult, boltBlastDamage } from './crossbow'
export { UPGRADE_CLIP_MULT, UPGRADE_DAMAGE_MULT } from './common'
