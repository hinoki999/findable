-- ============================================================
-- Drops: a declined drop is invisible to its sender
-- ============================================================
-- Declines must be invisible to the sender. The app never shows them, but the
-- SELECT policy returned the sender's own drop with every column, so a direct
-- API query (GET /rest/v1/drops?sender_id=eq.<me>&select=status) showed
-- status = 'declined'.
--
-- The sender now sees their own drops in every status except 'declined'. The
-- receiver still sees every drop sent to them, including ones they declined.
-- Block filtering is unchanged. Realtime applies this policy too, so the
-- sender also gets no change event when their drop is declined.
--
-- Replaces the policy of the same name from 20260924000000.
--
-- Hiding the row is not enough on its own: a sender could still probe a drop
-- by trying to change it. A hidden declined drop matches 0 rows silently, so
-- every other refusal the sender can hit must look the same:
--   - drops_restrict_update (20260928000000) raised an error when the sender
--     changed a locked column on a drop they can see; it now skips the row
--     silently for the sender, like drops_enforce_status (20260928000300)
--   - the old DELETE policy let either party hard-delete a drop, so a delete
--     returned 1 row for a pending drop and 0 for a declined one (and it also
--     bypassed the 10-second undo rule). The app never hard-deletes drops (it
--     soft-deletes via status = 'deleted', and delete_user() is SECURITY
--     DEFINER), so the policy is removed.
-- ============================================================

DROP POLICY IF EXISTS "Users can view their own drops" ON public.drops;

CREATE POLICY "Users can view their own drops"
  ON public.drops
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
USING (
  (
    auth.uid() = receiver_id
    OR (auth.uid() = sender_id AND status IS DISTINCT FROM 'declined')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = sender_id AND b.blocked_id = receiver_id)
       OR (b.blocker_id = receiver_id AND b.blocked_id = sender_id)
  )
);

DROP POLICY IF EXISTS "Users can delete own drops" ON public.drops;

-- Same as 20260928000000, except that a sender's disallowed change is skipped
-- silently (0 rows) instead of raising. The receiver still gets the error.
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
    IF auth.uid() = OLD.sender_id AND auth.uid() IS DISTINCT FROM OLD.receiver_id THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'Only a drop''s status can be changed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.drops_restrict_update() FROM PUBLIC, anon, authenticated;
