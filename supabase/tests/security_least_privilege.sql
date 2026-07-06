begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'target@example.com'),
  ('33333333-3333-4333-8333-333333333333', 'moderator@example.com'),
  ('44444444-4444-4444-8444-444444444444', 'suspended@example.com')
on conflict (id) do nothing;

insert into public.profiles (
  id,
  nickname,
  custom_id,
  moderation_status,
  suspended_until
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'owner',
    'owner',
    'active',
    null
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'target',
    'target',
    'active',
    null
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'moderator',
    'moderator',
    'active',
    null
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'suspended',
    'suspended',
    'suspended',
    now() + interval '1 day'
  )
on conflict (id) do update
set nickname = excluded.nickname,
  custom_id = excluded.custom_id,
  moderation_status = excluded.moderation_status,
  suspended_until = excluded.suspended_until;

insert into public.user_roles (user_id, role)
values ('33333333-3333-4333-8333-333333333333', 'moderator')
on conflict (user_id) do update set role = excluded.role;

insert into public.ugc_policy_acceptances (
  user_id,
  terms_version,
  community_standards_version,
  accepted_at,
  source
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    public.current_ugc_policy_version(),
    public.current_ugc_policy_version(),
    now(),
    'test'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    public.current_ugc_policy_version(),
    public.current_ugc_policy_version(),
    now(),
    'test'
  )
on conflict (user_id) do update
set terms_version = excluded.terms_version,
  community_standards_version = excluded.community_standards_version,
  accepted_at = excluded.accepted_at,
  source = excluded.source;

select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

insert into public.posts (id, content, author, user_id, mood)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '테스트 게시글입니다',
    'target',
    '22222222-2222-4222-8222-222222222222',
    '일상'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '댓글 알림 검증용 게시글입니다',
    'target',
    '22222222-2222-4222-8222-222222222222',
    '일상'
  )
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '', true);

select ok(
  not has_table_privilege('anon', 'public.posts', 'INSERT'),
  'anonymous users cannot write posts'
);
select ok(
  not has_table_privilege('anon', 'public.comments', 'INSERT'),
  'anonymous users cannot write comments'
);
select ok(
  not has_column_privilege('authenticated', 'public.posts', 'likes_count', 'INSERT'),
  'post like counter is not client insertable'
);
select ok(
  not has_column_privilege('authenticated', 'public.posts', 'dislikes_count', 'INSERT'),
  'post comment counter is not client insertable'
);
select ok(
  not has_column_privilege('authenticated', 'public.posts', 'reports_count', 'INSERT'),
  'post report counter is not client insertable'
);
select ok(
  not has_table_privilege('authenticated', 'public.notifications', 'UPDATE'),
  'authenticated users cannot update notifications directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.notifications', 'DELETE'),
  'authenticated users cannot delete notifications directly'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select lives_ok(
  $$
    insert into public.posts (content, author, user_id, mood)
    values (
      '정상 작성 가능한 글입니다',
      'owner',
      '11111111-1111-4111-8111-111111111111',
      '일상'
    )
  $$,
  'active owner can create their own post without counter columns'
);

select throws_ok(
  $$
    insert into public.posts (content, author, user_id, mood)
    values (
      '다른 사용자로 위조한 글입니다',
      'target',
      '22222222-2222-4222-8222-222222222222',
      '일상'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot forge post ownership'
);

select lives_ok(
  $$
    insert into public.comments (post_id, user_id, user_email, content)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'owner',
      '정상 댓글입니다'
    )
  $$,
  'active owner can create their own comment'
);

select lives_ok(
  $$
    insert into public.follows (follower_id, following_id)
    values (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
    on conflict do nothing
  $$,
  'active owner can follow another user'
);

select throws_ok(
  $$
    insert into public.follows (follower_id, following_id)
    values (
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111'
    )
  $$,
  '22023',
  'Cannot follow yourself',
  'self-follow is rejected server-side'
);

select lives_ok(
  $$
    insert into public.blocks (blocker_id, blocked_id)
    values (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
    on conflict do nothing
  $$,
  'active owner can block another user'
);

select throws_ok(
  $$
    insert into public.blocks (blocker_id, blocked_id)
    values (
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111'
    )
  $$,
  '22023',
  'Cannot block yourself',
  'self-block is rejected server-side'
);

select throws_ok(
  $$
    insert into public.notifications (
      target_user,
      target_user_id,
      actor_nickname,
      actor_user_id,
      type,
      post_id
    )
    values (
      'target',
      '22222222-2222-4222-8222-222222222222',
      'owner',
      '11111111-1111-4111-8111-111111111111',
      'comment',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    )
  $$,
  '42501',
  null,
  'notification event validation rejects missing matching comment'
);

select lives_ok(
  $$
    select public.submit_content_report(
      'post',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'spam',
      '반복 광고입니다'
    )
  $$,
  'active owner can submit a verified report through RPC'
);

select throws_ok(
  $$
    select public.moderate_report(
      (select id from public.reports limit 1),
      'dismiss',
      ''
    )
  $$,
  '42501',
  'Moderator only',
  'non-moderator cannot moderate reports'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);

select ok(
  public.is_moderator(),
  'moderator role is backed by user_roles'
);

select lives_ok(
  $$
    select public.moderate_report(
      (select id from public.reports where status = 'pending' limit 1),
      'dismiss',
      ''
    )
  $$,
  'role-backed moderator can resolve a report'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '44444444-4444-4444-8444-444444444444',
  true
);

select throws_ok(
  $$
    insert into public.posts (content, author, user_id, mood)
    values (
      '정지 계정 작성 시도입니다',
      'suspended',
      '44444444-4444-4444-8444-444444444444',
      '일상'
    )
  $$,
  '42501',
  'Account is suspended',
  'suspended users cannot create posts'
);

select throws_ok(
  $$
    insert into public.follows (follower_id, following_id)
    values (
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222'
    )
  $$,
  '42501',
  'Account is suspended',
  'suspended users cannot follow'
);

select throws_ok(
  $$
    select public.toggle_post_like(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  $$,
  '42501',
  'Account is suspended',
  'suspended users cannot react'
);

select throws_ok(
  $$
    select public.submit_content_report(
      'post',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'spam',
      ''
    )
  $$,
  '42501',
  'Account is suspended',
  'suspended users cannot report'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select throws_ok(
  $$
    do $rate$
    begin
      for i in 1..11 loop
        perform public.assert_security_rate_limit(
          'test_rate_limit',
          10,
          interval '1 hour'
        );
      end loop;
    end;
    $rate$
  $$,
  'P0001',
  'Rate limit exceeded',
  'server-side rate limits return a deterministic denial'
);

select * from finish();
rollback;
