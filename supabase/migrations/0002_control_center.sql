-- Isolated Control Center tables in the existing Aachman Studios Supabase project.
create table if not exists public.cc_projects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null, repository_full_name text, website_url text, vercel_project_id text,
 posthog_project_id text, gsc_property text, created_at timestamptz not null default now(),
 unique(user_id, repository_full_name)
);
create table if not exists public.cc_integrations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null, external_id text not null default '', status text not null default 'not_connected',
 last_sync timestamptz, last_error text, created_at timestamptz not null default now(),
 unique(user_id,provider,external_id)
);
create table if not exists public.cc_commits (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references public.cc_projects(id) on delete cascade,
 sha text not null, title text not null, author text, committed_at timestamptz not null,
 url text, unique(user_id,project_id,sha)
);
create table if not exists public.cc_deployments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid references public.cc_projects(id) on delete cascade,
 external_id text not null, state text not null, url text, deployed_at timestamptz,
 unique(user_id,external_id)
);
create table if not exists public.cc_daily_metrics (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid references public.cc_projects(id) on delete cascade,
 provider text not null, metric text not null, day date not null, value numeric not null,
 dimensions jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create unique index if not exists cc_metric_unique on public.cc_daily_metrics(user_id,coalesce(project_id,'00000000-0000-0000-0000-000000000000'::uuid),provider,metric,day,dimensions);
create table if not exists public.cc_seo_snapshots (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references public.cc_projects(id) on delete cascade,
 page_url text not null, checked_at timestamptz not null default now(), status integer,
 title text, description text, canonical text, has_robots boolean, has_sitemap boolean,
 issues jsonb not null default '[]'::jsonb,
 unique(user_id,project_id,page_url,checked_at)
);
create table if not exists public.cc_marketing_posts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid references public.cc_projects(id) on delete set null, platform text not null,
 external_id text not null, posted_at timestamptz, url text,
 views bigint, reach bigint, interactions bigint, clicks bigint,
 unique(user_id,platform,external_id)
);
create table if not exists public.cc_activity_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid references public.cc_projects(id) on delete set null,
 app text not null, category text not null, started_at timestamptz not null, ended_at timestamptz not null,
 created_at timestamptz not null default now(),
 check(ended_at>=started_at and ended_at<=started_at+interval '24 hours'),
 check(category in ('Development','Study','School','Research','Business','Marketing','Communication','Entertainment','Other','Idle'))
);
create table if not exists public.cc_study_targets (
 user_id uuid primary key references auth.users(id) on delete cascade,
 minutes_per_day integer not null default 0 check(minutes_per_day between 0 and 1440)
);
create table if not exists public.cc_skill_evidence (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 skill text not null, project_id uuid references public.cc_projects(id) on delete set null,
 evidence_type text not null, description text not null, occurred_at timestamptz not null default now(), url text
);
create table if not exists public.cc_alerts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid references public.cc_projects(id) on delete cascade,
 kind text not null, message text not null, created_at timestamptz not null default now(), resolved_at timestamptz
);
create table if not exists public.cc_sync_runs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null, started_at timestamptz not null default now(), ended_at timestamptz,
 status text not null default 'running', error text
);
create table if not exists public.cc_collector_tokens (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 token_hash text not null unique, name text not null default 'Desktop collector',
 created_at timestamptz not null default now(), last_used_at timestamptz, revoked_at timestamptz
);
create index if not exists cc_projects_user on public.cc_projects(user_id);
create index if not exists cc_commits_timeline on public.cc_commits(user_id,committed_at desc);
create index if not exists cc_metrics_history on public.cc_daily_metrics(user_id,day desc);
create index if not exists cc_seo_history on public.cc_seo_snapshots(user_id,checked_at desc);
create index if not exists cc_activity_timeline on public.cc_activity_sessions(user_id,started_at desc);
create index if not exists cc_sync_history on public.cc_sync_runs(user_id,started_at desc);
do $$ declare t text; begin
 foreach t in array array['cc_projects','cc_integrations','cc_commits','cc_deployments','cc_daily_metrics','cc_seo_snapshots','cc_marketing_posts','cc_activity_sessions','cc_study_targets','cc_skill_evidence','cc_alerts','cc_sync_runs','cc_collector_tokens'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t||'_own',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 end loop;
end $$;
