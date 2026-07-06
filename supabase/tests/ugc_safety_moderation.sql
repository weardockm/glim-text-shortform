begin;

create extension if not exists pgtap with schema extensions;

select plan(53);

insert into auth.users (id, email)
values
  ('66666666-6666-4666-8666-666666666666', 'writer@example.com'),
  ('77777777-7777-4777-8777-777777777777', 'reader@example.com'),
  ('88888888-8888-4888-8888-888888888888', 'safety-mod@example.com'),
  ('99999999-9999-4999-8999-999999999999', 'suspended@example.com'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'banned@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'flood@example.com'),
  ('10000000-0000-4000-8000-000000000001', 'target-1@example.com'),
  ('10000000-0000-4000-8000-000000000002', 'target-2@example.com'),
  ('10000000-0000-4000-8000-000000000003', 'target-3@example.com'),
  ('10000000-0000-4000-8000-000000000004', 'target-4@example.com'),
  ('10000000-0000-4000-8000-000000000005', 'target-5@example.com'),
  ('10000000-0000-4000-8000-000000000006', 'target-6@example.com'),
  ('10000000-0000-4000-8000-000000000007', 'target-7@example.com'),
  ('10000000-0000-4000-8000-000000000008', 'target-8@example.com'),
  ('10000000-0000-4000-8000-000000000009', 'target-9@example.com'),
  ('10000000-0000-4000-8000-000000000010', 'target-10@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, nickname, custom_id, moderation_status)
values
  ('66666666-6666-4666-8666-666666666666', 'writer', 'writer', 'active'),
  ('77777777-7777-4777-8777-777777777777', 'reader', 'reader', 'active'),
  ('88888888-8888-4888-8888-888888888888', 'safety-mod', 'safety_mod', 'active'),
  ('99999999-9999-4999-8999-999999999999', 'suspended', 'suspended', 'suspended'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'banned', 'banned', 'banned'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'flood', 'flood', 'active'),
  ('10000000-0000-4000-8000-000000000001', 'target1', 'target1', 'active'),
  ('10000000-0000-4000-8000-000000000002', 'target2', 'target2', 'active'),
  ('10000000-0000-4000-8000-000000000003', 'target3', 'target3', 'active'),
  ('10000000-0000-4000-8000-000000000004', 'target4', 'target4', 'active'),
  ('10000000-0000-4000-8000-000000000005', 'target5', 'target5', 'active'),
  ('10000000-0000-4000-8000-000000000006', 'target6', 'target6', 'active'),
  ('10000000-0000-4000-8000-000000000007', 'target7', 'target7', 'active'),
  ('10000000-0000-4000-8000-000000000008', 'target8', 'target8', 'active'),
  ('10000000-0000-4000-8000-000000000009', 'target9', 'target9', 'active'),
  ('10000000-0000-4000-8000-000000000010', 'target10', 'target10', 'active')
on conflict (id) do update
set nickname = excluded.nickname,
  custom_id = excluded.custom_id,
  moderation_status = excluded.moderation_status;

insert into public.user_roles (user_id, role)
values ('88888888-8888-4888-8888-888888888888', 'moderator')
on conflict (user_id) do update set role = excluded.role;

select has_table(
  'public',
  'ugc_policy_acceptances',
  'versioned UGC policy acceptance table exists'
);
select has_table(
  'public',
  'moderation_audit_events',
  'moderation audit trail table exists'
);
select has_function(
  'public',
  'accept_current_ugc_policy',
  array['text'],
  'client can accept current UGC policy through RPC'
);
select has_function(
  'public',
  'get_ugc_policy_acceptance_status',
  'client can read current UGC policy acceptance state'
);
select has_function(
  'public',
  'request_report_appeal',
  array['uuid', 'text'],
  'report participants can request a moderation appeal through RPC'
);
select has_function(
  'public',
  'quarantine_content_item',
  array['text', 'uuid', 'text'],
  'moderators can quarantine content through RPC'
);
select has_column('public', 'reports', 'review_due_at', 'reports have moderator SLA due timestamp');
select has_column('public', 'reports', 'first_response_at', 'reports have first response timestamp');
select has_column('public', 'reports', 'closed_at', 'reports have closure timestamp');
select has_column('public', 'reports', 'appeal_status', 'reports have appeal status metadata');
select has_column('public', 'posts', 'moderation_status', 'posts have moderation status metadata');
select has_column('public', 'comments', 'moderation_status', 'comments have moderation status metadata');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  true
);

select throws_ok(
  $$
    insert into public.posts (content, author, user_id, mood)
    values (
      '약관 동의 전 글입니다',
      'writer',
      '66666666-6666-4666-8666-666666666666',
      '일상'
    )
  $$,
  '42501',
  'UGC policy acceptance required',
  'unaccepted users cannot create posts'
);

reset role;

insert into public.ugc_policy_acceptances (
  user_id,
  terms_version,
  community_standards_version,
  accepted_at,
  source
)
values (
  '66666666-6666-4666-8666-666666666666',
  '2026-07-02',
  '2026-07-02',
  now(),
  'test'
)
on conflict (user_id) do update
set terms_version = excluded.terms_version,
  community_standards_version = excluded.community_standards_version,
  accepted_at = excluded.accepted_at,
  source = excluded.source;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  true
);

