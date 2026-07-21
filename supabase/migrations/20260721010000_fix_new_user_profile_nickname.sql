-- Keep automatically generated profile nicknames within the current 8-character limit.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    nickname,
    custom_id,
    avatar_url,
    updated_at
  )
  values (
    new.id,
    'glim' || left(replace(new.id::text, '-', ''), 4),
    null,
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all
  on function public.handle_new_user_profile()
  from public, anon, authenticated;
