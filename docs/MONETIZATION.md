# Monetization — design & contracts

Status: v1 design, implemented on branch `claude/monetization-supporter-pack`.
Owner decisions still needed are listed in `docs/LAUNCH_CHECKLIST.md`.

## Principles (from SOUL.md — non-negotiable)

- Cosmetics only. Nothing sold affects damage, HP, money, ammo, speed, or
  unlock pacing. If a reviewer can show a paid item changes a gameplay
  number, it's a bug.
- No dark patterns: no timers, no "limited offer", no fake scarcity, no
  interstitials, no interrupting a run. One calm CTA on the start screen
  and one line on the death screen. Players who never pay get the full
  game forever.
- Every paid cosmetic has a free sibling earnable by playing. The locker
  shows both side by side; the paid one is a "thanks", not a gate.
- Performance: no new shader programs. Skins swap `color/metalness/
  roughness` on the existing `meshStandardMaterial`s in `Gun.jsx` (same
  material type, same flags => same program). Crosshairs are CSS.

## Revenue model (v1)

**Supporter Pack — one-time €4.99** via Stripe Checkout (hosted page).
Contents (all cosmetic):

| Item | Type | Free sibling (milestone) |
|---|---|---|
| Gold finish (all guns) | weapon skin | Blood-Rust finish — reach wave 10 |
| Obsidian finish | weapon skin | Field-Worn finish — 250 total kills |
| 3 crosshair styles (dot, chevron, circle) + colour picker | HUD | Classic cross + 2 colours — free for all; Green — reach wave 5 |
| ★ Supporter badge on leaderboard + name tint | social | — |
| Knife: ember-glow blade | weapon skin | — |

Later (not in v1, see TODO): daily challenge with its own board, portal
distribution (CrazyGames/Poki rev-share), more skin packs.

## Architecture

```
Browser (React)                         Vercel functions          Supabase
──────────────                          ────────────────          ────────
Locker UI ──POST /api/checkout───────▶ api/checkout.js ──verify JWT──▶ auth
  (Bearer <supabase access_token>)        │ stripe.checkout.sessions.create
  ◀── { url } ── redirect to Stripe ──────┘   metadata: { user_id, sku }
Stripe ──checkout.session.completed──▶ api/stripe-webhook.js ─service role─▶ entitlements (insert)
                                                                          └▶ profiles.is_supporter = true
Locker UI ──select entitlements where user_id = auth.uid() (RLS)───────────▶ entitlements
GET /api/store-config ──▶ { checkoutEnabled: bool, priceLabel: '€4.99' }
```

Return URLs: success `/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
cancel `/?checkout=cancel`. On success the client re-fetches entitlements
(poll up to ~10 s — webhook may lag) and opens the locker.

### Env vars (Vercel project settings — server only, never VITE_*)

| Var | Used by |
|---|---|
| `STRIPE_SECRET_KEY` | checkout, webhook |
| `STRIPE_WEBHOOK_SECRET` | webhook signature verification |
| `SUPABASE_SERVICE_ROLE_KEY` | checkout (JWT verify), webhook (grant) |
| `SUPABASE_URL` | optional; defaults to the project URL in `src/supabase.js` |
| `SUPPORTER_PRICE_CENTS` | optional, default `499` (EUR, inline `price_data`) |

If `STRIPE_SECRET_KEY` is missing, `/api/store-config` reports
`checkoutEnabled:false` and the locker shows supporter items as
"coming soon" (no broken button).

### Database (Supabase project `cabin`, ref `clhonzagmvgpsaawjwsf`)

```sql
-- existing: profiles(id uuid pk → auth.users, username text), scores(...)
alter table public.profiles
  add column if not exists is_supporter boolean not null default false,
  add column if not exists stats jsonb not null default '{}'::jsonb,       -- { bestWave, totalKills, runs, totalHeadshots, totalKnifeKills }
  add column if not exists cosmetics jsonb not null default '{}'::jsonb;   -- { skin, crosshair, crosshairColor, knifeSkin }

create table public.entitlements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text not null,                       -- 'supporter_pack'
  source text not null default 'stripe',   -- 'stripe' | 'manual'
  stripe_session_id text unique,
  stripe_event_id text unique,             -- idempotency
  amount_cents integer,
  currency text,
  granted_at timestamptz not null default now(),
  unique (user_id, sku)
);
-- RLS: owner can SELECT; no client INSERT/UPDATE/DELETE (service role only)

create table public.events (                -- product analytics, insert-only from clients
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid,                            -- null for anonymous
  anon_id text,                            -- random id in localStorage
  session_id text,                         -- per page load
  name text not null check (char_length(name) <= 64),
  props jsonb not null default '{}'::jsonb,
  client text                              -- 'desktop' | 'mobile'
);
-- RLS: anon + authenticated may INSERT; nobody may SELECT via anon key
```

Leaderboard badge: `fetchLeaderboard` also selects `profiles(is_supporter)`
via the `scores.user_id → profiles.id` relation (anonymous scores have
no badge).

### Client contracts (so parallel work lines up)

- `src/cosmetics.js` — catalog + pure helpers:
  - `COSMETICS` array of `{ id, kind: 'skin'|'crosshair'|'knifeSkin'|'badge', label, unlock: {type:'free'} | {type:'supporter'} | {type:'milestone', stat:'bestWave'|'totalKills', value}, ...visual params }`
  - `isUnlocked(item, { entitlements, stats })`
  - `applySkinToGunMat(skinId, role, baseColor, metalness, roughness)` → `{ color, metalness, roughness }` (pure, no allocations in render path; precomputed palette maps)
- Store (`store.js`) additions: `cosmetics` (equipped), `setCosmetic(kind, id)`,
  `entitlements: []`, `setEntitlements(list)`, `stats` (lifetime), `recordRunEnd()`.
- `src/supabase.js` additions: `fetchEntitlements()`, `loadProfileExtras()`
  (stats+cosmetics), `saveProfileExtras({stats, cosmetics})`, leaderboard badge.
- `src/analytics.js`: `track(name, props?)` — fire-and-forget, batched,
  never throws, no-ops in vitest. Subscribes to the store for
  `game_start`, `wave_clear`, `death` so `store.js` needs no edits for those.
  Explicit calls from UI: `locker_open`, `supporter_cta_view`,
  `checkout_start`, `checkout_success`, `checkout_cancel`, `cosmetic_equip`.
- `src/components/Screens.jsx`: start-screen view `'locker'`; death screen
  shows "NEW UNLOCK" line when a milestone flips during this run.
- Anonymous players: stats/cosmetics persist in `localStorage`
  (`cabin.profile.v1`); on login they merge (max of stats) and upload.

## Why not ads / subscriptions / loot boxes

- Rewarded/interstitial ads interrupt the loop and need portal approval; revisit
  only as part of a CrazyGames/Poki distribution deal (their SDK, their ads).
- Subscription has nothing recurring to sell. Loot boxes are a dark pattern.
