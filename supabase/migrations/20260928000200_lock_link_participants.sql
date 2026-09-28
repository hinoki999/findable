-- ============================================================
-- Links: only viewed_at can change after a link is created
-- ============================================================
-- "Users can update their own links." checks only that the caller is
-- user_id_1 or user_id_2, before and after the update. Either party could
-- therefore set the other user_id column to anyone: the check still passed on
-- their own column, and the result was a link with a person who never dropped
-- them, which unlocked that person's contact card via get_contact_profiles.
--
-- The app only ever updates viewed_at. This trigger rejects any other change
-- made by a signed-in user; changes made without a user JWT (dashboard,
-- service role, migrations) are not checked. Same pattern as
-- drops_restrict_update in 20260928000000.
-- ============================================================

CREATE OR REPLACE FUNCTION public.links_restrict_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'viewed_at') IS DISTINCT FROM (to_jsonb(OLD) - 'viewed_at') THEN
    RAISE EXCEPTION 'Only a link''s viewed state can be changed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger-only function: nobody should be able to call it directly.
REVOKE ALL ON FUNCTION public.links_restrict_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS links_restrict_update ON public.links;

CREATE TRIGGER links_restrict_update
  BEFORE UPDATE ON public.links
  FOR EACH ROW
  EXECUTE FUNCTION public.links_restrict_update();
