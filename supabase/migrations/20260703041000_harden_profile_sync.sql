-- Preserve a nullable custom profile ID during Auth-triggered profile creation,
-- and expose nickname propagation without an unused legacy argument.

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

  if char_length(new.nickname) > 40 then
    raise exception using errcode = '22023', message = 'Invalid nickname';
  end if;

  if char_length(coalesce(new.custom_id, '')) > 40
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

drop function if exists public.sync_authored_display_name(text);

create function public.sync_authored_display_name()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  current_nickname text;
begin
  if request_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  select profile.nickname
  into current_nickname
  from public.profiles as profile
  where profile.id = request_user_id;

  if current_nickname is null then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  update public.posts as post
  set author = current_nickname
  where post.user_id = request_user_id
    and post.author <> '🚨글림 운영자';

  update public.comments as comment
  set user_email = current_nickname
  where comment.user_id = request_user_id;
end;
$$;

revoke all
  on function public.sync_authored_display_name()
  from public, anon;

grant execute
  on function public.sync_authored_display_name()
  to authenticated, service_role;
