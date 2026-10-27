// MODEL PLAYGROUND REGISTRY  (/?models  ·  deep link: /?models&m=<id>)
//
// To show a new game model in the playground, add ONE entry to ENTRIES below:
//   {
//     id:            unique slug, used in the ?m= deep link
//     category:      one of CATEGORIES
//     label:         chip text
//     Component:     React component rendering the model with its base at y = 0.
//                    Receives `ctrl` (ref: { id, n } = current animation id and a
//                    press counter) plus everything in `props`.
//     props:         extra props for Component (optional)
//     animations:    [{ id, label, loop? }] shown as buttons. loop anims
//                    (idle, walk, burning...) persist; the others are one-shots
//                    replayed on each press. First entry is the default.
//     defaultCamera: { position, target, fit } - fit 'width' pushes the camera
//                    back on portrait screens, 'height' leaves it alone.
//     floorY:        y of the floor grid (default 0)
//     humanScale:    show the 1.8 m reference box by default (default false)
//     variants:      N > 0 shows a Variant chooser (1..N + shuffle); the chosen index is
//                    passed to Component as the `variant` prop (also deep link &v=<n>)
//   }
// Zombie archetypes are generated from ZOMBIE_ARCHETYPES in store.js, so a new
// archetype appears here automatically.
import { ZOMBIE_ARCHETYPES } from '../store'
import {
  ZombieDisplay, WeaponDisplay, KnifeDisplay, AmmoCrateDisplay, ArmourDisplay,
  MysteryBoxDisplay, UpgradeBenchDisplay,
} from './models'
import {
  RockingChair, Bookshelf, OldDesk, Bed, Nightstand, KitchenTable, WoodStove,
  DeerHead, CellarDoor, FloorRug, Chest,
} from '../components/Arena'

export const CATEGORIES = [
  { id: 'zombies', label: 'Zombies' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'knife', label: 'Knife' },
  { id: 'armour', label: 'Armour' },
  { id: 'pickups', label: 'Pickups' },
  { id: 'props', label: 'Props' },
]

const ZOMBIE_ANIMS = [
  { id: 'idle', label: 'Idle', loop: true },
  { id: 'walk', label: 'Walk', loop: true },
  { id: 'attack', label: 'Attack', loop: true },
  { id: 'death', label: 'Death', loop: true },
  { id: 'burning', label: 'Burning', loop: true },
]

const zombieEntries = Object.entries(ZOMBIE_ARCHETYPES).map(([type, a]) => {
  const hs = a.heightScale ?? 1
  return {
    id: type,
    category: 'zombies',
    label: a.label ?? type,
    Component: ZombieDisplay,
    props: { type },
    animations: ZOMBIE_ANIMS,
    defaultCamera: { position: [2.4 * hs, 1.5 * hs, 3.4 * hs], target: [0, 0.9 * hs, 0], fit: 'height' },
    humanScale: true,
    variants: 8,   // Variant chooser: seed 0 = this zombie's look for id `pg0`, etc.
  }
})

const WEAPON_CAM = { position: [0.8, 0.18, 0.3], target: [0, -0.02, -0.2], fit: 'width' }
const FIRE = [{ id: 'fire', label: 'Fire' }]
const weaponEntry = (weapon, label, animations = FIRE) => ({
  id: weapon, category: 'weapons', label, Component: WeaponDisplay, props: { weapon },
  animations, defaultCamera: WEAPON_CAM, floorY: -0.3,
})

const ARMOUR_CAM_HEAD = { position: [0, 1.75, -2.1], target: [0, 1.55, 0], fit: 'height' }
const ARMOUR_CAM_BODY = { position: [0, 1.3, -3.4], target: [0, 1.0, 0], fit: 'height' }
const armourEntry = (id, label, props, cam) => ({
  id, category: 'armour', label, Component: ArmourDisplay, props, animations: [],
  defaultCamera: cam, humanScale: true,
})

// Cabin furniture/props (exported from Arena.jsx; base at y = 0). They take a
// `position` prop and ignore `ctrl`, so they work as-is with no animations.
const PROP_CAM = (d, h = 1.1) => ({ position: [d * 0.5, h + 0.3, d * 0.65], target: [0, h * 0.6, 0], fit: 'width' })
const propEntry = (id, label, Component, props, cam, extra) => ({
  id, category: 'props', label, Component, props: { position: [0, 0, 0], ...props },
  animations: [], defaultCamera: cam, ...extra,
})

