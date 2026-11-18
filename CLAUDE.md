# testzombieshooter

## Start of session

Read `SOUL.md` (how I work, who I am on this project), `MEMORY.md`
(running journal of recent context), and `TODO.md` (idea stash) before
doing anything else. Then read the control panel (below).

## Control panel (the owner directs work here)

https://claude.ai/artifact/D1y2Wem5q9Na5jj5VcP4gF ("Night After Night", source
`docs/next-roadmap.html`; republish from that file with that URL). The data contract is the
comment at the top of the page's script. Read and write it with the ArtifactData tool.

- **Session start:** `list` on `calls`, `progress` and `items`, and `get` on `queue/order`.
- **What to work on:** a request in chat wins. Otherwise finish anything in progress, then take
  the first queued card: `calls/<id>.call == 'go'`, no `hold`, not active or shipped, in
  `queue/order.ids` order (Go cards missing from the order follow in page order).
  `calls/<id>.note` is the owner's instruction for that card. Decisions (`d-*`) are A/B/C/talk.
- **Chat requests become cards:** write `items/<id>` `{ title, line, source: 'claude', createdAt }`
  plus `calls/<id>` `{ call: 'go', note: '', hold: false }`, so the panel shows all work.
- **Report progress** in `progress/<id>` (ISO timestamps, one-line summary):
  - on start: `status: 'building'`, `summary`, `steps: [{ text, done }]`, `startedAt`, `updatedAt`;
  - tick `steps` as they finish;
  - PR open: `status: 'review'`, `pr`, `prUrl`, `preview`;
  - waiting on the owner: `status: 'blocked'`, `blocker`;
  - merged: `status: 'shipped'`, `shippedAt`.
- **Never** write `queue/order` or a card's `hold`: those are the owner's controls.

## Git workflow

- All pull requests must target `main` as the base branch.
- Create feature branches from `main`.
- Open a PR for the session's work even for small/doc-only changes, so
  Vercel generates a preview deployment. Always reply with the preview
  URL once it's ready.

---

## Architecture

React 18 + React Three Fiber (R3F) + Three.js 0.167, Zustand 4, Vite 5 (drei only for the `/?models` playground). No image assets: the skybox is a canvas texture and the other textures are 64x64 procedural DataTextures (`textures.js`). The cabin is 18 x 20 (`CABIN_HW` 9, `CABIN_HD` 10, `WALL_H` 3.2 in `src/maps/cabin.js`, which is the source of truth for structure, windows and spawn points); the diner is the second map (`src/maps/diner.js`).

### Where things live

Long write-ups are next to the code or in `docs/`; read the one for the system you change:

- `docs/performance.md`: the six freeze root causes, light budget detail, frame governor, static bake, skybox, roof, lights table.
- `docs/systems.md`: wave / spawn, economy, co-op, the 2026-10 systems table, spider, mobile layer, versus modes (Mail, Director, Duel), audio buses, fx bus and the Player / Arena split.
- `src/weapons/README.md`: the gun registry, weapon table, ammo pools, shop, Mystery Box rules.
- Header comments: `zombieAI/system.js`, `zombieMesh.js`, `zombieRegistry.js`, `netProtocol.js`, `hitboxes.js`, `staticMerge.js`, `fxBus.js`.
- Other docs: `docs/next-roadmap.html` (control panel source), `docs/mobile-roadmap.html`, `docs/roadmap.html`, `docs/LAUNCH_CHECKLIST.md`, `docs/MONETIZATION.md`, `docs/ANALYTICS.md`, `docs/memory-archive.md` (old MEMORY.md entries).

