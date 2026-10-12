---
name: database-schema-design
description: Guides creating or modifying Postgres/Supabase tables, relationships, migrations, and Row Level Security policies. Use whenever a task adds a table or column, changes a relationship, or needs data to be readable/writable by specific users or roles.
---

# Database Schema Design (Supabase / Postgres)

## When to load this
Any new table, new column, new relationship, or any feature that needs its own row-level access rules.

## Procedure

1. **Model the entity, not the screen.** Name tables and columns after real-world concepts, not the UI that happens to display them today.
2. **Write the migration, not a dashboard edit.** Every schema change is a versioned SQL migration file via the Supabase CLI, reviewable like any other code change. Never hand-edit schema directly against a project holding real data.
3. **Decide keys and constraints deliberately:** primary keys, foreign keys with the correct `ON DELETE` behavior (cascade vs. restrict vs. set null — pick based on what should actually happen, don't default blindly), `NOT NULL` where nothing valid, unique constraints wherever double-submission would create a real problem (this also gives you idempotency for free).
4. **Write RLS policies alongside the table, not after.** Enable RLS the moment the table is created, even before the UI exists. Define policies per operation (`select`, `insert`, `update`, `delete`) rather than one broad policy — they usually have different rules.
5. **Performance-proof every policy:**
   - Wrap auth calls in a subquery so Postgres evaluates once per statement, not once per row: use `(select auth.uid())` inside the policy expression rather than a bare `auth.uid()`.
   - Add an index on every column a policy filters or joins on (e.g., the `user_id` / `org_id` column a policy checks against).
   - Test the policy against a table with realistic row counts, not just a handful of seed rows, before considering it done.
6. **Model roles/permissions as data**, not scattered booleans — a `memberships` or `roles` table that RLS policies reference, so adding a new role later doesn't mean touching every policy.
7. **Plan Storage separately from the database.** If the feature involves files, design the bucket + storage policy alongside the table that references it — remember database backups don't cover Storage objects (see `disaster-recovery-planning`).
8. **Backfill plan for existing data**, if the change affects rows that already exist — state explicitly whether old rows need a default, a migration script, or are fine as-is.

## Pitfalls
- RLS disabled "temporarily" during development and never re-enabled.
- A policy that works correctly but silently costs a full table scan per row at scale (missing index, unwrapped auth call).
- Cascading deletes wired up without thinking through whether that's actually the desired behavior (e.g., deleting a user account silently deleting records other users still need).
