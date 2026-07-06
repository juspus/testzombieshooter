# MEMORY.md

Running journal for picking up context across sessions. Read this at the
start of every session. Keep entries short — a few lines each.

## Active

- (none)

## Feature inventory (as of 2026-06-14)

What's actually in the game today, grouped by system. This is the
onboarding summary — see CLAUDE.md for architecture detail.

**Core loop**
- Wave-based survival: wave N spawns `5 + (N-1)*3` zombies, capped at 25
  active, rest queue in `pendingSpawns`
- Intermission between waves (scales with wave number, hold-T to skip)
- Money economy: wave clear, per-kill, headshot/knife/no-planks/fast-clear
  bonuses (see CLAUDE.md Economy table)
- Planks: board up windows, strong planks upgrade (20 hits vs base)

**Weapons & combat**
- Pistol (free), Pump Shotgun (€150, 12 pellets/shot), AK-47 (€270,
  full-auto 10rds/s), Desert Eagle (€700, instant kill, pierces 3),
  Flamethrower (€1500, continuous cone spray, 0.5 dps burn DoT, 1000
  starting fuel, +1000 fuel packs for €100)
- Per-weapon ammo pools (clip + reserve saved independently per weapon),
  scroll-wheel weapon switching. Flamethrower has no clip — all "ammo"
  lives in `reserveBullets` as fuel, drained continuously while spraying
  (`consumeFuel`/`FLAME_FUEL_PER_SEC`)
- Hunting knife: melee swing, swap with Q, kill bonus
- Procedural weapon sound design (pistol, shotgun pump/shot, flamethrower
  continuous roar/hiss/rumble — multiple iterations tuning the shotgun
  boom specifically)
- Burning zombies show flickering flame meshes (shared geometry/materials,
  `Zombie.ignite(id)`); burn ticks via `hitZombieFlame` every
  `FLAME_TICK_INTERVAL` (0.2s), synced cross-client via `hit_zombie_flame`

**Zombies**
- 6 archetypes: Walker, Runner, Brute, Screamer (speed aura), Crawler
  (low profile), Boss — unlock progressively by wave
- Custom pixel-art skull/zombie model with walk + window-attack + death
  animations
- Real-geometry collision movement + A* pathing to window attack spots
  (no wall-sliding/corner-sticking)

