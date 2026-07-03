-- The notifications.target_user_id column introduced an ambiguous reference
-- with this function's existing RPC parameter. Keep the public RPC signature
-- unchanged for the Edge Function and use an internal alias instead.

create or replace function public.delete_user_data(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_user_id alias for $1;
  target_nickname text;
begin
  select profile.nickname
  into target_nickname
  from public.profiles as profile
  where profile.id = requested_user_id;

  delete from public.notifications as notification
  where notification.target_user_id = requested_user_id
     or notification.actor_user_id = requested_user_id
     or notification.post_id in (
       select post.id
       from public.posts as post
       where post.user_id = requested_user_id
     )
     or (
       target_nickname is not null
       and (
         notification.target_user = target_nickname
         or notification.actor_nickname = target_nickname
       )
     );

  delete from public.comments as comment
  where comment.user_id = requested_user_id
     or comment.post_id in (
       select post.id
       from public.posts as post
       where post.user_id = requested_user_id
     )
     or (
       target_nickname is not null
       and comment.user_id is null
       and comment.user_email = target_nickname
     );

  delete from public.follows as follow
  where follow.follower_id = requested_user_id
     or follow.following_id = requested_user_id;

  delete from public.blocks as block
  where block.blocker_id = requested_user_id
     or block.blocked_id = requested_user_id;

  delete from public.posts as post
  where post.user_id = requested_user_id;

  delete from public.profiles as profile
  where profile.id = requested_user_id;
end;
$$;

revoke all
  on function public.delete_user_data(uuid)
  from public, anon, authenticated;

grant execute
  on function public.delete_user_data(uuid)
  to service_role;