```
src/
├── store.js              # Entry: composes the slices in store/ (run, wave, combat, powerups, weapons, machines, economy, player, building, coop, versus, director, profile); spawns.js, drops.js, shared.js, zombieTypes.js are helpers. Old names stay exported from here
├── store/                # The Zustand slices, one per job
├── zombieAI/             # Pure zombie simulation (no React, no three): system.js ticks everyone once per frame; tick, movement, spitter, spider, exploder, hitReact, auras, state, io
├── zombieLive.js         # The live ZombieSystem: real store, map, sounds, fx, net through an `io` object; resets on run_start
├── zombieRegistry.js     # Live zombie scene groups (hit tests, melee, flame, auto-shoot), bullet-hole adders, flame hit handler
├── zombieParts.js        # The zombie model as box lists per moving part
├── zombieMesh.js         # Bakes those boxes into ~6 merged geometries + one shared palette material
├── zombieSpecials.js     # Exploder / armored / spitter / spider rules and numbers
├── hitboxes.js           # Broad-phase zombie hit tests (hitZombieRay)
├── weapons/              # One file per gun + index.js registry + common.js (see weapons/README.md)
├── sounds.js + sounds/   # Entry re-exports sounds/*: core (the ONE AudioContext + buses), spatial, weapons, zombies, world, music, player
├── netProtocol.js        # Every net message kind, payload shape and validator (pure)
├── net.js                # PeerJS (WebRTC data channel) transport
├── fxBus.js              # Channels of no-ops that components fill (trails, shells, blood, bolts, grenades, gun / knife, flame spray)
├── staticMerge.js        # Bakes the static scene into a few meshes per material (StaticBake.jsx)
├── arena/                # The cabin by job: shell (walls, roof, doors, windows, planks, beams), props (fireplace, furniture), lighting, shared (palette, dims, Box)
├── player/               # The local player: usePlayerState / Input / Firing / Interaction / Movement, constants.js, fireContext.js
├── maps/                 # cabin.js, diner.js, index.js (map schema, spawn clusters, door costs)
├── walls.js              # Pathfinding grid, A*, wall collision, line of sight
├── rng.js                # Seeded randomness (runRandom / waveRandom / keyedRandom)
└── components/
    ├── Game.jsx          # Canvas, fog, scene root, one Suspense, lazy chunks
    ├── Arena.jsx         # Entry: composes src/arena/ inside <StaticBake>; DinerArena.jsx for the diner
    ├── Player.jsx        # Entry and the one frame loop (clamp, then the src/player/ steps in order)
    ├── Zombie.jsx        # The zombie model and pose only (poseZombie copies sim state onto the groups); the AI is in src/zombieAI/
    ├── ZombieManager.jsx # The single useFrame that ticks ZombieSystem then poses every zombie; warmer zombie
    ├── Gun.jsx, Knife.jsx, BulletTrails, ShellCasings, BloodFX, ImpactFX, FlameSpray, Bolts, Grenades   # viewmodel and fx (registered on fxBus)
    ├── Screens.jsx       # Entry re-exporting screens/ (router, StartScreen, Lobby, SettingsPanel, Locker, Death, WaveClear, Intermission, PausedOverlay)
    ├── HUD.jsx, Shop.jsx, MobileControls.jsx, PauseMenu.jsx
    ├── ui.jsx + ui.css   # Shared menu UI kit: Button, Panel, Tabs, Option (use for any new menu UI)
    └── NetManager.jsx, RemotePlayer.jsx, VersusLayer.jsx (lazy), DirectorView.jsx   # co-op, versus, director
```

---

## Performance rules (binding; detail and history in `docs/performance.md`)

- **Never change the light count at runtime.** three.js counts only visible lights; any change recompiles every lit shader (a multi-frame stall). Animating lights (muzzle flash, Blackout flashlight, bulbs, fireplace) are always mounted and only change `intensity`. Never toggle `visible`, never mount or unmount a light. Cabin = 11 lights; `renderer.info.programs.length` must stay flat through shooting, weapon swaps, power-ups.
- **Shadows.** One shadow-casting light (the directional moonlight, 512x512 over +-18; the diner 512 over +-14). Never `castShadow` on a point or spot light (cube map = 6 passes). The arena `Box` helper defaults to `castShadow = false`: do not flip it; new meshes must not cast unless they are a big silhouette that reads through a window. Zombies cast from 6 parts each. `src/__tests__/perfGuards.test.js` fails on a map above 512, a point-light shadow, or a flipped `Box` default (grep `pointLight.*castShadow` when touching lights; this has regressed silently twice).
- **No per-frame allocation**; pools over mount/unmount (a zombie mount used to stall the frame); every unique material config is a shader program, so do not add `transparent` / `metalness` / `envMap` variants to things that mount often; `meshBasicMaterial` for unlit decoration.
- **Delta clamp.** Every `useFrame` clamps the raw delta first, `Math.min(rawDelta, 0.05)`, then multiplies by `time.scale` (`timeScale.js`). Without the clamp a notification pull-down teleports zombies through walls.
- **Static bake.** Everything that never moves in the cabin and the diner lives inside `<StaticBake>` and is merged per material at mount. Anything that mounts later or moves must live OUTSIDE the wrapper. Transparent, emissive, `renderOrder`, hidden, instanced and `userData.noMerge` meshes stay separate. `?nobake` turns it off for A/B runs.
- **Zombie meshes** are ~6 merged part meshes sharing one palette material (`zombieMesh.js`); keep one shader program for every variant. The scene sits in ONE `Suspense` in `Game.jsx` (the arena chunk is lazy).
- **Frame governor** (`frameGovernor.js`) is invisible and only lowers the lo-fi height / refreshes shadows every 2nd frame. It never touches lights or materials. `?lofi=0` / `?gov=0` turn it off (dev/preview).
- **Bundle.** Main chunk is about 157 kB gzip (budget limit 162). PeerJS loads only on HOST/JOIN, Supabase through `getSupabase()` / `peekSupabase()`, versus-only UI behind `VersusLayer` / `DuelUi` / `VersusResult`; never import those statically from main code. Only the map's own arena chunk loads.
- Raw numbers are in `scripts/perf-budget.json`; a perf card that makes things faster lowers a limit in the same PR, and a raise needs a reason in the PR.

