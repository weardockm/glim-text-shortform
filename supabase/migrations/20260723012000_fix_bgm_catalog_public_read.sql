drop policy if exists "Active BGM tracks are publicly readable"
  on public.bgm_tracks;
create policy "Active BGM tracks are publicly readable"
  on public.bgm_tracks
  for select
  to anon, authenticated
  using (is_active);

create or replace function public.list_bgm_tracks_for_moderation()
returns table (
  id bigint,
  storage_path text,
  title text,
  artist text,
  sort_order integer,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_moderator() then
    raise exception using
      errcode = '42501',
      message = 'Moderator access required';
  end if;

  return query
  select
    track.id,
    track.storage_path,
    track.title,
    track.artist,
    track.sort_order,
    track.is_active,
    track.created_at
  from public.bgm_tracks as track
  order by track.sort_order asc, track.title asc;
end;
$$;

revoke all
  on function public.list_bgm_tracks_for_moderation()
  from public, anon;

grant execute
  on function public.list_bgm_tracks_for_moderation()
  to authenticated, service_role;
