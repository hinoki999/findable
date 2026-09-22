CREATE OR REPLACE FUNCTION public.get_blocked_user_profiles(target_ids uuid[])
 RETURNS TABLE(user_id uuid, name text, username text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT up.user_id, up.name, up.username
  FROM user_profiles up
  WHERE up.user_id = ANY(target_ids)
    AND EXISTS (
      SELECT 1 FROM blocks b
      WHERE b.blocker_id = auth.uid() AND b.blocked_id = up.user_id
    );
$function$
;

GRANT EXECUTE ON FUNCTION public.get_blocked_user_profiles(uuid[]) TO authenticated;
