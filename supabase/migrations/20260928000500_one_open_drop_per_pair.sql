-- ============================================================
-- Drops: one open drop per sender -> receiver, declined included
-- ============================================================
-- The app refused a second drop to the same person only while the first was
-- pending or accepted, and only in the client. Once the receiver declined, the
-- re-drop went through - which told the sender they had been declined. Since
-- 20260928000400 the sender can't even see a declined drop, so the client
-- check can't find it at all.
--
-- A unique index enforces it server-side for every caller. pending, accepted
-- and declined all hold the slot, so a re-drop fails the same way whether the
-- earlier drop is still pending or was declined. 'deleted' (undo, or either
-- party deleting after a response) frees it. 'linked' is not included: that is
-- the state link_drop writes for the caller's drop back, and links have their
-- own duplicate check.
--
-- An index sees every row regardless of RLS, and it is atomic, so two sends
-- racing each other can't both get through.
--
-- The client maps the resulting unique violation (23505 on this index) to the
-- same "You have already dropped this user" message it used before.
-- ============================================================

-- Existing duplicates would make the index fail to build; stop with a clear
-- message instead, so they can be reviewed before choosing which to keep.
DO $$
DECLARE
  v_pairs integer;
BEGIN
  SELECT count(*) INTO v_pairs
  FROM (
    SELECT sender_id, receiver_id
    FROM public.drops
    WHERE status IN ('pending', 'accepted', 'declined')
    GROUP BY sender_id, receiver_id
    HAVING count(*) > 1
  ) dup;

  IF v_pairs > 0 THEN
    RAISE EXCEPTION '% sender/receiver pair(s) have more than one pending, accepted or declined drop; resolve them before applying this migration', v_pairs;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS drops_one_open_per_pair
  ON public.drops (sender_id, receiver_id)
  WHERE status IN ('pending', 'accepted', 'declined');
