-- Keep notification ownership tied to immutable Auth user IDs instead of
-- editable/display nicknames, then expose each row only to its recipient.

alter table public.notifications
  add column if not exists target_user_id uuid
    references auth.users(id) on delete cascade,
  add column if not exists actor_user_id uuid
    references auth.users(id) on delete cascade;

-- Prefer the post owner when the notification points to a post.
update public.notifications as notification
set target_user_id = post.user_id
from public.posts as post
where notification.target_user_id is null
  and notification.post_id = post.id
  and post.user_id is not null;

-- Follow notifications and legacy rows have no post, so match their stored
-- nickname to the profile that owned it.
update public.notifications as notification
set target_user_id = profile.id
from public.profiles as profile
where notification.target_user_id is null
  and notification.target_user = profile.nickname;

update public.notifications as notification
set actor_user_id = profile.id
from public.profiles as profile
where notification.actor_user_id is null
  and notification.actor_nickname = profile.nickname;

create index if not exists notifications_target_user_id_created_at_idx
  on public.notifications (target_user_id, created_at desc);

create index if not exists notifications_actor_user_id_idx
  on public.notifications (actor_user_id);

-- Keep older deployed clients working during rollout while preventing clients
-- from impersonating another actor or mismatching an ID and nickname.
create or replace function public.normalize_notification_user_ids()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
begin
  if request_user_id is not null then
    new.actor_user_id := request_user_id;

    select profile.nickname
    into new.actor_nickname
    from public.profiles as profile
    where profile.id = request_user_id;
  end if;

  if new.target_user_id is null then
    select profile.id
    into new.target_user_id
    from public.profiles as profile
    where profile.nickname = new.target_user
    limit 1;
  end if;

  select profile.nickname
  into new.target_user
  from public.profiles as profile
  where profile.id = new.target_user_id;

  return new;
end;
$$;

revoke all
  on function public.normalize_notification_user_ids()
  from public, anon, authenticated;

drop trigger if exists normalize_notification_user_ids_trigger
  on public.notifications;

create trigger normalize_notification_user_ids_trigger
before insert on public.notifications
for each row execute function public.normalize_notification_user_ids();

alter table public.notifications enable row level security;

-- Remove any legacy policy that may have exposed every notification.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
  loop
    execute format(
      'drop policy if exists %I on public.notifications',
      existing_policy.policyname
    );
  end loop;
end;
$$;

revoke all privileges
  on table public.notifications
  from public, anon, authenticated;

grant select, insert
  on table public.notifications
  to authenticated;

grant all privileges
  on table public.notifications
  to service_role;

create policy "Recipients can read their notifications"
  on public.notifications
  for select
  to authenticated
  using (target_user_id = (select auth.uid()));

create policy "Users can create verified notifications"
  on public.notifications
  for insert
  to authenticated
  with check (
    notifications.actor_user_id = (select auth.uid())
    and notifications.target_user_id is not null
    and notifications.target_user_id <> (select auth.uid())
    and notifications.type in ('like', 'comment', 'follow')
    and exists (
      select 1
      from public.profiles as actor_profile
      where actor_profile.id = (select auth.uid())
        and actor_profile.nickname = notifications.actor_nickname
    )
    and exists (
      select 1
      from public.profiles as target_profile
      where target_profile.id = notifications.target_user_id
        and target_profile.nickname = notifications.target_user
    )
    and (
      (
        notifications.type = 'like'
        and notifications.post_id is not null
        and exists (
          select 1
          from public.posts as target_post
          where target_post.id = notifications.post_id
            and target_post.user_id = notifications.target_user_id
        )
      )
      or
      (
        notifications.type = 'comment'
        and notifications.post_id is not null
        and exists (
          select 1
          from public.posts as target_post
          where target_post.id = notifications.post_id
            and target_post.user_id = notifications.target_user_id
        )
        and exists (
          select 1
          from public.comments as actor_comment
          where actor_comment.post_id = notifications.post_id
            and actor_comment.user_id = (select auth.uid())
        )
      )
      or
      (
        notifications.type = 'follow'
        and notifications.post_id is null
        and exists (
          select 1
          from public.follows as actor_follow
          where actor_follow.follower_id = (select auth.uid())
            and actor_follow.following_id = notifications.target_user_id
        )
      )
    )
  );

comment on column public.notifications.target_user_id is
  'Auth user ID of the notification recipient; used by RLS';

comment on column public.notifications.actor_user_id is
  'Auth user ID of the user who caused the notification';
