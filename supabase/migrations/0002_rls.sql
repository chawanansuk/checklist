-- Row Level Security.
--
-- Phase 1 model:
--   * Owner/manager sign in with Supabase Auth (magic link) => role 'authenticated'.
--     They can read/write all operational tables (internal team tool).
--   * anon (not signed in) is denied everywhere.
--   * Trusted server routes (task generation, photo upload) use the service-role
--     key, which bypasses RLS entirely.
--
-- Per-property scoping for managers can be layered on later without a rewrite.

alter table profiles       enable row level security;
alter table properties     enable row level security;
alter table task_templates enable row level security;
alter table task_instances enable row level security;
alter table task_photos    enable row level security;

-- Helper: one policy per table granting full access to authenticated users.
create policy "authenticated all" on profiles
  for all to authenticated using (true) with check (true);

create policy "authenticated all" on properties
  for all to authenticated using (true) with check (true);

create policy "authenticated all" on task_templates
  for all to authenticated using (true) with check (true);

create policy "authenticated all" on task_instances
  for all to authenticated using (true) with check (true);

create policy "authenticated all" on task_photos
  for all to authenticated using (true) with check (true);

-- No policies are defined for the anon role, so anon reads/writes are rejected.
