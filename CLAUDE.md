# testzombieshooter

## Start of session

Read `SOUL.md` (how I work, who I am on this project), `MEMORY.md`
(running journal of recent context), and `TODO.md` (idea stash) before
doing anything else.

## Git workflow

- All pull requests must target `main` as the base branch.
- Create feature branches from `main`.
- Open a PR for the session's work even for small/doc-only changes, so
  Vercel generates a preview deployment. Always reply with the preview
  URL once it's ready.

---

## Architecture

### Tech stack
- React 18 + React Three Fiber (R3F) + @react-three/drei
- Three.js 0.167, Zustand 4, Vite 5
- No textures except `public/forest-panorama.png` (baked offline with Pillow)

### Key files
```
src/
├── store.js                   # All game state + actions (Zustand)
├── cabin.js                   # Cabin dimension constants + window/door defs
├── walls.js                   # Wall segment geometry for pathfinding grid
├── sounds.js                  # Audio helpers
├── net.js                     # WebSocket multiplayer networking
└── components/
    ├── Game.jsx               # Canvas setup, fog, scene root
    ├── Arena.jsx              # Full cabin interior + lighting + Roof component
    ├── ForestSkybox.jsx       # Single cylinder with baked panorama texture
    ├── Player.jsx             # Pointer-lock camera, WASD, raycasting shoot, scroll weapon switch
    ├── Gun.jsx                # 3-D gun models (Pistol, AK-47, Desert Eagle, Shotgun)
    ├── Knife.jsx              # Melee knife model + swing animation
    ├── Zombie.jsx             # Single zombie mesh + AI + animation
    ├── ZombieManager.jsx      # Renders all live zombies + shader warmer
    ├── BulletTrails.jsx
    ├── ShellCasings.jsx
    ├── BulletPickups.jsx      # Ammo crates that spawn during waves
    ├── HUD.jsx
    ├── Shop.jsx
    ├── Screens.jsx            # Start / Wave Cleared / Intermission / YOU DIED
    ├── Walls.jsx              # Visible wall geometry
    ├── NetManager.jsx         # Multiplayer event bus
    └── RemotePlayer.jsx       # Ghost mesh for the co-op partner
```

### Cabin dimensions (cabin.js)
```js
CABIN_HW = 9    // X: ±9  (width = 18)
CABIN_HD = 10   // Z: ±10 (depth = 20)
WALL_H   = 3.2  // wall height
WALL_T   = 0.3  // wall thickness
WIN_Y0   = 0.5  // window sill height
WIN_Y1   = 2.0  // window lintel height
```

---

## Weapon & ammo system

### Weapons
| Weapon | Caliber | Clip | Cost | Fire mode | Notes |
|---|---|---|---|---|---|
| Pistol | 9mm | 10 | free | Semi-auto | Starting weapon |
| Pump Shotgun | 12ga | 8 | €150 | Pump | 12 pellets/shot, 0.5 s cooldown |
| AK-47 | 5.45mm | 30 | €270 | Full-auto | 10 rds/s while mouse held |
| Desert Eagle | .50 AE | 7 | €700 | Semi-auto | Instant kill, pierces up to 3 targets |

### Caliber constants (store.js)
```js
export const CALIBER_LABELS = {
  pistol:  '9mm',
  ak47:    '5.45mm',
  shotgun: '12ga',
  deagle:  '.50 AE',
}
export const ALL_WEAPONS = ['pistol', 'shotgun', 'ak47', 'deagle']
```

### Per-weapon ammo pools
Each weapon keeps its own clip and reserve independently. The active weapon's
live ammo lives in `bulletsInClip` / `reserveBullets`; inactive weapons' ammo
is parked in the `savedClips` / `savedReserves` maps.

```js
// Store state (relevant fields)
weapon:        'pistol'   // currently equipped
ownedWeapons:  ['pistol'] // grows as weapons are purchased
savedClips:    { pistol: 0, ak47: 0, shotgun: 0, deagle: 0 }
savedReserves: { pistol: 0, ak47: 0, shotgun: 0, deagle: 0 }
bulletsInClip: 10         // active weapon's clip (live)
reserveBullets: 25        // active weapon's reserve (live)
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
Saves the current weapon's clip/reserve, immediately switches to the purchased
weapon (full clip, 0 reserve), and appends it to `ownedWeapons`. Buying a
weapon you already own is blocked.

### Ammo Pack
Adds to `reserveBullets` (the active weapon's reserve). The shop description
dynamically shows the active weapon's caliber. Deep Pockets perk raises the
pack amount from +20 to +30 rounds.

### Ammo crate pickups (BulletPickups.jsx)
During a wave, glowing ammo crates spawn every 10 s at one of four interior
corners (`±5.5, 0, ±7.5`). At most one crate per corner at a time. Walking
within 1.8 units auto-collects it and adds +10 rounds to the active weapon's
reserve via `addBullets()` in the store.

---

## Performance — zombie spawn/kill freeze (solved)

This was a multi-layered problem. All fixes are committed to main.

### Root cause 1 — shader compilation stall on first spawn
Three.js compiles GLSL programs lazily on first render. With 7 point lights, each new `meshStandardMaterial` triggers a compile. First zombie mount caused a multi-frame freeze.

**Fix:** Always-mounted hidden zombie warmer in `ZombieManager.jsx`:
```jsx
<ZombieComponent key="warmer" id={-1} startX={0} startZ={0} hidden />
```
The warmer renders at `scale={0.001}` so it's invisible but keeps all shader programs alive. The `hidden` prop skips `useEffect` registration and `useFrame` logic.

### Root cause 2 — GPU buffer allocation on every mount
Each zombie mount called `gl.bufferData()` for ~99 geometries → spike of ~99 WebGL buffer allocations.

**Fix:** Module-level geometry cache in `Zombie.jsx`:
```js
const _geoCache = new Map()
function bg(x, y, z) {
  const k = `${x},${y},${z}`
  if (!_geoCache.has(k)) _geoCache.set(k, new THREE.BoxGeometry(x, y, z))
  return _geoCache.get(k)
}
```
All ~99 `boxGeometry`/`cylinderGeometry` calls go through `bg()`/`cg()`. Buffers are allocated once at module load.

### Root cause 3 — shadow map overhead
`scene.traverseVisible()` visits every Object3D every frame for shadow rendering. With 26 `castShadow` meshes per zombie × 25 zombies = 650 shadow draw calls per frame.

**Fix:** Reduced zombie shadow casters from 26 → 6 (head, chest, 2 upper arms, 2 thighs). Other 20 sub-meshes have no `castShadow`.

### Root cause 4 — fireplace point light cube shadow map
A `pointLight` with `castShadow` renders the scene **6 times per frame** (cube map faces).

**Fix:** Removed `castShadow` from the fireplace point light in `Arena.jsx`. Directional moonlight still casts shadows.

### Root cause 5 — oversized directional shadow map
Shadow map was 1024×1024 covering ±30 units. Reduced to 512×512 covering ±18 (matches actual play area).

```jsx
<directionalLight castShadow
  shadow-mapSize-width={512} shadow-mapSize-height={512}
  shadow-camera-left={-18} shadow-camera-right={18}
  shadow-camera-top={18}   shadow-camera-bottom={-18}
