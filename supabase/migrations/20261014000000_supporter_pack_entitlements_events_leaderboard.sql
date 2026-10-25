-- ALREADY APPLIED to project `cabin` (clhonzagmvgpsaawjwsf) on 2026-10-14.
-- Kept here so the schema is reproducible.

alter table public.profiles
  add column if not exists stats jsonb not null default '{}'::jsonb,
  add column if not exists cosmetics jsonb not null default '{}'::jsonb;

create table if not exists public.entitlements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text not null,
  source text not null default 'stripe',
  stripe_session_id text unique,
  stripe_event_id text unique,
  amount_cents integer,
  currency text,
  granted_at timestamptz not null default now(),
  unique (user_id, sku)
);
create index if not exists entitlements_user_id_idx on public.entitlements(user_id);
alter table public.entitlements enable row level security;
drop policy if exists "read own entitlements" on public.entitlements;
create policy "read own entitlements" on public.entitlements
  for select to authenticated using (auth.uid() = user_id);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  anon_id text,
  session_id text,
  name text not null check (char_length(name) <= 64),
  props jsonb not null default '{}'::jsonb,
  client text
);
create index if not exists events_created_at_idx on public.events(created_at);
create index if not exists events_name_idx on public.events(name);
alter table public.events enable row level security;
revoke select, update, delete on public.events from anon, authenticated;

create or replace function public.is_supporter(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select uid is not null and exists (
    select 1 from public.entitlements e where e.user_id = uid and e.sku = 'supporter_pack'
  )
$$;
revoke all on function public.is_supporter(uuid) from public;
grant execute on function public.is_supporter(uuid) to anon, authenticated;

create or replace view public.leaderboard with (security_invoker = true) as
  select s.id, s.name, s.wave, s.kills, s.created_at,
         public.is_supporter(s.user_id) as is_supporter
  from public.scores s;
grant select on public.leaderboard to anon, authenticated;

create index if not exists scores_wave_kills_idx on public.scores(wave desc, kills desc);
