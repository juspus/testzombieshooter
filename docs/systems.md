# Systems reference

How the larger systems work. The binding rules are in CLAUDE.md; read the section here before changing the system.

## Component side doors are modules (2026-11-18)

No component carries properties (`Gun.fire = ...` is gone; `src/__tests__/registries.test.js` fails if a component file assigns one). Gameplay code that triggers a scene effect imports a channel from `src/fxBus.js` (`trails.add`, `shells.eject`, `flameSpray.spray`, `blood.spawn`, `bolts.fire`, `grenades.throw`, `gun.fire/pump/setFlameActive/getMuzzlePosition`, `knife.swing`); the owning component fills it with `registerFx(channel, impl)` in a `useLayoutEffect` and the cleanup puts the no-op back (only if the member is still its own, so a remount or HMR never leaves a stale function; a call while nothing is mounted does nothing). Live zombie groups, bullet-hole adders and the per-particle flame hit handler are in `src/zombieRegistry.js` (`Zombie.jsx` registers in its effect, `Player` registers the flame handler). `ignite` / `hitReact` go straight to `zombieSystem` (`zombieLive.js`). The live zombie system is reset on the store's `run_start` event (zombieLive.js), so a same-seed restart does not revive the last run's corpses.

## Player and Arena are split (2026-11-18)

`Player.jsx` and `Arena.jsx` are entries. `Player` calls `usePlayerState` (store -> shared refs), `usePlayerInput`, `usePlayerFiring`, `usePlayerInteraction`, `usePlayerMovement` (all in `src/player/`) and runs the single `useFrame`: clamp the delta, then `mobileButtons`, (shop / pause early return), `look`, `mobileFire`, `tickTimers`, `interaction.step`, `holdFire`, `aim`, `flame`, `move`. Firing keeps `weapon.fire(FIRE)`. Pause stops the flamethrower roar (an effect on `paused`). `Arena` composes `src/arena/lighting.jsx` (the lights, in order, then `LivingLights`: 11 lights with the fireplace pair, never changed at runtime), `WindowPlanks` (outside the bake) and the `<StaticBake>` wrapper with `shell.jsx` / `props.jsx` parts inside it. `perfGuards.test.js` reads the cabin as the entry plus `src/arena/`.

## Wave / spawn system

- Wave N spawns `5 + (N-1)*3` zombies, capped at 25 active at once
- Remaining zombies queue in `pendingSpawns`; one slots in per kill
- `tick()` in store only runs during `intermission` phase (countdown between waves)
- Zombie AI (pathing, state machine, attack timers, exploder / spitter / spider logic, hit-reaction timers, death timing, guest interpolation) lives in `src/zombieAI/*`: pure modules (no React / R3F / three, they run in Node) ticked once per frame by `ZombieSystem` (`system.js`) from `ZombieManager`'s single `useFrame`, which then calls each zombie's pose. `Zombie.jsx` is only the model and the pose (`poseZombie` copies sim state onto the groups). The live system (real store, map, sounds, FX, net via an `io` object) is `src/zombieLive.js`; `src/__tests__/zombieAI.*.test.js` play a wave headless (`@vitest-environment node`, helper `zombieAI.helper.js`). The screamer aura is computed once per tick (`auras.js`). Sim zombie state is a plain object (`zombieAI/state.js`); `zombieSystem.get(id)` in dev, `window.__zombieSystem`.

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

Kill money (per kill + headshot/knife bonus, `killMoney()` in store.js) is paid on the
kill, x2 under Double Money; nuke kills pay none. `nextWave` pays only the wave base +
`lastWaveBonuses.total` (planks / fast clear / modifier). The HUD shows a `+€x` pop
under MONEY (`MoneyGain` in HUD.jsx). Co-op: both clients pay for every kill.

## Multiplayer (co-op)

