-- Retention & early-funnel baseline over public.events.
-- READ-ONLY. Paste ONE query at a time into the Supabase SQL editor (runs as
-- postgres, so the anon/authenticated SELECT revoke doesn't apply). See docs/ANALYTICS.md.
--
-- Events emitted by src/analytics.js (props in braces):
--   session_start {mobile, ua}                 once per page load
--   game_start    {map, mp, run_id}            run begins; mp = solo | host | guest
--   wave_clear    {wave, kills, run_id}        wave N cleared (=> player reached wave N+1)
--   death         {wave, kills, money, weapon, perks, run_id, secs}   wave = wave died on
--   shop_open / locker_open / cosmetic_equip / supporter_cta_view / checkout_*
-- run_id and secs were added with this file: runs recorded BEFORE that deploy have no
-- run_id (they are ignored by the run queries below; player/session queries still
-- count them). Opt-out players and Playwright/webdriver traffic emit nothing.
--
-- Identity: anon_id = one browser (localStorage), UTC days throughout. A player on two
-- devices counts twice; cleared storage counts as a new player.
-- Tune the window by editing the interval in each query's `ev` CTE.

-- ---------------------------------------------------------------------------
-- 1. Daily new players
-- A "new player" = an anon_id whose first-ever event landed on that day.
-- ---------------------------------------------------------------------------
with first_seen as (
  select anon_id, min(created_at)::date as day
  from public.events
  where anon_id is not null
  group by anon_id
)
select day, count(*) as new_players
from first_seen
where day >= current_date - 60
group by day
order by day desc;

-- ---------------------------------------------------------------------------
-- 2. Day-1 and day-7 return rate by cohort day
-- d1 = share of the cohort with any event exactly 1 day after their first day;
-- d7 = exactly 7 days after. "Exact day" (classic D-N), not "within N days".
-- Cohorts too young to have a D-N yet are NULL (not 0%).
-- Rates on cohorts of < ~30 players are noise; look at the weekly line too.
-- ---------------------------------------------------------------------------
with activity as (
  select distinct anon_id, created_at::date as day
  from public.events
  where anon_id is not null
),
cohort as (
  select anon_id, min(day) as cohort_day from activity group by anon_id
),
joined as (
  select c.cohort_day, c.anon_id,
         bool_or(a.day = c.cohort_day + 1) as ret_d1,
         bool_or(a.day = c.cohort_day + 7) as ret_d7
  from cohort c
  join activity a using (anon_id)
  group by c.cohort_day, c.anon_id
)
select cohort_day,
       count(*) as players,
       case when cohort_day + 1 <= current_date - 1 then round(100.0 * count(*) filter (where ret_d1) / count(*), 1) end as d1_pct,
       case when cohort_day + 7 <= current_date - 1 then round(100.0 * count(*) filter (where ret_d7) / count(*), 1) end as d7_pct
from joined
where cohort_day >= current_date - 60
group by cohort_day
order by cohort_day desc;

-- ---------------------------------------------------------------------------
-- 3. Sessions: runs per session and session length
-- Analytics session = a player's events with no gap > 30 min (independent of the
-- client's session_id, which resets only on page load). Length = last - first event
-- in the session (single-event sessions have length 0; a player idling in a menu
-- for hours still ends the session after 30 min of silence, so lengths are lower
-- bounds). Runs per session = game_start events in it.
-- ---------------------------------------------------------------------------
with ev as (
  select anon_id, created_at, name
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
         count(*) filter (where name = 'game_start') as runs,
         extract(epoch from max(created_at) - min(created_at)) as secs
  from numbered
  group by anon_id, sess_no
)
select count(*)                                                        as sessions,
       round(avg(runs), 2)                                             as avg_runs_per_session,
       percentile_cont(0.5) within group (order by runs)               as median_runs,
       round(100.0 * count(*) filter (where runs = 0) / count(*), 1)   as pct_sessions_no_run,
       round((percentile_cont(0.25) within group (order by secs) / 60)::numeric, 1) as len_min_p25,
       round((percentile_cont(0.5)  within group (order by secs) / 60)::numeric, 1) as len_min_median,
       round((percentile_cont(0.75) within group (order by secs) / 60)::numeric, 1) as len_min_p75
from sessions;

-- ---------------------------------------------------------------------------
-- 4. Wave reached: quartiles overall and for each player's FIRST run
-- Wave reached = wave you died on (death.wave); if the run has no death (tab closed /
-- left mid-run) = last cleared wave + 1; if neither, 1. Only runs with a run_id.
-- ---------------------------------------------------------------------------
with starts as (
  select props->>'run_id' as run_id, anon_id, created_at,
         row_number() over (partition by anon_id order by created_at) as run_no
  from public.events
  where name = 'game_start' and props ? 'run_id' and anon_id is not null
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
  select s.run_no, coalesce(d.wave, c.wave + 1, 1) as reached
  from starts s
  left join deaths d using (run_id)
  left join clears c using (run_id)
  where s.created_at >= now() - interval '60 days'
)
select 'all runs' as scope, count(*) as runs,
       percentile_cont(0.25) within group (order by reached) as p25,
       percentile_cont(0.5)  within group (order by reached) as median,
       percentile_cont(0.75) within group (order by reached) as p75
from runs
union all
select 'first run per player', count(*),
       percentile_cont(0.25) within group (order by reached),
       percentile_cont(0.5)  within group (order by reached),
       percentile_cont(0.75) within group (order by reached)
from runs where run_no = 1;
-- (run_no counts only runs that have a run_id, so "first run" = first run since the
--  run_id deploy, not necessarily the player's true first ever.)

-- ---------------------------------------------------------------------------
-- 5. First-minute quit rate
-- early_quit  = run never reached wave 2 (no wave_clear). Covers quitting, closing the
--               tab or dying in wave 1. (Wave 1 is ~5 zombies; clearing it takes a
--               competent player well under a few minutes.)
-- died_lt_60s = died within 60 s of starting (death.secs).
-- Runs started in the last 10 min are excluded: they may still be in progress.
-- ---------------------------------------------------------------------------
with starts as (
  select props->>'run_id' as run_id, created_at, coalesce(props->>'mp', 'solo') as mp
  from public.events
  where name = 'game_start' and props ? 'run_id'
    and created_at between now() - interval '60 days' and now() - interval '10 minutes'
),
deaths as (
  select props->>'run_id' as run_id, min((props->>'secs')::int) as secs
  from public.events where name = 'death' and props ? 'run_id' group by 1
),
cleared as (
  select distinct props->>'run_id' as run_id from public.events where name = 'wave_clear' and props ? 'run_id'
)
select count(*) as runs,
       round(100.0 * count(*) filter (where c.run_id is null) / count(*), 1)                  as early_quit_pct,
       round(100.0 * count(*) filter (where d.secs < 60) / count(*), 1)                       as died_lt_60s_pct,
       round(100.0 * count(*) filter (where c.run_id is null and d.run_id is null) / count(*), 1) as left_without_dying_pct
from starts s
left join deaths d using (run_id)
left join cleared c using (run_id);

-- ---------------------------------------------------------------------------
-- 6. Co-op share of runs
-- mp = solo | host | guest. A co-op match produces one game_start per participant
-- (when both players have analytics on), so "coop_pct" is a share of player-runs,
-- not of matches; matches ~= host runs.
-- ---------------------------------------------------------------------------
select count(*) as runs,
       count(*) filter (where coalesce(props->>'mp', 'solo') = 'solo')  as solo,
       count(*) filter (where props->>'mp' = 'host')                    as coop_host,
       count(*) filter (where props->>'mp' = 'guest')                   as coop_guest,
       round(100.0 * count(*) filter (where props->>'mp' in ('host', 'guest')) / nullif(count(*), 0), 1) as coop_pct
from public.events
where name = 'game_start' and created_at >= now() - interval '60 days';
