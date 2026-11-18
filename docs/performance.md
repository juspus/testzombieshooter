# Performance notes

The binding rules are in CLAUDE.md ("Performance rules"). This file is the history and the detail behind them.

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

**Since 2026-11-17 (t-zombie-merge):** the body is ~6 merged part meshes (`zombieParts.js` lists the boxes, `zombieMesh.js` bakes and caches one geometry per part and feature flags, built lazily and warmed in idle time by the warmer). `bg()` only remains for a few helpers. One shared material shape (palette uniform array, per-vertex colour) keeps the program count flat.

### Root cause 3 — shadow map overhead
`scene.traverseVisible()` visits every Object3D every frame for shadow rendering. With 26 `castShadow` meshes per zombie × 25 zombies = 650 shadow draw calls per frame.

**Fix:** Reduced zombie shadow casters from 26 → 6 (head, chest, 2 upper arms, 2 thighs). Other 20 sub-meshes have no `castShadow`. After the merge the same parts cast (`PartMesh shadow`), still 6 per zombie.

### Root cause 4 — fireplace point light cube shadow map
A `pointLight` with `castShadow` renders the scene **6 times per frame** (cube map faces).

**Fix:** Removed `castShadow` from the fireplace point light in `Arena.jsx`. Directional moonlight still casts shadows.
(Note: this had silently regressed — `castShadow` was back on the fireplace light until 2026-10-27. Grep for `pointLight.*castShadow` when touching lights.)

### Root cause 5 — oversized directional shadow map
Shadow map was 1024×1024 covering ±30 units. Reduced to 512×512 covering ±18 (matches actual play area). The diner uses 512×512 over ±14 (interior is ±8 x ±6).
(Note: this regressed silently once, back to 1024/±30 in both arenas, and was restored on 2026-10-28. `src/__tests__/perfGuards.test.js` now fails if a map exceeds 512 or a point light gets `castShadow`.)

```jsx
<directionalLight castShadow
  shadow-mapSize-width={512} shadow-mapSize-height={512}
  shadow-camera-left={-18} shadow-camera-right={18}
  shadow-camera-top={18}   shadow-camera-bottom={-18}
/>
```

### Root cause 6 — 755 shadow casters in the Arena
The Arena's local `Box` helper defaulted `castShadow = true`, so every clapboard line, forest-thicket twig, beam and prop cast shadows: 761 casters in the cabin scene (843 total with zombies in the audit), 837 shadow-pass draws per frame. `Box` now defaults to `castShadow = false`; only wall slabs, window/doorway fills, fireplace pillars, the barricaded door and window planks opt in. Cabin scene is now ~58 casters (+6 per live zombie). New meshes must not cast unless they are a big silhouette that reads in moonlight through a window. Do not flip the `Box` default back.

### Fixed light budget (never change the light count at runtime)
three.js counts only *visible* lights; any change in that count recompiles every lit shader (same stall as root cause 1). Lights that animate (muzzle flash in `Gun.jsx`, Blackout flashlight in `ModifierFx.jsx`, bulbs/fireplace via `LivingLights`/`Storm`) are always mounted and only change `intensity`. Never toggle `visible` or mount/unmount a light. In `Gun.jsx` the Upgrade Bench hides the gun via a `modelRef` group that holds the meshes only; the muzzle light stays visible. `BulletPickups.jsx` crates glow with `emissive` (no light; it is only used by the model playground). Verified 2026-10-28: `renderer.info.programs.length` stayed at 23 (cabin) from wave 1 start through shooting, grenade, all power-ups, weapon swaps, bench and Blackout. It is 24 today (perf budget `programs`, max of the frame, after a real shot and after swapping through every weapon; the scene renders only once the lazy arena and its 11 lights exist).

