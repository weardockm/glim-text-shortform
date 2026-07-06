with expected_relation(object_name) as (
  values
    ('profiles'),
    ('posts'),
    ('comments'),
    ('follows'),
    ('blocks'),
    ('notifications'),
    ('post_likes'),
    ('comment_likes'),
    ('bookmarks'),
    ('push_subscriptions'),
    ('reports'),
    ('account_deletion_requests')
),
expected_function(object_name) as (
  values
    ('is_moderator'),
    ('sync_authored_display_name'),
    ('toggle_post_like'),
    ('toggle_comment_like'),
    ('toggle_post_bookmark'),
    ('import_legacy_post_like'),
    ('import_legacy_comment_like'),
    ('import_legacy_bookmark'),
    ('submit_content_report'),
    ('moderate_report'),
    ('create_operator_notice'),
    ('delete_operator_notice')
),
expected_bucket(object_name) as (
  values ('avatars'), ('bgm')
),
expected_storage_object(bucket_id, object_name) as (
  values
    ('bgm', 'Paper Cup Piano.mp3'),
    ('bgm', 'Paper Boat After Rain.mp3')
),
expected_edge_function(object_name) as (
  values ('delete-account'), ('send-push')
)
select jsonb_build_object(
  'client_contract',
  jsonb_build_object(
    'relations',
    (
      select jsonb_agg(
        jsonb_build_object(
          'name',
          relation.object_name,
          'exists',
          to_regclass('public.' || relation.object_name) is not null
        )
        order by relation.object_name
      )
      from expected_relation as relation
    ),
    'functions',
    (
      select jsonb_agg(
        jsonb_build_object(
          'name',
          expected.object_name,
          'exists',
          exists(
            select 1
            from pg_proc as procedure
            join pg_namespace as namespace
              on namespace.oid = procedure.pronamespace
            where namespace.nspname = 'public'
              and procedure.proname = expected.object_name
          )
        )
        order by expected.object_name
      )
      from expected_function as expected
    ),
    'storage_buckets',
    (
      select jsonb_agg(
        jsonb_build_object(
          'name',
          expected.object_name,
          'exists',
          exists(
            select 1
            from storage.buckets as bucket
            where bucket.id = expected.object_name
          )
        )
        order by expected.object_name
      )
      from expected_bucket as expected
    ),
    'storage_objects',
    (
      select jsonb_agg(
        jsonb_build_object(
          'bucket',
          expected.bucket_id,
          'name',
          expected.object_name,
          'exists',
          exists(
            select 1
            from storage.objects as stored_object
            where stored_object.bucket_id = expected.bucket_id
              and stored_object.name = expected.object_name
          )
        )
        order by expected.bucket_id, expected.object_name
      )
      from expected_storage_object as expected
    ),
    'edge_functions',
    (
      select jsonb_agg(expected.object_name order by expected.object_name)
      from expected_edge_function as expected
    )
  ),
  'tables',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'table', table_name,
          'columns', columns
        )
        order by table_name
      )
      from (
        select
          column_table.table_name,
          jsonb_agg(
            jsonb_build_object(
              'name', column_table.column_name,
              'type', column_table.data_type,
              'nullable', column_table.is_nullable
            )
            order by column_table.ordinal_position
          ) as columns
        from information_schema.columns as column_table
        where column_table.table_schema = 'public'
        group by column_table.table_name
      ) as public_tables
    ),
    '[]'::jsonb
  ),
  'policies',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'schema', policy.schemaname,
          'table', policy.tablename,
          'name', policy.policyname,
          'roles', policy.roles,
          'command', policy.cmd
        )
        order by policy.schemaname, policy.tablename, policy.policyname
      )
      from pg_policies as policy
      where policy.schemaname in ('public', 'storage')
    ),
    '[]'::jsonb
  ),
  'functions',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'name', routine.routine_name,
          'security_type', routine.security_type
        )
        order by routine.routine_name
      )
      from information_schema.routines as routine
      where routine.routine_schema = 'public'
    ),
    '[]'::jsonb
  ),
  'storage_buckets',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', bucket.id,
          'public', bucket.public,
          'file_size_limit', bucket.file_size_limit,
          'allowed_mime_types', bucket.allowed_mime_types
        )
        order by bucket.id
      )
      from storage.buckets as bucket
    ),
    '[]'::jsonb
  )
) as schema_inventory;