## Rules for game code

- **Co-op authority.** The host is authoritative for zombies, drops (`powerups.js`), Mystery Box rolls, doors and modifiers; each client damages only its own player; money / ammo / XP are per player. All player damage goes through `store.hitPlayer` (downed guard); weapon swaps through `switchWeapon`. A guest never pauses the host's world. Do not change net message shapes outside `netProtocol.js` (and its tests). Versus runs are separate seeded worlds; in-run messages go through `sendVersus` / `onVersus`, never `game_event`.
- **Randomness.** All gameplay randomness goes through `rng.js` (`runRandom` / `waveRandom` / `keyedRandom`, seeded in Daily / Versus / Duel). Cosmetic randomness stays on `Math.random`. A weapon's pellet spread draws `runRandom('spread')` (angle, then radius) so seeded runs repeat.
- **Weapons.** Numbers and fire behaviour live in `src/weapons/<gun>.js`; `src/__tests__/weapons.test.js` fails if a number moves. A weapon file may import pure modules only, never a component or the store. Other files still branch on gun ids (`Gun.jsx`, `Machines.jsx`, `RemotePlayer.jsx`, `Shop.jsx`, `Zombie.jsx`, `zombieSpecials.js`, `sounds/*`, the playground registry): see `src/weapons/README.md`.
- **Zombies.** Corpses stay in `zombies` with `corpse: true` (always `dying`): count live zombies with `!z.dying`. All zombie hit tests go through `hitZombieRay` (`hitboxes.js`). `Zombie.jsx` is the model and the pose; AI changes go in `src/zombieAI/*` (pure, runs in Node, `src/__tests__/zombieAI.*.test.js` play a wave headless).
- **Components own no properties.** Gameplay code reaches a scene effect through a channel in `fxBus.js` (`registerFx` in a `useLayoutEffect`; register a closure created per mount), never `Component.fn`. `registries.test.js` fails if a component assigns a property.
- **Audio.** The AudioContext and every bus live ONLY in `sounds/core.js`. `ac.destination` is the effects bus; music connects to `_musicOut(ac)`; stings use `_realDest`. Never create a second context.
- **Store entry.** The store imports the weapon registry, never the reverse. `store.js` and `weaponRules.js` still export every old constant name; change a number in the gun's file.
- **Listeners and HMR.** Module-level subscriptions (`onGameEvent` etc.) need an unsubscribe (`import.meta.hot?.dispose`).

## UI and mobile rules

- No emoji anywhere in the UI (short text labels, or `components/Icons.jsx`: Check, Star, Chevron, Lock). In-game text is terse; hints only in the first 3 waves (`hints.js`).
- Use the `ui.jsx` kit for any new menu. Minimum touch target 44 px (`MIN_TAP`, `menuTouch.js`; in-wave buttons 48, FIRE 64). Minimum text 11 px on phones, 14 px for HUD numbers; wrap inline menu font sizes as `max(var(--ui-fs-min), ...)`. `@media (pointer: coarse)` in `ui.css` handles the kit's sizes.
- Pause (`pause.js`, the store `paused` flag), touch controls, settings, wake lock, install hint, rotate gate and context-loss handling are described in `docs/systems.md` ("Mobile layer"). The Mystery Box runs on wall-clock time, so `pause.js` pushes `box.at` forward by the paused time.

