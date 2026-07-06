drop policy if exists "Anyone can read posts"
  on public.posts;
drop policy if exists "Moderators can read all posts"
  on public.posts;

create policy "Anyone can read approved posts"
  on public.posts
  for select
  to anon, authenticated
  using (moderation_status = 'approved');

create policy "Moderators can read all posts"
  on public.posts
  for select
  to authenticated
  using ((select public.is_moderator()));

drop policy if exists "Anyone can read comments"
  on public.comments;
drop policy if exists "Moderators can read all comments"
  on public.comments;

create policy "Anyone can read approved comments on approved posts"
  on public.comments
  for select
  to anon, authenticated
  using (
    moderation_status = 'approved'
    and exists (
      select 1
      from public.posts as post
      where post.id = comments.post_id
        and post.moderation_status = 'approved'
    )
  );

create policy "Moderators can read all comments"
  on public.comments
  for select
  to authenticated
  using ((select public.is_moderator()));
