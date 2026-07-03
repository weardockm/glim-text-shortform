-- Structured UGC reports, server-enforced moderator roles, and account
-- sanctions. Clients submit and review reports only through verified RPCs.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

revoke all privileges
  on table public.user_roles
  from public, anon, authenticated;

grant all privileges
  on table public.user_roles
  to service_role;

insert into public.user_roles (user_id, role)
select auth_user.id, 'admin'
from auth.users as auth_user
where lower(auth_user.email) = 'weardockm@gmail.com'
on conflict (user_id) do update
set role = excluded.role;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles as user_role
    where user_role.user_id = auth.uid()
      and user_role.role in ('admin', 'moderator')
  );
$$;

revoke all
  on function public.is_moderator()
  from public, anon;

grant execute
  on function public.is_moderator()
  to authenticated, service_role;

alter table public.profiles
  add column if not exists moderation_status text not null default 'active',
  add column if not exists suspended_until timestamptz,
  add column if not exists moderation_reason text;

alter table public.profiles
  drop constraint if exists profiles_moderation_status_check;

alter table public.profiles
  add constraint profiles_moderation_status_check
  check (moderation_status in ('active', 'suspended', 'banned'));

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null
    check (target_type in ('post', 'comment', 'user')),
  target_id uuid not null,
  target_user_id uuid references auth.users(id) on delete cascade,
  reason text not null check (
    reason in (
      'spam',
      'harassment',
      'hate',
      'sexual',
      'violence',
      'personal_info',
      'other'
    )
  ),
  details text not null default '' check (char_length(details) <= 500),
  content_snapshot text not null default '',
  author_snapshot text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'actioned', 'dismissed')),
  resolution_action text,
  resolution_note text not null default ''
    check (char_length(resolution_note) <= 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reports_status_created_at_idx
  on public.reports (status, created_at desc);

create index if not exists reports_target_idx
  on public.reports (target_type, target_id);

create index if not exists reports_target_user_id_idx
  on public.reports (target_user_id);

create unique index if not exists reports_one_pending_per_user_target_idx
  on public.reports (reporter_id, target_type, target_id)
  where status = 'pending';

alter table public.reports enable row level security;

revoke all privileges
  on table public.reports
  from public, anon, authenticated;

grant select
  on table public.reports
  to authenticated;

grant all privileges
  on table public.reports
  to service_role;

drop policy if exists "Users can read their submitted reports"
  on public.reports;
create policy "Users can read their submitted reports"
  on public.reports
  for select
  to authenticated
  using (reporter_id = (select auth.uid()));

drop policy if exists "Moderators can read all reports"
  on public.reports;
create policy "Moderators can read all reports"
  on public.reports
  for select
  to authenticated
  using ((select public.is_moderator()));

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
  if request_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

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

  if (
    select count(*)
    from public.reports as recent_report
    where recent_report.reporter_id = request_user_id
      and recent_report.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception using errcode = 'P0001', message = 'Report rate limit exceeded';
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

create or replace function public.moderate_report(
  moderation_report_id uuid,
  moderation_action text,
  moderation_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  selected_report public.reports%rowtype;
begin
  if request_user_id is null or not public.is_moderator() then
    raise exception using errcode = '42501', message = 'Moderator only';
  end if;

  if moderation_action not in (
    'dismiss',
    'delete_content',
    'suspend_7d',
    'ban_user'
  ) then
    raise exception using errcode = '22023', message = 'Invalid moderation action';
  end if;

  moderation_note := trim(coalesce(moderation_note, ''));
  if char_length(moderation_note) > 500 then
    raise exception using errcode = '22023', message = 'Moderation note too long';
  end if;

  select report.*
  into selected_report
  from public.reports as report
  where report.id = moderation_report_id
    and report.status = 'pending'
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Pending report not found';
  end if;

  if moderation_action = 'dismiss' then
    update public.reports as report
    set status = 'dismissed',
      resolution_action = moderation_action,
      resolution_note = moderation_note,
      reviewed_by = request_user_id,
      reviewed_at = now()
    where report.id = moderation_report_id;
    return;
  end if;

  if moderation_action = 'delete_content' then
    if selected_report.target_type = 'post' then
      delete from public.notifications as notification
      where notification.post_id = selected_report.target_id;

      delete from public.comments as comment
      where comment.post_id = selected_report.target_id;

      delete from public.posts as post
      where post.id = selected_report.target_id;
    elsif selected_report.target_type = 'comment' then
      delete from public.comments as comment
      where comment.id = selected_report.target_id;
    else
      raise exception using
        errcode = '22023',
        message = 'User reports cannot delete content';
    end if;
  elsif moderation_action = 'suspend_7d' then
    update public.profiles as profile
    set moderation_status = 'suspended',
      suspended_until = now() + interval '7 days',
      moderation_reason = '신고 검토 조치'
    where profile.id = selected_report.target_user_id;
  elsif moderation_action = 'ban_user' then
    update public.profiles as profile
    set moderation_status = 'banned',
      suspended_until = null,
      moderation_reason = '신고 검토 조치'
    where profile.id = selected_report.target_user_id;
  end if;

  update public.reports as report
  set status = 'actioned',
    resolution_action = moderation_action,
    resolution_note = moderation_note,
    reviewed_by = request_user_id,
    reviewed_at = now()
  where report.status = 'pending'
    and report.target_type = selected_report.target_type
    and report.target_id = selected_report.target_id;
end;
$$;

revoke all
  on function public.moderate_report(uuid, text, text)
  from public, anon;

grant execute
  on function public.moderate_report(uuid, text, text)
  to authenticated, service_role;

create or replace function public.enforce_content_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  current_status text;
  current_suspended_until timestamptz;
begin
  if request_user_id is null or public.is_moderator() then
    return new;
  end if;

  select profile.moderation_status, profile.suspended_until
  into current_status, current_suspended_until
  from public.profiles as profile
  where profile.id = request_user_id;

  if current_status = 'banned' then
    raise exception using errcode = '42501', message = 'Account is banned';
  end if;

  if current_status = 'suspended'
    and current_suspended_until is not null
    and current_suspended_until > now() then
    raise exception using errcode = '42501', message = 'Account is suspended';
  end if;

  if current_status = 'suspended'
    and (
      current_suspended_until is null
      or current_suspended_until <= now()
    ) then
    update public.profiles as profile
    set moderation_status = 'active',
      suspended_until = null,
      moderation_reason = null
    where profile.id = request_user_id;
  end if;

  return new;
end;
$$;

revoke all
  on function public.enforce_content_moderation()
  from public, anon, authenticated;

drop trigger if exists enforce_post_moderation_trigger on public.posts;
create trigger enforce_post_moderation_trigger
before insert on public.posts
for each row execute function public.enforce_content_moderation();

drop trigger if exists enforce_comment_moderation_trigger on public.comments;
create trigger enforce_comment_moderation_trigger
before insert on public.comments
for each row execute function public.enforce_content_moderation();

-- Ensure account deletion also removes report records and snapshots.
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
