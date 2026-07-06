alter table public.posts
  add column if not exists moderation_status text not null default 'approved',
  add column if not exists moderation_reason text,
  add column if not exists moderation_checked_at timestamptz not null default now();

alter table public.posts
  drop constraint if exists posts_moderation_status_check;

alter table public.posts
  add constraint posts_moderation_status_check
  check (moderation_status in ('approved', 'quarantined', 'rejected'));

alter table public.comments
  add column if not exists moderation_status text not null default 'approved',
  add column if not exists moderation_reason text,
  add column if not exists moderation_checked_at timestamptz not null default now();

alter table public.comments
  drop constraint if exists comments_moderation_status_check;

alter table public.comments
  add constraint comments_moderation_status_check
  check (moderation_status in ('approved', 'quarantined', 'rejected'));

alter table public.reports
  add column if not exists review_due_at timestamptz not null default (now() + interval '24 hours'),
  add column if not exists first_response_at timestamptz,
  add column if not exists last_moderator_action_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists appeal_status text not null default 'none',
  add column if not exists appeal_details text not null default '',
  add column if not exists appealed_at timestamptz,
  add column if not exists retention_until timestamptz not null default (now() + interval '2 years');

alter table public.reports
  drop constraint if exists reports_appeal_status_check;

alter table public.reports
  add constraint reports_appeal_status_check
  check (appeal_status in ('none', 'requested', 'accepted', 'rejected'));

create index if not exists reports_review_due_at_idx
  on public.reports (status, review_due_at);

alter table public.security_rate_events
  drop constraint if exists security_rate_events_action_check;

alter table public.security_rate_events
  add constraint security_rate_events_action_check
  check (
    action in (
      'post_create',
      'comment_create',
      'post_reaction',
      'comment_reaction',
      'bookmark_toggle',
      'report_submit',
      'appeal_request',
      'follow_create',
      'block_create',
      'notification_create',
      'test_rate_limit'
    )
  );

