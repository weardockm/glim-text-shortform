-- Lock down user-generated content and move engagement mutations behind
-- authenticated, server-verified RPCs.

alter table public.posts
  add column if not exists legacy_likes_count integer not null default 0;

update public.posts
set legacy_likes_count = greatest(coalesce(likes_count, 0), 0)
where legacy_likes_count = 0
  and coalesce(likes_count, 0) > 0;

alter table public.comments
  add column if not exists legacy_likes_count integer not null default 0;

update public.comments
set legacy_likes_count = greatest(coalesce(likes_count, 0), 0)
where legacy_likes_count = 0
  and coalesce(likes_count, 0) > 0;

create table if not exists public.post_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  legacy_credit boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists post_likes_post_id_idx
  on public.post_likes (post_id);

create table if not exists public.comment_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  legacy_credit boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create index if not exists comment_likes_comment_id_idx
  on public.comment_likes (comment_id);

create table if not exists public.bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists bookmarks_post_id_idx
  on public.bookmarks (post_id);

alter table public.post_likes enable row level security;
alter table public.comment_likes enable row level security;
alter table public.bookmarks enable row level security;

revoke all privileges
  on table public.post_likes, public.comment_likes, public.bookmarks
  from public, anon, authenticated;

grant select
  on table public.post_likes, public.comment_likes, public.bookmarks
  to authenticated;

grant all privileges
  on table public.post_likes, public.comment_likes, public.bookmarks
  to service_role;

drop policy if exists "Users can read their post likes"
  on public.post_likes;
create policy "Users can read their post likes"
  on public.post_likes
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can read their comment likes"
  on public.comment_likes;
create policy "Users can read their comment likes"
  on public.comment_likes
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can read their bookmarks"
  on public.bookmarks;
