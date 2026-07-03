-- Profile owners may edit their public profile fields, but only moderators or
-- trusted server roles may change account sanction fields.

create or replace function public.protect_moderation_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
    and not public.is_moderator()
    and (
      new.moderation_status is distinct from old.moderation_status
      or new.suspended_until is distinct from old.suspended_until
      or new.moderation_reason is distinct from old.moderation_reason
    ) then
    raise exception using
      errcode = '42501',
      message = 'Moderation fields are server managed';
  end if;

  return new;
end;
$$;

revoke all
  on function public.protect_moderation_status()
  from public, anon, authenticated;

drop trigger if exists protect_moderation_status_trigger
  on public.profiles;

create trigger protect_moderation_status_trigger
before update of moderation_status, suspended_until, moderation_reason
on public.profiles
for each row execute function public.protect_moderation_status();