### Frame governor (`src/frameGovernor.js`, `components/FrameGovernor.jsx`)
Invisible, no setting. Pure state machine fed the raw frame delta (not `time.scale`): EMA of frame time; above 22 ms for 2 s steps down a level, below 17.5 ms (a vsync-locked 60 Hz frame is 16.7 ms, so 14 ms could never be reached) for 6 s steps up; 3 s cooldown, flap back-off up to 8x, first 2 s ignored. Levels: 0 normal (lo-fi height 400); 1 height 340; 2 height 288; 3 height 288 + shadow map refreshed every 2nd frame (`shadowMap.autoUpdate=false`, `needsUpdate` on alternate frames). It never touches lights or materials. Off with `?lofi=0` or `?gov=0` (dev/preview). `?perf` shows `gov L<n>`; `window.__gov` in dev.

### Static bake (`src/staticMerge.js`, `components/StaticBake.jsx`)
The cabin and the diner wrap everything that never moves in `<StaticBake>`. After mount (layout effect, once) every eligible mesh is merged per material signature + castShadow + receiveShadow into one mesh, the material instance is reused (no new program), emptied groups are dropped, and the remaining matrices are frozen (`matrixAutoUpdate = false`, lights excluded). Merged meshes are named `static-merged` and carry `userData.merged` = part count. Transparent, emissive, `renderOrder`, hidden, mirrored, instanced and `userData.noMerge` meshes stay separate, so glass, planks (outside the wrapper), candle flames and anything that animates keep working. Anything that mounts later or moves must live OUTSIDE the wrapper. The undo function disposes the merged buffers (StrictMode, HMR). World raycasts (bullets, grenades, spitters) are analytic (`worldRay.js`) and never touch these meshes. Cabin: 1,437 -> 599 meshes, wave-1 view 476 -> 109 draws. A merged mesh is not frustum-culled, so triangles rise (trivial for a GPU). `?nobake` (dev/preview) turns it off for A/B runs.
The scene sits in ONE `Suspense` in `Game.jsx` (the arena chunk is lazy): without it the first frames compiled shaders for a light count the run never has and left 4 dead programs.

## ForestSkybox

**File:** `src/components/ForestSkybox.jsx`

Single open-ended `CylinderGeometry` (radius 46, height 70, 96 segments) at `[0, 22, 0]` with a `meshBasicMaterial` (no lighting, no fog, `depthTest/depthWrite` off, `renderOrder -100`, `side={THREE.BackSide}`).

- The texture is a 2048x512 `CanvasTexture` painted procedurally at mount (`makeForestTexture`, seeded LCG, pixel-art pine layers, Nearest filter, no mipmaps, `wrapS = RepeatWrapping`). There is no PNG and nothing to precache.
- Registered with `registerSkyMaterial` (`weather.js`) so the storm can tint it.
- 1 draw call, 1 scene node, zero per-frame cost; no `castShadow`/`receiveShadow`.

## Cabin roof (src/arena/shell.jsx)

Pitched gable roof in `src/arena/shell.jsx` as the `Roof` component.

```js
const PITCH = 2.8  // height above WALL_H
```

- Two sloped panels: `boxGeometry` rotated at `Math.atan2(PITCH, HW)` ≈ 17°
- Eave overhang: 0.55 units beyond walls
- Ridge cap: thin box at peak
- Gable ends: 10 stacked boxes of decreasing width approximating a triangle
- Color: `ROOF = '#1e0e04'`

No `castShadow` on roof meshes (exterior, outside shadow frustum).

## Lighting summary (src/arena/lighting.jsx)

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

## Known performance notes

- Each unique material config = one WebGL shader program. Avoid adding new `transparent`, `metalness`, or `envMap` combinations to materials that mount/unmount frequently.
- `meshBasicMaterial` skips all lighting — use it for skybox, UI planes, purely decorative non-lit geometry.
- `scene.traverseVisible()` is called every frame for the shadow map. Every node with `castShadow=true` adds a shadow draw call. The cabin scene has ~58 `castShadow` meshes at rest (measured 2026-10-28; was 761 after a silent `Box` default regression), the diner ~35; keep zombie shadow casters at 6 per zombie.
- The part-geometry and palette-material caches in `zombieMesh.js` (and the `bg()` cache in `Zombie.jsx`) are module-level singletons. They are never cleared. This is intentional.
