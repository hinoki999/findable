# DropShake — Work Queue

Ordered. Top item is what's being worked now. Discoveries made while working an
item go on this list; they do not become the next task on their own.

Sources: Atlas's audit, the six-area Claude Code audit, the 2026-09-27 device
test, and findings surfaced while fixing other items.

---

## Order and why

1. **Finish what's started, plus small code fixes that ride the same build.**
   Cheap, and leaving a half-done item is worse than finishing it.
2. **Build and device test.** Eleven things are fixed but unverified. That's the
   largest block of unknowns and it gates confidence in everything after it.
3. **Store requirements.** The only genuine launch blockers. None depend on any
   remaining audit item.
4. **Remaining correctness, High first.**
5. **Cleanup and deferred work.**

---

## 1. Current batch — code fixes, one build

**1.1 — Re-drop after a decline reveals the decline** *(in progress)*
The app blocks a second drop while the first is pending or accepted. A declined
drop is now hidden from the sender, so that check passes and the re-drop goes
through, which tells the sender they were declined. Block it with the same "You
have already dropped this user" message. Must be enforced server-side: the
client check reads a row the sender can no longer see.

**1.2 — Blip preview shows too much**
The blip preview must show profile photo, name, and a proximity indicator only.
Remove the bio section from the blip modal. Bio belongs in the full contact card,
after a drop.

**1.3 — Where does the "New Link!" notification come from?**
Answer before changing anything. Both users must receive and dismiss their own
notification, independently. Does each user's notification read
`links.viewed_at`, or local state on their own device? If it reads the shared
column, per-user tracking is needed. If it's local state, nothing to do.

**1.4 — Password reset always fails**
The same one-time code is verified twice.

**1.5 — Account deletion is broken for current users**
Deletion sends a verification code to the email on the profile, which is the
placeholder `user@example.com`. Requirement: after deleting, the same email must
be able to sign up again and get a clean account. Confirm `delete_user()` plus
the foreign keys from `20260926000000` leave nothing behind that would block a
re-signup.

**1.6 — Privacy zones**
Permanently removed, not deferred. Ignore any README reference to them.

---

## 2. Build and device test

Two of the pending fixes are native, so a build is required. Test everything
below in one pass.

**Auth** — the bypass removal deleted 277 lines and none of it has run on a
device:
- Cold start with a saved session
- Log out, log back in
- Sign up (use an unused email, or delete the auth user under Authentication →
  Users first)
- Log out again

**Fixed but unverified:**
- Logout no longer leaves the phone broadcasting the previous user's ID
- Ghost Mode saves reliably, including when Bluetooth is off
- Profile photo persists after leaving and returning to the page
- Signup completes without the `user_settings_user_id_key` error
- Blip shows the other user's profile photo

**Permissions and media:**
- Android 12+: the Bluetooth prompt does not ask for location
- Photo picker: gallery and camera both work

**Flow:**
- Block and unblock end to end — blocked user disappears from the radar and
  reappears after unblocking
- Both-dropped path: A drops B, then B drops A before responding
- Both users receive and dismiss their own "New Link!" notification

---

## 3. Store requirements

The actual launch blockers.

- Google Play Developer account
- Privacy policy, hosted and reachable
- Data safety form — must agree with both the code and the in-app Terms. The
  Terms rewrite makes this answerable: no location collected, name/username/photo
  visible to nearby users
- Content rating
- Production signed build. The production profile has never been run by any
  automation, and local release builds are currently signed with the debug
  keystore
- Support inbox. `support@droplinkconnect.com` was never set up; the contact
  email in the Terms is still `link@hirulelabs.com`

---

## 4. Correctness — High

**4.1 — Error reporting.** Four parts, in order:
1. Wire Sentry source maps into `android/` so release crash stacks are readable,
   and set `environment` so dev builds stop reporting into the production project
2. Add `beforeBreadcrumb` scrubbing before increasing what's reported. HTTP
   breadcrumbs capture PostgREST URLs containing user UUIDs
3. Stop swallowing errors — `// Silent fail`, empty catches, error branches with
   no throw
4. Report zero-row writes that currently report success (profile updates, push
   token saves)

Separately: Sentry may hold historical events whose breadcrumbs contain auth
tokens and profile data from before the logging fix. Check retention and purge.

**4.2 — Crash on Android 7–9.** Both foreground services call a three-argument
`startForeground` that requires API 29; `minSdk` is 24.

**4.3 — Account deletion leaves profile photos publicly reachable.** Relevant to
Play's data-deletion requirement. Related: the photo bucket is public, so anyone
with a user's ID can fetch their photo with no account.

**4.4 — "Device found" broadcasts are readable by any installed app,** and on API
26–32 another app can inject fake sightings, because the receiver is exported.

**4.5 — Push tokens are never cleared on logout or refreshed.** The previous
user's notifications, which include contacts' names, keep arriving on the device.

**4.6 — Drop push text comes from `sender_name`,** which the sender controls.

