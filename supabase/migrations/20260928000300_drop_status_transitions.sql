-- ============================================================
-- Drops: who may change a drop's status, and to what
-- ============================================================
-- The UPDATE policies let either party set any status. A sender could set
-- their own drop to 'linked' (firing "New Link" pushes to someone who never
-- linked back), move a declined drop back to 'pending' (re-delivering it and
-- re-sending the push), or insert a drop that starts out 'accepted'.
--
-- Rules:
--   Sender     pending          -> deleted   only within 10 seconds of sending (the Undo toast)
--              accepted, linked -> deleted
--   Receiver   pending          -> accepted, declined
--              accepted         -> deleted   (accepted, then changed their mind)
--              linked           -> deleted   ("Delete link" in History, from either side)
--              pending, accepted -> linked   only through link_drop
--   Nobody     declined, deleted -> anything (a decline is final and silent
--              for the sender, so the sender can't act on it either)
--   Inserts by signed-in users start as 'pending', with created_at = now().
--   A disallowed change by the sender is skipped silently rather than raising
--   an error, so it looks the same as aiming at a (hidden) declined drop.
--
-- "Through link_drop" is detected by current_user: inside a SECURITY DEFINER
-- function it is the function's owner; for a direct client update it is
-- 'authenticated'. Changes made without a user JWT (dashboard, service role,
-- migrations) are not checked.
-- ============================================================

CREATE OR REPLACE FUNCTION public.drops_enforce_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_via_definer boolean := current_user <> 'authenticated';
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_via_definer THEN
      IF NEW.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'A new drop must be pending' USING ERRCODE = '42501';
      END IF;
      -- The Undo window is measured from created_at, so the client can't set it
      NEW.created_at := now();
      NEW.responded_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN ('declined', 'deleted') THEN
    -- link_drop (SECURITY DEFINER) marks the received drop linked
    IF NEW.status = 'linked' AND v_via_definer AND OLD.status IN ('pending', 'accepted') THEN
      RETURN NEW;
    END IF;

    IF v_uid = OLD.receiver_id THEN
      IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') THEN
        RETURN NEW;
      END IF;
      IF OLD.status IN ('accepted', 'linked') AND NEW.status = 'deleted' THEN
        RETURN NEW;
      END IF;
    END IF;

    IF v_uid = OLD.sender_id AND NEW.status = 'deleted' THEN
      IF OLD.status IN ('accepted', 'linked') THEN
        RETURN NEW;
      END IF;
      IF OLD.status = 'pending' AND now() - OLD.created_at <= interval '10 seconds' THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- Not allowed. For the sender, skip the row silently (0 rows, no error):
  -- a declined drop is invisible to the sender (20260928000400), so any update
  -- they aim at it matches 0 rows. An error here instead would let the sender
  -- tell "still pending" apart from "declined" by trying to change the drop.
  IF v_uid = OLD.sender_id AND v_uid IS DISTINCT FROM OLD.receiver_id THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'Drop status cannot change from % to %', OLD.status, NEW.status
    USING ERRCODE = '42501';
END;
$function$;

-- Trigger-only function: nobody should be able to call it directly.
REVOKE ALL ON FUNCTION public.drops_enforce_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS drops_enforce_status ON public.drops;

CREATE TRIGGER drops_enforce_status
  BEFORE INSERT OR UPDATE ON public.drops
  FOR EACH ROW
  EXECUTE FUNCTION public.drops_enforce_status();
