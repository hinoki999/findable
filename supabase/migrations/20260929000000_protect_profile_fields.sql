-- ============================================================
-- user_profiles: server-owned fields, placeholder cleanup, recovery lookup
-- ============================================================
-- "allow_update_own_profile" and the insert policy only check that the row is
-- the caller's, so a user could write any column of their own profile:
--   - phone_verified: mark their phone verified without verifying it
--   - email: set an address that isn't their account's
-- A trigger now owns those fields for signed-in callers. email always mirrors
-- the auth account (auth.users.email), so an email change verified through
-- Supabase Auth shows up in the profile on the next write. phone_verified and
-- the verification-code columns can't be changed by the client at all; phone
-- verification (work queue 5.3) will need a server-side path to set them.
-- Changes made without a user JWT (dashboard, service role, migrations) are not
-- checked.
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_profiles_protect_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER            -- reads auth.users
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT u.email INTO NEW.email FROM auth.users u WHERE u.id = NEW.user_id;

  IF TG_OP = 'INSERT' THEN
    NEW.phone_verified := false;
    NEW.phone_verification_code := NULL;
    NEW.verification_code_expires := NULL;
  ELSE
    NEW.phone_verified := OLD.phone_verified;
    NEW.phone_verification_code := OLD.phone_verification_code;
    NEW.verification_code_expires := OLD.verification_code_expires;
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger-only function: nobody should be able to call it directly.
REVOKE ALL ON FUNCTION public.user_profiles_protect_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_profiles_protect_fields ON public.user_profiles;

CREATE TRIGGER user_profiles_protect_fields
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.user_profiles_protect_fields();

-- ------------------------------------------------------------
-- Placeholder text the app used to save as real data ("Your Name",
-- "(555) 123-4567", "Add bio"). The app now writes null for an empty field.
-- ------------------------------------------------------------
UPDATE public.user_profiles SET name = NULL WHERE name = 'Your Name';
UPDATE public.user_profiles SET phone = NULL WHERE phone = '(555) 123-4567';
UPDATE public.user_profiles SET bio = NULL WHERE bio = 'Add bio';

-- ------------------------------------------------------------
-- get_name_by_email returned the display name (not the username) for any
-- email, to any signed-in user. Username recovery now reads the caller's own
-- profile after the recovery code signs them in, so nothing calls it.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_name_by_email(text);
