create table if not exists public.post_ai_profiles (
  post_id uuid primary key references public.posts(id) on delete cascade,
  model text not null,
  summary text not null default '',
  topics text[] not null default '{}'::text[],
  emotions text[] not null default '{}'::text[],
  tone text not null default '',
  safety_labels text[] not null default '{}'::text[],
  recommendation_vector jsonb not null default '{}'::jsonb,
  analyzed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_ai_profiles_topics_idx
  on public.post_ai_profiles using gin (topics);

create index if not exists post_ai_profiles_emotions_idx
  on public.post_ai_profiles using gin (emotions);

alter table public.post_ai_profiles enable row level security;

drop policy if exists "Anyone can read post ai profiles"
  on public.post_ai_profiles;

create policy "Anyone can read post ai profiles"
  on public.post_ai_profiles
  for select
  to anon, authenticated
  using (true);

grant select on table public.post_ai_profiles to anon, authenticated;
