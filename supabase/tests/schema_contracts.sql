begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'posts', 'posts table exists');
select has_table('public', 'comments', 'comments table exists');
select has_table('public', 'follows', 'follows table exists');
select has_table('public', 'blocks', 'blocks table exists');
select has_table('public', 'notifications', 'notifications table exists');

select has_column('public', 'profiles', 'avatar_url', 'profiles.avatar_url exists');
select has_column('public', 'posts', 'user_id', 'posts.user_id exists');
select has_column('public', 'comments', 'reports_count', 'comments.reports_count exists');
select has_column('public', 'comments', 'user_id', 'comments.user_id exists');
select has_column(
  'public',
  'notifications',
  'target_user_id',
  'notifications.target_user_id exists'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.posts'::regclass),
  'posts RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.comments'::regclass),
  'comments RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.blocks'::regclass),
  'blocks RLS is enabled'
);

select ok(
  exists(select 1 from storage.buckets where id = 'avatars' and public),
  'avatars is a public bucket'
);
select ok(
  exists(select 1 from storage.buckets where id = 'bgm' and public),
  'bgm is a public bucket'
);
select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Anyone can read bgm'
      and cmd = 'SELECT'
  ),
  'public bgm read policy exists'
);
select ok(
  not exists(
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname ilike '%bgm%'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  'bgm has no client mutation policy'
);
select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Avatar owners can upload'
  ),
  'avatar upload policy exists'
);
select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Anyone can read avatars'
  ),
  'public avatar read policy exists'
);
select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Avatar owners can update'
  ),
  'avatar update policy exists'
);
select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Avatar owners can delete'
  ),
  'avatar delete policy exists'
);

select has_function(
  'public',
  'toggle_post_like',
  array['uuid'],
  'toggle_post_like(uuid) exists'
);
select has_function(
  'public',
  'submit_content_report',
  array['text', 'uuid', 'text', 'text'],
  'submit_content_report contract exists'
);
select has_function('public', 'is_moderator', 'is_moderator() exists');
select has_function(
  'public',
  'delete_user_data',
  array['uuid'],
  'delete_user_data(uuid) exists'
);
select has_function(
  'public',
  'handle_new_user_profile',
  'handle_new_user_profile() exists'
);
select has_function(
  'public',
  'remove_follows_after_block',
  'remove_follows_after_block() exists'
);
select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Anyone can read public profile fields'
  ),
  'final profile read policy exists'
);
select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'follows'
      and policyname = 'Users can follow from their own account'
  ),
  'final follow insert policy exists'
);
select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'blocks'
      and policyname = 'Users can create their own blocks'
  ),
  'final block insert policy exists'
);
select ok(
  not exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and policyname ilike '%baseline%'
  ),
  'no temporary baseline policy survives'
);

select * from finish();
rollback;
