create table if not exists public.security_rate_events (
  id bigserial primary key,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (
    action in (
      'post_create',
      'comment_create',
      'post_reaction',
      'comment_reaction',
      'bookmark_toggle',
      'report_submit',
      'follow_create',
      'block_create',
      'notification_create',
      'test_rate_limit'
    )
  ),
  created_at timestamptz not null default now()
);

create index if not exists security_rate_events_actor_action_created_idx
  on public.security_rate_events (actor_user_id, action, created_at desc);

alter table public.security_rate_events enable row level security;

revoke all privileges
  on table public.security_rate_events
  from public, anon, authenticated;

grant all privileges
  on table public.security_rate_events
  to service_role;

create or replace function public.assert_security_rate_limit(
  rate_action text,
  max_events integer,
  rate_window interval
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  recent_count integer;
begin
  if request_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if max_events <= 0 or rate_window <= interval '0 seconds' then
    raise exception using errcode = '22023', message = 'Invalid rate limit';
  end if;

  select count(*)::integer
  into recent_count
  from public.security_rate_events as event
  where event.actor_user_id = request_user_id
    and event.action = rate_action
    and event.created_at > now() - rate_window;

  if recent_count >= max_events then
    raise exception using errcode = 'P0001', message = 'Rate limit exceeded';
  end if;

  insert into public.security_rate_events (actor_user_id, action)
  values (request_user_id, rate_action);
end;
$$;

revoke all
  on function public.assert_security_rate_limit(text, integer, interval)
  from public, anon;

grant execute
  on function public.assert_security_rate_limit(text, integer, interval)
  to authenticated, service_role;

revoke all privileges
  on table public.posts
  from public, anon, authenticated;

grant select
  on table public.posts
  to anon, authenticated;

grant insert (
  content,
  author,
  user_id,
  bgm_url,
  bgm_title,
  mood
)
  on public.posts
  to authenticated;

grant delete
  on table public.posts
  to authenticated;

grant all privileges
  on table public.posts
  to service_role;

revoke all privileges
  on table public.notifications
  from public, anon, authenticated;

grant select, insert
  on table public.notifications
  to authenticated;

grant all privileges
  on table public.notifications
  to service_role;

create or replace function public.enforce_content_write_guards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_account_can_write();

  if tg_table_name = 'posts' then
    perform public.assert_security_rate_limit(
      'post_create',
      10,
      interval '1 hour'
    );
  elsif tg_table_name = 'comments' then
    perform public.assert_security_rate_limit(
      'comment_create',
      30,
      interval '1 hour'
    );
  end if;

  return new;
end;
$$;

revoke all
  on function public.enforce_content_write_guards()
  from public, anon, authenticated;

drop trigger if exists enforce_post_write_guards_trigger on public.posts;
create trigger enforce_post_write_guards_trigger
before insert on public.posts
for each row execute function public.enforce_content_write_guards();

drop trigger if exists enforce_comment_write_guards_trigger on public.comments;
create trigger enforce_comment_write_guards_trigger
before insert on public.comments
for each row execute function public.enforce_content_write_guards();

create or replace function public.enforce_relationship_write_guards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_account_can_write();

  if tg_table_name = 'follows' then
    if new.follower_id = new.following_id then
      raise exception using errcode = '22023', message = 'Cannot follow yourself';
    end if;

    perform public.assert_security_rate_limit(
      'follow_create',
      60,
      interval '1 hour'
    );
  elsif tg_table_name = 'blocks' then
    if new.blocker_id = new.blocked_id then
      raise exception using errcode = '22023', message = 'Cannot block yourself';
    end if;

    perform public.assert_security_rate_limit(
      'block_create',
      60,
      interval '1 hour'
    );
  end if;

  return new;
end;
$$;

revoke all
  on function public.enforce_relationship_write_guards()
  from public, anon, authenticated;

drop trigger if exists enforce_follow_write_guards_trigger on public.follows;
create trigger enforce_follow_write_guards_trigger
before insert on public.follows
for each row execute function public.enforce_relationship_write_guards();

drop trigger if exists enforce_block_write_guards_trigger on public.blocks;
create trigger enforce_block_write_guards_trigger
before insert on public.blocks
for each row execute function public.enforce_relationship_write_guards();

create or replace function public.enforce_notification_write_guards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_account_can_write();
  perform public.assert_security_rate_limit(
    'notification_create',
    60,
    interval '1 hour'
  );
  return new;
end;
$$;

revoke all
  on function public.enforce_notification_write_guards()
  from public, anon, authenticated;

drop trigger if exists enforce_notification_write_guards_trigger
  on public.notifications;
create trigger enforce_notification_write_guards_trigger
before insert on public.notifications
for each row execute function public.enforce_notification_write_guards();

create or replace function public.toggle_post_like(
  target_post_id uuid
)
returns table (liked boolean, total_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  existing_legacy_credit boolean;
begin
  perform public.assert_account_can_write();
  perform public.assert_security_rate_limit(
    'post_reaction',
    120,
    interval '1 hour'
  );

  perform 1
  from public.posts as post
  where post.id = target_post_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Post not found';
  end if;

  select post_like.legacy_credit
  into existing_legacy_credit
  from public.post_likes as post_like
  where post_like.user_id = request_user_id
    and post_like.post_id = target_post_id;

  if found then
    if existing_legacy_credit then
      update public.posts as post
      set legacy_likes_count = post.legacy_likes_count + 1
      where post.id = target_post_id;
    end if;

    delete from public.post_likes as post_like
    where post_like.user_id = request_user_id
      and post_like.post_id = target_post_id;

    return query
    select false, coalesce(post.likes_count, 0)::integer
    from public.posts as post
    where post.id = target_post_id;
    return;
  end if;

  insert into public.post_likes (user_id, post_id)
  values (request_user_id, target_post_id);

  return query
  select true, coalesce(post.likes_count, 0)::integer
  from public.posts as post
  where post.id = target_post_id;
end;
$$;

revoke all
  on function public.toggle_post_like(uuid)
  from public, anon;

grant execute
  on function public.toggle_post_like(uuid)
  to authenticated, service_role;

create or replace function public.toggle_comment_like(
  target_comment_id uuid
)
returns table (liked boolean, total_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  existing_legacy_credit boolean;
begin
  perform public.assert_account_can_write();
  perform public.assert_security_rate_limit(
    'comment_reaction',
    120,
    interval '1 hour'
  );

  perform 1
  from public.comments as comment
  where comment.id = target_comment_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Comment not found';
  end if;

  select comment_like.legacy_credit
  into existing_legacy_credit
  from public.comment_likes as comment_like
  where comment_like.user_id = request_user_id
    and comment_like.comment_id = target_comment_id;

  if found then
    if existing_legacy_credit then
      update public.comments as comment
      set legacy_likes_count = comment.legacy_likes_count + 1
      where comment.id = target_comment_id;
    end if;

    delete from public.comment_likes as comment_like
    where comment_like.user_id = request_user_id
      and comment_like.comment_id = target_comment_id;

    return query
    select false, coalesce(comment.likes_count, 0)::integer
    from public.comments as comment
    where comment.id = target_comment_id;
    return;
  end if;

  insert into public.comment_likes (user_id, comment_id)
  values (request_user_id, target_comment_id);

  return query
  select true, coalesce(comment.likes_count, 0)::integer
  from public.comments as comment
  where comment.id = target_comment_id;
end;
$$;

revoke all
  on function public.toggle_comment_like(uuid)
  from public, anon;

grant execute
  on function public.toggle_comment_like(uuid)
  to authenticated, service_role;

create or replace function public.toggle_post_bookmark(
  target_post_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
begin
  perform public.assert_account_can_write();
  perform public.assert_security_rate_limit(
    'bookmark_toggle',
    120,
    interval '1 hour'
  );

  if not exists (
    select 1
    from public.posts as post
    where post.id = target_post_id
  ) then
    raise exception using errcode = 'P0002', message = 'Post not found';
  end if;

  delete from public.bookmarks as bookmark
  where bookmark.user_id = request_user_id
    and bookmark.post_id = target_post_id;

  if found then
    return false;
  end if;

  insert into public.bookmarks (user_id, post_id)
  values (request_user_id, target_post_id);
  return true;
end;
$$;

revoke all
  on function public.toggle_post_bookmark(uuid)
  from public, anon;

grant execute
  on function public.toggle_post_bookmark(uuid)
  to authenticated, service_role;

create or replace function public.submit_content_report(
  report_target_type text,
  report_target_id uuid,
  report_reason text,
  report_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  reported_user_id uuid;
  reported_content text := '';
  reported_author text := '';
  new_report_id uuid;
begin
  perform public.assert_account_can_write();
  perform public.assert_security_rate_limit(
    'report_submit',
    10,
    interval '1 hour'
  );

  if report_target_type not in ('post', 'comment', 'user') then
    raise exception using errcode = '22023', message = 'Invalid report target';
  end if;

  if report_reason not in (
    'spam',
    'harassment',
    'hate',
    'sexual',
    'violence',
    'personal_info',
    'other'
  ) then
    raise exception using errcode = '22023', message = 'Invalid report reason';
  end if;

  report_details := trim(coalesce(report_details, ''));
  if char_length(report_details) > 500 then
    raise exception using errcode = '22023', message = 'Report details too long';
  end if;

  if report_target_type = 'post' then
    select post.user_id, left(coalesce(post.content, ''), 2000),
      left(coalesce(post.author, ''), 100)
    into reported_user_id, reported_content, reported_author
    from public.posts as post
    where post.id = report_target_id;
  elsif report_target_type = 'comment' then
    select comment.user_id, left(coalesce(comment.content, ''), 2000),
      left(coalesce(comment.user_email, ''), 100)
    into reported_user_id, reported_content, reported_author
    from public.comments as comment
    where comment.id = report_target_id;

    if reported_user_id is null and reported_author <> '' then
      select profile.id
      into reported_user_id
      from public.profiles as profile
      where profile.nickname = split_part(reported_author, '@', 1)
      limit 1;
    end if;
  else
    select profile.id, '사용자 프로필 신고',
      left(coalesce(profile.nickname, ''), 100)
    into reported_user_id, reported_content, reported_author
    from public.profiles as profile
    where profile.id = report_target_id;
  end if;

  if reported_user_id is null then
    raise exception using errcode = 'P0002', message = 'Report target not found';
  end if;

  if reported_user_id = request_user_id then
    raise exception using errcode = '22023', message = 'Cannot report yourself';
  end if;

  insert into public.reports (
    reporter_id,
    target_type,
    target_id,
    target_user_id,
    reason,
    details,
    content_snapshot,
    author_snapshot
  )
  values (
    request_user_id,
    report_target_type,
    report_target_id,
    reported_user_id,
    report_reason,
    report_details,
    reported_content,
    reported_author
  )
  returning id into new_report_id;

  if report_target_type = 'post' then
    update public.posts as post
    set reports_count = coalesce(post.reports_count, 0) + 1
    where post.id = report_target_id;
  elsif report_target_type = 'comment' then
    update public.comments as comment
    set reports_count = coalesce(comment.reports_count, 0) + 1
    where comment.id = report_target_id;
  end if;

  return new_report_id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'Report already submitted';
end;
$$;

revoke all
  on function public.submit_content_report(text, uuid, text, text)
  from public, anon;

grant execute
  on function public.submit_content_report(text, uuid, text, text)
  to authenticated, service_role;