export const ENTRIES = [
  ...zombieEntries,
  weaponEntry('pistol', 'Pistol'),
  weaponEntry('shotgun', 'Shotgun', [...FIRE, { id: 'pump', label: 'Pump' }]),
  weaponEntry('ak47', 'AK-47'),
  weaponEntry('deagle', 'Desert Eagle'),
  weaponEntry('flamethrower', 'Flamethrower', [...FIRE, { id: 'flame', label: 'Flame', loop: true }]),
  weaponEntry('crossbow', 'Crossbow (box only)'),
  {
    id: 'knife', category: 'knife', label: 'Hunting knife', Component: KnifeDisplay,
    animations: [{ id: 'swing', label: 'Swing' }],
    defaultCamera: { position: [0.55, 0.15, 0.2], target: [0, 0, -0.2], fit: 'width' }, floorY: -0.3,
  },
  armourEntry('bike_helmet', 'Bike helmet', { helmet: 'bike_helmet' }, ARMOUR_CAM_HEAD),
  armourEntry('military_helmet', 'Military helmet', { helmet: 'military_helmet' }, ARMOUR_CAM_HEAD),
  armourEntry('knight_helmet', 'Knight helmet', { helmet: 'knight_helmet' }, ARMOUR_CAM_HEAD),
  armourEntry('biker_jacket', 'Biker jacket', { bodyArmor: 'biker_jacket' }, ARMOUR_CAM_BODY),
  armourEntry('bulletproof_vest', 'Bulletproof vest', { bodyArmor: 'bulletproof_vest' }, ARMOUR_CAM_BODY),
  armourEntry('knight_armor', 'Knight armour', { bodyArmor: 'knight_armor' }, ARMOUR_CAM_BODY),
  armourEntry('knight_full', 'Full knight', { helmet: 'knight_helmet', bodyArmor: 'knight_armor' },
    { position: [0, 1.4, -4.2], target: [0, 0.95, 0], fit: 'height' }),
  {
    id: 'ammo_crate', category: 'pickups', label: 'Ammo crate', Component: AmmoCrateDisplay,
    animations: [],
    defaultCamera: { position: [0.9, 0.5, 1.1], target: [0, 0.2, 0], fit: 'width' }, floorY: 0,
  },
  propEntry('rocking_chair', 'Rocking chair', RockingChair, {}, PROP_CAM(2.4, 1.0), { humanScale: true }),
  propEntry('bookshelf', 'Bookshelf', Bookshelf, {}, PROP_CAM(3.2, 1.0)),
  propEntry('old_desk', 'Old desk', OldDesk, {}, PROP_CAM(2.4, 0.7)),
  propEntry('bed', 'Bed', Bed, {}, PROP_CAM(3.6, 0.7)),
  propEntry('nightstand', 'Nightstand', Nightstand, {}, PROP_CAM(1.6, 0.5)),
  propEntry('kitchen_table', 'Kitchen table', KitchenTable, {}, PROP_CAM(2.0, 0.6)),
  propEntry('wood_stove', 'Wood stove', WoodStove, {}, PROP_CAM(3.0, 1.0)),
  propEntry('deer_head', 'Deer head', DeerHead, { position: [0, 1, 0] }, PROP_CAM(1.8, 1.0), { floorY: 0 }),
  propEntry('cellar_door', 'Cellar door', CellarDoor, {}, { position: [0.9, 1.5, 1.4], target: [0, 0, 0], fit: 'width' }),
  propEntry('floor_rug', 'Floor rug', FloorRug, { args: [2.5, 1.8] }, { position: [1.6, 2.2, 2.0], target: [0, 0, 0], fit: 'width' }),
  propEntry('chest', 'Loot chest', Chest, {}, PROP_CAM(1.8, 0.4)),
  {
    id: 'mystery_box', category: 'props', label: 'Mystery Box', Component: MysteryBoxDisplay,
    animations: [{ id: 'closed', label: 'Closed', loop: true }, { id: 'open', label: 'Open', loop: true }, { id: 'teddy', label: 'Teddy', loop: true }],
    defaultCamera: { position: [1.8, 1.8, 2.8], target: [0, 0.9, 0], fit: 'width' },
  },
  {
    id: 'upgrade_bench', category: 'props', label: 'Upgrade Bench', Component: UpgradeBenchDisplay,
    animations: [{ id: 'idle', label: 'Idle', loop: true }, { id: 'work', label: 'Working', loop: true }],
    defaultCamera: { position: [2.2, 1.8, 3.2], target: [0, 0.9, 0], fit: 'width' },
  },
]

export const getEntry = (id) => ENTRIES.find((e) => e.id === id) ?? null
