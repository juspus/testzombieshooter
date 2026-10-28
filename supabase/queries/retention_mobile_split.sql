-- Mobile vs desktop split of the retention baseline (companion to retention.sql).
-- READ-ONLY. Paste ONE query at a time into the Supabase SQL editor. See docs/ANALYTICS.md.
--
-- Schema used (supabase/migrations/20261014...): public.events(id, created_at timestamptz,
-- user_id uuid, anon_id text, session_id text, name text, props jsonb, client text).
-- events.client is 'mobile' | 'desktop' (set per event by src/analytics.js; NULL on rows
-- from before the column was filled, shown here as 'unknown').
--
-- Assumptions (not verified against live data; this file was not executed):
--  * A run's client = the client on its game_start event (a run never changes device).
--  * A player's client for retention = the client of their FIRST event ever. The return
--    itself counts on ANY client, so a mobile-first player who comes back on desktop
--    is a mobile D1 return.
--  * A session's client = its most common event client (mode()).
--  * run-based queries only see runs that have props.run_id (see retention.sql header).
--  * props->>'wave' is a JSON number serialised by JSON.stringify, so ::int is safe;
--    rows where it is not numeric would raise, none are emitted by the client.
--  * Small buckets (< ~30 runs/players) are noise; the `n` column is always shown.

-- ---------------------------------------------------------------------------
-- 1. Wave reached per run, by client: median and p75
-- Reached = wave you died on; if no death (left mid-run) = last cleared wave + 1; else 1.
-- ---------------------------------------------------------------------------
with starts as (
  select props->>'run_id' as run_id, coalesce(client, 'unknown') as client
  from public.events
  where name = 'game_start' and props ? 'run_id'
    and created_at >= now() - interval '60 days'
),
deaths as (
  select props->>'run_id' as run_id, max((props->>'wave')::int) as wave
  from public.events where name = 'death' and props ? 'run_id' group by 1
),
clears as (
  select props->>'run_id' as run_id, max((props->>'wave')::int) as wave
  from public.events where name = 'wave_clear' and props ? 'run_id' group by 1
),
runs as (
  select s.client, coalesce(d.wave, c.wave + 1, 1) as reached
  from starts s
  left join deaths d using (run_id)
  left join clears c using (run_id)
)
select client,
       count(*)                                               as runs,
       percentile_cont(0.5)  within group (order by reached)  as median_wave,
       percentile_cont(0.75) within group (order by reached)  as p75_wave
from runs
group by client
order by client;

-- ---------------------------------------------------------------------------
-- 2. Runs per session, by client
-- Session = a player's events with no gap > 30 min (as in retention.sql query 3).
-- ---------------------------------------------------------------------------
with ev as (
  select anon_id, created_at, name, client
  from public.events
  where anon_id is not null and created_at >= now() - interval '30 days'
),
gapped as (
  select *, case when created_at - lag(created_at) over (partition by anon_id order by created_at) > interval '30 minutes'
                 then 1 else 0 end as is_new
  from ev
),
numbered as (
  select *, sum(is_new) over (partition by anon_id order by created_at) as sess_no
  from gapped
),
sessions as (
  select anon_id, sess_no,
         coalesce(mode() within group (order by client), 'unknown') as client,
         count(*) filter (where name = 'game_start') as runs
  from numbered
  group by anon_id, sess_no
)
select client,
       count(*)                                                      as sessions,
       round(avg(runs), 2)                                           as avg_runs_per_session,
       percentile_cont(0.5) within group (order by runs)             as median_runs,
       round(100.0 * count(*) filter (where runs = 0) / count(*), 1) as pct_sessions_no_run
from sessions
group by client
order by client;

-- ---------------------------------------------------------------------------
-- 3. Day-1 and day-7 return, by client (all cohorts in the window pooled)
-- Exact-day D-N as in retention.sql query 2. Only players whose D-N day has fully
-- elapsed are in each denominator, so d1_n / d7_n differ.
-- ---------------------------------------------------------------------------
with activity as (
  select distinct anon_id, created_at::date as day
  from public.events
  where anon_id is not null
),
cohort as (
  select anon_id,
         min(created_at)::date as cohort_day,
         coalesce((array_agg(client order by created_at))[1], 'unknown') as client
  from public.events
  where anon_id is not null
  group by anon_id
),
joined as (
  select c.client, c.cohort_day, c.anon_id,
         bool_or(a.day = c.cohort_day + 1) as ret_d1,
         bool_or(a.day = c.cohort_day + 7) as ret_d7
  from cohort c
  join activity a using (anon_id)
  where c.cohort_day >= current_date - 60
  group by c.client, c.cohort_day, c.anon_id
)
select client,
       count(*)                                                                  as players,
       count(*) filter (where cohort_day + 1 <= current_date - 1)                as d1_n,
       round(100.0 * count(*) filter (where ret_d1 and cohort_day + 1 <= current_date - 1)
             / nullif(count(*) filter (where cohort_day + 1 <= current_date - 1), 0), 1) as d1_pct,
       count(*) filter (where cohort_day + 7 <= current_date - 1)                as d7_n,
       round(100.0 * count(*) filter (where ret_d7 and cohort_day + 7 <= current_date - 1)
             / nullif(count(*) filter (where cohort_day + 7 <= current_date - 1), 0), 1) as d7_pct
from joined
group by client
order by client;

-- ---------------------------------------------------------------------------
-- 4. Where people quit, by client
-- One row per (client, wave): how many runs ended there and how.
--   died      = a death event on that wave
--   left_alive = no death; the player stopped after clearing wave-1 (tab closed / quit /
--                backgrounded). Quit wave = last cleared wave + 1 (1 if none cleared).
-- Runs started in the last 10 min are excluded (may still be in progress).
-- pct_of_client_runs = share of ALL that client's runs ending at this wave. The analytics
-- events carry no phase name, so wave + died/left_alive is the finest "where" available.
-- ---------------------------------------------------------------------------
with starts as (
  select props->>'run_id' as run_id, coalesce(client, 'unknown') as client
  from public.events
  where name = 'game_start' and props ? 'run_id'
    and created_at between now() - interval '60 days' and now() - interval '10 minutes'
),
deaths as (
  select props->>'run_id' as run_id, max((props->>'wave')::int) as wave
  from public.events where name = 'death' and props ? 'run_id' group by 1
),
clears as (
  select props->>'run_id' as run_id, max((props->>'wave')::int) as wave
  from public.events where name = 'wave_clear' and props ? 'run_id' group by 1
),
ended as (
  select s.client,
         coalesce(d.wave, c.wave + 1, 1)                       as quit_wave,
         case when d.run_id is not null then 'died' else 'left_alive' end as how
  from starts s
  left join deaths d using (run_id)
  left join clears c using (run_id)
)
select client, quit_wave,
       count(*) filter (where how = 'died')       as died,
       count(*) filter (where how = 'left_alive') as left_alive,
       count(*)                                   as runs,
       round(100.0 * count(*) / sum(count(*)) over (partition by client), 1) as pct_of_client_runs
from ended
group by client, quit_wave
order by client, quit_wave;