select throws_ok(
  $$
    insert into public.posts (content, author, user_id, mood)
    values (
      '구버전 약관 동의 글입니다',
      'writer',
      '66666666-6666-4666-8666-666666666666',
      '일상'
    )
  $$,
  '42501',
  'UGC policy acceptance required',
  'stale policy acceptance cannot create posts'
);

select lives_ok(
  $$ select public.accept_current_ugc_policy('test') $$,
  'current UGC policy can be accepted'
);

select results_eq(
  $$ select accepted from public.get_ugc_policy_acceptance_status() $$,
  $$ values (true) $$,
  'accepted status is true after current acceptance'
);

select lives_ok(
  $$
    insert into public.posts (
      id,
      content,
      author,
      user_id,
      mood
    )
    values (
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '오늘은 조용히 걸으며 마음을 정리했어요',
      'writer',
      '66666666-6666-4666-8666-666666666666',
      '일상'
    )
  $$,
  'accepted clean Korean post publishes'
);

select throws_ok(
  $$
    insert into public.posts (content, author, user_id, mood)
    values (
      '카지노 홍보 https://spam.example 지금 가입하세요',
      'writer',
      '66666666-6666-4666-8666-666666666666',
      '일상'
    )
  $$,
  '22023',
  'Content violates community standards',
  'URL and spam fixture is rejected server-side'
);

select throws_ok(
  $$
    insert into public.posts (content, author, user_id, mood)
    values (
      'www.spam.example 가입 코드 무료머니',
      'writer',
      '66666666-6666-4666-8666-666666666666',
      '일상'
    )
  $$,
  '22023',
  'Content violates community standards',
  'domain-only URL and spam keyword fixture is rejected server-side'
);

select throws_ok(
  $$
    insert into public.comments (post_id, user_id, user_email, content)
    values (
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '66666666-6666-4666-8666-666666666666',
      'writer',
      E'정상처럼 보이지만\u0001제어문자가 있습니다'
    )
  $$,
  '22023',
  'Content violates community standards',
  'control-character fixture is rejected server-side'
);

select lives_ok(
  $$
    insert into public.comments (post_id, user_id, user_email, content)
    values (
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '66666666-6666-4666-8666-666666666666',
      'writer',
      '조용히 공감합니다'
    )
  $$,
  'accepted clean Korean comment publishes'
);

reset role;

