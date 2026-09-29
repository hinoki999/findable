-- ============================================================
-- Links: each user dismisses their own "New Link" independently
-- ============================================================
-- links.viewed_at was one column shared by both users. Whoever dismissed the
-- "New Links" card first set it, and the other user's next poll no longer
-- returned the link, so they lost the notification without ever seeing it.
--
-- Replace it with one column per participant. mark_link_viewed() sets only the
-- caller's column, and links_restrict_update only lets a signed-in user change
-- their own column.
-- ============================================================

ALTER TABLE public.links
  ADD COLUMN viewed_at_user_1 timestamptz,
  ADD COLUMN viewed_at_user_2 timestamptz;

-- Carry over any existing viewed state (it can't be attributed to one user).
UPDATE public.links
SET viewed_at_user_1 = viewed_at,
    viewed_at_user_2 = viewed_at
WHERE viewed_at IS NOT NULL;

ALTER TABLE public.links DROP COLUMN viewed_at;

-- ------------------------------------------------------------
-- A signed-in user may change only their own viewed column. Changes made
-- without a user JWT (dashboard, service role, migrations) are not checked.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.links_restrict_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_own_column text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_own_column := CASE auth.uid()
    WHEN OLD.user_id_1 THEN 'viewed_at_user_1'
    WHEN OLD.user_id_2 THEN 'viewed_at_user_2'
  END;

  IF v_own_column IS NULL
     OR (to_jsonb(NEW) - v_own_column) IS DISTINCT FROM (to_jsonb(OLD) - v_own_column) THEN
    RAISE EXCEPTION 'Only your own viewed state of a link can be changed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- mark_link_viewed: set the caller's viewed column on one of their links.
-- Keeps the first viewed time if called again.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_link_viewed(p_link_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.links
  SET viewed_at_user_1 = CASE WHEN user_id_1 = auth.uid() THEN COALESCE(viewed_at_user_1, now()) ELSE viewed_at_user_1 END,
      viewed_at_user_2 = CASE WHEN user_id_2 = auth.uid() THEN COALESCE(viewed_at_user_2, now()) ELSE viewed_at_user_2 END
  WHERE id = p_link_id
    AND (user_id_1 = auth.uid() OR user_id_2 = auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Link not found';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_link_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_link_viewed(uuid) TO authenticated;