Two-player co-op over WebSocket (`net.js`). One player is **host**, one is **guest**.
- Host drives wave spawning, zombie logic, and wave-clear detection
- Guest receives `wave_start` / `hit_zombie` / `add_plank` events and stays in sync
- `NetManager.jsx` handles the event bus; `RemotePlayer.jsx` renders the partner
- Store fields: `mpRole`, `mpConnected`, `remotePlayer`, `roomCode`
- Transport is PeerJS (WebRTC data channel) via `net.js`, not a WebSocket server.
- Invite links: `/?join=CODE` (`src/invite.js`, `InviteShare.jsx`).
- Down, not out: `src/coopDown.js` (pure state machine) + `src/coopRuntime.js`.
  All player damage must go through `store.hitPlayer` (downed guard); weapon
  swaps through `switchWeapon`.
- Each client damages only its own player; the host is authoritative for
  zombies, drops (`powerups.js`), Mystery Box rolls, doors, modifiers.
- Money/ammo/XP are per player.

## Systems added in the 2026-10 roadmap push (see MEMORY.md for detail)

| Area | Files |
|---|---|
| Feel | `FeelFx.jsx` (hit markers, danger, last-kill), `timeScale.js` (multiply frame deltas by `time.scale`), `cameraFeel.js`, `BloodFX.jsx`, `ImpactFX.jsx`, `hitFx.js` |
| Look | `LofiPass.jsx` (low-res dither post pass; `?lofi=0`), `textures.js`, `zombieVariant.js`, `Storm.jsx`, `LivingLights.jsx` (`?nofx`) |
| Run | `doors.js` + `DOOR_COSTS`/`ROOM_ANCHORS` in maps, `powerups.js`, `zombieSpecials.js` (exploder/armored/spitter/spider), `modifiers.js`, `weaponRules.js` (box/bench/crossbow, no gun carry limit), `grenades.js` |
| Progression | `progression.js`, `challenges.js`, `achievements.js`, `gameEvents.js`, `progressTracker.js`, level rewards in `cosmetics.js`, `mapSelect.js` (map picker + loadouts) |
| Daily | `rng.js` — all gameplay randomness goes through `runRandom`/`waveRandom`/`keyedRandom` (seeded in Daily Run); cosmetic randomness stays on `Math.random` |
| Tools | `?perf`, `?bench`, `/?models` playground (`src/playground/registry.js`), `/?testlab` soundboard |

### Spider zombie (wave 11+, `SPIDER` + `spiderStep` in zombieSpecials.js)
Floor zombie outside (claws planks like a walker). Inside it climbs to the ceiling, crawls above the nearest player, shrieks (the "look up" cue), drops (pounce, each client checks its own player), claws for `FLOOR_TIME`, then leaps back up.
- Built in a "surface frame": body on its back, limbs bent backward, surface at y = -`BODY_Y`. A `flipRef` group between the zombie root and `bodyRef` rolls it by PI onto the ceiling (it is identity for every other type). The root's `position.y` is the spider's body centre (0.5 on the floor), NOT `ZOMBIE_HEIGHT/2`.
- On the ceiling it moves with the walls minus `FURNITURE_COLLIDERS`, and `spiderCeilingAt` drops it to the 2.2 m door lintel inside interior doorways.
- Its own death (falls, rolls belly-down, limbs curl) and `settleCorpse()` (shared). Bullet holes are moved into the flip group's frame.
- Player pitch is clamped to +-60 deg, so a spider right overhead is out of view; the shriek is the cue. Model: `/?models&m=spider` (Ceiling / Wind-up anims).

`hitZombie(id, isHeadshot, source, weapon, dist, mult)` — weapon/dist feed armour rules, mult feeds upgrades.
Corpses stay in `zombies` with `corpse: true` (always `dying`): count live zombies with `!z.dying`.

## Mobile layer (2026-10-28, mobile roadmap — `docs/mobile-roadmap.html`)

