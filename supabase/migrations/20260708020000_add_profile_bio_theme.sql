alter table public.profiles
  add column if not exists bio text;

alter table public.profiles
  add column if not exists theme text not null default 'default';

alter table public.profiles
  drop constraint if exists profiles_bio_length_check;

alter table public.profiles
  add constraint profiles_bio_length_check
  check (char_length(coalesce(bio, '')) <= 60);

alter table public.profiles
  drop constraint if exists profiles_theme_check;

alter table public.profiles
  add constraint profiles_theme_check
  check (theme in ('default', 'lofi_night', 'vintage_analog'));

grant select (id, nickname, custom_id, avatar_url, bio, theme, updated_at)
  on public.profiles
  to anon, authenticated;

grant insert (id, nickname, custom_id, avatar_url, bio, theme, updated_at)
  on public.profiles
  to authenticated;

grant update (nickname, custom_id, avatar_url, bio, theme, updated_at)
  on public.profiles
  to authenticated;
