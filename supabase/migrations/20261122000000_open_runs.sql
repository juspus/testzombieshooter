-- NOT YET APPLIED. Safe to run more than once (idempotent). Standalone (needs no other migration).
-- Paste into Supabase dashboard -> SQL Editor -> Run.
--
-- Adds: public list of open runs (src/openRuns.js). A solo player mid-run can open their run to
-- the public; it is listed here while they wait for a partner. The game connects peer to peer
-- (PeerJS) by the 5-letter room code; this table is only the notice board.
--
--   * open_runs: one row per open room. `secret` is a random token only the host knows; the
--     table itself has no policies, so anon / authenticated clients cannot read or write it
--     directly (the secret never leaves the server).
--   * list_open_runs(map, proto): rows heartbeated in the last 60 s, newest first, max 30,
--     without the secret.
--   * open_run_upsert(...): create or refresh a row (the secret must match an existing row);
--     also sweeps rows silent for 10 minutes; refuses past 500 rows.
--   * open_run_close(code, secret): delete a row.
--
-- Honest limits: anyone can list a fake room (it just fails to connect and drops off after
-- 60 s); a scripted client could fill the list up to the 500-row cap.

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
revoke all on public.open_runs from anon, authenticated;

create index if not exists open_runs_updated_idx on public.open_runs (updated_at desc);

create or replace function public.list_open_runs(p_map text, p_proto int)
returns table (code text, map text, wave int, proto int, updated_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select r.code, r.map, r.wave, r.proto, r.updated_at
  from public.open_runs r
  where r.map = p_map and r.proto = p_proto and r.updated_at > now() - interval '60 seconds'
  order by r.updated_at desc
  limit 30;
$$;

create or replace function public.open_run_upsert(p_code text, p_secret uuid, p_map text, p_wave int, p_proto int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.open_runs where updated_at < now() - interval '10 minutes';
  if exists (select 1 from public.open_runs where code = p_code) then
    update public.open_runs
      set wave = p_wave, map = p_map, proto = p_proto, updated_at = now()
      where code = p_code and secret = p_secret;
  else
    if (select count(*) from public.open_runs) >= 500 then
      raise exception 'open_runs_full';
    end if;
    insert into public.open_runs (code, secret, map, wave, proto) values (p_code, p_secret, p_map, p_wave, p_proto);
  end if;
end;
$$;

create or replace function public.open_run_close(p_code text, p_secret uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.open_runs where code = p_code and secret = p_secret;
$$;

revoke all on function public.list_open_runs(text, int) from public;
revoke all on function public.open_run_upsert(text, uuid, text, int, int) from public;
revoke all on function public.open_run_close(text, uuid) from public;
grant execute on function public.list_open_runs(text, int) to anon, authenticated;
grant execute on function public.open_run_upsert(text, uuid, text, int, int) to anon, authenticated;
grant execute on function public.open_run_close(text, uuid) to anon, authenticated;
