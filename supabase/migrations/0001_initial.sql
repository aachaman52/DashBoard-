-- Apply to a NEW dedicated Control Center Supabase project only.
create table public.projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, repository_full_name text, website_url text, created_at timestamptz not null default now(),
  unique(user_id, name)
);
create table public.integrations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null, external_id text, status text not null default 'disconnected', last_sync timestamptz,
  unique(user_id, provider, external_id)
);
create table public.activity_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  app text not null, category text not null, started_at timestamptz not null, ended_at timestamptz not null,
  created_at timestamptz not null default now(), check (ended_at >= started_at),
  check (category in ('Development','Study','School','Research','Business','Marketing','Communication','Entertainment','Other','Idle'))
);
create table public.metric_snapshots (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  provider text not null, metric text not null, day date not null, value numeric not null,
  created_at timestamptz not null default now(), unique(user_id, project_id, provider, metric, day)
);
create index activity_user_started on public.activity_sessions(user_id, started_at desc);
create index metric_user_day on public.metric_snapshots(user_id, day desc);
create index projects_user_repo on public.projects(user_id, repository_full_name);
alter table public.projects enable row level security;
alter table public.integrations enable row level security;
alter table public.activity_sessions enable row level security;
alter table public.metric_snapshots enable row level security;
create policy projects_owner on public.projects for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy integrations_owner on public.integrations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy sessions_owner on public.activity_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy metrics_owner on public.metric_snapshots for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
