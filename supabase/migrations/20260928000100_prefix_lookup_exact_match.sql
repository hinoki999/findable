-- ============================================================
-- get_profile_by_user_id_prefix: exact 8-character hex match only
-- ============================================================
-- The lookup used user_id::text LIKE prefix || '%' with no escaping, so '_'
-- and '%' were wildcards: '________' matched any user, and walking prefixes
-- such as '0_______', '1_______' listed every user's id, name and username.
-- A BLE advert carrying those bytes also resolved to a real person on nearby
-- phones.
--
-- The client only ever sends the first 8 characters of a user id, lowercased.
-- Accept exactly that and compare with =, so no character has special meaning.
-- Return type and grants are unchanged from 20260926100000.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_profile_by_user_id_prefix(prefix text)
 RETURNS TABLE(user_id uuid, name text, username text, profile_photo text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT up.user_id, up.name, up.username, up.profile_photo
  FROM user_profiles up
  WHERE auth.uid() IS NOT NULL
    AND prefix ~ '^[0-9a-f]{8}$'
    AND left(up.user_id::text, 8) = prefix
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_profile_by_user_id_prefix(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_by_user_id_prefix(text) TO authenticated;
