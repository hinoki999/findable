-- ============================================================
-- Drop notifications: read the Edge Function key from Vault
-- ============================================================
-- Replaces the two dashboard-created Database Webhooks on public.drops,
-- which embedded a (now revoked) legacy JWT in the trigger definition.
-- The key now lives in Vault under 'drop_notification_secret_key' and is
-- sent as the apikey header; send-drop-notification validates it in-handler
-- against SUPABASE_SECRET_KEYS (verify_jwt = false).
--
-- Payload shape matches supabase_functions.http_request so the Edge Function
-- needs no payload changes: { type, table, schema, record, old_record }.
--
-- Prerequisite (run once, outside this migration, so the key is never committed):
--   select vault.create_secret('<sb_secret_...>', 'drop_notification_secret_key');

CREATE OR REPLACE FUNCTION public.notify_drop_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  secret_key text;
BEGIN
  SELECT ds.decrypted_secret INTO secret_key
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'drop_notification_secret_key';

  -- A missing key must never block the drop write itself; the webhook this
  -- replaces was also fire-and-forget.
  IF secret_key IS NULL THEN
    RAISE WARNING 'notify_drop_change: vault secret drop_notification_secret_key not found, notification skipped';
    RETURN NULL;
  END IF;

  PERFORM net.http_post(
    url := 'https://jfuhplqtujaakksmixii.supabase.co/functions/v1/send-drop-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', secret_key
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
      'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END
    ),
    timeout_milliseconds := 5000
  );

  RETURN NULL;
END;
$function$
;

-- Trigger-only function: nobody should be able to call it directly.
REVOKE EXECUTE ON FUNCTION public.notify_drop_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "drop-linked-notification" ON public.drops;
DROP TRIGGER IF EXISTS "drops-inserted-notification" ON public.drops;

CREATE TRIGGER "drop-linked-notification"
  AFTER UPDATE ON public.drops
  FOR EACH ROW EXECUTE FUNCTION public.notify_drop_change();

CREATE TRIGGER "drops-inserted-notification"
  AFTER INSERT ON public.drops
  FOR EACH ROW EXECUTE FUNCTION public.notify_drop_change();
