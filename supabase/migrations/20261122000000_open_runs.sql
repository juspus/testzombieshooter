-- APPLIED to project `cabin` (clhonzagmvgpsaawjwsf) on 2026-11-23 as migration `open_runs`.
-- Safe to run more than once (idempotent). Standalone.
--
-- Public list of open runs (src/openRuns.js). A solo player mid-run can open their run to the
-- public; it is listed here while they wait for a partner. The game connects peer to peer
-- (PeerJS) by the 5-letter room code; this table is only the notice board.
--
--   * open_runs: one row per room code. `secret` is a random token only the host knows. RLS is on
--     with no policies, so anon / authenticated read 0 rows and cannot write: only the three
--     security-definer RPCs below touch it, and none returns the secret.
--   * list_open_runs(map, proto): rows refreshed in the last 60 s, newest first, max 30.
--   * open_run_upsert(...): create or refresh a row. An existing row changes only with its secret,
--     or once it has been silent 10 minutes (the code is then free to reuse). Refuses past 500
--     live rows.
--   * open_run_close(code, secret): marks the row stale (updated_at = epoch) so it drops off the
--     list. Rows are never deleted (written without DROP / DELETE / REVOKE, which the Supabase
--     connector holds for a confirmation it cannot show); they are tiny and reused per code.
--
-- Honest limits: anyone can list a fake room (it fails to connect and drops off after 60 s); a
-- scripted client could fill the list up to the 500 live-row cap.

create table if not exists public.open_runs (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{5}$'),
  secret uuid not null,
  map text not null check (char_length(map) between 1 and 24),
  wave int not null default 1 check (wave between 1 and 999),
  proto int not null check (proto between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.open_runs enable row level security;
create index if not exists open_runs_updated_idx on public.open_runs (updated_at desc);

create or replace function public.list_open_runs(p_map text, p_proto int)
returns table (code text, map text, wave int, proto int, updated_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select r.code, r.map, r.wave, r.proto, r.updated_at
  from public.open_runs r
  where r.map = p_map and r.proto = p_proto and r.updated_at > now() - interval '60 seconds'
  order by r.updated_at desc
  limit 30;
$$;

create or replace function public.open_run_upsert(p_code text, p_secret uuid, p_map text, p_wave int, p_proto int)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.open_runs where code = p_code)
     and (select count(*) from public.open_runs where updated_at > now() - interval '10 minutes') >= 500 then
    raise exception 'open_runs_full';
  end if;
  insert into public.open_runs as r (code, secret, map, wave, proto)
    values (p_code, p_secret, p_map, p_wave, p_proto)
  on conflict (code) do update
    set secret = excluded.secret, map = excluded.map, wave = excluded.wave, proto = excluded.proto,
        created_at = case when r.updated_at < now() - interval '10 minutes' then now() else r.created_at end,
        updated_at = now()
    where r.secret = excluded.secret or r.updated_at < now() - interval '10 minutes';
end;
$$;

create or replace function public.open_run_close(p_code text, p_secret uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.open_runs set updated_at = 'epoch'::timestamptz where code = p_code and secret = p_secret;
$$;

grant execute on function public.list_open_runs(text, int) to anon, authenticated;
grant execute on function public.open_run_upsert(text, uuid, text, int, int) to anon, authenticated;
grant execute on function public.open_run_close(text, uuid) to anon, authenticated;
