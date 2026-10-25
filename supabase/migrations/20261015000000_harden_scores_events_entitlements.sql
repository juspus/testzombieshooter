-- NOT YET CONFIRMED APPLIED. Safe to run more than once.
-- Paste into Supabase dashboard -> SQL Editor -> Run.
-- Fixes from the security review:
--   1. Anyone could insert a score carrying a supporter's user_id (fake ★ scores).
--   2. Clients held table-level write grants on entitlements (unused, but remove).
--   3. events had a size cap but no rate cap (DB-fill risk on the 500 MB free tier).

-- 1. Scores: a client may only attach its own auth.uid() (or none).
drop policy if exists "insert_score" on public.scores;
create policy "insert_score" on public.scores
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- 2. Grants hygiene.
revoke insert, update, delete, truncate, references, trigger on public.entitlements from anon, authenticated;
revoke truncate, references, trigger on public.events from anon, authenticated;
revoke truncate, references, trigger on public.scores from anon, authenticated;
revoke truncate, references, trigger on public.profiles from anon, authenticated;

-- 3. Events: 2 KB props cap + max 120 rows/minute per client identity.
drop policy if exists "insert events" on public.events;
create policy "insert events" on public.events
  for insert to anon, authenticated
  with check (
    (user_id is null or user_id = auth.uid())
    and char_length(name) <= 64
    and pg_column_size(props) <= 2048
    and (anon_id is null or char_length(anon_id) <= 64)
    and (session_id is null or char_length(session_id) <= 64)
    and (client is null or char_length(client) <= 16)
  );
create index if not exists events_anon_recent_idx on public.events (anon_id, created_at desc);
create index if not exists events_user_recent_idx on public.events (user_id, created_at desc) where user_id is not null;

create or replace function public.events_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.user_id is not null then
    select count(*) into n from public.events
      where user_id = new.user_id and created_at > now() - interval '1 minute';
  elsif new.anon_id is not null then
    select count(*) into n from public.events
      where anon_id = new.anon_id and created_at > now() - interval '1 minute';
  else
    return null; -- no client identity: drop
  end if;
  if n >= 120 then return null; end if; -- silently drop; client is fire-and-forget
  return new;
end $$;
revoke all on function public.events_rate_limit() from public;
drop trigger if exists events_rate_limit_trg on public.events;
create trigger events_rate_limit_trg before insert on public.events
  for each row execute function public.events_rate_limit();

-- 4. Scores: one submission per signed-in user per 5 s.
create or replace function public.scores_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and exists (
    select 1 from public.scores where user_id = new.user_id and created_at > now() - interval '5 seconds'
  ) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.scores_rate_limit() from public;
drop trigger if exists scores_rate_limit_trg on public.scores;
create trigger scores_rate_limit_trg before insert on public.scores
  for each row execute function public.scores_rate_limit();

-- 5. Retention helper (privacy page promises 12 months for events).
--    Run monthly: select public.purge_old_events();
create or replace function public.purge_old_events()
returns void language sql security definer set search_path = public as $$
  delete from public.events where created_at < now() - interval '12 months';
$$;
revoke all on function public.purge_old_events() from public;