| Area | Files / rules |
|---|---|
| Pause | `src/pause.js` (`pauseGame`, `resumeGame` = 3-2-1, `autoPause`, `installLifecycle`), `PauseMenu.jsx`. It reuses the store `paused` flag, which already froze the world for the co-op host pause. Solo auto-pauses on hidden/pagehide/(touch-only) blur. A co-op guest never pauses the host's world; it sends `away`, and the partner sees PARTNER AWAY. The Mystery Box runs on wall-clock time, so `pause.js` pushes `box.at` forward by the paused time. |
| Frame deltas | Every `useFrame` clamps the raw delta first: `Math.min(rawDelta, 0.05)`, then multiplies by `time.scale`. Without the clamp, a notification pull-down teleports zombies through walls. |
| Settings | `src/settings.js` (Zustand + localStorage): look sensitivity (scales mobile and mouse look), aimAssist, autoShoot (both default on; auto-shoot is the owner's call), buttonSize, buttonOpacity, leftHanded, volume / sfxVolume / musicVolume (master, effects and music buses in `sounds.js`, square curve). Brightness lives in `brightness.js`. The panel opens from pause; the start menu's Settings has an Audio section on every device. |
| Touch controls | `MobileControls.jsx`: a floating stick in the left 40% + inset (`stickZoneWidth`, below y=110), with `stickVector` in `mobileInput.js` (10% dead zone, analog speed). Player movement normalizes only when the length is above 1. The button cluster is laid out around FIRE. Hit test = drawn circle + `HIT_PAD` 8 px, and the nearest edge wins. USE and grenade track their own pointer ids, so they never steal the look finger. Pointer refs reset on rotate, resize, pause, settings and shop. |
| Touch sizes | Minimum touch target 44 px (`MIN_TAP`, `useMenuEnv` in `src/menuTouch.js`; in-wave buttons 48, FIRE 64). Minimum text 11 px on phones, 14 px for HUD numbers. Menus built on the UI kit (`ui.jsx`/`ui.css`) get this from `@media (pointer: coarse)` overrides in `ui.css`: the kit height variables become 44 px, and `--ui-fs-min` becomes 11 px (it is 0 on desktop). Wrap inline menu font sizes as `max(var(--ui-fs-min), ...)`. No emoji: use `components/Icons.jsx` (Check, Star, Chevron, Lock). |
| Upright and install | `RotateGate.jsx` covers only a live run held upright (and pauses it); menus, death and lobby work upright. `InstallHint.jsx` shows on the start screen only, on iOS Safari only, once. `fullscreen.js` requests fullscreen + landscape lock on run-start taps (Android only). `wakeLock.js` holds the screen awake during live, unpaused runs. |
| Interruptions | WebGL context loss pauses the run and restores in place (`handleContextLost`/`Restored`); after 5 s it offers RELOAD. `progressSounds` shares the one AudioContext from `sounds.js` (`getAudioContext`), unlocked on the first gesture. |
| Network and bundle | PeerJS loads only on HOST/JOIN (dynamic import). `getPeerOptions()` asks `/api/turn` for ICE servers (env `TURN_URLS`/`TURN_USERNAME`/`TURN_CREDENTIAL`, see docs/LAUNCH_CHECKLIST.md) and falls back to STUN only. Supabase loads lazily: use `getSupabase()` (async) or `peekSupabase()`, never a static client import. `vendor-three`/`vendor-react` are separate chunks (drei is NOT in vendor-three: only the `/?models` playground uses it). Lazy chunks (2026-11-17, main chunk 174 -> 148 kB gzip): `VersusLayer` (VersusNet, MailHud, DirectorView + paper, DirectorFlow; `VersusMount` in Game.jsx mounts it, sticky, once a room / versus run / Director match exists), `DuelUi` and `VersusResult` (via `versusChunks.js`, preloaded when the Versus menu opens), and only the map's own arena (`Arena` or `DinerArena`, its import starts at module load; the map is fixed per page load). New versus-only UI goes behind one of these; never import it statically from main code. A failed arena chunk reloads the page once (`arenaChunkReloadAt` in sessionStorage, at most once a minute; Chromium caches a failed `import()`, so re-importing never refetches); after that `SceneErrorBoundary` in `Game.jsx` covers the screen with "Couldn't load the map" and RELOAD. |

## Versus modes (2026-10-28, `docs/pvp-modes.html`)

| Area | Files / rules |
|---|---|
| Seeded start | `store.startSeededGame(mode, seed, opts)`; `runMode` is `'normal' \| 'daily' \| 'versus' \| 'duel'`, `runSeed` the seed. Seeded runs force the default pistol loadout. `rng.newRunSeed()`. `scoreSubmittable(runMode)` (`versus.js`) keeps versus and duel runs off the leaderboard. |
| Seed Duel (async) | `src/duel.js` (token = URL-safe base64 JSON: seed, map, name, per-wave kills, final), `components/DuelUi.jsx`. `/?duel=TOKEN` picks the map at page load even if locked. Cleared waves always tie on kills (same seed), so the HUD shows the rival's final wave/kills, not per-wave kills. |
| Zombie Mail (live) | Main menu Versus > Zombie Mail hosts/joins a versus room (`LobbyBody` in `components/screens/Lobby.jsx` is shared with Co-op); a guest who joins from Co-op or an invite link is moved to the Zombie Mail lobby when the host's mode arrives. Seed Duel lives under Versus too. `versus_start` event. Each player runs a SEPARATE seeded world: `startVersusRun` sets `mpRole` null and `mpConnected` false but keeps the net.js link, so co-op sync, RemotePlayer and revive stay silent. In-run messages go through `sendVersus(kind, data)` / `onVersus(kind, fn)` (`versus.js`), never `game_event`; every payload carries the run `seed` and a mismatch is dropped (stale messages from the last match). `VersusNet.jsx`: 1 Hz status, results, forfeit (10 s link down / 30 s silent, or an instant `leave` on pagehide), rival strip. `versusRematch.js`. No pause while linked. |
| Mail | `src/mail.js` (items, meter, delivery queue), `src/mailRuntime.js` (send/receive), `components/MailHud.jsx` (keys 1-5, warning line), MAIL button in `MobileControls.jsx`. Delivery lands via `store.mailTick` (from `tick()` while playing); spawn cluster from `keyedRandom` by mail id so seeded wave streams stay identical; mailed zombies add to `mail.waveExtra` (HUD total). Blackout sets `mail.pendingModifier` for the next `nextWave`. |
| The Director | `src/director.js` (contract: units, costs, unlocks, `waveBudget`, best-of-3 scoring, `dir_*` message shapes), `src/directorFlow.js` + `src/directorRuntime.js` (turns, 8 Hz `dir_state`, host-driven `dir_next`, `dir_ready`), store `director` slice (`startDirector`, `directorSpawn`, `directorTick`, `directorEndTurn`, ...), `components/DirectorFlow.jsx` (between-turns and result cards, defender strip), `components/DirectorView.jsx` + `DirectorView.css` + `src/directorPaper.js` (the director's war-map screen; paper and ink painted once to offscreen canvases). Director waves spawn nothing from the seeded spawner: only `dir_spawn` (validated, deduped by id, also accepted in intermission) and the `autoFill` walkers after `SPAWN_WINDOW_S`. Death in director mode ends the turn, not the run. While a player directs (or between turns) `Game.jsx` sets `frameloop='never'` and their world is paused and empty. `cluster` indexes the map's full `SPAWN_CLUSTERS`; a sealed room's cluster falls back to the nearest active one. `/directorlab.html` is a dev harness for the view (not built). |
| Two-browser tests | `?peer=local` (dev/preview only) signals through a local PeerJS server: `npx peerjs --port 9000 --host 127.0.0.1` (package `peer`). `scripts/twoplayer-smoke.cjs` (co-op), `scripts/versus-smoke.cjs`, `scripts/mail-smoke.cjs`, `scripts/director-smoke.cjs`; args: base URL, screenshot dir. Headless runs are slow (frame delta clamp), so waits are long. Scripts that probe a module with `import('/src/...')` need a Vite server started after your last edit: hot reload serves the app a `?t=` copy, so the probe reads a separate, unused module. |

## Audio buses (sounds/core.js)

The AudioContext, every bus node, the muffle state and the pause hold flag live ONLY in `src/sounds/core.js` (one context; `src/sounds.js` just re-exports). Other `sounds/*` modules import `ctx`, `playTone`, `_realDest`, `_musicOut` from it; never create a second context or bus. `src/__tests__/sounds.shape.test.js` pins the export list and the bus routing.

`ac.destination` is shadowed: it returns the **effects** bus, so every sound that connects to it gets the Effects slider and the low-HP muffle for free. Music must connect to `_musicOut(ac)` instead, or it lands on the Effects slider. Heartbeat/stings use `_realDest` (effects level, no muffle). Master sits after all three.
