import { fireSingle } from './common'
import { playGunshot, playReload } from '../sounds'

// 9mm sidearm: the starting gun, semi-auto, free.
export const pistol = {
  id: 'pistol',
  name: 'Pistol',
  upgradedName: 'Mustang',
  caliber: '9mm',
  clip: 10,
  startReserve: 30,   // reserve a Mystery Box copy starts with
  maxReserve: 60,     // Max Ammo level (x1.5 with Deep Pockets)
  cost: null,         // not sold in the shop
  buyReserve: 0,      // reserve a shop purchase starts with
  boxWeight: 6,       // Mystery Box roll weight
  fireMode: 'semi',
  cooldown: 0,        // s between shots enforced in Player.jsx (0 = none)
  autoShootInterval: 0.4,   // mobile auto-shoot: s between shots
  vibrate: 18,
  damageMult: 1,      // on top of the base hit (body 1 / head 3); Upgrade Bench x2 is separate
  pierce: 1,
  reload: { base: 1.5, fast: 1.0 },   // s, without / with Fast Hands
  ammoPack: null,     // null = the default pack (common.js DEFAULT_AMMO_PACK)
  sounds: { shot: (upg) => playGunshot('pistol', upg), reload: () => playReload() },
  model: 'PistolModel',   // export of components/Gun.jsx
  fire: fireSingle,
}
