-- ============================================================
-- Item 17: atomic linking, profile photo on the pre-drop lookup
-- ============================================================

-- ------------------------------------------------------------
-- link_drop: turn a received drop into a link, in one transaction.
-- The links INSERT policy requires a drop in each direction with status
-- accepted/linked. The client used to write only one of them, so every link
-- insert was rejected (and one drop was left 'linked' with no link).
-- Called by the receiver of p_drop_id. p_profile is the contact info the caller
-- chooses to share back (same keys as the client's senderProfile object).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_drop(p_drop_id uuid, p_profile jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_drop public.drops%ROWTYPE;
  v_link_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_drop FROM public.drops WHERE id = p_drop_id FOR UPDATE;
  IF NOT FOUND OR v_drop.receiver_id <> auth.uid() THEN
    RAISE EXCEPTION 'Drop not found';
  END IF;

  IF v_drop.status NOT IN ('pending', 'accepted') THEN
    RAISE EXCEPTION 'Drop cannot be linked from status %', v_drop.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = v_drop.sender_id AND b.blocked_id = v_drop.receiver_id)
       OR (b.blocker_id = v_drop.receiver_id AND b.blocked_id = v_drop.sender_id)
  ) THEN
    RAISE EXCEPTION 'Unable to link with this user';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.links l
    WHERE (l.user_id_1 = v_drop.sender_id AND l.user_id_2 = v_drop.receiver_id)
       OR (l.user_id_1 = v_drop.receiver_id AND l.user_id_2 = v_drop.sender_id)
  ) THEN
    RAISE EXCEPTION 'Already linked with this user';
  END IF;

  -- The caller's drop back to the sender. Inserted as 'linked' (not 'pending')
  -- so send-drop-notification sends no "New Drop" push for it.
  INSERT INTO public.drops (
    sender_id, receiver_id, status, responded_at, distance_feet,
    sender_name, sender_username, sender_email, sender_phone, sender_bio,
    sender_profile_photo, sender_social_media
  ) VALUES (
    auth.uid(), v_drop.sender_id, 'linked', now(), v_drop.distance_feet,
    NULLIF(p_profile->>'name', ''), NULLIF(p_profile->>'username', ''),
    NULLIF(p_profile->>'email', ''), NULLIF(p_profile->>'phone', ''),
    NULLIF(p_profile->>'bio', ''), NULLIF(p_profile->>'profilePhoto', ''),
    p_profile->'socialMedia'
  );

  -- pending/accepted -> linked fires the existing "New Link" push to both users.
  UPDATE public.drops SET status = 'linked', responded_at = now() WHERE id = p_drop_id;

  INSERT INTO public.links (user_id_1, user_id_2, drop_id)
  VALUES (v_drop.sender_id, auth.uid(), p_drop_id)
  RETURNING id INTO v_link_id;

  RETURN v_link_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.link_drop(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_drop(uuid, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- get_profile_by_user_id_prefix: also return profile_photo, shown on the blip
-- before a drop. The return type changes, so the function is dropped first.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_profile_by_user_id_prefix(text);

CREATE FUNCTION public.get_profile_by_user_id_prefix(prefix text)
 RETURNS TABLE(user_id uuid, name text, username text, profile_photo text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT up.user_id, up.name, up.username, up.profile_photo
  FROM user_profiles up
  WHERE auth.uid() IS NOT NULL
    AND length(prefix) >= 8
    AND up.user_id::text LIKE prefix || '%'
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_profile_by_user_id_prefix(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_by_user_id_prefix(text) TO authenticated;

-- ------------------------------------------------------------
-- Data fix: drops left 'linked' with no link (the old client marked the drop
-- linked, then its link insert was rejected). Reset them to pending.
-- ------------------------------------------------------------
UPDATE public.drops d
SET status = 'pending', responded_at = NULL
WHERE d.status = 'linked'
  AND NOT EXISTS (
    SELECT 1 FROM public.links l
    WHERE (l.user_id_1 = d.sender_id AND l.user_id_2 = d.receiver_id)
       OR (l.user_id_1 = d.receiver_id AND l.user_id_2 = d.sender_id)
  );
