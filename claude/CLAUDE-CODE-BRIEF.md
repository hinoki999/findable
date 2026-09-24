# DropShake — Working Brief

Read this fully before doing anything.

---

## STANDING RULES — these override any instruction in a task

1. **Never run `git commit`, `git push`, `eas update`, or `eas build`.** Caitlin runs
   all of these herself. Stop after each item, report what changed, and wait.
2. **Never apply an edit without showing the diff first.** One item at a time.
3. **Evidence before diagnosis.** Read the actual file. Never assume a line's
   content from a filename, a comment, or a previous grep.
4. **After every code change, run `npx tsc --noEmit` from `mobile/`.** There are
   4 known pre-existing errors (listed below). Anything beyond those 4 is
   something you introduced — fix it before moving on.
5. **Never run `supabase db reset` or any destructive database command.**
6. **If a fix requires a product decision, stop and ask.** Do not pick a
   reasonable-looking default.

---

## Project

- **App:** DropShake (renamed from DropLink). Proximity contact-sharing over BLE.
  Android only. React Native / Expo SDK 54, Supabase backend, Kotlin native BLE.
- **Repo:** `github.com/hinoki999/findable`, branch `develop` (canonical).
- **Local path:** `C:\Users\caiti\Documents\droplin` — app code in `mobile/`,
  database migrations in `supabase/migrations/`.
- **Status:** Pre-launch. No real users. 3 test accounts.
- **Supabase project ref:** `jfuhplqtujaakksmixii`

### Known pre-existing TypeScript errors (do not count these as regressions)
```
src/components/BLEScanner.tsx:10    — expo-notifications NotificationBehavior shape
src/components/SwipeableRow.tsx:363 — Animated style cursor type
src/config/environment.ts:22        — comparison of non-overlapping literal types
src/screens/ScannerScreen.tsx:10    — saveDevice called with 1 arg, expects 2
```
These are tracked for the cleanup phase. Leave them unless explicitly asked.

---

## Decisions already made — do not revisit these

- **Links require mutual drops.** A link between two users means user 1 dropped
  user 2 *and* user 2 dropped user 1. No exceptions, no other path.
- **Blocking hides, never deletes.** When A blocks B, existing drops and links
  stay in the database but are filtered out of SELECT for both parties via RLS.
  Reversible on unblock.
- **Pins are Links-page only.** A pin keeps a linked contact at the top of the
  Links list (HistoryScreen). It does nothing anywhere else. Pin UI in DropScreen
  and HomeScreen was leftover residue and has been removed.
- **Privacy zones is dead.** Superseded by Ghost Mode. All references removed.
- **App icons stay as they are.** Not being redesigned.

## Deliberately left unchanged — do not "fix" these

- **`android/app/google-services.json`** still says `droplink-5700c`. That is the
  live Firebase project ID. Changing the string breaks FCM. A real rename is
  separate infrastructure work.
- **`src/contexts/AuthContext.tsx`: `DEVICE_UNIQUE_ID_KEY = 'droplink_device_unique_id'`.**
  Persistent storage key. Renaming it invalidates every existing install's device ID.

---

## Already completed — do not redo

| Item | What was done |
|---|---|
| Leaked `service_role` key | JWT signing keys migrated, rotated, legacy keys disabled, old key revoked. App updated to new publishable key and shipped via OTA. |
| Sentry Metro integration | `metro.config.js` now uses `getSentryExpoConfig` from `@sentry/react-native/metro`. Verified with a clean `expo export`. |
| Blocked-users management UI | `SecuritySettingsScreen.tsx` — list + unblock, backed by `get_blocked_user_profiles` RPC. |
| DropLink → DropShake rename | app.json, strings.xml, native Kotlin BLE services, all UI strings, Terms & Conditions. Casing is `DropShake`. |
| Pinned contacts persistence | `pinContact`/`unpinContact`/`getPinnedContacts` now use `contact_user_id` (uuid). Pins load from server on login. |
| Migration `20260924000000_security_hardening.sql` | Applied and pushed. Covers SEC-02, 03, 06a, 06b, 07 (partial), 08, 11, 12, DRIFT-2. |

**Schema drift resolved (was blocking):** the live database differs from the
committed schema in known ways. Confirmed live: `pinned_contacts` has
`contact_user_id` (not `device_id`); `user_settings` has no
`privacy_zones_enabled`; a `reports` table **does** exist. Trust the live
database, not the 2026-09-02 snapshot.

---

## Remaining work

Group items that touch the same file. Do not work strictly top to bottom if
batching is cheaper — but finish and report each item before starting the next.

### Critical

**1 — eas.json production profile emits APK**
`mobile/eas.json` production profile sets `"android": { "buildType": "apk" }`.
Google Play requires an app bundle. Delete the `buildType` override; EAS
defaults to app-bundle. Leave `preview` alone — a sideloadable APK is wanted there.

