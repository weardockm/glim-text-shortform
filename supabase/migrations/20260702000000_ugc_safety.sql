-- UGC safety: user blocking and complete account-data cleanup.

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_cannot_block_self check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_id_idx
  on public.blocks (blocked_id);

alter table public.blocks enable row level security;

drop policy if exists "Users can view their own blocks" on public.blocks;
create policy "Users can view their own blocks"
  on public.blocks
  for select
  to authenticated
  using ((select auth.uid()) = blocker_id);

drop policy if exists "Users can create their own blocks" on public.blocks;
create policy "Users can create their own blocks"
  on public.blocks
  for insert
  to authenticated
  with check (
    (select auth.uid()) = blocker_id
    and blocker_id <> blocked_id
  );

drop policy if exists "Users can remove their own blocks" on public.blocks;
create policy "Users can remove their own blocks"
  on public.blocks
  for delete
  to authenticated
  using ((select auth.uid()) = blocker_id);

alter table public.comments
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists comments_user_id_idx
  on public.comments (user_id);

-- Best-effort link for legacy comments that stored only the nickname.
update public.comments as comment
set user_id = profile.id
from public.profiles as profile
where comment.user_id is null
  and comment.user_email = profile.nickname;

create or replace function public.remove_follows_after_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where
    (follower_id = new.blocker_id and following_id = new.blocked_id)
    or
    (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$;

drop trigger if exists remove_follows_after_block_trigger on public.blocks;
create trigger remove_follows_after_block_trigger
after insert on public.blocks
for each row execute function public.remove_follows_after_block();

create or replace function public.delete_user_data(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_nickname text;
begin
  select nickname
  into target_nickname
  from public.profiles
  where id = target_user_id;

  delete from public.notifications
  where post_id in (
    select id from public.posts where user_id = target_user_id
  )
  or (
    target_nickname is not null
    and (
      target_user = target_nickname
      or actor_nickname = target_nickname
    )
  );

  delete from public.comments
  where user_id = target_user_id
  or post_id in (
    select id from public.posts where user_id = target_user_id
  )
  or (
    target_nickname is not null
    and user_id is null
    and user_email = target_nickname
  );

  delete from public.follows
  where follower_id = target_user_id
     or following_id = target_user_id;

  delete from public.blocks
  where blocker_id = target_user_id
     or blocked_id = target_user_id;

  delete from public.posts where user_id = target_user_id;
  delete from public.profiles where id = target_user_id;
end;
$$;

revoke all on function public.delete_user_data(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid)
  to service_role;