create table if not exists public.ugc_policy_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  community_standards_version text not null,
  accepted_at timestamptz not null default now(),
  source text not null default 'client'
    check (source in ('client', 'admin', 'test', 'service')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ugc_policy_acceptances_versions_idx
  on public.ugc_policy_acceptances (
    terms_version,
    community_standards_version,
    accepted_at desc
  );

alter table public.ugc_policy_acceptances enable row level security;

revoke all privileges
  on table public.ugc_policy_acceptances
  from public, anon, authenticated;

grant all privileges
  on table public.ugc_policy_acceptances
  to service_role;

create table if not exists public.moderation_audit_events (
  id bigserial primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (
    event_type in (
      'ugc_policy_accepted',
      'report_submitted',
      'report_moderated',
      'appeal_requested'
    )
  ),
  target_type text not null default 'system'
    check (target_type in ('system', 'post', 'comment', 'user', 'report')),
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  retention_until timestamptz not null default (now() + interval '2 years')
);

alter table public.moderation_audit_events
  drop constraint if exists moderation_audit_events_event_type_check;

alter table public.moderation_audit_events
  add constraint moderation_audit_events_event_type_check
  check (
    event_type in (
      'ugc_policy_accepted',
      'report_submitted',
      'report_moderated',
      'appeal_requested',
      'content_quarantined'
    )
  );

create index if not exists moderation_audit_events_target_idx
  on public.moderation_audit_events (target_type, target_id, created_at desc);

create index if not exists moderation_audit_events_created_idx
  on public.moderation_audit_events (created_at desc);

alter table public.moderation_audit_events enable row level security;

revoke all privileges
  on table public.moderation_audit_events
  from public, anon, authenticated;

grant select
  on table public.moderation_audit_events
  to authenticated;

grant all privileges
  on table public.moderation_audit_events
  to service_role;

grant insert (id)
  on public.posts
  to authenticated;

drop policy if exists "Report targets can read closed reports"
  on public.reports;
create policy "Report targets can read closed reports"
  on public.reports
  for select
  to authenticated
  using (
    target_user_id = (select auth.uid())
    and status in ('actioned', 'dismissed')
  );

drop policy if exists "Moderators can read moderation audit events"
  on public.moderation_audit_events;
create policy "Moderators can read moderation audit events"
  on public.moderation_audit_events
  for select
  to authenticated
  using ((select public.is_moderator()));

create or replace function public.current_ugc_policy_version()
returns text
language sql
stable
set search_path = ''
as $$
  select '2026-07-06'::text;
$$;

revoke all
  on function public.current_ugc_policy_version()
  from public, anon, authenticated;

grant execute
  on function public.current_ugc_policy_version()
  to authenticated, service_role;

create or replace function public.accept_current_ugc_policy(
  acceptance_source text default 'client'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  current_version text := public.current_ugc_policy_version();
  normalized_source text := coalesce(nullif(trim(acceptance_source), ''), 'client');
begin
  if request_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if normalized_source not in ('client', 'admin', 'test', 'service') then
    raise exception using errcode = '22023', message = 'Invalid acceptance source';
  end if;

  insert into public.ugc_policy_acceptances (
    user_id,
    terms_version,
    community_standards_version,
    accepted_at,
    source,
    updated_at
  )
  values (
    request_user_id,
    current_version,
    current_version,
    now(),
    normalized_source,
    now()
  )
  on conflict (user_id) do update
  set terms_version = excluded.terms_version,
    community_standards_version = excluded.community_standards_version,
    accepted_at = excluded.accepted_at,
    source = excluded.source,
    updated_at = excluded.updated_at;

  insert into public.moderation_audit_events (
    actor_user_id,
    event_type,
    target_type,
    metadata
  )
  values (
    request_user_id,
    'ugc_policy_accepted',
    'system',
    jsonb_build_object('version', current_version, 'source', normalized_source)
  );
end;
$$;

revoke all
  on function public.accept_current_ugc_policy(text)
  from public, anon;

grant execute
  on function public.accept_current_ugc_policy(text)
  to authenticated, service_role;

create or replace function public.get_ugc_policy_acceptance_status()
returns table (
  accepted boolean,
  current_terms_version text,
  current_community_standards_version text,
  accepted_terms_version text,
  accepted_community_standards_version text,
  accepted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    acceptance.terms_version = public.current_ugc_policy_version()
      and acceptance.community_standards_version = public.current_ugc_policy_version()
      as accepted,
    public.current_ugc_policy_version() as current_terms_version,
    public.current_ugc_policy_version() as current_community_standards_version,
    acceptance.terms_version as accepted_terms_version,
    acceptance.community_standards_version as accepted_community_standards_version,
    acceptance.accepted_at
  from (select auth.uid() as user_id) as request_user
  left join public.ugc_policy_acceptances as acceptance
    on acceptance.user_id = request_user.user_id
  where request_user.user_id is not null;
$$;

revoke all
  on function public.get_ugc_policy_acceptance_status()
  from public, anon;

grant execute
  on function public.get_ugc_policy_acceptance_status()
  to authenticated, service_role;

create or replace function public.assert_current_ugc_policy_accepted()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  current_version text := public.current_ugc_policy_version();
begin
  if request_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.ugc_policy_acceptances as acceptance
    where acceptance.user_id = request_user_id
      and acceptance.terms_version = current_version
      and acceptance.community_standards_version = current_version
  ) then
    raise exception using
      errcode = '42501',
      message = 'UGC policy acceptance required';
  end if;
end;
$$;

revoke all
  on function public.assert_current_ugc_policy_accepted()
  from public, anon, authenticated;

create or replace function public.assert_ugc_content_allowed(
  content_kind text,
  raw_content text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_content text := trim(coalesce(raw_content, ''));
  content_length integer := char_length(trim(coalesce(raw_content, '')));
  control_probe text := regexp_replace(coalesce(raw_content, ''), '[\n\r\t]', '', 'g');
begin
  if content_kind not in ('post', 'comment') then
    raise exception using errcode = '22023', message = 'Invalid content kind';
  end if;

  if content_kind = 'post' and (content_length < 5 or content_length > 120) then
    raise exception using errcode = '22023', message = 'Content length is not allowed';
  end if;

  if content_kind = 'comment' and (content_length < 1 or content_length > 500) then
    raise exception using errcode = '22023', message = 'Content length is not allowed';
  end if;

  if control_probe ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Content violates community standards';
  end if;

  if normalized_content ~* '(https?://|www\.|[[:alnum:]_-]+\.[[:alpha:]]{2,})' then
    raise exception using errcode = '22023', message = 'Content violates community standards';
  end if;

  if normalized_content ~ '(.)\1{7,}' then
    raise exception using errcode = '22023', message = 'Content violates community standards';
  end if;

  if normalized_content ~* '(카지노|바카라|도박|무료\s*머니|가입\s*코드|텔레그램|카톡\s*문의|시발|씨발|병신|개새끼|좆|강간|살해|죽여|자살|섹스|음란|rape|porn|casino|telegram)' then
    raise exception using errcode = '22023', message = 'Content violates community standards';
  end if;
end;
$$;

revoke all
  on function public.assert_ugc_content_allowed(text, text)
  from public, anon, authenticated;

create or replace function public.enforce_content_write_guards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then
    return new;
  end if;

  perform public.assert_account_can_write();
  perform public.assert_current_ugc_policy_accepted();

  if tg_table_name = 'posts' then
    perform public.assert_ugc_content_allowed('post', new.content);
    new.moderation_status := 'approved';
    new.moderation_reason := null;
    new.moderation_checked_at := now();
    perform public.assert_security_rate_limit(
      'post_create',
      10,
      interval '1 hour'
    );
  elsif tg_table_name = 'comments' then
    perform public.assert_ugc_content_allowed('comment', new.content);
    new.moderation_status := 'approved';
    new.moderation_reason := null;
    new.moderation_checked_at := now();
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
before insert or update of content on public.posts
for each row execute function public.enforce_content_write_guards();

drop trigger if exists enforce_comment_write_guards_trigger on public.comments;
create trigger enforce_comment_write_guards_trigger
before insert or update of content on public.comments
for each row execute function public.enforce_content_write_guards();

create or replace function public.request_report_appeal(
  moderation_report_id uuid,
  appeal_text text default ''
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
  perform public.assert_account_can_write();
  perform public.assert_security_rate_limit(
    'appeal_request',
    3,
    interval '24 hours'
  );

  appeal_text := trim(coalesce(appeal_text, ''));
  if char_length(appeal_text) < 5 or char_length(appeal_text) > 500 then
    raise exception using errcode = '22023', message = 'Appeal details length is not allowed';
  end if;

  select report.*
  into selected_report
  from public.reports as report
  where report.id = moderation_report_id
    and report.status in ('actioned', 'dismissed')
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Closed report not found';
  end if;

  if request_user_id not in (selected_report.reporter_id, selected_report.target_user_id) then
    raise exception using errcode = '42501', message = 'Appeal is not allowed';
  end if;

  if selected_report.appeal_status = 'requested' then
    raise exception using errcode = '23505', message = 'Appeal already requested';
  end if;

  update public.reports as report
  set appeal_status = 'requested',
    appeal_details = appeal_text,
    appealed_at = now(),
    last_moderator_action_at = coalesce(report.last_moderator_action_at, report.reviewed_at)
  where report.id = moderation_report_id;

  insert into public.moderation_audit_events (
    actor_user_id,
    event_type,
    target_type,
    target_id,
    metadata
  )
  values (
    request_user_id,
    'appeal_requested',
    'report',
    moderation_report_id,
    jsonb_build_object(
      'target_type',
      selected_report.target_type,
      'target_id',
      selected_report.target_id,
      'target_user_id',
      selected_report.target_user_id
    )
  );
end;
$$;

revoke all
  on function public.request_report_appeal(uuid, text)
  from public, anon;

grant execute
  on function public.request_report_appeal(uuid, text)
  to authenticated, service_role;

create or replace function public.quarantine_content_item(
  content_kind text,
  content_id uuid,
  quarantine_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  target_author_id uuid;
begin
  if request_user_id is null or not public.is_moderator() then
    raise exception using errcode = '42501', message = 'Moderator only';
  end if;

  if content_kind not in ('post', 'comment') then
    raise exception using errcode = '22023', message = 'Invalid content kind';
  end if;

  quarantine_reason := trim(coalesce(quarantine_reason, ''));
  if char_length(quarantine_reason) > 500 then
    raise exception using errcode = '22023', message = 'Moderation note too long';
  end if;

  if content_kind = 'post' then
    update public.posts as post
    set moderation_status = 'quarantined',
      moderation_reason = nullif(quarantine_reason, ''),
      moderation_checked_at = now()
    where post.id = content_id
    returning post.user_id into target_author_id;
  else
    update public.comments as comment
    set moderation_status = 'quarantined',
      moderation_reason = nullif(quarantine_reason, ''),
      moderation_checked_at = now()
    where comment.id = content_id
    returning comment.user_id into target_author_id;
  end if;

  if target_author_id is null then
    raise exception using errcode = 'P0002', message = 'Content not found';
  end if;

  insert into public.moderation_audit_events (
    actor_user_id,
    event_type,
    target_type,
    target_id,
    metadata
  )
  values (
    request_user_id,
    'content_quarantined',
    content_kind,
    content_id,
    jsonb_build_object(
      'reason',
      quarantine_reason,
      'target_user_id',
      target_author_id
    )
  );
end;
$$;

revoke all
  on function public.quarantine_content_item(text, uuid, text)
  from public, anon;

grant execute
  on function public.quarantine_content_item(text, uuid, text)
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
    author_snapshot,
    review_due_at,
    retention_until
  )
  values (
    request_user_id,
    report_target_type,
    report_target_id,
    reported_user_id,
    report_reason,
    report_details,
    reported_content,
    reported_author,
    now() + interval '24 hours',
    now() + interval '2 years'
  )
  returning id into new_report_id;

  insert into public.moderation_audit_events (
    actor_user_id,
    event_type,
    target_type,
    target_id,
    metadata
  )
  values (
    request_user_id,
    'report_submitted',
    report_target_type,
    report_target_id,
    jsonb_build_object(
      'report_id',
      new_report_id,
      'reason',
      report_reason,
      'target_user_id',
      reported_user_id
    )
  );

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
    'quarantine_content',
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
      reviewed_at = now(),
      first_response_at = coalesce(report.first_response_at, now()),
      last_moderator_action_at = now(),
      closed_at = now()
    where report.id = moderation_report_id;
  else
    if moderation_action = 'quarantine_content' then
      if selected_report.target_type = 'post' then
        update public.posts as post
        set moderation_status = 'quarantined',
          moderation_reason = nullif(moderation_note, ''),
          moderation_checked_at = now()
        where post.id = selected_report.target_id;
      elsif selected_report.target_type = 'comment' then
        update public.comments as comment
        set moderation_status = 'quarantined',
          moderation_reason = nullif(moderation_note, ''),
          moderation_checked_at = now()
        where comment.id = selected_report.target_id;
      else
        raise exception using
          errcode = '22023',
          message = 'User reports cannot quarantine content';
      end if;
    elsif moderation_action = 'delete_content' then
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
      reviewed_at = now(),
      first_response_at = coalesce(report.first_response_at, now()),
      last_moderator_action_at = now(),
      closed_at = now()
    where report.status = 'pending'
      and report.target_type = selected_report.target_type
      and report.target_id = selected_report.target_id;
  end if;

  insert into public.moderation_audit_events (
    actor_user_id,
    event_type,
    target_type,
    target_id,
    metadata
  )
  values (
    request_user_id,
    'report_moderated',
    'report',
    moderation_report_id,
    jsonb_build_object(
      'action',
      moderation_action,
      'target_type',
      selected_report.target_type,
      'target_id',
      selected_report.target_id,
      'target_user_id',
      selected_report.target_user_id
    )
  );
end;
$$;

revoke all
  on function public.moderate_report(uuid, text, text)
  from public, anon;

grant execute
  on function public.moderate_report(uuid, text, text)
  to authenticated, service_role;