select throws_ok(
  $$
    update public.posts
    set content = '수정으로 카지노 홍보를 끼워 넣습니다'
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  $$,
  '22023',
  'Content violates community standards',
  'prohibited post edits are blocked by update guard'
);

select throws_ok(
  $$
    update public.comments
    set content = '댓글 수정으로 telegram 광고를 넣습니다'
    where post_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and user_id = '66666666-6666-4666-8666-666666666666'
  $$,
  '22023',
  'Content violates community standards',
  'prohibited comment edits are blocked by update guard'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '77777777-7777-4777-8777-777777777777',
  true
);
select public.accept_current_ugc_policy('test');

select lives_ok(
  $$
    select public.submit_content_report(
      'post',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'spam',
      '반복 광고처럼 보여 신고합니다'
    )
  $$,
  'another accepted user can report public content'
);

select lives_ok(
  $$
    select public.submit_content_report(
      'user',
      '66666666-6666-4666-8666-666666666666',
      'harassment',
      '프로필 기반 괴롭힘 신고 경로를 확인합니다'
    )
  $$,
  'accepted user can report another user profile'
);

select lives_ok(
  $$
    insert into public.blocks (blocker_id, blocked_id)
    values (
      '77777777-7777-4777-8777-777777777777',
      '66666666-6666-4666-8666-666666666666'
    )
  $$,
  'authenticated user can create a guarded block relationship'
);

select isnt_empty(
  $$ select 1 from public.reports where review_due_at <= created_at + interval '24 hours' $$,
  'report queue has a 24h SLA due timestamp'
);

reset role;

select isnt_empty(
  $$ select 1 from public.moderation_audit_events where event_type = 'report_submitted' $$,
  'report submission writes an audit event'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '77777777-7777-4777-8777-777777777777',
  true
);

select throws_ok(
  $$
    select public.moderate_report(
      (select id from public.reports where status = 'pending' limit 1),
      'dismiss',
      '권한 없는 검토 시도'
    )
  $$,
  '42501',
  'Moderator only',
  'non-moderators cannot resolve reports'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '99999999-9999-4999-8999-999999999999',
  true
);

select throws_ok(
  $$
    select public.submit_content_report(
      'post',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'spam',
      '정지 사용자의 신고 시도'
    )
  $$,
  '42501',
  'Account is suspended',
  'suspended users cannot submit reports'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  true
);

select throws_ok(
  $$
    select public.submit_content_report(
      'post',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'spam',
      '차단 사용자의 신고 시도'
    )
  $$,
  '42501',
  'Account is banned',
  'banned users cannot submit reports'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  true
);
select public.accept_current_ugc_policy('test');

select throws_ok(
  $$
    do $rate$
    declare
      target_index integer;
      target_id uuid;
    begin
      for target_index in 1..11 loop
        target_id := (
          '10000000-0000-4000-8000-' ||
          lpad(target_index::text, 12, '0')
        )::uuid;
        perform public.submit_content_report(
          'user',
          target_id,
          'spam',
          '반복 신고 플러드 검증'
        );
      end loop;
    end;
    $rate$
  $$,
  'P0001',
  'Rate limit exceeded',
  'report flood through submit_content_report is rate-limited server-side'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '88888888-8888-4888-8888-888888888888',
  true
);

select lives_ok(
  $$
    select public.moderate_report(
      (
        select id
        from public.reports
        where status = 'pending'
          and target_type = 'post'
        order by created_at
        limit 1
      ),
      'dismiss',
      '검토 후 기각'
    )
  $$,
  'moderator can resolve the report'
);
select isnt_empty(
  $$
    select 1
    from public.reports
    where status = 'dismissed'
      and reviewed_at is not null
      and first_response_at is not null
      and closed_at is not null
      and last_moderator_action_at is not null
  $$,
  'moderator action timestamps are auditable'
);
select isnt_empty(
  $$ select 1 from public.moderation_audit_events where event_type = 'report_moderated' $$,
  'moderator action writes an audit event'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  true
);

