-- Read-only RLS audit.
-- Run this file in Supabase Dashboard > SQL Editor and copy the single JSON
-- result. It does not create, update, or delete any database object or row.

with target_relations as (
  select
    namespace.nspname as schema_name,
    relation.relname as table_name,
    relation.oid as relation_oid,
    relation.relrowsecurity as rls_enabled,
    relation.relforcerowsecurity as rls_forced
  from pg_class as relation
  join pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where relation.relkind in ('r', 'p')
    and (
      namespace.nspname = 'public'
      or (
        namespace.nspname = 'storage'
        and relation.relname in ('buckets', 'objects')
      )
    )
),
table_audit as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', relation.schema_name,
      'table', relation.table_name,
      'rls_enabled', relation.rls_enabled,
      'rls_forced', relation.rls_forced,
      'anon', jsonb_build_object(
        'select', has_table_privilege(
          'anon',
          relation.relation_oid,
          'SELECT'
        ),
        'insert', has_table_privilege(
          'anon',
          relation.relation_oid,
          'INSERT'
        ),
        'update', has_table_privilege(
          'anon',
          relation.relation_oid,
          'UPDATE'
        ),
        'delete', has_table_privilege(
          'anon',
          relation.relation_oid,
          'DELETE'
        )
      ),
      'authenticated', jsonb_build_object(
        'select', has_table_privilege(
          'authenticated',
          relation.relation_oid,
          'SELECT'
        ),
        'insert', has_table_privilege(
          'authenticated',
          relation.relation_oid,
          'INSERT'
        ),
        'update', has_table_privilege(
          'authenticated',
          relation.relation_oid,
          'UPDATE'
        ),
        'delete', has_table_privilege(
          'authenticated',
          relation.relation_oid,
          'DELETE'
        )
      )
    )
    order by relation.schema_name, relation.table_name
  ) as value
  from target_relations as relation
),
policy_audit as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', policy.schemaname,
      'table', policy.tablename,
      'policy', policy.policyname,
      'permissive', policy.permissive,
      'roles', to_jsonb(policy.roles),
      'command', policy.cmd,
      'using', policy.qual,
      'with_check', policy.with_check
    )
    order by policy.schemaname, policy.tablename, policy.policyname
  ) as value
  from pg_policies as policy
  where policy.schemaname = 'public'
    or (
      policy.schemaname = 'storage'
      and policy.tablename in ('buckets', 'objects')
  )
),
column_privilege_audit as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', privilege.table_schema,
      'table', privilege.table_name,
      'column', privilege.column_name,
      'role', privilege.grantee,
      'privilege', privilege.privilege_type
    )
    order by privilege.table_schema, privilege.table_name,
      privilege.column_name, privilege.grantee, privilege.privilege_type
  ) as value
  from information_schema.column_privileges as privilege
  where privilege.grantee in ('anon', 'authenticated')
    and (
      privilege.table_schema = 'public'
      or (
        privilege.table_schema = 'storage'
        and privilege.table_name in ('buckets', 'objects')
      )
    )
),
function_audit as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', namespace.nspname,
      'function', routine.proname,
      'arguments', pg_get_function_identity_arguments(routine.oid),
      'security_definer', routine.prosecdef,
      'anon_execute', has_function_privilege(
        'anon',
        routine.oid,
        'EXECUTE'
      ),
      'authenticated_execute', has_function_privilege(
        'authenticated',
        routine.oid,
        'EXECUTE'
      )
    )
    order by namespace.nspname, routine.proname,
      pg_get_function_identity_arguments(routine.oid)
  ) as value
  from pg_proc as routine
  join pg_namespace as namespace
    on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public'
)
select jsonb_pretty(
  jsonb_build_object(
    'tables', coalesce((select value from table_audit), '[]'::jsonb),
    'policies', coalesce((select value from policy_audit), '[]'::jsonb),
    'column_privileges', coalesce(
      (select value from column_privilege_audit),
      '[]'::jsonb
    ),
    'functions', coalesce((select value from function_audit), '[]'::jsonb)
  )
) as rls_audit;
