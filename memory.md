# memory.md

Running journal for picking up context across sessions. Read this at the
start of every session. Keep entries short — a few lines each.

## Active

- Open PR #91 (`claude/mobile-controls-usability-ElP6H`): two-finger
  shoot+look, tap-anywhere-to-fire, mobile aim assist. Not yet merged.
- Open PR #79 (`claude/weapon-caliber-switching-MwEA4`): per-caliber ammo
  system. Looks superseded — main already has a different (and simpler)
  per-weapon ammo system (`savedClips`/`savedReserves`, see CLAUDE.md).
  Probably needs closing, not merging — confirm with Justas first.
- Open PR #46 (`claude/foggy-forest-skybox`): forest skybox. Main already
  has `ForestSkybox.jsx` (merged via PR #70, different implementation).
  Likely stale/duplicate — confirm before closing.

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

- Confirm whether PR #79 and #46 should be closed as superseded (see Active).

## Dated log

- 2026-06-14: Set up soul.md / memory.md / CLAUDE.md pointer. Discussed and
  agreed on personality (blunt, discussion-first), vision (fun + retention,
  performance-is-fun, monetization without hurting fun), and memory
  structure. Built feature inventory from git history + open PRs.
