-- Keep server-side profile limits aligned with the edit form.
create or replace function public.protect_reserved_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.nickname := trim(coalesce(new.nickname, ''));
  if new.custom_id is not null then
    new.custom_id := trim(new.custom_id);
  end if;

  if new.nickname = '🚨글림 운영자'
    and not public.is_moderator() then
    raise exception using
      errcode = '42501',
      message = 'Reserved profile identity';
  end if;

  if char_length(new.nickname) > 8 then
    raise exception using errcode = '22023', message = 'Invalid nickname';
  end if;

  if char_length(coalesce(new.custom_id, '')) > 12
    or (
      coalesce(new.custom_id, '') <> ''
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
