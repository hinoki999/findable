-- ============================================================
-- Foreign keys to auth.users for tables that had none
-- ============================================================
-- blocks, user_profiles, user_settings and devices had no FK to auth.users, so
-- deleting a user through the dashboard or Auth admin API left their rows
-- (including PII) behind. reports.reported_id had none either.
--
-- The existing FKs were already validated on the live database
-- (pg_constraint.convalidated = true for all 8), so nothing to validate there.

-- user_settings has rows for users that no longer exist; remove them so the FK
-- can be added as a validated constraint.
DELETE FROM public.user_settings us
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = us.user_id);

-- Owned rows: deleting the user deletes them (matches links, pinned_contacts,
-- reports.reporter_id, and what delete_user() already does by hand).
ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.devices
  ADD CONSTRAINT devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Reports outlive the reported user: keep the report, unlink the user.
ALTER TABLE public.reports
  ALTER COLUMN reported_id DROP NOT NULL,
  ADD CONSTRAINT reports_reported_id_fkey FOREIGN KEY (reported_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- reported_id is nullable only so a report survives the reported user's
-- deletion; new reports must still name someone.
drop policy if exists "Users can create reports" on "public"."reports";

create policy "Users can create reports"
  on "public"."reports"
  as permissive
  for insert
  to public
with check (
  auth.uid() = reporter_id
  AND reported_id IS NOT NULL
);

-- drops had no ON DELETE action, so Postgres refused to delete any user with
-- drops unless delete_user() cleared them first. Cascade instead, so every
-- deletion path behaves the same.
ALTER TABLE public.drops
  DROP CONSTRAINT drops_sender_id_fkey,
  DROP CONSTRAINT drops_receiver_id_fkey,
  ADD CONSTRAINT drops_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT drops_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id) ON DELETE CASCADE;