**2 — Database triggers contain a hardcoded key**
`supabase/migrations/20260902060443_remote_schema.sql` lines ~893 and ~895
contain trigger definitions with a JWT embedded in plaintext. The key itself is
already revoked, so this is no longer a live exposure — but the next
`supabase db pull` will re-commit whatever key is there. Rewrite the triggers to
read the key from Supabase Vault, or move the notification dispatch out of a
trigger entirely. **Ask before changing trigger behaviour** — these fire the
drop/link push notifications.

### High

**3 — Block checks fail open in the client**
`mobile/src/services/api.ts`:
- `getBlockedUserIds` returns an empty `Set` on no-session, on query error, and
  in its catch. An empty Set means "nobody is blocked", so one transient error
  silently disables block filtering for the life of the screen. Make all three
  paths throw.
- `sendDrop`'s block check logs `blockCheckError` and then continues to the
  insert. Make the error branch throw.
- Then check the callers: `HomeScreen.tsx` around line 965 swallows the result
  with a `// Silent fail` comment. Surface the failure to the user instead.

**4 — Secrets and PII logged in release builds**
No `babel.config.js` exists anywhere outside `node_modules`, so every
`console.log` ships. `api.ts` logs a full auth token, live OTP codes, and other
users' complete profile rows. Two parts:
- Delete the specific offending log lines (full token, `[PHONE-VERIFY] Code input`,
  `[DROP-SCREEN] Full result set`, `[DROP-CRASH] senderProfile`).
- Add a `babel.config.js` with `transform-remove-console` for production builds,
  preserving `console.error`.

**5 — Auth-bypass backdoor ships in the bundle**
`mobile/src/contexts/AuthContext.tsx:26` — `AUTH_BYPASS_ENABLED = false`. The
flag is off, but the gated code is a complete credential-free login path:
derives a password from a device id, signs in against production Supabase, and
on failure fabricates a session with `token: 'bypass-token'` reporting
`isAuthenticated: true`. It also writes to a `profiles` table that does not exist.
Remove the flag and every gated branch entirely (roughly lines 77–207, 251–291,
335–346, 380–383, 407–447 — verify current line numbers, they have shifted).

**6 — Bluetooth permission flags never reach the shipped manifest**
`mobile/app.plugin.js` adds `android:usesPermissionFlags="neverForLocation"` to
BLUETOOTH_SCAN and `android:maxSdkVersion="30"` to ACCESS_FINE_LOCATION. Neither
appears in `mobile/android/app/src/main/AndroidManifest.xml`, because the native
directory is committed so `expo prebuild` never runs. Edit the committed manifest
directly. Requires a native build to verify.

