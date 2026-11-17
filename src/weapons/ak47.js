import { fireSingle } from './common'
import { playGunshot, playReload } from '../sounds'

// 5.45mm assault rifle: full-auto, 10 rounds/s while the trigger is held.
export const ak47 = {
  id: 'ak47',
  name: 'AK-47',
  upgradedName: 'Red Fang',
  caliber: '5.45mm',
  clip: 30,
  startReserve: 90,
  maxReserve: 150,
  cost: 270,
  buyReserve: 0,
  boxWeight: 16,
  fireMode: 'auto',
  fireInterval: 0.1,  // s between shots while the trigger is held
  cooldown: 0,
  autoShootInterval: 0.4,
  vibrate: 18,
  damageMult: 1,
  pierce: 1,
  reload: { base: 1.5, fast: 1.0 },
  ammoPack: null,
  sounds: { shot: (upg) => playGunshot('ak47', upg), reload: () => playReload() },
  model: 'AKModel',
  fire: fireSingle,
}
