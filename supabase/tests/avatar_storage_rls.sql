begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'avatars',
      '11111111-1111-4111-8111-111111111111/avatar.png',
      '11111111-1111-4111-8111-111111111111'
    )
  $$,
  'owner can upload an avatar'
);

set local role anon;
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'avatars'
      and name = '11111111-1111-4111-8111-111111111111/avatar.png'
  ),
  1,
  'public avatar can be read'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

select results_eq(
  $$
    update storage.objects
    set name = '11111111-1111-4111-8111-111111111111/overwritten.png'
    where bucket_id = 'avatars'
      and name = '11111111-1111-4111-8111-111111111111/avatar.png'
    returning name
  $$,
  array[]::text[],
  'another user cannot overwrite the owner avatar'
);

select throws_ok(
  $$
    delete from storage.objects
    where bucket_id = 'avatars'
      and name = '11111111-1111-4111-8111-111111111111/avatar.png'
    returning name
  $$,
  '42501',
  'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'direct storage table delete is blocked for another user; Storage API handles deletion'
);

select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'avatars'
      and name = '11111111-1111-4111-8111-111111111111/avatar.png'
  ),
  1,
  'blocked cross-user direct table delete leaves the avatar unchanged'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'avatars',
      'not-a-user/avatar.png',
      '22222222-2222-4222-8222-222222222222'
    )
  $$,
  '42501',
  null,
  'malformed owner path is rejected'
);

set local role anon;
select throws_ok(
  $$
    select public.toggle_post_like(
      '33333333-3333-4333-8333-333333333333'::uuid
    )
  $$,
  '42501',
  null,
  'anonymous RPC invocation is rejected'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select throws_ok(
  $$
    delete from storage.objects
    where bucket_id = 'avatars'
      and name = '11111111-1111-4111-8111-111111111111/avatar.png'
  $$,
  '42501',
  'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'owner direct storage table delete is blocked; Storage API handles deletion'
);

select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'avatars'
      and name = '11111111-1111-4111-8111-111111111111/avatar.png'
  ),
  1,
  'blocked owner direct delete leaves the avatar unchanged'
);

select * from finish();
rollback;