**Shop & perks**
- Supply chest shop: weapons, ammo packs, 6 perks (Fast Hands, Deep
  Pockets, Iron Sights, Runner's Breath, Carpenter, Knife Mastery)

**World**
- Multi-room cabin (bedroom, hall, kitchen, main room), pitched gable roof,
  Evil Dead-style interior (fireplace, props, moonlight)
- Forest skybox: procedural panorama, single cylinder, zero per-frame cost

**Multiplayer**
- 2-player co-op via WebRTC (PeerJS), host/guest roles, room codes,
  synced zombie targeting, remote player model + animations, pause sync

**Mobile / PWA**
- Mobile-optimized HUD, touch controls (drag-to-look, tap/hold buttons),
  PWA service worker for offline play, iOS black-screen/WebGL fixes
- Two-finger controls: primary finger looks, secondary finger fires
  independently; tap-anywhere-on-look-zone fires
- Mobile aim assist (6-ray forgiveness cone) + auto-shoot when a zombie
  is in the crosshair cone (COD Mobile "Simple" style — deliberate
  choice to lower the touch-aiming skill floor)
- Haptic feedback on shoot (18ms pulse; shotgun double-tap) and death
  (two-beat thump) via navigator.vibrate — Android only, no-ops on iOS
- Test Lab page (`/?testlab`) for isolated weapon/sound testing

**Dev/testing**
- Debug URL params (`?wave=N&money=N&weapon=ak47/shotgun/deagle`) on
  `startGame()` jump straight to a wave/loadout. Gated via
  `VITE_VERCEL_ENV` (vite.config.js `define` reads Vercel's
  `VERCEL_ENV`): active in dev + preview, no-op on production.

**Misc**
- Share button on death screen (hashed share links)
- Disabled text selection across UI

**Performance**
- All 5 root causes of the zombie spawn/kill freeze fixed (shader
  pre-warming, geometry cache, reduced shadow casters, no point-light
  shadows, smaller directional shadow map) — see CLAUDE.md for detail

## Ideas & deferred

- (none yet)

## Open questions

- (none yet)

## Dated log

- 2026-07-06: Mobile feel pass, part 1 — look-sensitivity curve + slider
  (branch `claude/mobile-game-feel-controls-xev9bl`). Diagnosed why mobile
  controls felt clunky: flat sensitivity multiplier meant fine aim and fast
  turns fought each other, and there was no way for a player to retune it.
  Fixed: `mobileInput.js` now scales each touchmove sample by its own speed
  (0.6x–1.8x curve, `addMobileLook`) instead of one constant, and stores a
  user sensitivity multiplier (0.5x–2.5x, localStorage-persisted) exposed via
  a slider on the mobile start screen. Removed the old flat
  `MOBILE_LOOK_SENSITIVITY` constant from Player.jsx. Still open from that
  discussion: the two-finger look+shoot scheme itself (nonstandard vs.
  COD/PUBG Mobile conventions) — deferred to a separate pass.
- 2026-06-19: Dynamic music (PR #115). Calm drone during intermission, heavy
  dread during waves: 80 BPM half-time kick, off-beat hat, 55+58.3 Hz beating
  drone pair (3.3 Hz pulse), boom stab every 6 s. 1.5 s crossfade in, 2.5 s
  out. New export `setMusicIntensity(level)` in sounds.js. Volume balance
  (kick vs drone vs calm layer) may need tuning after playtesting.

- 2026-06-17: Added haptic feedback on mobile (PR #113, merged). Short pulse
  per shot, shotgun double-tap, death thump. Android only — iOS has no web
  vibration API. Also confirmed leaderboards already exist (removed from TODO).

- 2026-06-17: Fixed window boarding bugs (PR #108). Three issues: (1) upgrading
  to strong mode with 1 existing plank was calling addPlank (increment count)
  instead of upgradePlanks — upgrade now takes priority; (2) plain plank could
  be placed on a strong window — blocked in both Player.jsx and store; (3) second
  strong plank was blocked by an overly broad store guard — guard now checks
  strongPlanksMode before rejecting.

- 2026-06-15: Fixed mobile camera-look freeze after intermission. Real
  cause: MobileControls renders null during the brief wave_clear phase
  (and when shop is open), unmounting the touch zones mid-drag with no
  pointerup/pointercancel ever firing. Stale non-null lookPointerRef then
  made the next touch register as the "secondary shoot finger" instead of
  primary look, so look stopped responding (movement/shoot still worked).
  Fix: reset all pointer-tracking refs whenever controls go inactive. Also
  fixed a separate bug where intermission->playing didn't reset shopOpen
  (left MobileControls fully invisible if shop was still open at wave
  start). Branch `claude/mobile-controls-freeze-permission-d61fwn`.
- 2026-06-14: Set up soul.md / memory.md / CLAUDE.md pointer. Discussed and
  agreed on personality (blunt, discussion-first), vision (fun + retention,
  performance-is-fun, monetization without hurting fun), and memory
  structure. Built feature inventory from git history + open PRs. Closed
  PRs #79 and #46 as superseded by what's already on main.
- 2026-06-15: Reviewed architecture (mostly fine, Arena.jsx/Zombie.jsx are
  large but not urgent) and confirmed R3F + Rapier-if-needed over a Godot
  rewrite. Merged PR #91 (mobile controls: two-finger shoot+look,
  tap-anywhere-fire, aim assist, auto-shoot) after discussing and keeping
  the auto-shoot (COD Mobile precedent). Also fixed a pre-existing bug:
  duplicate "R — reload · Q — knife" HUD hint on desktop.
- 2026-06-15: Merged PR #94 — debug URL params (`?wave=`, `?money=`,
  `?weapon=`) for fast manual testing, gated off on Vercel production
  builds via `VITE_VERCEL_ENV`.
- 2026-06-15: Added a standing workflow rule to CLAUDE.md — open a PR for
  every session's work (even doc-only) and always report the Vercel
  preview link (PR #100).
