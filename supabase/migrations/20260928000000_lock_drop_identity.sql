-- ============================================================
-- Drops: only status and responded_at can change after a drop is sent
-- ============================================================
-- The UPDATE policies only check that the caller is the sender (or the
-- receiver) of the row. They put no limit on the other columns, so:
--   - a receiver could set sender_id to anyone, making it look as if that
--     person had dropped them, which unlocked their full card through
--     get_contact_profiles and could satisfy the links INSERT policy
--   - a sender could set receiver_id to anyone, including someone who had
--     blocked them (the block check only runs on INSERT)
--   - either party could rewrite the sender_* contact snapshot
--
-- The app and link_drop only ever change status and responded_at. This
-- trigger rejects any other change made by a signed-in user. Changes made
-- without a user JWT (dashboard, service role, migrations) are not checked.
-- The whole row is compared, minus the two editable columns, so any column
-- that exists live but not in the committed schema is covered too.
-- ============================================================

CREATE OR REPLACE FUNCTION public.drops_restrict_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'status' - 'responded_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'status' - 'responded_at') THEN
    RAISE EXCEPTION 'Only a drop''s status can be changed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger-only function: nobody should be able to call it directly.
REVOKE ALL ON FUNCTION public.drops_restrict_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS drops_restrict_update ON public.drops;

CREATE TRIGGER drops_restrict_update
  BEFORE UPDATE ON public.drops
  FOR EACH ROW
  EXECUTE FUNCTION public.drops_restrict_update();
