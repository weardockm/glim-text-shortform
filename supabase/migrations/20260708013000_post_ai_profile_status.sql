alter table public.post_ai_profiles
  add column if not exists analysis_status text not null default 'ready',
  add column if not exists error_message text;

alter table public.post_ai_profiles
  drop constraint if exists post_ai_profiles_analysis_status_check;

alter table public.post_ai_profiles
  add constraint post_ai_profiles_analysis_status_check
  check (analysis_status in ('processing', 'ready', 'failed'));