/>
```

---

## ForestSkybox

**File:** `src/components/ForestSkybox.jsx`

Single `CylinderGeometry` (radius 18, height 24, 64 segments, open-ended) with `meshBasicMaterial` (no lighting cost) wrapping `public/forest-panorama.png`.

- **1 draw call, 1 scene node, zero per-frame cost**
- No `castShadow`, no `receiveShadow`
- Texture loaded via `useTexture` from `@react-three/drei`
- `texture.wrapS = THREE.RepeatWrapping` for seamless horizontal wrap
- Cylinder positioned at `[0, 5, 0]` so tree line sits at correct eye level
- `side={THREE.BackSide}` so interior of cylinder is visible

### Regenerating the panorama
The PNG was generated with Python + Pillow. To regenerate, run the script in the session transcript. Key parameters:
- Canvas: 4096×1024
- Seeded RNG: `random.Random(0xF04E57)`
- 3 tree layers (far/mid/near) with wrap-safe edge mirroring
- Mist gradient at ground level

---

## Cabin roof (Arena.jsx)

Pitched gable roof added directly in `Arena.jsx` as the `Roof` component.

```js
const PITCH = 2.8  // height above WALL_H
```

- Two sloped panels: `boxGeometry` rotated at `Math.atan2(PITCH, HW)` ≈ 17°
- Eave overhang: 0.55 units beyond walls
- Ridge cap: thin box at peak
- Gable ends: 10 stacked boxes of decreasing width approximating a triangle
- Color: `ROOF = '#1e0e04'`

No `castShadow` on roof meshes (exterior, outside shadow frustum).

---

## Lighting summary (Arena.jsx)

| Light | Type | castShadow | Notes |
|---|---|---|---|
| Moonlight | DirectionalLight | ✅ 512×512 | Main shadow caster |
| Ambient | AmbientLight | — | `intensity=0.55, color=#c8d8f0` |
| Hemisphere | HemisphereLight | — | Sky/ground fill |
| Main room | PointLight | ❌ | |
| Bedroom | PointLight | ❌ | |
| Hall (×2) | PointLight | ❌ | |
| Kitchen | PointLight | ❌ | |
| Chest glow | PointLight | ❌ | |
| Fireplace (×2) | PointLight | ❌ | castShadow intentionally removed |

Total: 1 shadow-casting light. Point light shadow maps are cube maps (6 render passes each) — avoid `castShadow` on point lights.

---

## Wave / spawn system

- Wave N spawns `5 + (N-1)*3` zombies, capped at 25 active at once
- Remaining zombies queue in `pendingSpawns`; one slots in per kill
- `tick()` in store only runs during `intermission` phase (countdown between waves)
- Zombie movement is handled inside each `ZombieComponent`'s `useFrame`, not in the store

---

## Economy

| Source | Amount |
|---|---|
| Starting money | €10 |
| Wave clear (base) | €15 |
| Per kill | €1 |
| Headshot kill bonus | €0.50 |
| Knife kill bonus | €2 |
| No planks lost bonus | €10 (requires pre-wave planks) |
| Fast clear bonus | €8 (finish under par time) |

---

## Multiplayer (co-op)

Two-player co-op over WebSocket (`net.js`). One player is **host**, one is **guest**.
- Host drives wave spawning, zombie logic, and wave-clear detection
- Guest receives `wave_start` / `hit_zombie` / `add_plank` events and stays in sync
- `NetManager.jsx` handles the event bus; `RemotePlayer.jsx` renders the partner
- Store fields: `mpRole`, `mpConnected`, `remotePlayer`, `roomCode`

---

## Known performance notes

- Each unique material config = one WebGL shader program. Avoid adding new `transparent`, `metalness`, or `envMap` combinations to materials that mount/unmount frequently.
- `meshBasicMaterial` skips all lighting — use it for skybox, UI planes, purely decorative non-lit geometry.
- `scene.traverseVisible()` is called every frame for the shadow map. Every node with `castShadow=true` adds a shadow draw call. The Arena has ~43 `castShadow` meshes; keep zombie shadow casters at 6 per zombie.
- The geometry cache in `Zombie.jsx` is module-level (singleton). It is never cleared. This is intentional.
