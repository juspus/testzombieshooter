# Weapons and ammo

### One file per gun (`src/weapons/`)
Every gun's numbers and fire behaviour live in `src/weapons/<gun>.js`; `src/weapons/index.js` is the
registry (`WEAPONS`, `ALL_WEAPONS`, `getWeapon`, plus derived tables). Stats, ammo and fire behaviour for a new gun are one file plus one line in
`ORDER` in `index.js`, but other files still branch on gun ids: the pose, muzzle and flash branches in `Gun.jsx` (`isAK`/`isDeagle`/...),
`Machines.jsx` (`SHOW_IDS`), `RemotePlayer.jsx`, `Shop.jsx`, the playground registry, and 'crossbow'/'deagle' checks in
`Zombie.jsx`, `zombieSpecials.js`, `sounds.js` and `store.js`. A weapon file may import pure modules (`rng`, `walls`,
`hitboxes`, `sounds`) but never a component or the store (the store imports the registry: that would be a cycle).
Everything scene-bound reaches `fire` through `ctx` (field list at the top of `weapons/common.js`).

Fields of a weapon: `id`, `name`, `upgradedName`, `caliber`, `clip`, `startReserve` (Mystery Box copy),
`maxReserve` (Max Ammo, x1.5 with Deep Pockets), `cost` (shop price, `null` = not sold), `buyReserve` (reserve a shop
purchase starts with), `boxWeight`, `fireMode` (`semi` | `auto` | `pump` | `spray`), `cooldown` (s between shots,
enforced in `Player.jsx`), `fireInterval` (auto only), `autoShootInterval` (mobile auto-shoot), `vibrate`, `damageMult`,
`pierce`, `reload { base, fast }`, `ammoPack` (`null` = default pack), `sounds { shot, reload }` (lazy wrappers over
`sounds.js`, which keeps all synthesis), `model` (name of an export of `Gun.jsx`; `WEAPON_MODELS` maps it and `Gun.jsx` picks its model through it),
`fire(ctx)`.

`Player.jsx` calls `WEAPONS[weapon].fire(FIRE)` from `shoot()` (one persistent `FIRE` context, per-shot fields
refreshed, no per-shot allocation of it) and reads `fireMode`/`cooldown`/`autoShootInterval`/`reload` from the file instead of
branching per gun. All zombie hit tests still go through `hitZombieRay` (`hitboxes.js`); the shotgun's pellet spread still draws
`runRandom('spread')` (angle, then radius, per pellet) so seeded runs repeat. `fireSingle` (`common.js`) is the shared
pistol / AK-47 hitscan.