**7 — Four dangerous permissions declared with no caller**
`mobile/android/app/src/main/AndroidManifest.xml` declares `RECORD_AUDIO`,
`SYSTEM_ALERT_WINDOW`, `VIBRATE`, `WRITE_EXTERNAL_STORAGE` — verified zero
references anywhere in `src`, `App.tsx`, or the Kotlin. Remove those four lines.
Add `android:maxSdkVersion="32"` to `READ_EXTERNAL_STORAGE` (used by
expo-image-picker only). Keep `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — it is used
by `BLEAdvertiserNative.kt`.

**8 — Terms promise GPS collection the app never performs**
`mobile/src/screens/SignupScreen.tsx:1079` states the app collects "GPS-derived
location information". `expo-location` is a dependency but is imported nowhere;
proximity is RSSI-derived only. The Terms also reference Twilio SMS verification,
which is disabled in code. Rewrite that section to describe Bluetooth proximity
accurately. **Draft it and show Caitlin before applying — this is legal text.**
Also remove the unused `expo-location` dependency.

**9 — Six of seven CI workflows fail permanently**
`.github/workflows/` — `error-monitoring.yml` (runs every 5 min),
`staging-deploy.yml`, `production-deploy.yml`, `database-backup.yml` (daily),
`test-suite.yml` (hourly, watches a `backend/**` directory that no longer
exists). All reference removed Railway infrastructure. `eas-update.yml` and
`ota-update.yml` are `workflow_dispatch` only and harmless. Delete the dead ones.

**10 — No typecheck or lint in CI; preview builds from every branch**
`mobile/package.json` has `typecheck` and `lint` scripts. Neither appears in any
workflow. `mobile/.eas/workflows/preview.yml` triggers on `branches: ['**']`, so
any branch publishes to the shared preview channel. Add `npm run typecheck` as a
gate and scope the trigger to `develop`.

### Medium

**11 — Four tables lack a foreign key to `auth.users`**
`blocks`, `user_profiles`, `user_settings`, `devices` have no FK, so a deletion
via the dashboard or Auth admin API orphans rows including PII. Also, all nine
existing FKs are declared `NOT VALID`, meaning pre-existing rows were never
checked. New migration; validate the existing constraints too.

**12 — Twilio credentials injected into the app manifest**
`mobile/app.config.js` puts `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
`TWILIO_VERIFY_SERVICE_SID` into `expo.extra`, which is serialised into the
shipped binary and readable by unzipping the APK. The consuming code is commented
out. Remove the injection. Whether those env vars are actually set can only be
checked in the Expo dashboard — flag that for Caitlin.

**13 — 43MB of tracked junk, two lockfiles**
Tracked under `mobile/`: `full_log.txt` (23MB), `filtered_log.txt` (15MB),
`native_ble.txt`, `crash*.txt`, `bleid*.txt`, `stale_blip.txt`,
`detection_drop.txt`, `diagnostic_output.txt`, `drop_fail.txt`,
`kotlin_log.txt`, `ble_dupe_log.txt`, plus `App.tsx.bak`,
`src/components/BLEScanner.tsx.bak`, `.bak.20251012-141556`,
`src/components/adboutput2.ini`, `src/components/debug_log3.ini`.
Remove from git tracking, add patterns to `.gitignore` and `.easignore`
(currently excludes `*.log` but not `*.txt` or `*.ini`).
Both `package-lock.json` and `yarn.lock` are committed — ask which to keep.

**14 — runtimeVersion duplicated across two files**
`mobile/app.json:6` and
`mobile/android/app/src/main/res/values/strings.xml:5` both hold `1.0.2` and do
not update together. Bumping one silently stops OTA updates reaching devices.
Switch to a `runtimeVersion` policy, or add a CI check that they agree.
Separately, `"channel": "preview"` inside `expo.updates` in app.json is not a
real SDK 54 config key — delete it.

**15 — iOS purpose strings**
Not urgent (Android-only today, and the Kotlin BLE modules will not run on iOS
without a Swift rewrite). Documented for whenever iOS is pursued.

**16 — `main` is still the GitHub default branch**
`main` is ~10 months stale. Anyone cloning lands on it. Change the default to
`develop` in GitHub Settings → Branches. Do not delete `main`.
**This is a GitHub UI action — tell Caitlin, do not attempt it.**

### Investigate (needs two devices — currently blocked)

**17 — Drop flow is broken**
Symptoms: blips render from BLE but do not persist; tapping a blip shows no
profile data; sending a drop fails.

Established so far: BLE scanning works correctly (verified via logcat — device
found consistently at strong signal, deduplicated, rendered). The profile lookup
RPC is called and returns empty, without erroring. `user_profiles` has **0 rows**
while `auth.users` has 3, `drops` has 1, `links`/`devices` have 0.

The one surviving drop is `status='linked'`, but `links` is empty — inconsistent.
`delete_user()` would have removed the drop and auth user too, so that function
did not cause this.

Unresolved: whether profile rows were deleted, or whether profile *creation* is
broken. Distinguish by creating a fresh account and checking whether a
`user_profiles` row appears. If creation is broken, that is a launch blocker.

**18 — `send-drop-notification` Edge Function**
Dashboard-only, not in the repo. Reads `SUPABASE_SERVICE_ROLE_KEY` from an env
var (auto-populated by Supabase), so the key rotation most likely did not break
it — but this has not been tested since. Needs a two-device test, or check the
function's logs for errors after the rotation timestamp.

### Low

**19 — Phone verification.** Blocked: the Twilio account is suspended for the
second time (security-related). Supabase phone auth always requires a third-party
SMS provider — Twilio, MessageBird, Vonage, or TextLocal — so a Supabase plan
upgrade does not remove the dependency. Vonage was already ruled out. The current
`sendPhoneVerificationCodeTwilio`/`verifyPhoneCodeTwilio` functions in `api.ts`
are stubs that always throw. Three `// TEMP DISABLED` gates exist at
`DropScreen.tsx:384`, `HomeScreen.tsx:1582`, `HomeScreen.tsx:3758`.

**20 — Feedback / bug-report field.** Own table, sibling section to blocked-users
in Settings, likely emailed via Brevo.

**21 — General cleanup.** ESLint warnings, the 4 known TS errors, remove emojis,
README, documentation.

**22 — Rename the Supabase project** from "DropLink" (cosmetic, dashboard only).

**23 — TopBar DropShake styling** (cosmetic).

**24 — Make the repository private.** Deliberately last, per Caitlin.

---

## House standard for new database functions

Migration `20260921000000_add_get_blocked_user_profiles.sql` is the template.
Every new function gets:
- `SET search_path TO 'public'`
- an explicit `auth.uid()` predicate in the body
- an explicit `GRANT EXECUTE ... TO authenticated`, and a `REVOKE` from `anon`
  where the function should not be public

The five original functions predate this standard.

## Migration workflow

Migrations live in `supabase/migrations/`, named `YYYYMMDDHHMMSS_description.sql`.
Run the CLI from the **project root** (`droplin/`), not from `supabase/`.
`supabase db pull` needs Docker Desktop running.
If SQL is applied through the dashboard instead of the CLI, the migration file
still has to be created and recorded:
`npx supabase migration repair --status applied <timestamp>`