select lives_ok(
  $$
    select public.request_report_appeal(
      (
        select id
        from public.reports
        where status = 'dismissed'
          and target_type = 'post'
        order by reviewed_at desc
        limit 1
      ),
      '신고 대상자로서 재검토를 요청합니다'
    )
  $$,
  'report target can request an appeal after closure'
);

select isnt_empty(
  $$
    select 1
    from public.reports
    where appeal_status = 'requested'
      and appealed_at is not null
      and char_length(appeal_details) >= 5
  $$,
  'appeal request stamps appeal metadata'
);

reset role;

select isnt_empty(
  $$ select 1 from public.moderation_audit_events where event_type = 'appeal_requested' $$,
  'appeal request writes an audit event'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '77777777-7777-4777-8777-777777777777',
  true
);

select lives_ok(
  $$
    select public.submit_content_report(
      'post',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'other',
      '격리 조치 검증을 위한 추가 신고입니다'
    )
  $$,
  'reporter can submit a new report after the prior report is closed'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '88888888-8888-4888-8888-888888888888',
  true
);

select lives_ok(
  $$
    select public.moderate_report(
      (
        select id
        from public.reports
        where status = 'pending'
          and target_type = 'post'
        order by created_at desc
        limit 1
      ),
      'quarantine_content',
      '검토 중 임시 격리'
    )
  $$,
  'moderator can quarantine content from a report'
);

select isnt_empty(
  $$
    select 1
    from public.posts
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and moderation_status = 'quarantined'
      and moderation_checked_at is not null
  $$,
  'quarantine action moves reported post into quarantined status'
);

select lives_ok(
  $$
    select public.quarantine_content_item(
      'post',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '직접 격리 RPC 검증'
    )
  $$,
  'moderator can quarantine content directly'
);

select isnt_empty(
  $$ select 1 from public.moderation_audit_events where event_type = 'content_quarantined' $$,
  'direct quarantine writes an audit event'
);

set local role anon;
select is_empty(
  $$
    select 1
    from public.posts
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  $$,
  'anon cannot read a quarantined post'
);
select is_empty(
  $$
    select 1
    from public.comments
    where post_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  $$,
  'anon cannot read comments attached to a quarantined post'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '77777777-7777-4777-8777-777777777777',
  true
);
select is_empty(
  $$
    select 1
    from public.posts
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  $$,
  'non-moderators cannot read a quarantined post'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '88888888-8888-4888-8888-888888888888',
  true
);
select isnt_empty(
  $$
    select 1
    from public.posts
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and moderation_status = 'quarantined'
  $$,
  'moderators can read quarantined posts for review'
);
select isnt_empty(
  $$
    select 1
    from public.comments
    where post_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  $$,
  'moderators can read comments attached to quarantined posts for review'
);

reset role;
update public.posts
set moderation_status = 'rejected',
  moderation_checked_at = now()
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
update public.comments
set moderation_status = 'rejected',
  moderation_checked_at = now()
where post_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set local role anon;
select is_empty(
  $$
    select 1
    from public.posts
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  $$,
  'anon cannot read a rejected post'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '77777777-7777-4777-8777-777777777777',
  true
);
select is_empty(
  $$
    select 1
    from public.comments
    where post_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  $$,
  'non-moderators cannot read rejected comments'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '88888888-8888-4888-8888-888888888888',
  true
);
select isnt_empty(
  $$
    select 1
    from public.posts
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and moderation_status = 'rejected'
  $$,
  'moderators can read rejected posts for review history'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  true
);
select isnt_empty(
  $$
    select 1
    from public.reports
    where target_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and status = 'actioned'
  $$,
  'report targets can still read closed reports after content quarantine'
);

select ok(
  not has_table_privilege('authenticated', 'public.moderation_audit_events', 'INSERT'),
  'clients cannot forge moderation audit events'
);

select * from finish();
rollback;
