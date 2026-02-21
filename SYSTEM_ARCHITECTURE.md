# DropLink System Architecture

**Last Updated:** February 20, 2026  
**Version:** 1.0

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [Authentication System](#2-authentication-system)
3. [User States & Screens](#3-user-states--screens)
4. [Profile Management](#4-profile-management)
5. [BLE System](#5-ble-system)
6. [Drops System](#6-drops-system)
7. [Pins System](#7-pins-system)
8. [Delete Operations](#8-delete-operations)
9. [Tutorial System](#9-tutorial-system)
10. [Ghost Toggle / Discoverability](#10-ghost-toggle--discoverability)
11. [Settings System](#11-settings-system)
12. [Data Synchronization](#12-data-synchronization)
13. [Known Issues & Technical Debt](#13-known-issues--technical-debt)

---

## 1. Database Schema

### Supabase Tables

#### `user_profiles`
Primary user profile data.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `user_id` | UUID (PK) | - | FK to auth.users(id) ON DELETE CASCADE |
| `email` | TEXT | NULL | User's email address |
| `name` | TEXT | NULL | Display name for BLE discovery |
| `username` | TEXT | NULL | Login username for identification |
| `phone` | TEXT | NULL | Phone number |
| `bio` | TEXT | NULL | User bio |
| `profile_photo` | TEXT | NULL | Full public URL to photo |
| `social_media` | JSONB | '[]' | Array of {platform, handle} |
| `phone_verified` | BOOLEAN | false | Phone verification status |
| `phone_verification_code` | TEXT | NULL | OTP code for verification |
| `verification_code_expires` | TIMESTAMPTZ | NULL | Code expiry time |
| `tutorial_home_completed` | BOOLEAN | false | DEPRECATED - use tutorial_completions |
| `tutorial_drop_completed` | BOOLEAN | false | DEPRECATED |
| `tutorial_history_completed` | BOOLEAN | false | DEPRECATED |
| `tutorial_account_completed` | BOOLEAN | false | DEPRECATED |
| `has_completed_onboarding` | BOOLEAN | false | DEPRECATED |
| `created_at` | TIMESTAMPTZ | NOW() | Row creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOW() | Last update timestamp |

#### `drops`
Contact sharing records between users.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID (PK) | gen_random_uuid() | Unique drop ID |
| `sender_id` | UUID | - | FK to auth.users |
| `receiver_id` | UUID | - | FK to auth.users |
| `status` | TEXT | 'pending' | 'pending', 'accepted', 'returned', 'declined', 'deleted' |
| `created_at` | TIMESTAMPTZ | NOW() | When drop was sent |
| `responded_at` | TIMESTAMPTZ | NULL | When receiver responded |
| `distance_feet` | REAL | NULL | Distance at time of drop |
| `sender_name` | TEXT | NULL | Sender's display name |
| `sender_username` | TEXT | NULL | Sender's username |
| `sender_email` | TEXT | NULL | Sender's email |
| `sender_phone` | TEXT | NULL | Sender's phone |
| `sender_bio` | TEXT | NULL | Sender's bio |
| `sender_profile_photo` | TEXT | NULL | Sender's photo URL |
| `sender_social_media` | JSONB | NULL | Sender's social links |

#### `devices` (Legacy)
Legacy table for device tracking. Being replaced by `drops`.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | SERIAL (PK) | - | Auto-increment ID |
| `user_id` | UUID | - | FK to auth.users |
| `device_name` | TEXT | - | BLE device name |
| `rssi` | INTEGER | - | Signal strength |
| `distance_feet` | REAL | - | Calculated distance |
| `action` | TEXT | - | 'dropped', 'accepted', 'declined', 'returned' |
| `last_seen` | TIMESTAMPTZ | - | Last detection time |
| `phone_number` | TEXT | NULL | Contact phone |
| `email` | TEXT | NULL | Contact email |
| `bio` | TEXT | NULL | Contact bio |
| `social_media` | JSONB | NULL | Contact social links |
| `profile_photo` | TEXT | NULL | Contact photo URL |
| `created_at` | TIMESTAMPTZ | NOW() | Row creation time |

#### `user_settings`
User preferences and settings.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `user_id` | UUID (PK) | - | FK to auth.users |
| `dark_mode` | BOOLEAN | true | Dark mode preference |
| `max_distance` | INTEGER | 33 | Max discovery distance (feet) |
| `privacy_zones_enabled` | BOOLEAN | false | Privacy zones feature flag |
| `created_at` | TIMESTAMPTZ | NOW() | Row creation time |

#### `pinned_contacts`
User's pinned contacts for quick access.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `user_id` | UUID | - | FK to auth.users |
| `device_id` | INTEGER | - | FK to devices.id |
| `pinned_at` | TIMESTAMPTZ | NOW() | When contact was pinned |
| **PRIMARY KEY** | (user_id, device_id) | - | Composite key |

#### `tutorial_completions`
Per-screen tutorial completion tracking.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `user_id` | UUID (PK) | - | FK to auth.users |
| `home_completed` | BOOLEAN | false | Home tutorial done |
| `drop_completed` | BOOLEAN | false | Drop tutorial done |
| `history_completed` | BOOLEAN | false | History tutorial done |
| `account_completed` | BOOLEAN | false | Account tutorial done |

#### `privacy_zones` (Backend only)
Geographic privacy zones where user is hidden.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | SERIAL (PK) | - | Zone ID |
| `user_id` | UUID | - | FK to auth.users |
| `name` | TEXT | - | Zone name |
| `address` | TEXT | - | Zone address |
| `latitude` | DOUBLE | - | Center latitude |
| `longitude` | DOUBLE | - | Center longitude |
| `radius_meters` | INTEGER | - | Zone radius |
| `created_at` | TIMESTAMPTZ | NOW() | Creation time |

### Supabase Storage

#### `profile_photos` Bucket
- **Structure:** `{userId}/profile.{extension}`
- **Visibility:** PUBLIC
- **RLS:** Users can only manage their own photos

### RLS Policies

```sql
-- user_profiles: Users can only update their own profile
CREATE POLICY "Users can update own profile" ON user_profiles
FOR UPDATE USING (auth.uid() = user_id);

-- drops: Users can see drops where they are sender or receiver
CREATE POLICY "Users can view own drops" ON drops
FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- drops: Users can update drops where they are receiver
CREATE POLICY "Receivers can update drops" ON drops
FOR UPDATE USING (auth.uid() = receiver_id);

-- profile_photos storage: Users can manage own photos
CREATE POLICY "Users can manage own photos" ON storage.objects
FOR ALL USING (bucket_id = 'profile_photos' AND auth.uid()::text = (storage.foldername(name))[1]);
```

---

## 2. Authentication System

### Auth Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Welcome    │────▶│   Signup    │────▶│    Home     │
│   Screen    │     │   Screen    │     │   Screen    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       ▲
       │            ┌─────────────┐            │
       └───────────▶│    Login    │────────────┘
                    │   Screen    │
                    └─────────────┘
```

### Signup Flow

1. **User enters:** Name, Username, Email, Password
2. **Real-time validation:**
   - Username: 3-20 chars, alphanumeric + underscore/period
   - Username availability check (debounced API call)
   - Email format validation
   - Email availability check (debounced API call)
   - Password: 8+ chars, uppercase, lowercase, number, special char
3. **On submit:**
   ```typescript
   // Create Supabase auth user
   supabase.auth.signUp({
     email: email.toLowerCase().trim(),
     password: password,
     options: { data: { username: username } }
   });
   
   // Create user_profiles row
   supabase.from('user_profiles').insert({
     user_id, email, username, name, phone: null, bio: null,
     social_media: [], tutorial flags: false
   });
   
   // Create user_settings row
   supabase.from('user_settings').insert({
     user_id, dark_mode: true, max_distance: 33
   });
   ```
4. **Auto-login:** Signs in automatically after signup
5. **Profile photo prompt:** Shows optional photo upload modal

### Login Flow

1. **User enters:** Email, Password
2. **On submit:**
   ```typescript
   supabase.auth.signInWithPassword({ email, password });
   ```
3. **Session stored:** Supabase SDK stores in AsyncStorage
4. **Load user data:** Fetches profile, settings from Supabase

### Password Reset Flow

1. User taps "Forgot Password"
2. Enters email → `sendOtpCode(email, 'recovery')`
3. Enters OTP code → `verifyOtpCode(email, code)`
4. Enters new password → `resetPasswordWithOtp(email, code, newPassword)`

### Session Management

- **Storage:** Supabase SDK manages session in AsyncStorage
- **Auto-refresh:** `autoRefreshToken: true` in Supabase config
- **App state:** Starts/stops refresh based on foreground/background
- **Token format:** JWT with 3 segments

### Key Files

| File | Purpose |
|------|---------|
| `mobile/src/contexts/AuthContext.tsx` | Auth state, login/signup/logout |
| `mobile/src/screens/SignupScreen.tsx` | Signup UI and validation |
| `mobile/src/screens/LoginScreen.tsx` | Login UI, password reset |
| `mobile/src/services/supabase.ts` | Supabase client config |
| `mobile/src/services/storage.ts` | Secure storage abstraction |

---

## 3. User States & Screens

### All Screens

| Screen | File | Purpose |
|--------|------|---------|
| **WelcomeScreen** | `WelcomeScreen.tsx` | Initial app entry |
| **SignupScreen** | `SignupScreen.tsx` | User registration |
| **LoginScreen** | `LoginScreen.tsx` | User authentication |
| **HomeScreen** | `HomeScreen.tsx` | Main radar view, BLE, drops |
| **DropScreen** | `DropScreen.tsx` | Nearby users, accepted drops |
| **HistoryScreen** | `HistoryScreen.tsx` | Mutual links |
| **AccountScreen** | `AccountScreen.tsx` | Profile editing |
| **ProfilePhotoScreen** | `ProfilePhotoScreen.tsx` | Photo upload |
| **SecuritySettingsScreen** | `SecuritySettingsScreen.tsx` | Password, account deletion |

### Navigation Structure

```
┌─────────────────────────────────────────────────────────┐
│                     Tab Navigator                        │
│  ┌──────┐  ┌──────┐  ┌─────────┐  ┌─────────┐          │
│  │ Home │  │ Drop │  │ History │  │ Account │          │
│  └──────┘  └──────┘  └─────────┘  └─────────┘          │
│                                         │               │
│                               ┌─────────┴─────────┐     │
│                               │  Sub-screens:     │     │
│                               │  - ProfilePhoto   │     │
│                               │  - SecuritySettings│    │
│                               └───────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### Data Loading Per Screen

| Screen | On Mount | Polling | Pull-to-Refresh |
|--------|----------|---------|-----------------|
| HomeScreen | devices, incomingDrops | 5s each | ✓ |
| DropScreen | acceptedDrops, BLE scan | BLE continuous | ✓ |
| HistoryScreen | linkedDrops | - | ✓ |
| AccountScreen | (from context) | - | - |

---

## 4. Profile Management

### Profile Fields

| Field | Type | Editable | Stored In |
|-------|------|----------|-----------|
| `name` | string | ✓ | user_profiles |
| `username` | string | ✓ (with validation) | user_profiles + auth.user_metadata |
| `email` | string | Read-only | user_profiles |
| `phone` | string | ✓ | user_profiles |
| `bio` | string | ✓ | user_profiles |
| `profilePhoto` | URL | ✓ | profile_photos bucket |
| `socialMedia` | array | ✓ | user_profiles |

### Profile Update Flow

```typescript
// In App.tsx - updateProfile()
const updateProfile = async (newProfile) => {
  // 1. Update Supabase
  await supabase.from('user_profiles')
    .update({ name, phone, bio, profile_photo, social_media })
    .eq('user_id', userId);
  
  // 2. Update local state
  setProfile(newProfile);
  
  // 3. Update AsyncStorage cache
  await AsyncStorage.setItem('userProfile', JSON.stringify(newProfile));
};
```

### Profile Photo Upload

1. User selects photo (camera or gallery)
2. Image picker returns local URI
3. Upload to Supabase Storage: `profile_photos/{userId}/profile.{ext}`
4. Get public URL
5. Update `user_profiles.profile_photo` with URL

### Social Media Array Format

```typescript
socialMedia: Array<{
  platform: string;  // 'instagram', 'twitter', 'linkedin', etc.
  handle: string;    // '@username' or URL
}>
```

---

## 5. BLE System

### Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                      BLE SYSTEM                             │
│                                                            │
│  ┌─────────────────┐          ┌─────────────────┐         │
│  │   Advertising   │          │    Scanning     │         │
│  │  (Native Kotlin)│          │ (react-native-  │         │
│  │                 │          │   ble-plx)      │         │
│  └────────┬────────┘          └────────┬────────┘         │
│           │                            │                   │
│           ▼                            ▼                   │
│  ┌─────────────────┐          ┌─────────────────┐         │
│  │ Broadcasts:     │          │ Detects:        │         │
│  │ "DL-{deviceId}" │◀────────▶│ "DL-{deviceId}" │         │
│  │ Service UUID    │          │ Matches UUID    │         │
│  └─────────────────┘          └─────────────────┘         │
│                                        │                   │
│                                        ▼                   │
│                               ┌─────────────────┐         │
│                               │ Supabase Lookup │         │
│                               │ deviceId → user │         │
│                               └─────────────────┘         │
└────────────────────────────────────────────────────────────┘
```

### Configuration

```typescript
// mobile/src/config/bleConfig.ts
DROPLINK_SERVICE_UUID = 'af7d9e8c-3b2a-4f1e-9c8d-5e6f7a8b9c0d'
DROPLINK_DEVICE_PREFIX = 'DL-'
```

### Advertising (Android Only)

**Native Module:** `BLEAdvertiserNative.kt`

**What's Broadcast:**
- Device name: `"DL-{first 8 chars of userId}"`
- Service UUID: `af7d9e8c-3b2a-4f1e-9c8d-5e6f7a8b9c0d`
- Mode: `ADVERTISE_MODE_LOW_LATENCY`
- TX Power: `ADVERTISE_TX_POWER_HIGH`

**Lifecycle:**
1. User authenticates → userId available
2. User enables "Discoverable" toggle
3. `startAdvertising(serviceUUID, deviceId)` called
4. Native module sets Bluetooth adapter name to `"DL-{deviceId}"`
5. Starts BLE advertising
6. On stop: Restores original Bluetooth name

### Scanning

**Library:** `react-native-ble-plx`

**Detection Flow:**
1. Start scan (no UUID filter - scans all devices)
2. For each device:
   - Check if name starts with `"DL-"` OR has DropLink Service UUID
   - Extract deviceId from name: `"DL-29edbf25"` → `"29edbf25"`
   - Calculate distance from RSSI
   - Query Supabase for user with matching `user_id` prefix
3. Update devices array with user info

**Distance Calculation:**
```typescript
const measuredPower = -59; // RSSI at 1 meter
const distanceMeters = Math.pow(10, (measuredPower - rssi) / 20);
const distanceFeet = distanceMeters * 3.28084;
```

### Key Files

| File | Purpose |
|------|---------|
| `mobile/src/components/BLEScanner.tsx` | Scanning hook |
| `mobile/src/components/BLEAdvertiser.tsx` | Advertising hook |
| `mobile/src/config/bleConfig.ts` | Constants |
| `android/.../BLEAdvertiserNative.kt` | Native advertising |
| `android/.../BLEAdvertiserPackage.kt` | React Native bridge |

---

## 6. Drops System

### Status State Machine

```
                    ┌─────────────┐
                    │   PENDING   │ ◀── sendDrop()
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ ACCEPTED │    │ RETURNED │    │ DECLINED │
    └────┬─────┘    └────┬─────┘    └──────────┘
         │               │
         │               │ Creates reverse drop
         │               │ with status='accepted'
         │               │
         └───────┬───────┘
                 │
                 ▼
          ┌──────────┐
          │ DELETED  │ ◀── deleteDrop() [soft delete]
          └──────────┘
```

### Status Definitions

| Status | Description | Visible To | Appears On |
|--------|-------------|------------|------------|
| `pending` | Drop sent, awaiting response | Receiver only | HomeScreen modal |
| `accepted` | Receiver accepted (one-way) | Receiver only | DropScreen |
| `returned` | Mutual link created | Both users | HistoryScreen |
| `declined` | Receiver rejected | Neither | (filtered out) |
| `deleted` | Soft deleted | Neither | (filtered out) |

### Send Drop Flow

```typescript
// 1. User taps device blip on HomeScreen
// 2. Confirmation modal shows
// 3. User taps "Drop Card"

await sendDrop(receiverId, {
  name: profile.name,
  username: username,
  email: profile.email,
  phone: profile.phone,
  bio: profile.bio,
  profilePhoto: profile.profilePhoto,
  socialMedia: profile.socialMedia,
}, distanceFeet);

// Creates drops row with:
// - sender_id: current user
// - receiver_id: target user
// - status: 'pending'
// - sender_* fields: current user's contact info
```

### Receive Drop Flow

```typescript
// 1. HomeScreen polls getIncomingDrops() every 5s
// 2. If pending drops found, shows modal
// 3. User chooses action:

// ACCEPT (one-way save)
await updateDropStatus(dropId, 'accepted');
// → Updates status to 'accepted'
// → Drop appears on receiver's DropScreen

// RETURN (mutual link)
await updateDropStatus(dropId, 'returned', {
  name, email, phone, bio, profilePhoto, socialMedia
});
// → Updates status to 'returned'
// → Creates SECOND drop in reverse direction:
//   - sender_id: current user (responder)
//   - receiver_id: original sender
//   - status: 'accepted'
//   - sender_* fields: responder's contact info
// → Both users now see each other in HistoryScreen

// DECLINE
await updateDropStatus(dropId, 'declined');
// → Updates status to 'declined'
// → Drop filtered out from all queries
```

### Query Logic

| Function | Filters | Used By |
|----------|---------|---------|
| `getIncomingDrops()` | `receiver_id = me`, `status = 'pending'` | HomeScreen |
| `getAcceptedDrops()` | `receiver_id = me`, `status = 'accepted'` | DropScreen |
| `getLinkedDrops()` | `receiver_id = me`, `status = 'returned'` | HistoryScreen |

**Why only `receiver_id = me`?**
- For mutual links, there are 2 drop rows (A→B and B→A)
- Each user sees the drop where they are receiver
- The `sender_*` fields contain the OTHER person's info

### Key Files

| File | Function |
|------|----------|
| `mobile/src/services/api.ts` | All drop API functions |
| `mobile/src/screens/HomeScreen.tsx` | Incoming drops modal |
| `mobile/src/screens/DropScreen.tsx` | Accepted drops list |
| `mobile/src/screens/HistoryScreen.tsx` | Mutual links list |

---

## 7. Pins System

### Storage

**Database:** `pinned_contacts` table
- Only supports `device_id` (INTEGER) - legacy devices
- Composite key: `(user_id, device_id)`

**Local State:** `PinnedProfilesContext` in App.tsx
- `pinnedIds: Set<string | number>`
- Supports both device IDs (number) and drop IDs (string UUID)

### Behavior

| ID Type | Persistence | Source |
|---------|-------------|--------|
| Number (device_id) | Supabase | Legacy devices table |
| String (drop UUID) | Local only | Drops table |

### Toggle Logic

```typescript
const togglePin = async (id: string | number) => {
  const isPinned = pinnedIds.has(id);
  
  if (typeof id === 'number') {
    // Legacy device - sync to Supabase
    if (isPinned) {
      await unpinContact(id);
    } else {
      await pinContact(id);
    }
  }
  
  // Update local state (both types)
  if (isPinned) {
    pinnedIds.delete(id);
  } else {
    pinnedIds.add(id);
  }
};
```

### Display

- **Sorting:** Pinned items always appear first
- **Icon:** `pin` (filled orange) when pinned, `pin-outline` (gray) when not
- **Location:** HistoryScreen, DropScreen contact rows

---

## 8. Delete Operations

### Soft Delete (Drops)

```typescript
// deleteDrop() in api.ts
await supabase
  .from('drops')
  .update({ 
    status: 'deleted',
    responded_at: new Date().toISOString()
  })
  .eq('id', dropId)
  .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
```

**Behavior:**
- Row remains in database with `status = 'deleted'`
- Filtered out from all queries
- Other user's copy of link remains intact
- No cascade to other tables

### Hard Delete (Account)

```typescript
// deleteAccount() in api.ts
// Order matters due to foreign key constraints

// 1. Delete related data
await supabase.from('devices').delete().eq('user_id', userId);
await supabase.from('pinned_contacts').delete().eq('user_id', userId);
await supabase.from('user_settings').delete().eq('user_id', userId);
await supabase.from('tutorial_completions').delete().eq('user_id', userId);
await supabase.from('user_profiles').delete().eq('user_id', userId);

// 2. Delete auth user (triggers cascade)
await supabase.auth.admin.deleteUser(userId);
```

### Delete Summary

| Entity | Type | Cascade |
|--------|------|---------|
| Drop | Soft | None |
| Device | Hard | Removes pinned_contacts |
| Account | Hard | All user data |

---

## 9. Tutorial System

### Tutorial Screens

| Screen | Steps | Content |
|--------|-------|---------|
| Home | 6 | Welcome, blips, toggle, gestures, drop icon, completion |
| Drop | 1 | Nearby users explanation |
| History | 1 | Links explanation |
| Account | 1 | Profile editing |

### State Management

```typescript
// TutorialContext
interface TutorialState {
  completedTutorials: Record<ScreenName, boolean>;
  isActive: boolean;
  currentStep: number;  // 1-indexed
  totalSteps: number;
  currentScreen: ScreenName | null;
  shownScreens: Set<ScreenName>;  // Session tracking
}
```

### Lifecycle

1. **Screen mount:** `startScreenTutorial(screenName, stepCount)`
2. **Check:** If not completed AND not shown this session → show tutorial
3. **Navigation:** Next/Previous/Skip buttons
4. **Completion:** On last step or skip → `completeTutorial()`
5. **Persist:** Updates `tutorial_completions` table in Supabase

### Reset Functionality

**Not implemented.** Once completed, tutorials cannot be reset without:
- Direct database update
- Account deletion and re-creation

---

## 10. Ghost Toggle / Discoverability

### Location

Top-left corner of HomeScreen

### UI States

| State | Icon | Color | Effect |
|-------|------|-------|--------|
| Discoverable | `flash-outline` | Green | BLE advertising ON |
| Ghost Mode | `ghost-outline` | Gray | BLE advertising OFF |

### Behavior

```typescript
// When toggle changes
useEffect(() => {
  if (isDiscoverable) {
    startAdvertising();  // Broadcasts "DL-{deviceId}"
  } else {
    stopAdvertising();   // Stops BLE broadcast
  }
}, [isDiscoverable]);
```

**What it controls:**
- ✓ BLE Advertising (broadcasting your presence)
- ✗ BLE Scanning (you can still see others)
- ✗ Receiving drops (if someone has your ID, they can still send)

### Persistence

**Not persisted.** Default is `true` (discoverable) on every app launch.

---

## 11. Settings System

### Settings Structure

```typescript
interface UserSettings {
  darkMode: boolean;      // Default: true
  maxDistance: number;    // Default: 33 (feet)
  privacyZonesEnabled: boolean;  // Default: false (not in UI)
}
```

### Dark Mode

- **Storage:** `user_settings.dark_mode`
- **Context:** `DarkModeContext` with `isDarkMode`, `toggleDarkMode`
- **Effect:** Changes theme colors throughout app

### Max Distance

- **Storage:** `user_settings.max_distance`
- **Context:** `SettingsContext` with `maxDistance`, `setMaxDistance`
- **Effect:** Filters BLE devices beyond this range
- **Default:** 33 feet

### Privacy Zones

- **Storage:** `user_settings.privacy_zones_enabled`, `privacy_zones` table
- **Status:** Backend support exists, UI not implemented
- **Concept:** Geographic areas where user auto-hides

### Save/Load Flow

```typescript
// On app start
const settings = await getUserSettings();
setIsDarkMode(settings.darkMode);
setMaxDistance(settings.maxDistance);

// On change
await saveUserSettings({
  darkMode,
  maxDistance,
  privacyZonesEnabled
}, userId);
```

---

## 12. Data Synchronization

### Caching Strategy

| Data | Cache Location | Sync Frequency |
|------|----------------|----------------|
| User Profile | AsyncStorage | On login, on update |
| Auth Session | AsyncStorage (Supabase) | Auto-refresh |
| Devices | None | 5s polling |
| Incoming Drops | None | 5s polling |
| Linked Drops | None | Pull-to-refresh |
| Settings | None | On load |

### Polling Intervals

| Data | Interval | Screen |
|------|----------|--------|
| Linked Devices | 5 seconds | HomeScreen |
| Incoming Drops | 5 seconds | HomeScreen |
| BLE Scan Check | 5 seconds | HomeScreen |

### Real-time Updates

**Not implemented.** App uses polling instead of Supabase Realtime subscriptions.

### Offline Handling

- **Detection:** `useNetworkStatus()` hook monitors connectivity
- **UI:** Red "No internet connection" banner (NetworkBanner)
- **Behavior:** API calls fail with retry logic (3 retries, exponential backoff)
- **Cache:** Profile viewable from AsyncStorage when offline
- **Queue:** No offline queue for failed operations

### Cache Invalidation

| Trigger | Action |
|---------|--------|
| Pull-to-refresh | Re-fetches from Supabase |
| Login | Full data reload |
| Profile update | Immediate sync + cache update |
| Logout | Token cleared (cache persists) |

---

## 13. Known Issues & Technical Debt

### Data Model Issues

1. **Pins don't persist for drops** - String UUIDs only stored in local state
2. **Legacy devices table** - Being replaced by drops but still referenced
3. **Duplicate tutorial columns** - Both `user_profiles` and `tutorial_completions` have flags

### Missing Features

1. **Tutorial reset** - No way to replay tutorials
2. **Ghost mode persistence** - Resets to discoverable on app restart
3. **Privacy zones UI** - Backend exists, no frontend
4. **Realtime subscriptions** - Using polling instead
5. **Offline queue** - Failed operations not queued

### Security Considerations

1. **RLS policies** - Need verification for DELETE operations on drops
2. **Profile photo privacy** - All photos are public URLs

### Performance Issues

1. **BLE query on every detection** - Should cache user lookups (partially implemented)
2. **Polling frequency** - 5s may be aggressive for battery

### Code Quality

1. **AUTH_BYPASS flag** - Should be removed from production
2. **Debug logging** - Extensive `[DEBUG]` logs should be removed
3. **Legacy code** - `profiles` table references in some files

---

## Appendix: File Structure

```
mobile/
├── src/
│   ├── components/
│   │   ├── BLEAdvertiser.tsx      # BLE advertising hook
│   │   ├── BLEScanner.tsx         # BLE scanning hook
│   │   ├── NetworkBanner.tsx      # Offline indicator
│   │   └── TutorialOverlay.tsx    # Tutorial UI
│   ├── config/
│   │   └── bleConfig.ts           # BLE constants
│   ├── contexts/
│   │   ├── AuthContext.tsx        # Authentication state
│   │   ├── TabNavigationContext.tsx
│   │   └── TutorialContext.tsx    # Tutorial state
│   ├── screens/
│   │   ├── HomeScreen.tsx         # Main radar view
│   │   ├── DropScreen.tsx         # Nearby users, accepted drops
│   │   ├── HistoryScreen.tsx      # Mutual links
│   │   ├── AccountScreen.tsx      # Profile editing
│   │   ├── LoginScreen.tsx
│   │   ├── SignupScreen.tsx
│   │   └── ...
│   ├── services/
│   │   ├── api.ts                 # All Supabase API calls
│   │   ├── supabase.ts            # Supabase client config
│   │   └── storage.ts             # AsyncStorage abstraction
│   └── utils/
│       └── network.ts             # Network status hook
├── android/
│   └── app/src/main/java/com/hirule/mobile/
│       ├── MainApplication.kt     # Native module registration
│       └── ble/
│           ├── BLEAdvertiserNative.kt
│           └── BLEAdvertiserPackage.kt
└── App.tsx                        # Root component, contexts
```