### Weapons
| Weapon | Caliber | Clip | Start / max reserve | Cost | Fire mode | Notes |
|---|---|---|---|---|---|---|
| Pistol (Mustang) | 9mm | 10 | 30 / 60 | free | Semi-auto | Starting weapon |
| Pump Shotgun (Widowmaker) | 12ga | 8 | 24 / 48 | €150 | Pump | 12 pellets/shot, 0.5 s cooldown, mobile auto-shoot every 0.6 s |
| AK-47 (Red Fang) | 5.45mm | 30 | 90 / 150 | €270 | Full-auto | 10 rds/s while mouse held |
| Desert Eagle (Hand Cannon) | .50 AE | 7 | 21 / 42 | €700 | Semi-auto | Instant kill (every hit a headshot), pierces up to 3 targets |
| Flamethrower (Dragon's Breath) | Napalm | none | 1000 / 2000 fuel | €1500 | Spray (hold) | The reserve is fuel; shop sells 1000 fuel for €100. Burn DoT in `weapons/flamethrower.js` (`FLAME_*` tuning); `FlameSpray.jsx` draws and ignites |
| Crossbow (Wraith) | Bolt | 5 | 30 / 40 | Mystery Box only | Semi-auto | 0.45 s cooldown, pierces 6, bolt multiplier per zombie type (`boltMult`); `Bolts.jsx` pools bolts that stick and can be picked up (+1 reserve) |

Start reserve is what a Mystery Box copy begins with; a shop purchase begins with `buyReserve` (0 for the guns, 1000 for
the flamethrower). Mystery Box roll weights are `boxWeight` (pistol 6, shotgun 18, AK 16, Deagle 10, flamethrower 6,
crossbow 16); `BOX_WEIGHTS` keeps the registry order. The Upgrade Bench doubles damage and gives +50% clip
(`UPGRADE_DAMAGE_MULT`, `UPGRADE_CLIP_MULT`, now in `weapons/common.js`), reserve raised to Max Ammo.

### Old constants stay exported
`store.js` and `weaponRules.js` still export every old name, derived from the registry: `CALIBER_LABELS`, `ALL_WEAPONS`,
`MAX_RESERVE`, `CLIP_SIZE`, `AK_CLIP`/`AK_COST`, `DEAGLE_*`, `SHOTGUN_*`, `AMMO_PACK_*`, `FLAMETHROWER_*`, `FLAME_*`,
`BASE_CLIP`, `START_RESERVE`, `WEAPON_NAMES`, `UPGRADED_NAMES`, `BOX_WEIGHTS`, `CROSSBOW`, `boltMult`, `boltBlastDamage`.
Change a number in the gun's file; `src/__tests__/weapons.test.js` holds a table of the before-values and fails if one moves.

### Caliber constants
```js
// derived from the registry (src/weapons/index.js), re-exported by store.js
CALIBER_LABELS = { pistol: '9mm', ak47: '5.45mm', shotgun: '12ga', deagle: '.50 AE', flamethrower: 'Napalm', crossbow: 'Bolt' }
ALL_WEAPONS = ['pistol', 'shotgun', 'ak47', 'deagle', 'flamethrower', 'crossbow']   // scroll-wheel order
```

### Per-weapon ammo pools
Each weapon keeps its own clip and reserve independently. The active weapon's
live ammo lives in `bulletsInClip` / `reserveBullets`; inactive weapons' ammo
is parked in the `savedClips` / `savedReserves` maps.

```js
// Store state (relevant fields)
weapon:        'pistol'   // currently equipped
ownedWeapons:  ['pistol'] // grows as weapons are purchased or taken from the Mystery Box (no carry limit)
savedClips:    { pistol: 0, ak47: 0, shotgun: 0, deagle: 0, flamethrower: 0, crossbow: 0 }
savedReserves: { pistol: 0, ak47: 0, shotgun: 0, deagle: 0, flamethrower: 0, crossbow: 0 }
bulletsInClip: 10         // active weapon's clip (live)
reserveBullets: 25        // active weapon's reserve (live; fuel for the flamethrower)
```

### switchWeapon(nextWeapon)
Saves the active weapon's clip/reserve into `savedClips`/`savedReserves`,
loads the target weapon's saved values into `bulletsInClip`/`reserveBullets`,
and sets `isReloading: false`. `Player.jsx` also resets `reloadTimer.current = 0`
via a `useEffect` on `weapon`.

### Weapon switching — scroll wheel
`Player.jsx` listens to `wheel` on `document` (passive). Scroll down = next
weapon in `ownedWeapons`, scroll up = previous. Ignored when the shop is open
or pointer lock is not held. The HUD shows the "Scroll — switch" hint only when
2+ weapons are owned.

### Buying a weapon (buyItem)
Any registry weapon with a `cost` is a shop gun (`WEAPONS[id].cost != null`). `buyItem` gives it through `giveWeapon`
(`weaponRules.js`, shared with the Mystery Box): saves the current weapon's clip/reserve, switches to the purchased weapon
(full clip, `buyReserve` reserve) and appends it to `ownedWeapons`. Buying a weapon you already own is blocked.

### Ammo Pack
Adds to `reserveBullets` (the active weapon's reserve) using `ammoPackFor(weapon)`: the default pack is +20 rounds for
€10 (+30 with the Deep Pockets perk, `DEFAULT_AMMO_PACK`); the flamethrower's is +1000 fuel for €100 and ignores Deep
Pockets. The shop description shows the active weapon's caliber.

### Ammo crate pickups (BulletPickups.jsx)
During a wave, glowing ammo crates spawn every 10 s at one of four interior
corners (`±5.5, 0, ±7.5`). At most one crate per corner at a time. Walking
within 1.8 units auto-collects it and adds +10 rounds to the active weapon's
reserve via `addBullets()` in the store.
