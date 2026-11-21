# TODO.md

Ideas and deferred work to return to. No priority order — discuss before picking one up.
The prioritised plan lives in the live roadmap (`docs/next-roadmap.html`, link in MEMORY.md);
this file stays the raw idea stash. Finished ideas are deleted (2026-11-18 cleanup).

---

## Gameplay

- **Environmental hazards** — barricade fire spreading, broken window glass slowing zombies
- **Difficulty settings** — easy/normal/hard on the start screen; affects spawn rate, zombie HP, money rewards
- **Secondary objectives** — optional per-wave bonus tasks (e.g. "survive 60 s without reloading") for extra money

## Weapons & combat

- **Weapon inspect animation** — idle cosmetic, adds feel
- **Reload cancel** — interrupt reload by switching weapon (ammo loaded so far is kept)

## Progression & economy

- **Perk reroll** — spend €X to randomize one purchased perk slot

## World & atmosphere

- **Destructible windows** — windows that visually break as planks are removed
- **More map layouts** — barn/farmhouse (verticality via hayloft, wide door
  choke point) and windowless bunker (breach points instead of windows,
  biggest departure from the core "board the windows" loop) were discussed
  as the next candidates after the diner.

## Multiplayer

- **3–4 player support** — extend beyond 2-player co-op
- **Spectator mode** — watch after dying in solo, or observe co-op

## Mobile / UX

Prioritised in the mobile roadmap (`docs/mobile-roadmap.html`, link in MEMORY.md).

- **Onboarding overlay** — first-run tip for pointer lock / touch controls (touch half = `m-onboard`; owner skipped it on 2026-10-28)
- **Cloudflare TURN ephemeral credentials** — `api/turn.js` only does static env creds; add CF key/token minting if Cloudflare is the chosen provider
- **Gyro aim / layout editor** — parked in the mobile roadmap's "Later" list

## Tech / dev

Prioritised in the live roadmap (`docs/next-roadmap.html`, track two).

- **Rapier physics** — evaluate replacing manual collision with @react-three/rapier for cleaner wall/zombie interactions (deferred pending clear need)

---

## Monetization & growth (next)

- **More skin packs** — data-driven: add entries to `src/cosmetics.js`, no new code paths
- **CrazyGames / Poki SDK + submission** — rev-share ads, they bring traffic. SOUL.md constraint: no mid-run interstitials; ads only at natural breaks (start screen / after death)
- **itch.io page** — pay-what-you-want, points at cabin.puodzius.dev
- **Stripe Tax** — enable when revenue warrants it
- **Supabase Pro** — stop free-tier pausing (a paused project kills login, leaderboard and purchases)
- **Account deletion flow** — in-app; the privacy page promises deletion via email for now
- **Analytics dashboard SQL** — optional saved queries over the `events` table (funnel, retention by wave)
