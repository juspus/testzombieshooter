# memory.md

Running journal for picking up context across sessions. Read this at the
start of every session. Keep entries short — a few lines each.

## Active

- Branch `claude/faster-phone-testing-f4xajx`: debug URL params
  (`?wave=N&money=N&weapon=ak47/shotgun/deagle`) on `startGame()` for
  fast manual testing — jump straight to a wave/loadout instead of
  grinding. Gated via `VITE_VERCEL_ENV` (vite.config.js `define` reads
  Vercel's `VERCEL_ENV`): active in dev + preview, no-op on production.

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
  full-auto 10rds/s), Desert Eagle (€700, instant kill, pierces 3)
- Per-weapon ammo pools (clip + reserve saved independently per weapon),
  scroll-wheel weapon switching
- Hunting knife: melee swing, swap with Q, kill bonus
- Procedural weapon sound design (pistol, shotgun pump/shot — multiple
  iterations tuning the shotgun boom specifically)

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
- Test Lab page (`/?testlab`) for isolated weapon/sound testing

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
- 2026-06-15: Fixed mobile "FULLSCREEN MODE" install banner — its close (×)
  taps were being swallowed by the always-on look/shoot zone (same
  z-index:auto, later in DOM order won). Added zIndex:1 to installHint in
  MobileControls.jsx. PR #96 open against main.
