create extension if not exists pgcrypto with schema extensions;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  email_sha256 text,
  user_id uuid,
  provider text,
  request_source text not null,
  status text not null default 'received',
  request_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_deletion_requests_email_sha256_format
    check (email_sha256 is null or email_sha256 ~ '^[0-9a-f]{64}$'),
  constraint account_deletion_requests_source_known
    check (
      request_source in (
        'public_account_delete',
        'apple_manual_revocation_required'
      )
    ),
  constraint account_deletion_requests_status_known
    check (
      status in (
        'received',
        'manual_provider_revocation_required',
        'resolved'
      )
    )
);

create index if not exists account_deletion_requests_created_at_idx
  on public.account_deletion_requests (created_at desc);

create unique index if not exists account_deletion_requests_active_email_source_idx
  on public.account_deletion_requests (email_sha256, request_source)
  where email_sha256 is not null and status <> 'resolved';

alter table public.account_deletion_requests enable row level security;

revoke all
  on table public.account_deletion_requests
  from public, anon, authenticated;

grant insert
  on table public.account_deletion_requests
  to service_role;

create or replace function public.request_account_deletion(
  email text,
  request_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(email));
begin
  if normalized_email = ''
    or normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  then
    return;
  end if;

  insert into public.account_deletion_requests (
    email_sha256,
    request_source,
    request_metadata
  )
  values (
    encode(
      extensions.digest(convert_to(normalized_email, 'utf8'), 'sha256'),
      'hex'
    ),
    'public_account_delete',
    coalesce(request_metadata, '{}'::jsonb)
  )
  on conflict do nothing;
end;
$$;

revoke all
  on function public.request_account_deletion(text, jsonb)
  from public, anon, authenticated;

grant execute
  on function public.request_account_deletion(text, jsonb)
  to anon, authenticated, service_role;

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

  delete from public.reports as report
  where report.reporter_id = requested_user_id
     or report.target_user_id = requested_user_id;

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

  delete from public.post_likes as post_like
  where post_like.user_id = requested_user_id;

  delete from public.comment_likes as comment_like
  where comment_like.user_id = requested_user_id;

  delete from public.bookmarks as bookmark
  where bookmark.user_id = requested_user_id;

  delete from public.push_subscriptions as push_subscription
  where push_subscription.user_id = requested_user_id;

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
