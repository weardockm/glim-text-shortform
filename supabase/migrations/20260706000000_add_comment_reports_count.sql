alter table public.comments
  add column if not exists reports_count integer not null default 0;
