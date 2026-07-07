drop policy if exists "Comment authors and post owners can delete comments"
  on public.comments;

create policy "Comment authors and post owners can delete comments"
  on public.comments
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.posts as post
      where post.id = comments.post_id
        and post.user_id = (select auth.uid())
    )
  );
