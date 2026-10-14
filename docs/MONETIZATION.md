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
  add column if not exists stats jsonb not null default '{}'::jsonb,       -- { bestWave, totalKills, runs, totalHeadshots, totalKnifeKills }
  add column if not exists cosmetics jsonb not null default '{}'::jsonb;   -- { skin, crosshair, crosshairColor, knifeSkin }
-- NOTE: no `is_supporter` column on profiles — the client can UPDATE its own
-- profile row, so a flag there would be spoofable. Supporter status is derived
-- from `entitlements` (service-role-only writes) via `is_supporter(uuid)`.

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
-- RLS: anon + authenticated may INSERT (user_id must be null or auth.uid()); nobody may SELECT via anon key

-- Leaderboard with badge (scores.user_id → auth.users, so no PostgREST join to profiles):
create function public.is_supporter(uid uuid) returns boolean security definer ...;  -- exists() on entitlements
create view public.leaderboard with (security_invoker = true) as
  select s.id, s.name, s.wave, s.kills, s.created_at, public.is_supporter(s.user_id) as is_supporter
  from public.scores s;
```
All of the above is APPLIED to the live project (migration
`supporter_pack_entitlements_events_leaderboard`).

Leaderboard badge: `fetchLeaderboard` selects from the `leaderboard` view
(`id, name, wave, kills, created_at, is_supporter`) instead of `scores`.
Anonymous scores (null user_id) never get a badge.

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

## Server implementation notes

Files: `api/checkout.js`, `api/stripe-webhook.js`, `api/store-config.js`; shared
helpers in `api/_lib/` (underscore-prefixed, so Vercel does not deploy them as
functions). Tests: `npx vitest run api` (offline, no keys; signature tests use
the real `stripe` lib with a fake `whsec_test` secret).

| Endpoint | Request | Responses |
|---|---|---|
| `GET /api/store-config` | — | `200 { checkoutEnabled, priceLabel: '€4.99', sku: 'supporter_pack' }`, `Cache-Control: public, max-age=60` |
| `POST /api/checkout` | `Authorization: Bearer <supabase access_token>` | `200 { url }` (redirect to Stripe) · `401 unauthorized` · `409 already_owned` · `503 checkout_unavailable` · `405` |
| `POST /api/stripe-webhook` | Stripe-signed raw body | `200 { received: true }` · `400 invalid_signature` · `500 db_error` (Stripe retries) · `503` |

- Checkout verifies the token with `supabase.auth.getUser(token)` using the
  service-role client, then rejects if an `entitlements` row exists.
  Redirect origin comes from `x-forwarded-host`/`host` but only if allowlisted
  (`cabin.puodzius.dev`, `testzombieshooter.vercel.app`,
  `*-juspus-projects.vercel.app`, `localhost:*`); otherwise `https://cabin.puodzius.dev`.
- Webhook grants only on `checkout.session.completed` /
  `async_payment_succeeded` with `payment_status === 'paid'`. `user_id` must be
  a UUID and `sku` in the allowlist (metadata is untrusted). Unique violations
  (`23505`) count as success, so redelivery is harmless.
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
  (required); `SUPABASE_URL`, `SUPPORTER_PRICE_CENTS` (optional).
- In the Stripe dashboard, point a webhook endpoint at
  `https://<domain>/api/stripe-webhook` for `checkout.session.completed` and
  `checkout.session.async_payment_succeeded`.

Local webhook testing (`vercel dev` serves `api/`):

```sh
vercel dev --listen 3000
stripe listen --forward-to localhost:3000/api/stripe-webhook   # prints a whsec_... secret
# put that secret in STRIPE_WEBHOOK_SECRET, then:
stripe trigger checkout.session.completed
```
(`stripe trigger` fixtures lack our metadata, so they are acknowledged but
ignored; do a real test-mode checkout to see a grant.)
