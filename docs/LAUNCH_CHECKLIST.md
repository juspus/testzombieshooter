# Launch checklist — Supporter Pack

Things only the product owner can do. The code is live-safe without them
(supporter items show "coming soon" until Stripe is configured).

## 1. Stripe (≈20 min)
- [ ] Create a Stripe account (business or individual; VAT/OSS: Stripe Tax can be enabled later — start without it, prices are tax-inclusive).
- [ ] Dashboard → Developers → API keys → copy the **Secret key** (`sk_live_…`; use `sk_test_…` first on a preview deployment).
- [ ] Developers → Webhooks → Add endpoint: `https://cabin.puodzius.dev/api/stripe-webhook`, event `checkout.session.completed`. Copy the **Signing secret** (`whsec_…`).
- [ ] Branding: upload the icon (`public/icon-512.png`), set public business name "Cabin".

## 2. Supabase (≈5 min)
- [ ] Project `cabin` must not be paused (free tier pauses after 7 days idle — the leaderboard and login die with it). Either upgrade to Pro (~$25/mo) or keep it awake; a paused project is the #1 reason a purchase would fail.
- [ ] Settings → API → copy the **service_role** key (server only).
- [ ] SQL Editor → paste and run `supabase/migrations/20261015000000_harden_scores_events_entitlements.sql`. It is safe to run twice. It stops fake ★ leaderboard scores and rate-limits analytics inserts. (The first migration in that folder is already applied.)
- [ ] SQL Editor → then paste and run `supabase/migrations/20261027000000_daily_weekly_leaderboards.sql` (idempotent; run it after the hardening one). It adds the Daily Run (one ranked attempt per player per UTC day) and the weekly/daily leaderboard views. Until it is applied the game still works: "This week" falls back to a date filter on the all-time board and the "Daily" tab shows "coming soon". Check afterwards: play a Daily Run signed out, die, submit — the Daily tab should list it, and a second ranked submit the same day must be rejected.

## 3. Vercel env vars (project `testzombieshooter`, Production + Preview)
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Redeploy after adding.

### Co-op on mobile data (TURN relay, optional)
Carrier NATs often block direct WebRTC, so co-op needs a TURN relay on mobile data. `api/turn.js`
serves it to the game; with nothing set, co-op works as before (direct/STUN only).
- [ ] Pick any TURN provider, then set in Vercel: `TURN_URLS` (comma-separated `turn:` / `turns:` URLs,
  include a `turns:...:443?transport=tcp` one), `TURN_USERNAME`, `TURN_CREDENTIAL`. Redeploy.
- [ ] Check `/api/turn` returns your server in `iceServers`.
- [ ] Confirm: host and join from a phone on mobile data, open `chrome://webrtc-internals` on the
  desktop peer and look for a candidate of type `relay`.
- Short-lived-credential providers (e.g. Cloudflare Realtime TURN) are not supported yet.

## 4. Legal (required by Stripe & Google OAuth consent screen)
- [ ] Fill in the placeholders (your name/entity, contact email, country) in `public/terms.html` and `public/privacy.html`.
- [ ] Link the privacy URL in the Google Cloud OAuth consent screen.

## 5. Verify end to end (test mode first)
- [ ] Sign in with Google → Locker → "Support the dev €4.99" → Stripe test card `4242 4242 4242 4242`.
- [ ] After redirect, locker shows Gold/Obsidian unlocked; leaderboard shows ★ next to your name.
- [ ] Stripe dashboard → webhook shows 200.
- [ ] Switch keys to live, repeat with a real card, then refund yourself from the dashboard.

## 6. Measure
- Funnel events land in the `events` table (`game_start → death → locker_open → supporter_cta_view → checkout_start → checkout_success`).
- Query: `select name, count(*) from events where created_at > now() - interval '7 days' group by 1 order by 2 desc;`
- Decide on price/contents after ~500 deaths of data, not before.

## 7. Distribution (revenue multiplier — after the above works)
- Submit to CrazyGames and Poki (rev-share on their ads, they bring traffic). Needs their SDK; see TODO.md.
- itch.io page (pay-what-you-want) pointing at cabin.puodzius.dev.
