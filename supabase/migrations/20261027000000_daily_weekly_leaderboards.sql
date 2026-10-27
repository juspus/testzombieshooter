-- NOT YET APPLIED. Safe to run more than once (idempotent).
-- Paste into Supabase dashboard -> SQL Editor -> Run. (Do not use MCP: it timed out before.)
-- Requires 20261014000000 + 20261015000000 to be applied first.
--
-- Adds: Daily seeded run + weekly leaderboard.
--   * scores.mode ('normal' | 'daily'), scores.seed_date (UTC day of a daily), scores.anon_id
--   * one RANKED daily per player per day: unique on (user_id, seed_date) for signed-in
--     players, (anon_id, seed_date) for signed-out ones. Further daily runs are "practice"
--     and are never submitted by the client.
--   * views leaderboard_week (Mon 00:00 UTC ->) and leaderboard_daily (today UTC)
--   * leaderboard (all time) now excludes daily rows
-- The client degrades gracefully if this isn't applied: normal submits keep the old insert
-- shape, "This week" falls back to date-filtering `leaderboard`, "Daily" shows "coming soon".
--
-- Honest limits: anon_id is a client-generated id, so a signed-out player can reset it (clear
-- site data) for another ranked attempt, and a scripted client could post any score - same
-- trust model as the existing all-time board. Signed-in players are deduped by user_id.

alter table public.scores
  add column if not exists mode text not null default 'normal',
  add column if not exists seed_date date,
  add column if not exists anon_id text;

do $$ begin
  alter table public.scores add constraint scores_mode_check check (mode in ('normal', 'daily'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.scores add constraint scores_daily_shape_check check (
    (mode = 'normal' and seed_date is null)
    or (mode = 'daily' and seed_date is not null and (user_id is not null or (anon_id is not null and char_length(anon_id) <= 64)))
  );
exception when duplicate_object then null; end $$;

-- One ranked daily per identity per day.
create unique index if not exists scores_daily_user_uniq
  on public.scores (user_id, seed_date) where mode = 'daily' and user_id is not null;
create unique index if not exists scores_daily_anon_uniq
  on public.scores (anon_id, seed_date) where mode = 'daily' and user_id is null;

create index if not exists scores_daily_rank_idx
  on public.scores (seed_date, wave desc, kills desc) where mode = 'daily';
create index if not exists scores_created_at_idx on public.scores (created_at desc);

-- Insert policy: as before (own user_id or none), plus a daily may only be filed for today (UTC).
drop policy if exists "insert_score" on public.scores;
create policy "insert_score" on public.scores
  for insert to anon, authenticated
  with check (
    (user_id is null or user_id = auth.uid())
    and (
      mode = 'normal'
      or (mode = 'daily' and seed_date = (now() at time zone 'utc')::date)
    )
  );

-- Views. Same columns as `leaderboard` so the client reuses one renderer.
create or replace view public.leaderboard with (security_invoker = true) as
  select s.id, s.name, s.wave, s.kills, s.created_at,
         public.is_supporter(s.user_id) as is_supporter
  from public.scores s
  where s.mode = 'normal';
grant select on public.leaderboard to anon, authenticated;

create or replace view public.leaderboard_week with (security_invoker = true) as
  select s.id, s.name, s.wave, s.kills, s.created_at,
         public.is_supporter(s.user_id) as is_supporter
  from public.scores s
  where s.mode = 'normal'
    and s.created_at >= (date_trunc('week', now() at time zone 'utc') at time zone 'utc');
grant select on public.leaderboard_week to anon, authenticated;

create or replace view public.leaderboard_daily with (security_invoker = true) as
  select s.id, s.name, s.wave, s.kills, s.created_at,
         public.is_supporter(s.user_id) as is_supporter
  from public.scores s
  where s.mode = 'daily'
    and s.seed_date = (now() at time zone 'utc')::date;
grant select on public.leaderboard_daily to anon, authenticated;
