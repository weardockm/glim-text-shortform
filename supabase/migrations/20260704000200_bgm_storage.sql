insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'bgm',
  'bgm',
  true,
  20971520,
  array['audio/mpeg']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can read bgm" on storage.objects;
create policy "Anyone can read bgm"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'bgm');
