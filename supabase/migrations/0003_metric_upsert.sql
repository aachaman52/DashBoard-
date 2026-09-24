drop index if exists public.cc_metric_unique;
create unique index if not exists cc_metric_project_day on public.cc_daily_metrics(user_id,project_id,provider,metric,day);
