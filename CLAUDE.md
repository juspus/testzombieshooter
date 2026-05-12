# testzombieshooter

## Git workflow

- All pull requests must target `main` as the base branch.
- Create feature branches from `main`.

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
└── components/
    ├── Game.jsx               # Canvas setup, fog, scene root
    ├── Arena.jsx              # Full cabin interior + lighting + Roof component
    ├── ForestSkybox.jsx       # Single cylinder with baked panorama texture
    ├── Player.jsx             # Pointer-lock camera, WASD, raycasting shoot
    ├── Zombie.jsx             # Single zombie mesh + AI + animation
    ├── ZombieManager.jsx      # Renders all live zombies + shader warmer
    ├── BulletTrails.jsx
    ├── ShellCasings.jsx
    ├── HUD.jsx
    ├── Shop.jsx
    └── Screens.jsx
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

## Known performance notes

- Each unique material config = one WebGL shader program. Avoid adding new `transparent`, `metalness`, or `envMap` combinations to materials that mount/unmount frequently.
- `meshBasicMaterial` skips all lighting — use it for skybox, UI planes, purely decorative non-lit geometry.
- `scene.traverseVisible()` is called every frame for the shadow map. Every node with `castShadow=true` adds a shadow draw call. The Arena has ~43 `castShadow` meshes; keep zombie count at 6 per zombie.
- The geometry cache in `Zombie.jsx` is module-level (singleton). It is never cleared. This is intentional.
