-- ============================================================
-- Security hardening: RLS policies, function guards, constraints
-- ============================================================
-- Remove duplicate user_settings rows before adding unique index
DELETE FROM public.user_settings a
USING public.user_settings b
WHERE a.user_id = b.user_id
  AND a.id < b.id;
-- SEC-02: links INSERT requires mutual accepted drops (both directions)
drop policy if exists "Users can insert links" on "public"."links";

create policy "Users can insert links"
  on "public"."links"
  as permissive
  for insert
  to authenticated
with check (
  (auth.uid() = user_id_1 OR auth.uid() = user_id_2)
  AND EXISTS (
    SELECT 1 FROM public.drops d
    WHERE d.sender_id = user_id_1
      AND d.receiver_id = user_id_2
      AND d.status IN ('accepted', 'linked')
  )
  AND EXISTS (
    SELECT 1 FROM public.drops d
    WHERE d.sender_id = user_id_2
      AND d.receiver_id = user_id_1
      AND d.status IN ('accepted', 'linked')
  )
);

-- SEC-06a: drops INSERT blocked if either party has blocked the other
drop policy if exists "Users can send drops" on "public"."drops";

create policy "Users can send drops"
  on "public"."drops"
  as permissive
  for insert
  to authenticated
with check (
  auth.uid() = sender_id
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = sender_id AND b.blocked_id = receiver_id)
       OR (b.blocker_id = receiver_id AND b.blocked_id = sender_id)
  )
);

-- SEC-06b: drops UPDATE cannot re-target or impersonate
drop policy if exists "Users can update their own drops" on "public"."drops";
drop policy if exists "Users can respond to received drops" on "public"."drops";

create policy "Senders can update own drops"
  on "public"."drops"
  as permissive
  for update
  to authenticated
using (auth.uid() = sender_id)
with check (auth.uid() = sender_id);

create policy "Receivers can respond to drops"
  on "public"."drops"
  as permissive
  for update
  to authenticated
using (auth.uid() = receiver_id)
with check (auth.uid() = receiver_id);

-- Blocking hides drops from both parties without deleting data
drop policy if exists "Users can view their own drops" on "public"."drops";

create policy "Users can view their own drops"
  on "public"."drops"
  as permissive
  for select
  to authenticated
using (
  (auth.uid() = sender_id OR auth.uid() = receiver_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = sender_id AND b.blocked_id = receiver_id)
       OR (b.blocker_id = receiver_id AND b.blocked_id = sender_id)
  )
);

-- Blocking hides links from both parties without deleting data
drop policy if exists "Users can view their own links" on "public"."links";

create policy "Users can view their own links"
  on "public"."links"
  as permissive
  for select
  to authenticated
using (
  (auth.uid() = user_id_1 OR auth.uid() = user_id_2)
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = user_id_1 AND b.blocked_id = user_id_2)
       OR (b.blocker_id = user_id_2 AND b.blocked_id = user_id_1)
  )
);

-- SEC-03: prefix lookup requires auth, minimum length, exact-length bound
CREATE OR REPLACE FUNCTION public.get_profile_by_user_id_prefix(prefix text)
 RETURNS TABLE(user_id uuid, name text, username text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT up.user_id, up.name, up.username
  FROM user_profiles up
  WHERE auth.uid() IS NOT NULL
    AND length(prefix) >= 8
    AND up.user_id::text LIKE prefix || '%'
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_profile_by_user_id_prefix(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_by_user_id_prefix(text) TO authenticated;

-- SEC-08: name lookup requires auth
CREATE OR REPLACE FUNCTION public.get_name_by_email(check_email text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT name FROM user_profiles
  WHERE auth.uid() IS NOT NULL
    AND lower(email) = lower(check_email)
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_name_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_name_by_email(text) TO authenticated;

-- SEC-11: check the correct column, enforce uniqueness
CREATE OR REPLACE FUNCTION public.is_username_taken(check_name text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles WHERE lower(username) = lower(check_name)
  );
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_key
  ON public.user_profiles (lower(username))
  WHERE username IS NOT NULL;

-- SEC-12: delete_user removes blocks, pins search_path
CREATE OR REPLACE FUNCTION public.delete_user()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.blocks WHERE blocker_id = auth.uid() OR blocked_id = auth.uid();
  DELETE FROM public.reports WHERE reporter_id = auth.uid();
  DELETE FROM public.pinned_contacts WHERE user_id = auth.uid() OR contact_user_id = auth.uid();
  DELETE FROM public.links WHERE user_id_1 = auth.uid() OR user_id_2 = auth.uid();
  DELETE FROM public.drops WHERE sender_id = auth.uid() OR receiver_id = auth.uid();
  DELETE FROM public.devices WHERE user_id = auth.uid();
  DELETE FROM public.user_settings WHERE user_id = auth.uid();
  DELETE FROM public.user_profiles WHERE user_id = auth.uid();
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$function$;

-- DRIFT-2: user_settings one row per user
CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_id_key
  ON public.user_settings (user_id);

-- user_profiles one row per user
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_user_id_key
  ON public.user_profiles (user_id);