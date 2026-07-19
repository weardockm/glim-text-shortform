-- Nicknames are display names and may repeat. Profile IDs remain unique.
drop index if exists public.profiles_nickname_key;

create unique index if not exists profiles_custom_id_key
  on public.profiles (custom_id)
  where custom_id is not null and custom_id <> '';

create or replace function public.protect_reserved_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.nickname := trim(coalesce(new.nickname, ''));
  if new.custom_id is not null then
    new.custom_id := trim(new.custom_id);
  end if;

  if new.nickname = '🚨글림 운영자'
    and not public.is_moderator() then
    raise exception using
      errcode = '42501',
      message = 'Reserved profile identity';
  end if;

  if char_length(new.nickname) > 15 then
    raise exception using errcode = '22023', message = 'Invalid nickname';
  end if;

  if char_length(coalesce(new.custom_id, '')) > 20
    or (
      coalesce(new.custom_id, '') <> ''
      and new.custom_id !~ '^[A-Za-z0-9_.]+$'
    ) then
    raise exception using errcode = '22023', message = 'Invalid profile ID';
  end if;

  return new;
end;
$$;

revoke all
  on function public.protect_reserved_profile_identity()
  from public, anon, authenticated;

-- Legacy nickname-only rows are deleted only while the nickname still maps to
-- exactly one profile. ID-backed rows remain safe after nicknames can repeat.
create or replace function public.delete_user_data(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_user_id alias for $1;
  target_nickname text;
  nickname_match_count bigint := 0;
begin
  select profile.nickname
  into target_nickname
  from public.profiles as profile
  where profile.id = requested_user_id;

  if target_nickname is not null then
    select count(*)
    into nickname_match_count
    from public.profiles as profile
    where profile.nickname = target_nickname;
  end if;

  delete from public.reports as report
  where report.reporter_id = requested_user_id
     or report.target_user_id = requested_user_id;

  delete from public.notifications as notification
  where notification.target_user_id = requested_user_id
     or notification.actor_user_id = requested_user_id
     or notification.post_id in (
       select post.id from public.posts as post
       where post.user_id = requested_user_id
     )
     or (
       nickname_match_count = 1
       and (
         notification.target_user = target_nickname
         or notification.actor_nickname = target_nickname
       )
     );

  delete from public.post_likes where user_id = requested_user_id;
  delete from public.comment_likes where user_id = requested_user_id;
  delete from public.bookmarks where user_id = requested_user_id;
  delete from public.push_subscriptions where user_id = requested_user_id;

  delete from public.comments as comment
  where comment.user_id = requested_user_id
     or comment.post_id in (
       select post.id from public.posts as post
       where post.user_id = requested_user_id
     )
     or (
       nickname_match_count = 1
       and comment.user_id is null
       and comment.user_email = target_nickname
     );

  delete from public.follows
  where follower_id = requested_user_id
     or following_id = requested_user_id;
  delete from public.blocks
  where blocker_id = requested_user_id
     or blocked_id = requested_user_id;
  delete from public.posts where user_id = requested_user_id;
  delete from public.profiles where id = requested_user_id;
end;
$$;

revoke all
  on function public.delete_user_data(uuid)
  from public, anon, authenticated;

grant execute
  on function public.delete_user_data(uuid)
  to service_role;
