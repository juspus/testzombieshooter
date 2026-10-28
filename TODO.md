# TODO.md

Ideas and deferred work to return to. No priority order — discuss before picking one up.
The prioritised plan lives in the roadmaps (`docs/launch-roadmap.html` is current; links in MEMORY.md);
this file stays the raw idea stash.

---

## Gameplay

- **More zombie archetypes** — Spitter (ranged acid), Exploder (kamikaze burst), Armored (reduced bullet dmg, shotgun/deagle bypass)
- **Environmental hazards** — barricade fire spreading, broken window glass slowing zombies
- **Wave modifiers** — e.g. "Fog of War" (reduced visibility), "Bloodlust" (zombies 2× speed), rotated in randomly
- **Difficulty settings** — easy/normal/hard on the start screen; affects spawn rate, zombie HP, money rewards
- **Secondary objectives** — optional per-wave bonus tasks (e.g. "survive 60 s without reloading") for extra money

## Weapons & combat

- **Grenade** — thrown arc, area damage; limited stock, purchasable
- **Crossbow** — slow reload, silent, instant-kill bolt, bolt retrieval mechanic
- **Weapon inspect animation** — idle cosmetic, adds feel
- **Reload cancel** — interrupt reload by switching weapon (ammo loaded so far is kept)

## Progression & economy

- **Unlockable starting loadouts** — reach wave N to unlock a different starter weapon for future runs
- **Perk reroll** — spend €X to randomize one purchased perk slot

## World & atmosphere

- **Destructible windows** — windows that visually break as planks are removed
- **Blood decals** — screen-space splats on zombie kill, fade over time
- **Fireplace flicker sync** — tie existing point-light intensity to audio beat or sine wave
- **Map selector on start screen** — diner map exists (src/maps/, DinerArena.jsx,
  GasStationSkybox.jsx) and is playable via `?map=diner`, but there's no
  player-facing way to pick it yet. Needs a start-screen UI wired to the
  store's `mapId`, plus a product call on whether new maps unlock via
  progression or are free from the start.
- **More map layouts** — barn/farmhouse (verticality via hayloft, wide door
  choke point) and windowless bunker (breach points instead of windows,
  biggest departure from the core "board the windows" loop) were discussed
  as the next candidates after the diner.

## Multiplayer

- **3–4 player support** — extend beyond 2-player co-op
- **Spectator mode** — watch after dying in solo, or observe co-op
- **Voice chat** — WebRTC audio channel between host and guest

## Mobile / UX

Prioritised in the mobile roadmap (`docs/mobile-roadmap.html`, link in MEMORY.md).

- **Onboarding overlay** — first-run tip for pointer lock / touch controls (touch half = `m-onboard`; owner skipped it on 2026-10-28)
- **Cloudflare TURN ephemeral credentials** — `api/turn.js` only does static env creds; add CF key/token minting if Cloudflare is the chosen provider
- **Gyro aim / layout editor** — parked in the mobile roadmap's "Later" list

## Tech / dev

- **Rapier physics** — evaluate replacing manual collision with @react-three/rapier for cleaner wall/zombie interactions (deferred pending clear need)
- **Split Arena.jsx** — it's large; candidate split: `Cabin.jsx` (geometry), `Lighting.jsx`, `Props.jsx`
- **E2E smoke test** — Playwright: load game, start wave, kill one zombie, reach wave 2

---

## Monetization & growth (next)

- **Daily challenge** — seeded run (same spawns for everyone) with its own leaderboard
- **More skin packs** — data-driven: add entries to `src/cosmetics.js`, no new code paths
- **CrazyGames / Poki SDK + submission** — rev-share ads, they bring traffic. SOUL.md constraint: no mid-run interstitials; ads only at natural breaks (start screen / after death)
- **itch.io page** — pay-what-you-want, points at cabin.puodzius.dev
- **Stripe Tax** — enable when revenue warrants it
- **Supabase Pro** — stop free-tier pausing (a paused project kills login, leaderboard and purchases)
- **Account deletion flow** — in-app; the privacy page promises deletion via email for now
- **Analytics dashboard SQL** — optional saved queries over the `events` table (funnel, retention by wave)
