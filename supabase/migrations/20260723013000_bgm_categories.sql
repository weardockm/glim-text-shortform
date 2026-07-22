alter table public.bgm_tracks
  add column if not exists category text not null default '잔잔한';

alter table public.bgm_tracks
  drop constraint if exists bgm_tracks_category_check;
alter table public.bgm_tracks
  add constraint bgm_tracks_category_check check (
    category in ('잔잔한', '감성', '신나는', '몽환적인', '집중')
  );

drop function if exists public.list_bgm_tracks_for_moderation();
create function public.list_bgm_tracks_for_moderation()
returns table (
  id bigint,
  storage_path text,
  title text,
  artist text,
  category text,
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
    track.category,
    track.sort_order,
    track.is_active,
    track.created_at
  from public.bgm_tracks as track
  order by track.category asc, track.sort_order asc, track.title asc;
end;
$$;

revoke all
  on function public.list_bgm_tracks_for_moderation()
  from public, anon;

grant execute
  on function public.list_bgm_tracks_for_moderation()
  to authenticated, service_role;