create policy "Users can read their bookmarks"
  on public.bookmarks
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.refresh_post_like_count(
  target_post_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.posts as post
  set likes_count = greatest(post.legacy_likes_count, 0) + (
    select count(*)::integer
    from public.post_likes as post_like
    where post_like.post_id = target_post_id
  )
  where post.id = target_post_id;
$$;

revoke all
  on function public.refresh_post_like_count(uuid)
  from public, anon, authenticated;

create or replace function public.refresh_comment_like_count(
  target_comment_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.comments as comment
  set likes_count = greatest(comment.legacy_likes_count, 0) + (
    select count(*)::integer
    from public.comment_likes as comment_like
    where comment_like.comment_id = target_comment_id
  )
  where comment.id = target_comment_id;
$$;

revoke all
  on function public.refresh_comment_like_count(uuid)
  from public, anon, authenticated;

create or replace function public.refresh_like_count_from_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'post_likes' then
    perform public.refresh_post_like_count(coalesce(new.post_id, old.post_id));
  elsif tg_table_name = 'comment_likes' then
    perform public.refresh_comment_like_count(
      coalesce(new.comment_id, old.comment_id)
    );
  end if;
  return coalesce(new, old);
end;
$$;

revoke all
  on function public.refresh_like_count_from_row()
  from public, anon, authenticated;

drop trigger if exists refresh_post_like_count_trigger
  on public.post_likes;
create trigger refresh_post_like_count_trigger
after insert or delete on public.post_likes
for each row execute function public.refresh_like_count_from_row();

drop trigger if exists refresh_comment_like_count_trigger
  on public.comment_likes;
create trigger refresh_comment_like_count_trigger
after insert or delete on public.comment_likes
for each row execute function public.refresh_like_count_from_row();

create or replace function public.assert_account_can_write()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  account_status text;
  account_suspended_until timestamptz;
begin
  if request_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  select profile.moderation_status, profile.suspended_until
  into account_status, account_suspended_until
  from public.profiles as profile
  where profile.id = request_user_id;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Profile required';
  end if;

  if account_status = 'banned' then
    raise exception using errcode = '42501', message = 'Account is banned';
  end if;

  if account_status = 'suspended'
    and (
      account_suspended_until is null
      or account_suspended_until > now()
    ) then
    raise exception using errcode = '42501', message = 'Account is suspended';
  end if;
end;
$$;

revoke all
  on function public.assert_account_can_write()
  from public, anon, authenticated;

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

create or replace function public.import_legacy_post_like(
  target_post_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  legacy_credit_available boolean := false;
begin
  perform public.assert_account_can_write();

  if exists (
    select 1
    from public.post_likes as post_like
    where post_like.user_id = request_user_id
      and post_like.post_id = target_post_id
  ) then
    return;
  end if;

  select post.legacy_likes_count > 0
  into legacy_credit_available
  from public.posts as post
  where post.id = target_post_id
  for update;

  if not found then
    return;
  end if;

  if legacy_credit_available then
    update public.posts as post
    set legacy_likes_count = post.legacy_likes_count - 1
    where post.id = target_post_id;
  end if;

  insert into public.post_likes (user_id, post_id, legacy_credit)
  values (request_user_id, target_post_id, legacy_credit_available)
  on conflict (user_id, post_id) do nothing;
end;
$$;

revoke all
  on function public.import_legacy_post_like(uuid)
  from public, anon;

grant execute
  on function public.import_legacy_post_like(uuid)
  to authenticated, service_role;

create or replace function public.import_legacy_comment_like(
  target_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  legacy_credit_available boolean := false;
begin
  perform public.assert_account_can_write();

  if exists (
    select 1
    from public.comment_likes as comment_like
    where comment_like.user_id = request_user_id
      and comment_like.comment_id = target_comment_id
  ) then
    return;
  end if;

  select comment.legacy_likes_count > 0
  into legacy_credit_available
  from public.comments as comment
  where comment.id = target_comment_id
  for update;

  if not found then
    return;
  end if;

  if legacy_credit_available then
    update public.comments as comment
    set legacy_likes_count = comment.legacy_likes_count - 1
    where comment.id = target_comment_id;
  end if;

  insert into public.comment_likes (user_id, comment_id, legacy_credit)
  values (request_user_id, target_comment_id, legacy_credit_available)
  on conflict (user_id, comment_id) do nothing;
end;
$$;

revoke all
  on function public.import_legacy_comment_like(uuid)
  from public, anon;

grant execute
  on function public.import_legacy_comment_like(uuid)
  to authenticated, service_role;

create or replace function public.import_legacy_bookmark(
  target_post_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
begin
  perform public.assert_account_can_write();

  insert into public.bookmarks (user_id, post_id)
  select request_user_id, post.id
  from public.posts as post
  where post.id = target_post_id
  on conflict (user_id, post_id) do nothing;
end;
$$;

revoke all
  on function public.import_legacy_bookmark(uuid)
  from public, anon;

grant execute
  on function public.import_legacy_bookmark(uuid)
  to authenticated, service_role;

create or replace function public.refresh_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_post_id uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts as post
  set dislikes_count = (
    select count(*)::integer
    from public.comments as comment
    where comment.post_id = affected_post_id
  )
  where post.id = affected_post_id;
  return coalesce(new, old);
end;
$$;

revoke all
  on function public.refresh_post_comment_count()
  from public, anon, authenticated;

drop trigger if exists refresh_post_comment_count_trigger
  on public.comments;
create trigger refresh_post_comment_count_trigger
after insert or delete on public.comments
for each row execute function public.refresh_post_comment_count();

update public.posts as post
set dislikes_count = (
  select count(*)::integer
  from public.comments as comment
  where comment.post_id = post.id
);

alter table public.posts enable row level security;
alter table public.comments enable row level security;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('posts', 'comments')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      existing_policy.policyname,
      existing_policy.tablename
    );
  end loop;
end;
$$;

revoke all privileges
  on table public.posts, public.comments
  from public, anon, authenticated;

grant select
  on table public.posts, public.comments
  to anon, authenticated;

grant insert (
  content,
  author,
  user_id,
  bgm_url,
  bgm_title,
  mood,
  likes_count,
  dislikes_count,
  reports_count
)
  on public.posts
  to authenticated;

grant delete
  on table public.posts
  to authenticated;

grant insert (post_id, user_id, user_email, content)
  on public.comments
  to authenticated;

grant all privileges
  on table public.posts, public.comments
  to service_role;

create policy "Anyone can read posts"
  on public.posts
  for select
  to anon, authenticated
  using (true);

create policy "Users can create their own posts"
  on public.posts
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and author <> '🚨글림 운영자'
    and author = (
      select profile.nickname
      from public.profiles as profile
      where profile.id = (select auth.uid())
    )
    and char_length(trim(content)) between 5 and 120
    and mood in ('사색', '위로', '우울', '설렘', '일상')
    and coalesce(likes_count, 0) = 0
    and coalesce(dislikes_count, 0) = 0
    and coalesce(reports_count, 0) = 0
  );

create policy "Users can delete their own posts"
  on public.posts
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Anyone can read comments"
  on public.comments
  for select
  to anon, authenticated
  using (true);

create policy "Users can create their own comments"
  on public.comments
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and user_email = (
      select profile.nickname
      from public.profiles as profile
      where profile.id = (select auth.uid())
    )
    and char_length(trim(content)) between 1 and 1000
    and exists (
      select 1
      from public.posts as post
      where post.id = comments.post_id
    )
  );

create or replace function public.sync_authored_display_name(
  previous_nickname text default null
)
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
  on function public.sync_authored_display_name(text)
  from public, anon;

grant execute
  on function public.sync_authored_display_name(text)
  to authenticated, service_role;

create or replace function public.create_operator_notice(
  notice_title text,
  notice_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  new_notice_id uuid;
begin
  if request_user_id is null or not public.is_moderator() then
    raise exception using errcode = '42501', message = 'Moderator only';
  end if;

  notice_title := trim(coalesce(notice_title, ''));
  notice_content := trim(coalesce(notice_content, ''));
  if char_length(notice_title) not between 1 and 100
    or char_length(notice_content) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'Invalid notice content';
  end if;

  insert into public.posts (
    content,
    author,
    user_id,
    likes_count,
    dislikes_count,
    reports_count
  )
  values (
    '[공지]' || notice_title || '|||' || notice_content,
    '🚨글림 운영자',
    request_user_id,
    0,
    0,
    0
  )
  returning id into new_notice_id;

  return new_notice_id;
end;
$$;

revoke all
  on function public.create_operator_notice(text, text)
  from public, anon;

grant execute
  on function public.create_operator_notice(text, text)
  to authenticated, service_role;

create or replace function public.delete_operator_notice(
  notice_post_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_moderator() then
    raise exception using errcode = '42501', message = 'Moderator only';
  end if;

  if not exists (
    select 1
    from public.posts as post
    where post.id = notice_post_id
      and post.author = '🚨글림 운영자'
  ) then
    raise exception using errcode = 'P0002', message = 'Notice not found';
  end if;

  delete from public.notifications as notification
  where notification.post_id = notice_post_id;

  delete from public.comments as comment
  where comment.post_id = notice_post_id;

  delete from public.posts as post
  where post.id = notice_post_id
    and post.author = '🚨글림 운영자';
end;
$$;

revoke all
  on function public.delete_operator_notice(uuid)
  from public, anon;

grant execute
  on function public.delete_operator_notice(uuid)
  to authenticated, service_role;

create or replace function public.protect_reserved_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.nickname := trim(coalesce(new.nickname, ''));
  new.custom_id := trim(coalesce(new.custom_id, ''));

  if new.nickname = '🚨글림 운영자'
    and not public.is_moderator() then
    raise exception using
      errcode = '42501',
      message = 'Reserved profile identity';
  end if;

  if char_length(new.nickname) > 40 then
    raise exception using errcode = '22023', message = 'Invalid nickname';
  end if;

  if char_length(new.custom_id) > 40
    or (
      new.custom_id <> ''
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

drop trigger if exists protect_reserved_profile_identity_insert_trigger
  on public.profiles;
create trigger protect_reserved_profile_identity_insert_trigger
before insert
on public.profiles
for each row execute function public.protect_reserved_profile_identity();

drop trigger if exists protect_reserved_profile_identity_update_trigger
  on public.profiles;
create trigger protect_reserved_profile_identity_update_trigger
before update of nickname, custom_id
on public.profiles
for each row execute function public.protect_reserved_profile_identity();

revoke all privileges
  on table public.profiles
  from public, anon, authenticated;

grant select (id, nickname, custom_id, avatar_url, updated_at)
  on public.profiles
  to anon, authenticated;

grant insert (id, nickname, custom_id, avatar_url, updated_at)
  on public.profiles
  to authenticated;

grant update (nickname, custom_id, avatar_url, updated_at)
  on public.profiles
  to authenticated;

grant all privileges
  on table public.profiles
  to service_role;

revoke all privileges
  on table public.follows
  from public, anon, authenticated;
grant select on table public.follows to anon, authenticated;
grant insert, delete on table public.follows to authenticated;
grant all privileges on table public.follows to service_role;

revoke all privileges
  on table public.blocks
  from public, anon, authenticated;
grant select, insert, delete on table public.blocks to authenticated;
grant all privileges on table public.blocks to service_role;

revoke all privileges
  on table public.push_subscriptions
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.push_subscriptions
  to authenticated;
grant all privileges
  on table public.push_subscriptions
  to service_role;

drop policy if exists "Users can create verified notifications"
  on public.notifications;
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
        and exists (
          select 1
          from public.post_likes as actor_like
          where actor_like.post_id = notifications.post_id
            and actor_like.user_id = (select auth.uid())
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

revoke all
  on function public.handle_new_user_profile()
  from public, anon, authenticated;

revoke all
  on function public.remove_follows_after_block()
  from public, anon, authenticated;