---

## Checks: CI, lint, solo smoke, perf budget

`.github/workflows/ci.yml` runs on every pull request and push to `main` (Node 20): `test` (vitest + production build), `lint` (whole repo warnings, `lint:selfcheck`, and on PRs `lint:changed` against the base), `e2e` (build, `vite preview`, solo smoke, perf budget with a summary, screenshots uploaded).

| Check | Command | What it does |
|---|---|---|
| Tests + build | `npx vitest run`, `npx vite build` | About 700 tests, includes `perfGuards.test.js`. Run both before every PR. |
| Lint | `npm run lint` | ESLint flat config (`eslint.config.js`): react-hooks, no-undef, no-unused-vars, JSX awareness, a few bug catchers. No style rules, no Prettier. Whole repo, every problem is a **warning**, exit 0. |
| Lint, strict | `npm run lint:changed [baseRef]` | Same rules as **errors**, on files that differ from `merge-base(baseRef, HEAD)` (default `origin/main`; uncommitted and new files count). A problem fails only if its (rule, message) is **new** for that file (duplicates counted). `npm run lint:selfcheck` proves both. CI fails on it. Fix by using the name, adding the hook dep, or prefixing an unused name with `_`. Never reformat or "fix" old warnings to get green. |
| Solo smoke | `npm run smoke -- <baseUrl> [shotDir]` | `scripts/smoke-solo.cjs`: boots the game, Play, wave 1; asserts the scene (>= 400 non-zombie meshes, the cabin bake: >= 30 merged meshes holding >= 600 parts, >= 30 casting wall parts; every live zombie has meshes with `userData.zombieId`); takes pointer lock with a real click, fires a real click (`bulletsInClip` drops) and shoots a zombie placed on the crosshair ray; kills a zombie via `hitZombie`, clears the wave, reaches wave 2. Fails on a console error, page error or blank frame. ~35 to 90 s headless. `--prove-world-check` removes the cabin and expects the check to fail. |
| Perf budget | `npm run perf:budget -- <baseUrl> [--out file.json] [--map diner] [--query "&nobake"]` | `scripts/perf-budget.cjs`: `?wave=8&lofi=0&gov=0`, 25 live zombies, world paused, one frame at 1280x720: draws, triangles, nodes, meshes, castShadow meshes, lights (exact: the count is fixed), shader programs (max over the frame, after a real shot and after swapping through every weapon), main chunk gzip from `dist/` (run `npx vite build` first). Limits in `scripts/perf-budget.json`; a breach exits 1 and names the metric. The diner has no limits. |

- Latest measurement (2026-11-18, cabin): 292 draws, 57,016 triangles, 1,392 nodes, 984 meshes, 152 casters, 11 lights, 24 programs (one run read 25: a rare zombie variant; the limit is 25, so the margin is thin), 156.5 kB gzip main chunk (limits: 330 / 63,500 / 1,560 / 1,100 / 175 / 11 / 25 / 162). Variants are random, so nodes and casters wobble by about 1%.
- Smoke and budget need `window.__game` / `window.__r3f`: point them at `npx vite --port N` or a non-production `vite build` served by `vite preview`, never a `VERCEL_ENV=production` build. Playwright is deliberately **not** in `package.json` (the sandbox ships its own; scripts `require('playwright')`); CI installs it in the `e2e` job only.
- Manual two-browser smokes (not in CI): `?peer=local` (dev/preview only) signals through a local PeerJS server, `npx -y -p peer peerjs --port 9000 --host 127.0.0.1`. `scripts/twoplayer-smoke.cjs` (co-op), `versus-smoke.cjs`, `mail-smoke.cjs`, `director-smoke.cjs`, `protocol-smoke.cjs`; args: base URL, screenshot dir. Headless runs are slow (delta clamp), so waits are long; the mail and director join waits are flaky under load. Scripts that probe a module with `import('/src/...')` need a Vite server started after your last edit (hot reload serves the app a `?t=` copy). Dev only: `window.__game`, `window.__r3f`, `window.__gov`, `window.__zombieSystem`; `?perf`, `?bench`, `?wave=N&money=N&weapon=ak47`, `/?models` playground, `/?testlab` soundboard, `/directorlab.html`.
- Dead-code check: `npx -y knip` (not in `package.json`); `api/*.js` (Vercel functions), `scripts/*.cjs` and the html entry points show as unused files but are live.
