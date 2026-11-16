create table if not exists public.visit_sessions (
  id text primary key,
  visitor_id text not null,
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  ip text,
  country text,
  region text,
  city text,
  user_agent text
);

create table if not exists public.visit_spans (
  id bigint generated always as identity primary key,
  session_id text not null,
  screen text not null,
  mode text,
  scenario_id text,
  sheet text,
  started_at timestamptz not null,
  last_seen_at timestamptz not null
);

create table if not exists public.visit_ingest (
  ip text,
  at timestamptz not null
);

create index if not exists visit_ingest_ip_at on public.visit_ingest (ip, at);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hockey_app') then
    create role hockey_app login;
  end if;
end
$$;

grant usage on schema public to hockey_app;
grant select, insert, update, delete on public.visit_sessions, public.visit_spans, public.visit_ingest to hockey_app;
grant usage, select on sequence public.visit_spans_id_seq to hockey_app;

alter table public.visit_sessions enable row level security;
alter table public.visit_sessions force row level security;
alter table public.visit_spans enable row level security;
alter table public.visit_spans force row level security;
alter table public.visit_ingest enable row level security;
alter table public.visit_ingest force row level security;

revoke all on table public.visit_sessions from public, anon, authenticated, service_role;
revoke all on table public.visit_spans from public, anon, authenticated, service_role;
revoke all on table public.visit_ingest from public, anon, authenticated, service_role;

drop policy if exists hockey_app_all on public.visit_sessions;
create policy hockey_app_all on public.visit_sessions for all to hockey_app using (true) with check (true);
drop policy if exists hockey_app_all on public.visit_spans;
create policy hockey_app_all on public.visit_spans for all to hockey_app using (true) with check (true);
drop policy if exists hockey_app_all on public.visit_ingest;
create policy hockey_app_all on public.visit_ingest for all to hockey_app using (true) with check (true);
