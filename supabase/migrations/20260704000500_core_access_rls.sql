do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'follows', 'blocks')
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
  on table public.profiles, public.follows, public.blocks
  from public, anon, authenticated;

grant select (id, nickname, custom_id, avatar_url, updated_at)
  on public.profiles
  to anon, authenticated;

grant insert (id, nickname, custom_id, avatar_url, updated_at),
  update (nickname, custom_id, avatar_url, updated_at)
  on public.profiles
  to authenticated;

grant select
  on table public.follows
  to anon, authenticated;

grant insert, delete
  on table public.follows, public.blocks
  to authenticated;

grant select
  on table public.blocks
  to authenticated;

grant all privileges
  on table public.profiles, public.follows, public.blocks
  to service_role;

create policy "Anyone can read public profile fields"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

create policy "Users can create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Anyone can read follows"
  on public.follows
  for select
  to anon, authenticated
  using (true);

create policy "Users can follow from their own account"
  on public.follows
  for insert
  to authenticated
  with check (follower_id = (select auth.uid()));

create policy "Users can remove their own follows"
  on public.follows
  for delete
  to authenticated
  using (follower_id = (select auth.uid()));

create policy "Users can read their own blocks"
  on public.blocks
  for select
  to authenticated
  using (blocker_id = (select auth.uid()));

create policy "Users can create their own blocks"
  on public.blocks
  for insert
  to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "Users can remove their own blocks"
  on public.blocks
  for delete
  to authenticated
  using (blocker_id = (select auth.uid()));
