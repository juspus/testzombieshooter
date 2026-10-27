# Analytics: retention baseline

Client events go to `public.events` via `src/analytics.js` (batched, fire-and-forget;
no-op for opted-out players and webdriver/test traffic). Schema is in
`supabase/migrations/`. Anon/authenticated roles cannot SELECT it, so queries run from
the Supabase dashboard.

## Running the queries

1. Supabase dashboard > SQL Editor > New query.
2. Open `supabase/queries/retention.sql`, paste **one numbered query at a time**, Run.
3. All queries are read-only. Windows (30/60 days) are edited inline.

The queries were syntax- and logic-checked against synthetic data in a throwaway local
Postgres 16, never against the live database.

## Events used

| Event | Props | Emitted when |
|---|---|---|
| `session_start` | `mobile`, `ua` | page load |
| `game_start` | `map`, `mp` (solo/host/guest), `run_id` | run begins (from the start screen **and** from the death screen's restart) |
| `wave_clear` | `wave`, `kills`, `run_id` | wave N cleared |
| `death` | `wave`, `kills`, `money`, `weapon`, `perks`, `run_id`, `secs` | player dies; `secs` = run length |

`run_id` and `secs`, plus `game_start` on restart-after-death, are new. Older rows lack
them: run-based queries (4-6) only see runs from the deploy onward; player/session
queries (1-3) cover all history. A run where the tab was closed has `game_start` (and
maybe `wave_clear`s) but no `death`.

## Metrics

Conventions: a player = one `anon_id` (browser; two devices = two players, cleared
storage = new player). Days are UTC.

1. **Daily new players**: anon_ids by the day of their first event.
2. **D1 / D7 return by cohort day**: share of a cohort with any event exactly 1 / 7 days
   after their first day. NULL while the day hasn't fully elapsed. Small cohorts are noisy.
3. **Sessions**: a player's events split on gaps > 30 min (independent of the client
   `session_id`). Reports runs per session, % of sessions with no run, and session length
   quartiles (last minus first event, so a lower bound).
4. **Wave reached**: quartiles over all runs and over each player's first run. Reached =
   death wave, else last cleared wave + 1, else 1.
5. **First-minute quit**: `early_quit_pct` = runs that never cleared wave 1 (no
   `wave_clear`); `died_lt_60s_pct` = died within 60 s; `left_without_dying_pct` =
   never reached wave 2 and no death (bounced). Runs younger than 10 min are excluded.
6. **Co-op share**: `game_start` by `mp`. Both co-op players emit a run, so it is a share
   of player-runs, not matches (matches ~ host runs).

## Perf debug params (not analytics, same gating)

`/?perf` shows an FPS / frame time / draw calls / triangles / geometries / textures /
programs / zombie overlay (top-left); `/?bench` jumps to a fixed wave-10 scene (25
zombies, seeded spawns, player at 0,1.7,0, huge HP). Combine as `/?perf&bench`. Dev and
Vercel preview only, no-ops on production.
