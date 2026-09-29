-- ============================================================
-- Drops: one silent re-drop after a decline, none after the second
-- ============================================================
-- 20260928000500 made a declined drop hold the sender -> receiver slot for
-- good, so the first decline ended it. Now:
--   - a first decline frees the slot: the sender can drop again once, and that
--     re-drop behaves exactly like a first drop
--   - after a second decline, new drops to that person are refused with the
--     same "already dropped" error as an open drop
--
-- The decline count is not stored anywhere. It is the number of 'declined'
-- drops for the pair, which the sender can't see (their SELECT policy excludes
-- declined drops, 20260928000400) and can't change (declined is terminal for
-- signed-in users, 20260928000300). Only this SECURITY DEFINER trigger counts
-- them. Deleting either account removes the rows.
--
-- The refusal copies the unique-index violation in every field PostgREST
-- returns: same code, message and constraint, and no details (Postgres omits
-- the key values from a unique violation on a table with row-level security).
-- The client's existing mapping applies and the two refusals can't be told apart.
-- ============================================================

-- A declined drop no longer holds the slot by itself; only open drops do.
-- Same name, so the client's 23505 mapping still matches.
DROP INDEX IF EXISTS public.drops_one_open_per_pair;

CREATE UNIQUE INDEX drops_one_open_per_pair
  ON public.drops (sender_id, receiver_id)
  WHERE status IN ('pending', 'accepted');

CREATE OR REPLACE FUNCTION public.drops_limit_after_declines()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER            -- must see declined rows, which RLS hides from the sender
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only new drops from the app, which are always 'pending'. link_drop's own
  -- insert is 'linked', so linking back is never refused here.
  IF NEW.status = 'pending' AND (
    SELECT count(*) FROM public.drops d
    WHERE d.sender_id = NEW.sender_id
      AND d.receiver_id = NEW.receiver_id
      AND d.status = 'declined'
  ) >= 2 THEN
    RAISE EXCEPTION 'duplicate key value violates unique constraint "drops_one_open_per_pair"'
      USING ERRCODE = '23505',
            CONSTRAINT = 'drops_one_open_per_pair';
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger-only function: nobody should be able to call it directly.
REVOKE ALL ON FUNCTION public.drops_limit_after_declines() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS drops_limit_after_declines ON public.drops;

CREATE TRIGGER drops_limit_after_declines
  BEFORE INSERT ON public.drops
  FOR EACH ROW
  EXECUTE FUNCTION public.drops_limit_after_declines();
