update public.profiles
set theme = 'default'
where theme is distinct from 'default';

alter table public.profiles
  alter column theme set default 'default';

alter table public.profiles
  drop constraint if exists profiles_theme_check;

alter table public.profiles
  add constraint profiles_theme_check
  check (theme = 'default');
