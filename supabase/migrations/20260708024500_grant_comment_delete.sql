-- Allow authenticated users to execute comment deletion under the existing RLS policy.
grant delete
  on table public.comments
  to authenticated;
