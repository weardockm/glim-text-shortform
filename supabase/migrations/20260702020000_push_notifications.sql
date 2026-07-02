create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  firebase_installation_id text not null unique,
  preferences jsonb not null default
    '{"likes":true,"comments":true,"follows":true,"announcements":true}'::jsonb,
  enabled boolean not null default true,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can read their push subscriptions"
  on public.push_subscriptions;
create policy "Users can read their push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their push subscriptions"
  on public.push_subscriptions;
create policy "Users can create their push subscriptions"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their push subscriptions"
  on public.push_subscriptions;
create policy "Users can update their push subscriptions"
  on public.push_subscriptions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their push subscriptions"
  on public.push_subscriptions;
create policy "Users can delete their push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete
  on public.push_subscriptions
  to authenticated;

create table if not exists public.push_delivery_log (
  dedupe_key text primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete cascade,
  category text not null,
  created_at timestamptz not null default now()
);

alter table public.push_delivery_log enable row level security;
revoke all on public.push_delivery_log from anon, authenticated;

create index if not exists push_delivery_log_created_at_idx
  on public.push_delivery_log (created_at);
