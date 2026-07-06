begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

select has_table(
  'public',
  'account_deletion_requests',
  'account_deletion_requests table exists for public deletion requests'
);

select has_function(
  'public',
  'request_account_deletion',
  array['text', 'jsonb'],
  'request_account_deletion(text, jsonb) exists'
);

select lives_ok(
  $$ select public.request_account_deletion('Person@Example.COM', '{"source":"pgtap"}'::jsonb) $$,
  'public deletion request accepts email without revealing account existence'
);

select lives_ok(
  $$ select public.request_account_deletion('person@example.com', '{"source":"retry"}'::jsonb) $$,
  'duplicate public deletion request is idempotent'
);

select is(
  (
    select count(*)
    from public.account_deletion_requests
    where request_source = 'public_account_delete'
      and email_sha256 = encode(
        extensions.digest(convert_to('person@example.com', 'utf8'), 'sha256'),
        'hex'
      )
  ),
  1::bigint,
  'public deletion request stores one normalized hash only'
);

select is(
  (
    select status
    from public.account_deletion_requests
    where request_source = 'public_account_delete'
      and email_sha256 = encode(
        extensions.digest(convert_to('person@example.com', 'utf8'), 'sha256'),
        'hex'
      )
  ),
  'received'::text,
  'public deletion request audit state remains received after duplicate retry'
);

select ok(
  not has_table_privilege('anon', 'public.account_deletion_requests', 'SELECT'),
  'anon cannot read deletion requests'
);

insert into auth.users (id, email)
values
  ('55555555-5555-4555-8555-555555555555', 'delete-me@example.com'),
  ('66666666-6666-4666-8666-666666666666', 'delete-other@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, nickname, custom_id, avatar_url)
values
  (
    '55555555-5555-4555-8555-555555555555',
    'delete-me',
    'delete_me',
    'https://qdnpeliqtxdglqewbvgg.supabase.co/storage/v1/object/public/avatars/55555555-5555-4555-8555-555555555555/avatar.webp'
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'delete-other',
    'delete_other',
    null
  )
on conflict (id) do update
set nickname = excluded.nickname,
  custom_id = excluded.custom_id,
  avatar_url = excluded.avatar_url;

insert into public.ugc_policy_acceptances (
  user_id,
  terms_version,
  community_standards_version,
  accepted_at,
  source
)
values
  (
    '55555555-5555-4555-8555-555555555555',
    public.current_ugc_policy_version(),
    public.current_ugc_policy_version(),
    now(),
    'test'
  ),
  (
    '66666666-6666-4666-8666-666666666666',
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
  '55555555-5555-4555-8555-555555555555',
  true
);

insert into public.posts (id, content, author, user_id, mood)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '삭제 대상 사용자의 글입니다',
  'delete-me',
  '55555555-5555-4555-8555-555555555555',
  '일상'
) on conflict (id) do nothing;

insert into public.comments (id, post_id, user_id, user_email, content)
values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '55555555-5555-4555-8555-555555555555',
  'delete-me',
  '삭제 대상 댓글입니다'
) on conflict (id) do nothing;

insert into public.post_likes (user_id, post_id)
values (
  '55555555-5555-4555-8555-555555555555',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
) on conflict do nothing;

insert into public.comment_likes (user_id, comment_id)
values (
  '55555555-5555-4555-8555-555555555555',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
) on conflict do nothing;

insert into public.bookmarks (user_id, post_id)
values (
  '55555555-5555-4555-8555-555555555555',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
) on conflict do nothing;

insert into public.follows (follower_id, following_id)
values (
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666'
) on conflict do nothing;

insert into public.blocks (blocker_id, blocked_id)
values (
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666'
) on conflict do nothing;

insert into public.notifications (
  target_user,
  target_user_id,
  actor_nickname,
  actor_user_id,
  type,
  post_id
)
values (
  'delete-other',
  '66666666-6666-4666-8666-666666666666',
  'delete-me',
  '55555555-5555-4555-8555-555555555555',
  'follow',
  null
) on conflict do nothing;

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
  '55555555-5555-4555-8555-555555555555',
  'post',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '55555555-5555-4555-8555-555555555555',
  'spam',
  '삭제 테스트',
  '삭제 대상',
  'delete-me'
) on conflict do nothing;

insert into public.push_subscriptions (
  user_id,
  firebase_installation_id,
  enabled,
  preferences
)
values (
  '55555555-5555-4555-8555-555555555555',
  'delete-me-fid',
  true,
  '{"likes":true,"comments":true,"follows":true,"announcements":true}'::jsonb
) on conflict (firebase_installation_id) do update
set user_id = excluded.user_id,
  enabled = excluded.enabled,
  preferences = excluded.preferences;

select set_config('request.jwt.claim.sub', '', true);

select lives_ok(
  $$ select public.delete_user_data('55555555-5555-4555-8555-555555555555') $$,
  'delete_user_data cleanup is idempotent for a fully populated account'
);

select lives_ok(
  $$ select public.delete_user_data('55555555-5555-4555-8555-555555555555') $$,
  'delete_user_data duplicate retry is a safe no-op after cleanup'
);

select is((select count(*) from public.profiles where id = '55555555-5555-4555-8555-555555555555'), 0::bigint, 'profile is removed');
select is((select count(*) from public.posts where user_id = '55555555-5555-4555-8555-555555555555'), 0::bigint, 'authored posts are removed');
select is((select count(*) from public.comments where user_id = '55555555-5555-4555-8555-555555555555'), 0::bigint, 'authored comments are removed');
select is((select count(*) from public.post_likes where user_id = '55555555-5555-4555-8555-555555555555'), 0::bigint, 'post likes are removed');
select is((select count(*) from public.comment_likes where user_id = '55555555-5555-4555-8555-555555555555'), 0::bigint, 'comment likes are removed');
select is((select count(*) from public.bookmarks where user_id = '55555555-5555-4555-8555-555555555555'), 0::bigint, 'bookmarks are removed');
select is((select count(*) from public.follows where follower_id = '55555555-5555-4555-8555-555555555555' or following_id = '55555555-5555-4555-8555-555555555555'), 0::bigint, 'follows are removed');
select is((select count(*) from public.blocks where blocker_id = '55555555-5555-4555-8555-555555555555' or blocked_id = '55555555-5555-4555-8555-555555555555'), 0::bigint, 'blocks are removed');
select is((select count(*) from public.notifications where target_user_id = '55555555-5555-4555-8555-555555555555' or actor_user_id = '55555555-5555-4555-8555-555555555555' or target_user = 'delete-me' or actor_nickname = 'delete-me'), 0::bigint, 'notifications are removed by UUID and nickname linkage');
select is((select count(*) from public.reports where reporter_id = '55555555-5555-4555-8555-555555555555' or target_user_id = '55555555-5555-4555-8555-555555555555'), 0::bigint, 'report linkage is removed');
select is((select count(*) from public.push_subscriptions where user_id = '55555555-5555-4555-8555-555555555555'), 0::bigint, 'push subscriptions are removed before auth deletion');

select * from finish();
rollback;
