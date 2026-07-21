begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '77777777-7777-4777-8777-777777777777',
  'new-profile-trigger@example.com',
  '{"avatar_url":"https://example.com/avatar.png"}'::jsonb
);

select ok(
  exists(
    select 1
    from public.profiles
    where id = '77777777-7777-4777-8777-777777777777'
  ),
  'a profile is created when a new auth user is inserted'
);

select is(
  (
    select nickname
    from public.profiles
    where id = '77777777-7777-4777-8777-777777777777'
  ),
  'glim7777'::text,
  'generated nickname is deterministic and respects the current limit'
);

select is(
  (
    select custom_id
    from public.profiles
    where id = '77777777-7777-4777-8777-777777777777'
  ),
  null::text,
  'new profiles do not claim a custom ID before the user chooses one'
);

select is(
  (
    select avatar_url
    from public.profiles
    where id = '77777777-7777-4777-8777-777777777777'
  ),
  'https://example.com/avatar.png'::text,
  'provider avatar metadata is copied to the profile'
);

select * from finish();
rollback;
