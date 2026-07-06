create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  custom_id text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_nickname_key
  on public.profiles (nickname);
create unique index if not exists profiles_custom_id_key
  on public.profiles (custom_id)
  where custom_id is not null and custom_id <> '';

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  author text not null,
  user_id uuid references auth.users(id) on delete cascade,
  bgm_url text,
  bgm_title text,
  mood text,
  likes_count integer not null default 0,
  dislikes_count integer not null default 0,
  reports_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists posts_user_id_created_at_idx
  on public.posts (user_id, created_at desc);
create index if not exists posts_created_at_idx
  on public.posts (created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  user_email text not null,
  content text not null,
  likes_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists comments_post_id_created_at_idx
  on public.comments (post_id, created_at);
create index if not exists comments_user_id_idx
  on public.comments (user_id);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_distinct_users check (follower_id <> following_id)
);

create index if not exists follows_following_id_idx
  on public.follows (following_id);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_distinct_users check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_id_idx
  on public.blocks (blocked_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  target_user text not null,
  actor_nickname text not null,
  type text not null,
  post_id uuid references public.posts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

do $bootstrap$
begin
  if to_regprocedure('public.handle_new_user_profile()') is null then
    execute $definition$
      create function public.handle_new_user_profile()
      returns trigger
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      begin
        insert into public.profiles (
          id,
          nickname,
          custom_id,
          avatar_url,
          updated_at
        )
        values (
          new.id,
          'glimmer-' || replace(new.id::text, '-', ''),
          null,
          nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
          now()
        )
        on conflict (id) do nothing;

        return new;
      end;
      $body$
    $definition$;
  end if;
end;
$bootstrap$;

revoke all
  on function public.handle_new_user_profile()
  from public, anon, authenticated;

do $bootstrap$
begin
  if not exists(
    select 1
    from pg_trigger as trigger_row
    where trigger_row.tgrelid = 'auth.users'::regclass
      and trigger_row.tgname = 'on_auth_user_created'
      and not trigger_row.tgisinternal
  ) then
    execute
      'create trigger on_auth_user_created '
      'after insert on auth.users '
      'for each row execute function public.handle_new_user_profile()';
  end if;
end;
$bootstrap$;

do $bootstrap$
begin
  if to_regprocedure('public.remove_follows_after_block()') is null then
    execute $definition$
      create function public.remove_follows_after_block()
      returns trigger
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      begin
        delete from public.follows as follow
        where (
          follow.follower_id = new.blocker_id
          and follow.following_id = new.blocked_id
        )
        or (
          follow.follower_id = new.blocked_id
          and follow.following_id = new.blocker_id
        );

        return new;
      end;
      $body$
    $definition$;
  end if;
end;
$bootstrap$;

revoke all
  on function public.remove_follows_after_block()
  from public, anon, authenticated;

do $bootstrap$
begin
  if not exists(
    select 1
    from pg_trigger as trigger_row
    where trigger_row.tgrelid = 'public.blocks'::regclass
      and trigger_row.tgname = 'remove_follows_after_block_trigger'
      and not trigger_row.tgisinternal
  ) then
    execute
      'create trigger remove_follows_after_block_trigger '
      'after insert on public.blocks '
      'for each row execute function public.remove_follows_after_block()';
  end if;
end;
$bootstrap$;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.notifications enable row level security;
