# Adopted database baseline

`20260701000000_baseline_schema.sql` reconstructs tables that existed before
this repository began recording migrations. It is required for a clean local
reset, but the linked project already has those tables and records migrations
from `20260702020000` onward.

The default linked dry-run correctly refuses to insert this earlier migration:

```text
npx supabase db push --linked --dry-run --yes
```

This is an external release gate, not an accepted migration state. Do not
change remote migration history or apply the baseline until Docker-based local
reset, pgTAP, schema inventory comparison, and explicit approval are complete.

After those checks, choose exactly one reviewed reconciliation path:

1. Mark the adopted baseline as already represented by the linked schema:

   ```text
   npx supabase migration repair 20260701000000 --status applied --linked
   ```

2. Apply all missing migrations explicitly:

   ```text
   npx supabase db push --linked --include-all --dry-run --yes
   npx supabase db push --linked --include-all --yes
   ```

Both choices mutate linked state and require explicit approval. The default
path remains no remote change.