**4.7 — An advertisement can keep running that nothing stops,** including Ghost
Mode. Two start requests in quick succession can leave one orphaned.
Timing-dependent, marked Inferred.

**4.8 — BLE does not recover after Bluetooth is turned off and on.** The user
stays invisible until they toggle Ghost Mode, while the notification still says
it's broadcasting.

---

## 5. Incomplete features

**5.1 — Blocked-users Settings section.** The modal does not dismiss. Back
closes it; the Close button does not. Suspected `flex: 1` on a button styled for
a side-by-side layout.

**5.2 — Feedback / bug-report field.** Own table, sibling section to
blocked-users in Settings, emailed via Brevo.

**5.3 — Phone verification.** Blocked outside the codebase. Twilio suspended
twice for security reasons. Supabase phone auth always requires a third-party SMS
provider, so a plan upgrade doesn't remove the dependency; Vonage was ruled out.
Current functions are stubs that throw. Three `// TEMP DISABLED` gates in
`DropScreen.tsx` and `HomeScreen.tsx`. Includes the phone verification modal
dismiss button.

Bundled with this item: rotate the Twilio auth token (confirmed embedded in at
least one local build), delete any `TWILIO_*` variables in the Expo dashboard,
remove the `TWILIO_*` lines from the local `.env`, and clear the old build output
that still contains them. Note Expo still loads `.env` even after
`app.config.js` was deleted.

---

## 6. Correctness — Medium

- `phone_verified` and `email` can be edited directly by the user
- The `sender_*` snapshot fields on a drop aren't tied to the sender's real
  profile — a sender-written contact card
- No unique constraints on `links` or on pending drops
- No `onAuthStateChange` listener: when a session dies the UI stays "logged in"
  while queries run as anon
- The previous user's profile and push token stay on the device after logout
- "Change password" ignores the current password
- "Change username" updates the display name, not the username
- Saving any profile field writes placeholders such as `(555) 123-4567` into the
  database
- `is_email_taken` is callable without signing in
- "Recover username" returns `name` rather than `username`
- The native module reports success when a service start or Ghost stop failed
- A permanently denied permission is cached as granted
- The native scan store is never cleared, so it leaks between accounts
- Deleting a link from History brings it back on the next load
- `profileCacheRef` in `BLEScanner.tsx` is read but never written, so every
  sighting re-runs the profile lookup
- A background-seeded device never heard by the live scan stays on the radar
  indefinitely — stale cleanup keeps any device with no `lastSeen`
- Block changes may not reach the blocker's radar if `blocks` isn't in the
  Realtime publication (Inferred)
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is Play-restricted and nothing calls it
- `ACCESS_COARSE_LOCATION` is declared with no upper SDK limit and never
  requested
- `main` is still the GitHub default branch, ~10 months stale
- iOS purpose strings will ship generic and partly false. Deferred: Android-only,
  and the Kotlin BLE modules won't run on iOS without a Swift rewrite

---

## 7. Cleanup

- 126 ESLint warnings
- Dead code: `BLEService.ts`, `native/BLEAdvertiser.ts`, `DeviceDetail`,
  `DeviceList`, three unused loggers, `handleDirectSignup`, `authStorage.ts`, the
  unused `nativeDevices` context, the never-rendered `errorLogs` state
- `Documents/findable-app/` committed by accident
- `ai-builder/main.py` overwrites the real `BLEScanner.tsx`
- `wipe_user_data.py` (two copies) deletes with no confirmation
- Remove emojis from the codebase
- Native logs record MAC addresses and ID prefixes in release builds
- `userInterfaceStyle` and the splash colour in `app.json` never reach Android
- `eas-update.yml` pins Node 18
- README and documentation — the current README is from February and describes
  Railway as the backend
- Rename the Supabase project from "DropLink"
- TopBar DropShake styling (cosmetic)

---

## 8. Deferred deliberately

**Git history rewrite.** Covers the revoked `service_role` key, the 43MB of
debug dumps, and real phone numbers and a Gmail address in root-level log files —
all still in history. Needs `git filter-repo` across all branches and a
force-push. One deliberate session, paired with the item below.

**Make the repository private.** Last.

---

## Decided — do not revisit

- A link requires mutual drops, both directions. No other path.
- Declines are invisible to the sender. No notification, no visible record, no
  way to infer one.
- Blocking hides via RLS and never deletes. A blocked user gets no indication
  they were blocked; they simply lose access to the contact info.
- Pins are Links-page only and persist server-side across devices.
- Blip preview: profile photo, name, proximity indicator. Nothing else.
- Bio appears in the full contact card only.
- Both users receive and dismiss their own "New Link!" notification.
- Ghost Mode: nobody can see the user or drop them.
- Privacy zones are permanently removed. Ghost Mode replaces them.
- App icons stay as they are.
- `google-services.json` keeps `droplink-5700c` — it's the live Firebase project
  ID and changing the string breaks FCM.
