# DropLink Network Flow Diagrams

**Last Updated:** February 20, 2026  
**Purpose:** Comprehensive visualization of all data flows in the DropLink system

---

## Table of Contents

1. [Physical Topology](#1-physical-topology)
2. [Signup Flow](#2-signup-flow)
3. [Login Flow](#3-login-flow)
4. [Profile Update Flow](#4-profile-update-flow)
5. [BLE Detection Flow](#5-ble-detection-flow)
6. [Send Drop Flow](#6-send-drop-flow)
7. [Receive Drop Flow](#7-receive-drop-flow)
8. [View Links Flow](#8-view-links-flow)
9. [Authentication Token Flow](#9-authentication-token-flow)
10. [State Management Map](#10-state-management-map)
11. [Database Transaction Details](#11-database-transaction-details)
12. [Error Handling Flows](#12-error-handling-flows)

---

## 1. Physical Topology

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           DROPLINK PHYSICAL TOPOLOGY                             │
└─────────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────────┐
                              │   SUPABASE CLOUD    │
                              │                     │
                              │  ┌───────────────┐  │
                              │  │  PostgreSQL   │  │
                              │  │   Database    │  │
                              │  │               │  │
                              │  │ • auth.users  │  │
                              │  │ • user_profiles│ │
                              │  │ • drops       │  │
                              │  │ • user_settings│ │
                              │  │ • pinned_contacts│
                              │  │ • tutorial_completions│
                              │  └───────────────┘  │
                              │                     │
                              │  ┌───────────────┐  │
                              │  │    Storage    │  │
                              │  │    Bucket     │  │
                              │  │               │  │
                              │  │ profile_photos│  │
                              │  └───────────────┘  │
                              │                     │
                              │  ┌───────────────┐  │
                              │  │  Auth Server  │  │
                              │  │    (GoTrue)   │  │
                              │  └───────────────┘  │
                              └──────────┬──────────┘
                                         │
                                         │ HTTPS (TLS 1.3)
                                         │ Port 443
                                         │
                    ┌────────────────────┴────────────────────┐
                    │                                         │
                    │              INTERNET                   │
                    │                                         │
                    └────────────────────┬────────────────────┘
                                         │
              ┌──────────────────────────┴──────────────────────────┐
              │                                                      │
              │ HTTPS                                         HTTPS  │
              │ (REST API)                                (REST API) │
              │                                                      │
              ▼                                                      ▼
┌─────────────────────────┐                          ┌─────────────────────────┐
│       DEVICE A          │                          │       DEVICE B          │
│   (Android Phone)       │                          │   (Android Phone)       │
│                         │                          │                         │
│  ┌───────────────────┐  │                          │  ┌───────────────────┐  │
│  │  React Native App │  │                          │  │  React Native App │  │
│  │                   │  │                          │  │                   │  │
│  │  • JS Bundle      │  │                          │  │  • JS Bundle      │  │
│  │  • Native Modules │  │                          │  │  • Native Modules │  │
│  │  • AsyncStorage   │  │                          │  │  • AsyncStorage   │  │
│  └─────────┬─────────┘  │                          │  └─────────┬─────────┘  │
│            │            │                          │            │            │
│  ┌─────────▼─────────┐  │     BLE RADIO           │  ┌─────────▼─────────┐  │
│  │  BLE Advertiser   │  │     2.4 GHz             │  │   BLE Scanner     │  │
│  │  (Kotlin Native)  │──┼─────────────────────────┼──│ (react-native-    │  │
│  │                   │  │  "DL-{deviceId}"        │  │    ble-plx)       │  │
│  │  Broadcasts:      │  │  Service UUID           │  │                   │  │
│  │  • Device Name    │  │                         │  │  Detects:         │  │
│  │  • Service UUID   │  │◀────────────────────────┼──│  • RSSI           │  │
│  └───────────────────┘  │                         │  │  • Device Name    │  │
│                         │                         │  │  • Service UUIDs  │  │
└─────────────────────────┘                         │  └───────────────────┘  │
                                                    └─────────────────────────┘

LEGEND:
═══════
HTTPS ────────  Encrypted TCP connection (TLS 1.3)
BLE   ─ ─ ─ ─   Bluetooth Low Energy radio (2.4 GHz)
```

---

## 2. Signup Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SIGNUP FLOW                                         │
└─────────────────────────────────────────────────────────────────────────────────┘

USER INPUT                    MOBILE APP                         SUPABASE
─────────                     ──────────                         ────────

┌─────────────┐
│ User Types: │
│ • Name      │
│ • Username  │
│ • Email     │
│ • Password  │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────────┐
│     REAL-TIME VALIDATION (Local)     │
├──────────────────────────────────────┤
│ Username: 3-20 chars, [a-zA-Z0-9_.]  │
│ Email: regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/  │
│ Password: 8+ chars, A-Z, a-z, 0-9, special │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│   AVAILABILITY CHECK (Debounced)     │
│                                      │
│   checkUsernameAvailability()        │
│   checkEmailAvailability()           │
└──────────────────┬───────────────────┘
                   │
                   │  ┌─────────────────────────────────────────────────┐
                   │  │ HTTP GET                                         │
                   │  │ /rest/v1/user_profiles?username=eq.{username}   │
                   │  │ Headers: apikey, Authorization                   │
                   ├──┼────────────────────────────────────────────────▶│
                   │  └─────────────────────────────────────────────────┘
                   │                                                     │
                   │  ┌─────────────────────────────────────────────────┐
                   │  │ HTTP 200 OK                                      │
                   │◀─┤ Body: [] (empty = available)                     │
                   │  │   or [{...}] (taken)                            │
                   │  └─────────────────────────────────────────────────┘
                   │
                   ▼
       ┌──────────────────────┐
       │ User Taps "Sign Up"  │
       └──────────┬───────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           STEP 1: CREATE AUTH USER                               │
└─────────────────────────────────────────────────────────────────────────────────┘
                  │
                  │  ┌─────────────────────────────────────────────────┐
                  │  │ HTTP POST /auth/v1/signup                        │
                  │  │ Headers:                                         │
                  │  │   Content-Type: application/json                 │
                  │  │   apikey: {SUPABASE_ANON_KEY}                    │
                  │  │ Body:                                            │
                  │  │   {                                              │
                  │  │     "email": "user@example.com",                 │
                  │  │     "password": "SecurePass123!",                │
                  │  │     "options": {                                 │
                  │  │       "data": { "username": "johndoe" }          │
                  │  │     }                                            │
                  │  │   }                                              │
                  ├──┼────────────────────────────────────────────────▶│
                  │  └─────────────────────────────────────────────────┘
                  │                                                     │
                  │                                        ┌────────────▼────────────┐
                  │                                        │   AUTH SERVER (GoTrue)   │
                  │                                        ├──────────────────────────┤
                  │                                        │ 1. Validate credentials  │
                  │                                        │ 2. Hash password (bcrypt)│
                  │                                        │ 3. Generate UUID         │
                  │                                        │ 4. INSERT INTO auth.users│
                  │                                        │ 5. Generate JWT          │
                  │                                        │ 6. Generate refresh token│
                  │                                        └────────────┬─────────────┘
                  │                                                     │
                  │  ┌─────────────────────────────────────────────────┐
                  │  │ HTTP 200 OK                                      │
                  │◀─┤ Body:                                            │
                  │  │   {                                              │
                  │  │     "access_token": "eyJhbGciOiJIUzI1NiI...",   │
                  │  │     "token_type": "bearer",                      │
                  │  │     "expires_in": 3600,                          │
                  │  │     "refresh_token": "abc123...",                │
                  │  │     "user": {                                    │
                  │  │       "id": "29edbf25-00d3-41c0-afb7-...",      │
                  │  │       "email": "user@example.com",               │
                  │  │       "user_metadata": { "username": "johndoe" } │
                  │  │     }                                            │
                  │  │   }                                              │
                  │  └─────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STEP 2: CREATE USER PROFILE                               │
└─────────────────────────────────────────────────────────────────────────────────┘
                  │
                  │  ┌─────────────────────────────────────────────────┐
                  │  │ HTTP POST /rest/v1/user_profiles                 │
                  │  │ Headers:                                         │
                  │  │   Content-Type: application/json                 │
                  │  │   apikey: {SUPABASE_ANON_KEY}                    │
                  │  │   Authorization: Bearer {access_token}           │
                  │  │ Body:                                            │
                  │  │   {                                              │
                  │  │     "user_id": "29edbf25-00d3-41c0-afb7-...",   │
                  │  │     "email": "user@example.com",                 │
                  │  │     "username": "johndoe",                       │
                  │  │     "name": "John Doe",                          │
                  │  │     "phone": null,                               │
                  │  │     "bio": null,                                 │
                  │  │     "social_media": [],                          │
                  │  │     "tutorial_home_completed": false,            │
                  │  │     "tutorial_drop_completed": false,            │
                  │  │     "tutorial_history_completed": false,         │
                  │  │     "tutorial_account_completed": false          │
                  │  │   }                                              │
                  ├──┼────────────────────────────────────────────────▶│
                  │  └─────────────────────────────────────────────────┘
                  │                                                     │
                  │                                   ┌─────────────────▼─────────────────┐
                  │                                   │          PostgreSQL               │
                  │                                   ├───────────────────────────────────┤
                  │                                   │ INSERT INTO user_profiles (       │
                  │                                   │   user_id, email, username, name, │
                  │                                   │   phone, bio, social_media,       │
                  │                                   │   tutorial_home_completed, ...    │
                  │                                   │ ) VALUES (...);                   │
                  │                                   │                                   │
                  │                                   │ RLS CHECK: auth.uid() = user_id   │
                  │                                   │ Result: PASS (JWT contains uid)   │
                  │                                   └─────────────────┬─────────────────┘
                  │                                                     │
                  │  ┌─────────────────────────────────────────────────┐
                  │◀─┤ HTTP 201 Created                                 │
                  │  │ Body: {...created row...}                        │
                  │  └─────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STEP 3: CREATE USER SETTINGS                              │
└─────────────────────────────────────────────────────────────────────────────────┘
                  │
                  │  ┌─────────────────────────────────────────────────┐
                  │  │ HTTP POST /rest/v1/user_settings                 │
                  │  │ Headers:                                         │
                  │  │   Authorization: Bearer {access_token}           │
                  │  │ Body:                                            │
                  │  │   {                                              │
                  │  │     "user_id": "29edbf25-00d3-41c0-afb7-...",   │
                  │  │     "dark_mode": true,                           │
                  │  │     "max_distance": 33                           │
                  │  │   }                                              │
                  ├──┼────────────────────────────────────────────────▶│
                  │  └─────────────────────────────────────────────────┘
                  │                                                     │
                  │  ┌─────────────────────────────────────────────────┐
                  │◀─┤ HTTP 201 Created                                 │
                  │  └─────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         STEP 4: STORE SESSION LOCALLY                            │
└─────────────────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
       ┌─────────────────────────────────────┐
       │         AsyncStorage.setItem         │
       ├─────────────────────────────────────┤
       │ Key: 'sb-{projectRef}-auth-token'   │
       │ Value: {                            │
       │   "access_token": "eyJhbG...",      │
       │   "refresh_token": "abc123...",     │
       │   "expires_at": 1708456800,         │
       │   "user": {...}                     │
       │ }                                   │
       └─────────────────────────────────────┘
                  │
                  ▼
       ┌─────────────────────────────────────┐
       │      UPDATE REACT STATE             │
       ├─────────────────────────────────────┤
       │ AuthContext:                        │
       │   isAuthenticated: true             │
       │   userId: "29edbf25-..."            │
       │   username: "johndoe"               │
       │   token: "eyJhbG..."                │
       │   loading: false                    │
       └─────────────────────────────────────┘
                  │
                  ▼
       ┌─────────────────────────────────────┐
       │    NAVIGATE TO HOME SCREEN          │
       │    Show profile photo prompt        │
       └─────────────────────────────────────┘
```

---

## 3. Login Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               LOGIN FLOW                                         │
└─────────────────────────────────────────────────────────────────────────────────┘

USER                          MOBILE APP                         SUPABASE
────                          ──────────                         ────────

┌─────────────┐
│ User Types: │
│ • Email     │
│ • Password  │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ Tap "Log In"     │
└────────┬─────────┘
         │
         │  ┌─────────────────────────────────────────────────┐
         │  │ HTTP POST /auth/v1/token?grant_type=password     │
         │  │ Headers:                                         │
         │  │   Content-Type: application/json                 │
         │  │   apikey: {SUPABASE_ANON_KEY}                    │
         │  │ Body:                                            │
         │  │   {                                              │
         │  │     "email": "user@example.com",                 │
         │  │     "password": "SecurePass123!"                 │
         │  │   }                                              │
         ├──┼────────────────────────────────────────────────▶│
         │  └─────────────────────────────────────────────────┘
         │                                                     │
         │                                        ┌────────────▼────────────┐
         │                                        │   AUTH SERVER           │
         │                                        ├──────────────────────────┤
         │                                        │ 1. Find user by email    │
         │                                        │ 2. Verify password hash  │
         │                                        │ 3. Generate new JWT      │
         │                                        │ 4. Generate refresh token│
         │                                        │ 5. Log login event       │
         │                                        └────────────┬─────────────┘
         │                                                     │
         │  ┌─────────────────────────────────────────────────┐
         │  │ HTTP 200 OK                                      │
         │◀─┤ Body:                                            │
         │  │   {                                              │
         │  │     "access_token": "eyJhbGciOiJIUzI1NiI...",   │
         │  │     "token_type": "bearer",                      │
         │  │     "expires_in": 3600,                          │
         │  │     "refresh_token": "xyz789...",                │
         │  │     "user": {                                    │
         │  │       "id": "29edbf25-00d3-41c0-afb7-...",      │
         │  │       "email": "user@example.com",               │
         │  │       "user_metadata": { "username": "johndoe" } │
         │  │     }                                            │
         │  │   }                                              │
         │  └─────────────────────────────────────────────────┘
         │
         │  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
         │  │ ERROR CASE: Invalid credentials                  │
         │  │ HTTP 400 Bad Request                             │
         │  │ Body: { "error": "Invalid login credentials" }   │
         │  │ → Show toast "Invalid email or password"         │
         │  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         LOAD USER DATA                                           │
└─────────────────────────────────────────────────────────────────────────────────┘
         │
         ├────────────────────────────────────────────────────────────────────────┐
         │                                                                         │
         ▼                                                                         │
┌─────────────────────────────────┐                                               │
│ GET /rest/v1/user_profiles      │                                               │
│ ?user_id=eq.{userId}            │                                               │
│ &select=*                       │────────────────────────────────▶ PostgreSQL   │
└─────────────────────────────────┘                                               │
         │                                                                         │
         ▼                                                                         │
┌─────────────────────────────────┐                                               │
│ GET /rest/v1/user_settings      │                                               │
│ ?user_id=eq.{userId}            │────────────────────────────────▶ PostgreSQL   │
└─────────────────────────────────┘                                               │
         │                                                                         │
         ▼                                                                         │
┌─────────────────────────────────┐                                               │
│ GET /rest/v1/pinned_contacts    │                                               │
│ ?user_id=eq.{userId}            │────────────────────────────────▶ PostgreSQL   │
└─────────────────────────────────┘                                               │
         │                                                                         │
         ▼                                                                         │
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     UPDATE LOCAL STATE & CACHE                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  AsyncStorage:                    React State:                                  │
│  ┌─────────────────────────┐     ┌─────────────────────────────────────────┐   │
│  │ userProfile: {          │     │ profile: { name, email, phone, bio... } │   │
│  │   name: "John Doe",     │     │ isDarkMode: true                        │   │
│  │   email: "...",         │     │ maxDistance: 33                         │   │
│  │   ...                   │     │ pinnedIds: Set([1, 2, 3])               │   │
│  │ }                       │     └─────────────────────────────────────────┘   │
│  └─────────────────────────┘                                                    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│     NAVIGATE TO HOME SCREEN         │
│     Show toast "Welcome back!"      │
└─────────────────────────────────────┘
```

---

## 4. Profile Update Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PROFILE UPDATE FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────────┘

USER                          MOBILE APP                         SUPABASE
────                          ──────────                         ────────

┌─────────────────────┐
│ User edits profile: │
│ • Changes name      │
│ • Adds phone        │
│ • Updates bio       │
│ • Taps "Save"       │
└──────────┬──────────┘
           │
           ▼
┌────────────────────────────────────────┐
│        updateProfile(newProfile)        │
│                                        │
│  Called from AccountScreen via         │
│  UserProfileContext                    │
└────────────────────┬───────────────────┘
                     │
                     │  ┌─────────────────────────────────────────────────┐
                     │  │ HTTP PATCH /rest/v1/user_profiles               │
                     │  │ ?user_id=eq.29edbf25-00d3-41c0-afb7-...         │
                     │  │                                                 │
                     │  │ Headers:                                        │
                     │  │   Content-Type: application/json                │
                     │  │   apikey: {SUPABASE_ANON_KEY}                   │
                     │  │   Authorization: Bearer {access_token}          │
                     │  │   Prefer: return=representation                 │
                     │  │                                                 │
                     │  │ Body:                                           │
                     │  │   {                                             │
                     │  │     "name": "John D. Smith",                    │
                     │  │     "phone": "+1-555-123-4567",                 │
                     │  │     "bio": "Software developer",                │
                     │  │     "social_media": [                           │
                     │  │       {"platform": "twitter", "handle": "@john"}│
                     │  │     ]                                           │
                     │  │   }                                             │
                     ├──┼───────────────────────────────────────────────▶│
                     │  └─────────────────────────────────────────────────┘
                     │                                                     │
                     │                            ┌────────────────────────▼───────┐
                     │                            │          PostgreSQL             │
                     │                            ├────────────────────────────────┤
                     │                            │ RLS Policy Check:              │
                     │                            │   auth.uid() = user_id         │
                     │                            │   → PASS                       │
                     │                            │                                │
                     │                            │ UPDATE user_profiles           │
                     │                            │ SET name = 'John D. Smith',    │
                     │                            │     phone = '+1-555-123-4567', │
                     │                            │     bio = 'Software developer',│
                     │                            │     social_media = '[...]',    │
                     │                            │     updated_at = NOW()         │
                     │                            │ WHERE user_id = '29edbf25-...' │
                     │                            │ RETURNING *;                   │
                     │                            └────────────────────────┬───────┘
                     │                                                     │
                     │  ┌─────────────────────────────────────────────────┐
                     │◀─┤ HTTP 200 OK                                      │
                     │  │ Body: [{...updated row...}]                      │
                     │  └─────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        UPDATE LOCAL STATE & CACHE                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  1. Update React State:                                                         │
│     setProfile(newProfile)                                                      │
│                                                                                 │
│  2. Update AsyncStorage Cache:                                                  │
│     AsyncStorage.setItem('userProfile', JSON.stringify(newProfile))             │
│                                                                                 │
│  3. Show Toast:                                                                 │
│     "Profile updated successfully"                                              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                          PHOTO UPLOAD FLOW                                       │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────┐
│ User selects photo  │
│ from gallery/camera │
└──────────┬──────────┘
           │
           ▼
┌────────────────────────────────────────┐
│   ImagePicker returns local URI        │
│   file:///data/user/0/com.hirule/...   │
└────────────────────┬───────────────────┘
                     │
                     ▼
┌────────────────────────────────────────┐
│      uploadProfilePhoto(uri)           │
└────────────────────┬───────────────────┘
                     │
                     │  ┌─────────────────────────────────────────────────┐
                     │  │ HTTP POST /storage/v1/object/profile_photos/    │
                     │  │           {userId}/profile.jpg                   │
                     │  │                                                 │
                     │  │ Headers:                                        │
                     │  │   Content-Type: image/jpeg                      │
                     │  │   Authorization: Bearer {access_token}          │
                     │  │                                                 │
                     │  │ Body: [binary image data]                       │
                     ├──┼───────────────────────────────────────────────▶│
                     │  └─────────────────────────────────────────────────┘
                     │                                                     │
                     │                               ┌─────────────────────▼──────┐
                     │                               │      Storage Bucket        │
                     │                               ├────────────────────────────┤
                     │                               │ RLS Check:                 │
                     │                               │   bucket = 'profile_photos'│
                     │                               │   folder = auth.uid()      │
                     │                               │   → PASS                   │
                     │                               │                            │
                     │                               │ Store file at:             │
                     │                               │ profile_photos/            │
                     │                               │   29edbf25-.../            │
                     │                               │     profile.jpg            │
                     │                               └─────────────────────┬──────┘
                     │                                                     │
                     │  ┌─────────────────────────────────────────────────┐
                     │◀─┤ HTTP 200 OK                                      │
                     │  │ Body: { "Key": "profile_photos/29edbf25-..." }   │
                     │  └─────────────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────┐
│     Get Public URL                     │
│                                        │
│  supabase.storage                      │
│    .from('profile_photos')             │
│    .getPublicUrl('{userId}/profile.jpg')│
│                                        │
│  Returns:                              │
│  https://xxx.supabase.co/storage/v1/   │
│    object/public/profile_photos/       │
│    29edbf25-.../profile.jpg            │
└────────────────────┬───────────────────┘
                     │
                     ▼
┌────────────────────────────────────────┐
│  Update user_profiles.profile_photo    │
│                                        │
│  PATCH /rest/v1/user_profiles          │
│  Body: { "profile_photo": "{url}" }    │
└────────────────────────────────────────┘
```

---

## 5. BLE Detection Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BLE DETECTION FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

DEVICE A (Advertiser)              AIR (BLE Radio)              DEVICE B (Scanner)
─────────────────────              ──────────────              ──────────────────

┌─────────────────────┐
│ User A is logged in │
│ userId: "29edbf25-  │
│   00d3-41c0-afb7-   │
│   05e193be1b84"     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ isDiscoverable = true               │
│                                     │
│ Extract deviceId:                   │
│ userId.substring(0, 8) = "29edbf25" │
└──────────────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ BLEAdvertiserNative.kt              │
│                                     │
│ 1. Save original Bluetooth name     │
│ 2. Set adapter name:                │
│    bluetoothAdapter.setName(        │
│      "DL-29edbf25"                  │
│    )                                │
│ 3. Build AdvertiseData:             │
│    • setIncludeDeviceName(true)     │
│    • addServiceUuid(DROPLINK_UUID)  │
│ 4. Start advertising                │
└──────────────────┬──────────────────┘
                   │
                   │   2.4 GHz BLE Radio
                   │   ════════════════
                   │
                   │   ┌────────────────────────────────┐
                   │   │ ADVERTISING PACKET             │
                   │   │ ────────────────────           │
                   │   │ Flags: 0x06 (LE General)       │
                   │   │ Complete Local Name:           │
                   │   │   "DL-29edbf25"                │
                   │   │ Complete 128-bit Service UUIDs:│
                   │   │   af7d9e8c-3b2a-4f1e-9c8d-... │
                   │   │ TX Power Level: HIGH           │
                   │   └────────────────────────────────┘
                   │
                   │   Broadcast every ~100ms
                   │   ──────────────────────────────────────────────▶
                   │                                                   │
                   │                                                   │
                   │                               ┌───────────────────▼────────┐
                   │                               │ BLE Scanner Callback       │
                   │                               │ onDeviceDiscovered(device) │
                   │                               └───────────────────┬────────┘
                   │                                                   │
                   │                                                   ▼
                   │                               ┌──────────────────────────────┐
                   │                               │ Device Object Received:      │
                   │                               │                              │
                   │                               │ {                            │
                   │                               │   id: "AA:BB:CC:DD:EE:FF",   │
                   │                               │   name: "DL-29edbf25",       │
                   │                               │   rssi: -65,                 │
                   │                               │   serviceUUIDs: [            │
                   │                               │     "af7d9e8c-3b2a-..."      │
                   │                               │   ]                          │
                   │                               │ }                            │
                   │                               └──────────────────┬───────────┘
                   │                                                  │
                   │                                                  ▼
                   │                               ┌──────────────────────────────┐
                   │                               │ FILTER CHECK                 │
                   │                               │                              │
                   │                               │ if (name.startsWith("DL-")   │
                   │                               │     OR                       │
                   │                               │     serviceUUIDs.includes(   │
                   │                               │       DROPLINK_UUID))        │
                   │                               │   → PASS (DropLink device)   │
                   │                               └──────────────────┬───────────┘
                   │                                                  │
                   │                                                  ▼
                   │                               ┌──────────────────────────────┐
                   │                               │ DISTANCE CALCULATION         │
                   │                               │                              │
                   │                               │ rssi = -65 dBm               │
                   │                               │ measuredPower = -59 dBm      │
                   │                               │                              │
                   │                               │ distanceMeters =             │
                   │                               │   10^((-59 - (-65)) / 20)    │
                   │                               │ = 10^(6/20)                  │
                   │                               │ = 10^0.3                     │
                   │                               │ ≈ 2.0 meters                 │
                   │                               │                              │
                   │                               │ distanceFeet = 2.0 * 3.28084 │
                   │                               │ ≈ 6.6 feet                   │
                   │                               └──────────────────┬───────────┘
                   │                                                  │
                   │                                                  ▼
                   │                               ┌──────────────────────────────┐
                   │                               │ EXTRACT DEVICE ID            │
                   │                               │                              │
                   │                               │ name = "DL-29edbf25"         │
                   │                               │ deviceId = name.slice(3)     │
                   │                               │         = "29edbf25"         │
                   │                               └──────────────────┬───────────┘
                   │                                                  │
                   │                                                  │
┌──────────────────┼──────────────────────────────────────────────────┼──────────┐
│                  │              SUPABASE LOOKUP                     │          │
└──────────────────┼──────────────────────────────────────────────────┼──────────┘
                   │                                                  │
                   │                                                  ▼
                   │                    ┌─────────────────────────────────────────┐
                   │                    │ HTTP GET /rest/v1/user_profiles         │
                   │                    │ ?user_id=ilike.29edbf25%                │
                   │                    │ &select=user_id,name,username           │
                   │                    │ &limit=1                                │
                   │                    │                                         │
                   │                    │ Headers:                                │
                   │                    │   Authorization: Bearer {token}         │
                   │                    └─────────────────────────────────────────┘
                   │                                                  │
                   │                                                  │
                   │                               ┌──────────────────▼───────────┐
                   │                               │       PostgreSQL             │
                   │                               ├──────────────────────────────┤
                   │                               │ SELECT user_id, name, username│
                   │                               │ FROM user_profiles           │
                   │                               │ WHERE user_id ILIKE '29edbf25%'│
                   │                               │ LIMIT 1;                     │
                   │                               │                              │
                   │                               │ Result:                      │
                   │                               │ {                            │
                   │                               │   user_id: "29edbf25-00d3-...",│
                   │                               │   name: "John Doe",          │
                   │                               │   username: "johndoe"        │
                   │                               │ }                            │
                   │                               └──────────────────┬───────────┘
                   │                                                  │
                   │                    ┌─────────────────────────────────────────┐
                   │                    │ HTTP 200 OK                             │
                   │              ◀─────┤ Body: [{user_id: "...", name: "...", ...}]│
                   │                    └─────────────────────────────────────────┘
                   │                                                  │
                   │                                                  ▼
                   │                               ┌──────────────────────────────┐
                   │                               │ UPDATE DEVICES ARRAY         │
                   │                               │                              │
                   │                               │ devices.push({               │
                   │                               │   id: "AA:BB:CC:DD:EE:FF",   │
                   │                               │   name: "DL-29edbf25",       │
                   │                               │   rssi: -65,                 │
                   │                               │   distanceFeet: 6.6,         │
                   │                               │   userId: "29edbf25-00d3-...",│
                   │                               │   username: "johndoe",       │
                   │                               │   displayName: "John Doe"    │
                   │                               │ });                          │
                   │                               └──────────────────┬───────────┘
                   │                                                  │
                   │                                                  ▼
                   │                               ┌──────────────────────────────┐
                   │                               │ RENDER BLIP ON RADAR         │
                   │                               │                              │
                   │                               │ <DeviceBlip                  │
                   │                               │   device={device}            │
                   │                               │   position={calculatePos()}  │
                   │                               │   onPress={handleBlipTap}    │
                   │                               │ />                           │
                   │                               │                              │
                   │                               │ Green dot appears at         │
                   │                               │ calculated position based    │
                   │                               │ on distance (6.6 ft from     │
                   │                               │ center)                      │
                   │                               └──────────────────────────────┘
```

---

## 6. Send Drop Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            SEND DROP FLOW                                        │
└─────────────────────────────────────────────────────────────────────────────────┘

USER B (Sender)                    MOBILE APP                      SUPABASE
───────────────                    ──────────                      ────────

┌───────────────────────┐
│ User B sees User A's  │
│ blip on radar         │
│ (6.6 ft away)         │
│                       │
│ Taps the green blip   │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────────────────────────┐
│           CONFIRMATION MODAL               │
├───────────────────────────────────────────┤
│                                           │
│   "Send drop to John Doe?"                │
│                                           │
│   "This will share your contact card      │
│    with them"                             │
│                                           │
│   6.6 ft away                             │
│                                           │
│   ┌─────────────┐  ┌─────────────┐        │
│   │  Cancel     │  │ Send Drop   │        │
│   └─────────────┘  └─────────────┘        │
│                                           │
└───────────────────────────────────────────┘
            │
            │ User taps "Send Drop"
            ▼
┌───────────────────────────────────────────┐
│         sendDrop() called                 │
│                                           │
│  sendDrop(                                │
│    "29edbf25-00d3-41c0-afb7-...",  // A's userId   
│    {                                      │
│      name: "Jane Smith",           // B's profile
│      username: "janesmith",               │
│      email: "jane@example.com",           │
│      phone: "+1-555-987-6543",            │
│      bio: "Product designer",             │
│      profilePhoto: "https://...",         │
│      socialMedia: [                       │
│        {platform: "linkedin", handle: "..."}
│      ]                                    │
│    },                                     │
│    6.6                              // distance
│  )                                        │
└───────────────────┬───────────────────────┘
                    │
                    │  ┌─────────────────────────────────────────────────┐
                    │  │ HTTP POST /rest/v1/drops                        │
                    │  │                                                 │
                    │  │ Headers:                                        │
                    │  │   Content-Type: application/json                │
                    │  │   apikey: {SUPABASE_ANON_KEY}                   │
                    │  │   Authorization: Bearer {B's access_token}      │
                    │  │   Prefer: return=representation                 │
                    │  │                                                 │
                    │  │ Body:                                           │
                    │  │   {                                             │
                    │  │     "sender_id": "744df100-0ea0-4614-...",   // B's ID
                    │  │     "receiver_id": "29edbf25-00d3-41c0-...", // A's ID
                    │  │     "status": "pending",                        │
                    │  │     "distance_feet": 6.6,                       │
                    │  │     "sender_name": "Jane Smith",                │
                    │  │     "sender_username": "janesmith",             │
                    │  │     "sender_email": "jane@example.com",         │
                    │  │     "sender_phone": "+1-555-987-6543",          │
                    │  │     "sender_bio": "Product designer",           │
                    │  │     "sender_profile_photo": "https://...",      │
                    │  │     "sender_social_media": [{"platform":...}]   │
                    │  │   }                                             │
                    ├──┼───────────────────────────────────────────────▶│
                    │  └─────────────────────────────────────────────────┘
                    │                                                     │
                    │                            ┌────────────────────────▼───────┐
                    │                            │          PostgreSQL             │
                    │                            ├────────────────────────────────┤
                    │                            │ INSERT INTO drops (            │
                    │                            │   id,                          │
                    │                            │   sender_id,                   │
                    │                            │   receiver_id,                 │
                    │                            │   status,                      │
                    │                            │   distance_feet,               │
                    │                            │   sender_name,                 │
                    │                            │   sender_username,             │
                    │                            │   sender_email,                │
                    │                            │   sender_phone,                │
                    │                            │   sender_bio,                  │
                    │                            │   sender_profile_photo,        │
                    │                            │   sender_social_media,         │
                    │                            │   created_at                   │
                    │                            │ ) VALUES (                     │
                    │                            │   gen_random_uuid(),           │
                    │                            │   '744df100-...',              │
                    │                            │   '29edbf25-...',              │
                    │                            │   'pending',                   │
                    │                            │   6.6,                         │
                    │                            │   'Jane Smith',                │
                    │                            │   'janesmith',                 │
                    │                            │   'jane@example.com',          │
                    │                            │   '+1-555-987-6543',           │
                    │                            │   'Product designer',          │
                    │                            │   'https://...',               │
                    │                            │   '[{"platform":...}]',        │
                    │                            │   NOW()                        │
                    │                            │ ) RETURNING *;                 │
                    │                            └────────────────────────┬───────┘
                    │                                                     │
                    │  ┌─────────────────────────────────────────────────┐
                    │◀─┤ HTTP 201 Created                                 │
                    │  │ Body: [{                                         │
                    │  │   "id": "1a8f120f-905c-48d0-a488-...",           │
                    │  │   "sender_id": "744df100-...",                   │
                    │  │   "receiver_id": "29edbf25-...",                 │
                    │  │   "status": "pending",                           │
                    │  │   "created_at": "2026-02-20T12:34:56Z",          │
                    │  │   ...all sender_* fields...                      │
                    │  │ }]                                               │
                    │  └─────────────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────┐
│              UI UPDATES                   │
├───────────────────────────────────────────┤
│                                           │
│  1. Close modal:                          │
│     setActive(null)                       │
│                                           │
│  2. Show toast:                           │
│     "Drop sent to John Doe!"              │
│                                           │
└───────────────────────────────────────────┘
```

---

## 7. Receive Drop Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           RECEIVE DROP FLOW                                      │
└─────────────────────────────────────────────────────────────────────────────────┘

                               DEVICE A (Receiver)                    SUPABASE
                               ──────────────────                    ────────

┌─────────────────────────────────────────────────────────────────────────────────┐
│                          POLLING LOOP (Every 5 seconds)                          │
└─────────────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────────────────┐
                    │   setInterval(() => {         │
                    │     fetchIncomingDrops();     │
                    │   }, 5000);                   │
                    └───────────────┬───────────────┘
                                    │
                                    │  ┌─────────────────────────────────────────────────┐
                                    │  │ HTTP GET /rest/v1/drops                         │
                                    │  │ ?receiver_id=eq.29edbf25-00d3-41c0-...          │
                                    │  │ &status=eq.pending                              │
                                    │  │ &order=created_at.desc                          │
                                    │  │                                                 │
                                    │  │ Headers:                                        │
                                    │  │   Authorization: Bearer {A's access_token}      │
                                    ├──┼───────────────────────────────────────────────▶│
                                    │  └─────────────────────────────────────────────────┘
                                    │                                                     │
                                    │                            ┌────────────────────────▼───────┐
                                    │                            │          PostgreSQL             │
                                    │                            ├────────────────────────────────┤
                                    │                            │ SELECT * FROM drops            │
                                    │                            │ WHERE receiver_id = '29edbf25-...'
                                    │                            │   AND status = 'pending'       │
                                    │                            │ ORDER BY created_at DESC;      │
                                    │                            │                                │
                                    │                            │ RLS Check:                     │
                                    │                            │   auth.uid() = receiver_id     │
                                    │                            │   → PASS                       │
                                    │                            └────────────────────────┬───────┘
                                    │                                                     │
                                    │  ┌─────────────────────────────────────────────────┐
                                    │◀─┤ HTTP 200 OK                                      │
                                    │  │ Body: [{                                         │
                                    │  │   "id": "1a8f120f-905c-48d0-a488-...",           │
                                    │  │   "sender_id": "744df100-...",                   │
                                    │  │   "receiver_id": "29edbf25-...",                 │
                                    │  │   "status": "pending",                           │
                                    │  │   "distance_feet": 6.6,                          │
                                    │  │   "sender_name": "Jane Smith",                   │
                                    │  │   "sender_username": "janesmith",                │
                                    │  │   "sender_email": "jane@example.com",            │
                                    │  │   "sender_phone": "+1-555-987-6543",             │
                                    │  │   "sender_bio": "Product designer",              │
                                    │  │   "sender_profile_photo": "https://...",         │
                                    │  │   "sender_social_media": [...]                   │
                                    │  │ }]                                               │
                                    │  └─────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────────────────┐
                    │         STATE UPDATE                      │
                    │                                           │
                    │  setIncomingDrops(drops);                 │
                    │                                           │
                    │  Raindrop icon changes:                   │
                    │    "water-outline" → "water" (filled)     │
                    └───────────────────┬───────────────────────┘
                                        │
                                        │ User notices filled raindrop
                                        │ Taps the raindrop icon
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          INCOMING DROP MODAL                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌───────────────────────────────────────────────────────────┐                 │
│   │  ┌─────────────────────────────────────────────────────┐  │                 │
│   │  │ Jane Smith sent you a drop                          │  │                 │
│   │  │ 6.6 ft away • @janesmith                            │  │                 │
│   │  └─────────────────────────────────────────────────────┘  │                 │
│   │                                                           │                 │
│   │  ┌─────────┐                                              │                 │
│   │  │  Photo  │  Jane Smith                                  │                 │
│   │  │         │  @janesmith                                  │                 │
│   │  └─────────┘                                              │                 │
│   │                                                           │                 │
│   │  📧 jane@example.com                                      │                 │
│   │  📱 +1-555-987-6543                                       │                 │
│   │  💼 linkedin.com/in/...                                   │                 │
│   │                                                           │                 │
│   │  BIO: "Product designer"                                  │                 │
│   │                                                           │                 │
│   │  ┌────────┐  ┌────────┐  ┌─────────┐                      │                 │
│   │  │ Accept │  │ Return │  │ Decline │                      │                 │
│   │  └────────┘  └────────┘  └─────────┘                      │                 │
│   └───────────────────────────────────────────────────────────┘                 │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ User taps "Return" (mutual link)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    UPDATE DROP STATUS TO 'RETURNED'                              │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │  ┌─────────────────────────────────────────────────┐
                                        │  │ HTTP PATCH /rest/v1/drops                       │
                                        │  │ ?id=eq.1a8f120f-905c-48d0-...                   │
                                        │  │                                                 │
                                        │  │ Headers:                                        │
                                        │  │   Authorization: Bearer {A's access_token}      │
                                        │  │   Prefer: return=representation                 │
                                        │  │                                                 │
                                        │  │ Body:                                           │
                                        │  │   {                                             │
                                        │  │     "status": "returned",                       │
                                        │  │     "responded_at": "2026-02-20T12:40:00Z"      │
                                        │  │   }                                             │
                                        ├──┼───────────────────────────────────────────────▶│
                                        │  └─────────────────────────────────────────────────┘
                                        │                                                     │
                                        │                            ┌────────────────────────▼───────┐
                                        │                            │          PostgreSQL             │
                                        │                            ├────────────────────────────────┤
                                        │                            │ UPDATE drops                   │
                                        │                            │ SET status = 'returned',       │
                                        │                            │     responded_at = NOW()       │
                                        │                            │ WHERE id = '1a8f120f-...'      │
                                        │                            │   AND receiver_id = auth.uid() │
                                        │                            │ RETURNING *;                   │
                                        │                            └────────────────────────┬───────┘
                                        │                                                     │
                                        │  ┌─────────────────────────────────────────────────┐
                                        │◀─┤ HTTP 200 OK                                      │
                                        │  └─────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      CREATE REVERSE DROP (A's info → B)                          │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │  ┌─────────────────────────────────────────────────┐
                                        │  │ HTTP POST /rest/v1/drops                        │
                                        │  │                                                 │
                                        │  │ Body:                                           │
                                        │  │   {                                             │
                                        │  │     "sender_id": "29edbf25-...",    // A's ID   │
                                        │  │     "receiver_id": "744df100-...",  // B's ID   │
                                        │  │     "status": "accepted",  // auto-accepted     │
                                        │  │     "distance_feet": 6.6,                       │
                                        │  │     "sender_name": "John Doe",      // A's info │
                                        │  │     "sender_username": "johndoe",               │
                                        │  │     "sender_email": "john@example.com",         │
                                        │  │     "sender_phone": "+1-555-123-4567",          │
                                        │  │     "sender_bio": "Software developer",         │
                                        │  │     "sender_profile_photo": "https://...",      │
                                        │  │     "sender_social_media": [...]                │
                                        │  │   }                                             │
                                        ├──┼───────────────────────────────────────────────▶│
                                        │  └─────────────────────────────────────────────────┘
                                        │                                                     │
                                        │  ┌─────────────────────────────────────────────────┐
                                        │◀─┤ HTTP 201 Created                                 │
                                        │  └─────────────────────────────────────────────────┘
                                        │
                                        ▼
                    ┌───────────────────────────────────────────┐
                    │           UI UPDATES                      │
                    │                                           │
                    │  1. Close modal: setIncomingDrop(null)    │
                    │                                           │
                    │  2. Show toast:                           │
                    │     "Linked with Jane Smith!"             │
                    │                                           │
                    │  3. Both users now see each other         │
                    │     in History screen                     │
                    └───────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                    RESULTING DATABASE STATE                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   drops table now has 2 rows:                                                   │
│                                                                                 │
│   Row 1 (original):                                                             │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │ id: 1a8f120f-...                                                         │  │
│   │ sender_id: 744df100-... (B)                                              │  │
│   │ receiver_id: 29edbf25-... (A)                                            │  │
│   │ status: 'returned'                                                       │  │
│   │ sender_*: B's contact info                                               │  │
│   └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│   Row 2 (reverse):                                                              │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │ id: 2b9f230g-...                                                         │  │
│   │ sender_id: 29edbf25-... (A)                                              │  │
│   │ receiver_id: 744df100-... (B)                                            │  │
│   │ status: 'accepted'                                                       │  │
│   │ sender_*: A's contact info                                               │  │
│   └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│   Query results:                                                                │
│   • A queries getLinkedDrops() → sees Row 1 → displays B's info                 │
│   • B queries getLinkedDrops() → sees Row 2 (as accepted) → displays A's info   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. View Links Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           VIEW LINKS FLOW                                        │
└─────────────────────────────────────────────────────────────────────────────────┘

USER                          MOBILE APP                         SUPABASE
────                          ──────────                         ────────

┌─────────────────────┐
│ User navigates to   │
│ History tab (Links) │
└──────────┬──────────┘
           │
           ▼
┌───────────────────────────────────────────┐
│  useEffect on mount:                      │
│    getLinkedDrops()                       │
└───────────────────┬───────────────────────┘
                    │
                    │  ┌─────────────────────────────────────────────────┐
                    │  │ HTTP GET /rest/v1/drops                         │
                    │  │ ?receiver_id=eq.29edbf25-00d3-41c0-...          │
                    │  │ &status=eq.returned                             │
                    │  │ &order=responded_at.desc                        │
                    │  │                                                 │
                    │  │ Headers:                                        │
                    │  │   Authorization: Bearer {access_token}          │
                    ├──┼───────────────────────────────────────────────▶│
                    │  └─────────────────────────────────────────────────┘
                    │                                                     │
                    │                            ┌────────────────────────▼───────┐
                    │                            │          PostgreSQL             │
                    │                            ├────────────────────────────────┤
                    │                            │ SELECT * FROM drops            │
                    │                            │ WHERE receiver_id = '29edbf25-...'
                    │                            │   AND status = 'returned'      │
                    │                            │ ORDER BY responded_at DESC;    │
                    │                            └────────────────────────┬───────┘
                    │                                                     │
                    │  ┌─────────────────────────────────────────────────┐
                    │◀─┤ HTTP 200 OK                                      │
                    │  │ Body: [                                          │
                    │  │   {                                              │
                    │  │     id: "1a8f120f-...",                          │
                    │  │     sender_name: "Jane Smith",                   │
                    │  │     sender_username: "janesmith",                │
                    │  │     sender_email: "jane@example.com",            │
                    │  │     sender_profile_photo: "https://...",         │
                    │  │     status: "returned",                          │
                    │  │     responded_at: "2026-02-20T12:40:00Z"         │
                    │  │   },                                             │
                    │  │   {...more links...}                             │
                    │  │ ]                                                │
                    │  └─────────────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────┐
│         STATE & UI UPDATE                 │
├───────────────────────────────────────────┤
│                                           │
│  setData(drops.map(mapDropFromDb));       │
│                                           │
│  Sort: pinned first, then by date         │
│                                           │
│  Render FlatList:                         │
│  ┌─────────────────────────────────────┐  │
│  │ ┌─────┐ Jane Smith         📌 🗑️   │  │
│  │ │Photo│ @janesmith                  │  │
│  │ └─────┘ Link • 2 hours ago          │  │
│  ├─────────────────────────────────────┤  │
│  │ ┌─────┐ Mike Johnson       📌 🗑️   │  │
│  │ │Photo│ @mikej                      │  │
│  │ └─────┘ Link • 1 day ago            │  │
│  └─────────────────────────────────────┘  │
│                                           │
└───────────────────────────────────────────┘
           │
           │ User taps row
           ▼
┌───────────────────────────────────────────┐
│        CONTACT CARD MODAL                 │
├───────────────────────────────────────────┤
│                                           │
│  setSelectedContact(item);                │
│  setShowContactModal(true);               │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │       Jane Smith                    │  │
│  │  ┌─────────┐                        │  │
│  │  │  Photo  │                        │  │
│  │  └─────────┘                        │  │
│  │       @janesmith                    │  │
│  │                                     │  │
│  │  📱 +1-555-987-6543                 │  │
│  │  📧 jane@example.com                │  │
│  │  💼 linkedin.com/in/janesmith       │  │
│  │                                     │  │
│  │  BIO                                │  │
│  │  "Product designer"                 │  │
│  │                                     │  │
│  │  ┌──────────────────────────┐       │  │
│  │  │         Close            │       │  │
│  │  └──────────────────────────┘       │  │
│  └─────────────────────────────────────┘  │
│                                           │
└───────────────────────────────────────────┘
```

---

## 9. Authentication Token Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        JWT TOKEN LIFECYCLE                                       │
└─────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                         TOKEN CREATION (Login/Signup)                            │
└─────────────────────────────────────────────────────────────────────────────────┘

                              SUPABASE AUTH SERVER
                              ────────────────────
                                       │
                                       ▼
                    ┌──────────────────────────────────────────┐
                    │           JWT PAYLOAD                    │
                    ├──────────────────────────────────────────┤
                    │ {                                        │
                    │   "aud": "authenticated",                │
                    │   "exp": 1708460400,  // 1 hour from now │
                    │   "sub": "29edbf25-00d3-41c0-...", // userId
                    │   "email": "user@example.com",           │
                    │   "phone": "",                           │
                    │   "app_metadata": {                      │
                    │     "provider": "email",                 │
                    │     "providers": ["email"]               │
                    │   },                                     │
                    │   "user_metadata": {                     │
                    │     "username": "johndoe"                │
                    │   },                                     │
                    │   "role": "authenticated",               │
                    │   "aal": "aal1",                         │
                    │   "session_id": "abc123..."              │
                    │ }                                        │
                    └──────────────────────────────────────────┘
                                       │
                                       │ Sign with HS256
                                       │ (SUPABASE_JWT_SECRET)
                                       ▼
                    ┌──────────────────────────────────────────┐
                    │              JWT TOKEN                   │
                    │  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.  │
                    │  eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhw... │
                    │  .SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV... │
                    └──────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                            TOKEN STORAGE                                         │
└─────────────────────────────────────────────────────────────────────────────────┘

    Supabase SDK stores in AsyncStorage:
    
    Key: 'sb-{projectRef}-auth-token'
    
    Value:
    ┌──────────────────────────────────────────┐
    │ {                                        │
    │   "access_token": "eyJhbGciOiJIUzI1Ni...",│
    │   "token_type": "bearer",                │
    │   "expires_in": 3600,                    │
    │   "expires_at": 1708460400,              │
    │   "refresh_token": "xyz789...",          │
    │   "user": {                              │
    │     "id": "29edbf25-00d3-41c0-...",      │
    │     "email": "user@example.com",         │
    │     "user_metadata": {...}               │
    │   }                                      │
    │ }                                        │
    └──────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                       TOKEN ATTACHMENT TO REQUESTS                               │
└─────────────────────────────────────────────────────────────────────────────────┘

    Every Supabase request:
    
    ┌──────────────────────────────────────────┐
    │ Headers:                                 │
    │   apikey: {SUPABASE_ANON_KEY}           │
    │   Authorization: Bearer eyJhbGciOiJ...  │
    │   Content-Type: application/json        │
    └──────────────────────────────────────────┘
                    │
                    │
                    ▼
    ┌──────────────────────────────────────────┐
    │        SUPABASE VALIDATES               │
    ├──────────────────────────────────────────┤
    │ 1. Decode JWT header & payload          │
    │ 2. Verify signature with JWT_SECRET     │
    │ 3. Check exp > current time             │
    │ 4. Extract auth.uid() = sub field       │
    │ 5. Apply RLS policies                   │
    └──────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                         TOKEN REFRESH FLOW                                       │
└─────────────────────────────────────────────────────────────────────────────────┘

    Supabase SDK auto-refresh (configured in supabase.ts):
    
    autoRefreshToken: true
    persistSession: true
    
    ┌────────────────────────────────────────────────────────────────────────────┐
    │                                                                            │
    │    App Active                Token Near Expiry           Refresh Flow      │
    │    ──────────                ─────────────────           ────────────      │
    │                                                                            │
    │    ┌─────────┐               ┌───────────────┐          ┌────────────┐    │
    │    │ App     │──────────────▶│ exp - now < 60s│─────────▶│ POST       │    │
    │    │ Running │               │ (1 min buffer) │          │ /auth/v1/  │    │
    │    └─────────┘               └───────────────┘          │ token?     │    │
    │                                                          │ grant_type=│    │
    │                                                          │ refresh_   │    │
    │                                                          │ token      │    │
    │                                                          └─────┬──────┘    │
    │                                                                │           │
    │    ┌─────────────────────────────────────────────────────────────┐         │
    │    │ Request Body:                                               │         │
    │    │ { "refresh_token": "xyz789..." }                           │         │
    │    └─────────────────────────────────────────────────────────────┘         │
    │                                                                │           │
    │                                                                ▼           │
    │    ┌─────────────────────────────────────────────────────────────┐         │
    │    │ Response:                                                   │         │
    │    │ {                                                          │         │
    │    │   "access_token": "eyJhbGciOiJIUzI1NiI..." (new),          │         │
    │    │   "refresh_token": "abc456..." (new),                      │         │
    │    │   "expires_in": 3600                                       │         │
    │    │ }                                                          │         │
    │    └─────────────────────────────────────────────────────────────┘         │
    │                                                                │           │
    │                                                                ▼           │
    │    ┌─────────────────────────────────────────────────────────────┐         │
    │    │ AsyncStorage updated with new tokens                        │         │
    │    └─────────────────────────────────────────────────────────────┘         │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                         TOKEN EXPIRY HANDLING                                    │
└─────────────────────────────────────────────────────────────────────────────────┘

    If token expired AND refresh fails:
    
    ┌────────────────────────────────────────────────────────────────────────────┐
    │                                                                            │
    │    ┌─────────────┐      ┌────────────────┐      ┌─────────────────────┐   │
    │    │ API Request │─────▶│ 401 Unauthorized│─────▶│ Supabase SDK       │   │
    │    │             │      │                │      │ tries refresh      │   │
    │    └─────────────┘      └────────────────┘      └──────────┬──────────┘   │
    │                                                            │              │
    │                                                            ▼              │
    │                                              ┌─────────────────────────┐  │
    │                                              │ Refresh also fails?     │  │
    │                                              │ (refresh_token expired  │  │
    │                                              │  or revoked)            │  │
    │                                              └───────────┬─────────────┘  │
    │                                                          │               │
    │                                                          ▼               │
    │                                              ┌─────────────────────────┐  │
    │                                              │ Clear session           │  │
    │                                              │ Set isAuthenticated=false│ │
    │                                              │ Navigate to Login       │  │
    │                                              └─────────────────────────┘  │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                        APP STATE TOKEN MANAGEMENT                                │
└─────────────────────────────────────────────────────────────────────────────────┘

    supabase.ts AppState listener:
    
    ┌────────────────────────────────────────────────────────────────────────────┐
    │                                                                            │
    │    App Foreground                    App Background                        │
    │    ──────────────                    ──────────────                        │
    │                                                                            │
    │    ┌─────────────────────┐           ┌─────────────────────┐              │
    │    │ AppState.addEventListener│       │ AppState change     │              │
    │    │ 'change'             │           │ to 'background'    │              │
    │    └──────────┬──────────┘           └──────────┬──────────┘              │
    │               │                                  │                         │
    │               ▼                                  ▼                         │
    │    ┌─────────────────────┐           ┌─────────────────────┐              │
    │    │ if state == 'active'│           │ supabase.auth       │              │
    │    │   startAutoRefresh()│           │   .stopAutoRefresh()│              │
    │    └─────────────────────┘           └─────────────────────┘              │
    │                                                                            │
    │    (Prevents battery drain from refresh polling when app backgrounded)     │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. State Management Map

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STATE MANAGEMENT ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                            PERSISTENCE LAYERS                                    │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌───────────────────────────────────────────────────────────────────────────┐
    │                         SUPABASE (Persistent)                             │
    │                         ════════════════════                              │
    │                                                                           │
    │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
    │   │user_profiles│  │    drops    │  │user_settings│  │pinned_contacts  │  │
    │   │             │  │             │  │             │  │                 │  │
    │   │ • name      │  │ • sender_*  │  │ • dark_mode │  │ • device_id     │  │
    │   │ • username  │  │ • receiver_*│  │ • max_dist  │  │ • user_id       │  │
    │   │ • email     │  │ • status    │  │             │  │                 │  │
    │   │ • phone     │  │ • distance  │  │             │  │                 │  │
    │   │ • bio       │  │             │  │             │  │                 │  │
    │   │ • photo     │  │             │  │             │  │                 │  │
    │   │ • social    │  │             │  │             │  │                 │  │
    │   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘  │
    │                                                                           │
    │   ┌─────────────────────┐  ┌───────────────────┐                          │
    │   │ tutorial_completions│  │   profile_photos  │ (Storage bucket)         │
    │   │                     │  │                   │                          │
    │   │ • home_completed    │  │ {userId}/profile. │                          │
    │   │ • drop_completed    │  │   jpg             │                          │
    │   │ • history_completed │  │                   │                          │
    │   │ • account_completed │  │                   │                          │
    │   └─────────────────────┘  └───────────────────┘                          │
    │                                                                           │
    └───────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTPS
                                        ▼
    ┌───────────────────────────────────────────────────────────────────────────┐
    │                       ASYNCSTORAGE (Cached)                               │
    │                       ═════════════════════                               │
    │                                                                           │
    │   ┌─────────────────────────────────────────────────────────────────────┐ │
    │   │ Key: 'sb-{projectRef}-auth-token'                                   │ │
    │   │ Value: { access_token, refresh_token, expires_at, user }            │ │
    │   │ Managed by: Supabase SDK                                            │ │
    │   └─────────────────────────────────────────────────────────────────────┘ │
    │                                                                           │
    │   ┌─────────────────────────────────────────────────────────────────────┐ │
    │   │ Key: 'userProfile'                                                  │ │
    │   │ Value: { name, email, phone, bio, socialMedia, profilePhoto }       │ │
    │   │ Managed by: App.tsx updateProfile()                                 │ │
    │   └─────────────────────────────────────────────────────────────────────┘ │
    │                                                                           │
    └───────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ Read/Write
                                        ▼
    ┌───────────────────────────────────────────────────────────────────────────┐
    │                       REACT STATE (Ephemeral)                             │
    │                       ═══════════════════════                             │
    │                                                                           │
    │   App.tsx                                                                 │
    │   ───────                                                                 │
    │   ┌─────────────────────────────────────────────────────────────────────┐ │
    │   │ profile: UserProfile                                                │ │
    │   │ isDarkMode: boolean                                                 │ │
    │   │ maxDistance: number                                                 │ │
    │   │ pinnedIds: Set<string | number>                                     │ │
    │   │ tab: 'Home' | 'Drop' | 'History' | 'Account'                        │ │
    │   └─────────────────────────────────────────────────────────────────────┘ │
    │                                                                           │
    │   HomeScreen.tsx                                                          │
    │   ──────────────                                                          │
    │   ┌─────────────────────────────────────────────────────────────────────┐ │
    │   │ incomingDrops: Drop[]           (polled every 5s)                   │ │
    │   │ linkedDevices: Device[]          (polled every 5s)                   │ │
    │   │ isDiscoverable: boolean          (local only, not persisted)        │ │
    │   │ viewRotation: number             (gesture state)                    │ │
    │   │ viewScale: number                (gesture state)                    │ │
    │   │ selectedBlipDevice: BleDevice    (modal state)                      │ │
    │   └─────────────────────────────────────────────────────────────────────┘ │
    │                                                                           │
    │   DropScreen.tsx                                                          │
    │   ──────────────                                                          │
    │   ┌─────────────────────────────────────────────────────────────────────┐ │
    │   │ acceptedDrops: Drop[]            (loaded on mount)                  │ │
    │   │ active: BleDevice | null         (modal state)                      │ │
    │   │ incomingDrop: Drop | null        (notification state)               │ │
    │   └─────────────────────────────────────────────────────────────────────┘ │
    │                                                                           │
    │   HistoryScreen.tsx                                                       │
    │   ─────────────────                                                       │
    │   ┌─────────────────────────────────────────────────────────────────────┐ │
    │   │ data: Drop[]                     (loaded on mount)                  │ │
    │   │ searchQuery: string              (filter state)                     │ │
    │   │ selectedContact: Drop | null     (modal state)                      │ │
    │   └─────────────────────────────────────────────────────────────────────┘ │
    │                                                                           │
    │   BLEScanner.tsx (Hook)                                                   │
    │   ─────────────────────                                                   │
    │   ┌─────────────────────────────────────────────────────────────────────┐ │
    │   │ devices: BleDevice[]             (live BLE detections)              │ │
    │   │ isScanning: boolean              (scan state)                       │ │
    │   │ error: string | null             (error state)                      │ │
    │   └─────────────────────────────────────────────────────────────────────┘ │
    │                                                                           │
    └───────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ Context Provider
                                        ▼
    ┌───────────────────────────────────────────────────────────────────────────┐
    │                     REACT CONTEXT (Shared State)                          │
    │                     ════════════════════════════                          │
    │                                                                           │
    │   ┌─────────────────┐  ┌────────────────────┐  ┌──────────────────────┐  │
    │   │  AuthContext    │  │ UserProfileContext │  │  SettingsContext     │  │
    │   │                 │  │                    │  │                      │  │
    │   │ • isAuthenticated│ │ • profile          │  │ • maxDistance        │  │
    │   │ • userId        │  │ • updateProfile()  │  │ • setMaxDistance()   │  │
    │   │ • username      │  │                    │  │                      │  │
    │   │ • token         │  │                    │  │                      │  │
    │   │ • loading       │  │                    │  │                      │  │
    │   │ • login()       │  │                    │  │                      │  │
    │   │ • logout()      │  │                    │  │                      │  │
    │   │ • signup()      │  │                    │  │                      │  │
    │   └─────────────────┘  └────────────────────┘  └──────────────────────┘  │
    │                                                                           │
    │   ┌─────────────────┐  ┌────────────────────┐  ┌──────────────────────┐  │
    │   │ DarkModeContext │  │ PinnedProfilesCtx  │  │  TutorialContext     │  │
    │   │                 │  │                    │  │                      │  │
    │   │ • isDarkMode    │  │ • pinnedIds        │  │ • isActive           │  │
    │   │ • toggleDarkMode│  │ • togglePin()      │  │ • currentStep        │  │
    │   │                 │  │                    │  │ • completedTutorials │  │
    │   │                 │  │                    │  │ • nextStep()         │  │
    │   │                 │  │                    │  │ • skipTutorial()     │  │
    │   └─────────────────┘  └────────────────────┘  └──────────────────────┘  │
    │                                                                           │
    │   ┌─────────────────┐  ┌────────────────────┐                             │
    │   │   ToastContext  │  │ TabNavigationCtx   │                             │
    │   │                 │  │                    │                             │
    │   │ • showToast()   │  │ • navigateToTab()  │                             │
    │   │                 │  │                    │                             │
    │   └─────────────────┘  └────────────────────┘                             │
    │                                                                           │
    └───────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Database Transaction Details

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     DATABASE TRANSACTION DETAILS                                 │
└─────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                           sendDrop() Transaction                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

    SQL Executed:
    ─────────────
    INSERT INTO drops (
        id,
        sender_id,
        receiver_id,
        status,
        distance_feet,
        sender_name,
        sender_username,
        sender_email,
        sender_phone,
        sender_bio,
        sender_profile_photo,
        sender_social_media,
        created_at
    ) VALUES (
        gen_random_uuid(),
        $1,  -- sender_id
        $2,  -- receiver_id
        'pending',
        $3,  -- distance_feet
        $4,  -- sender_name
        $5,  -- sender_username
        $6,  -- sender_email
        $7,  -- sender_phone
        $8,  -- sender_bio
        $9,  -- sender_profile_photo
        $10, -- sender_social_media (JSONB)
        NOW()
    )
    RETURNING *;
    
    Indexes Used:
    ─────────────
    • PRIMARY KEY (id) - UUID generation
    • INDEX ON (receiver_id) - for receiver lookup queries
    • INDEX ON (sender_id) - for sender lookup queries
    
    RLS Policy Check:
    ─────────────────
    • INSERT allowed for authenticated users
    • No restriction on who can send to whom
    
    Triggers:
    ─────────
    • None defined


┌─────────────────────────────────────────────────────────────────────────────────┐
│                       updateDropStatus() Transaction                             │
└─────────────────────────────────────────────────────────────────────────────────┘

    SQL Executed (Step 1 - Update original):
    ─────────────────────────────────────────
    UPDATE drops
    SET status = $1,        -- 'accepted' | 'returned' | 'declined'
        responded_at = NOW()
    WHERE id = $2           -- drop_id
      AND receiver_id = $3  -- auth.uid() from JWT
    RETURNING *;
    
    RLS Policy Check:
    ─────────────────
    • UPDATE allowed only WHERE receiver_id = auth.uid()
    • Prevents sender from modifying drop status
    
    SQL Executed (Step 2 - If status='returned', create reverse):
    ─────────────────────────────────────────────────────────────
    INSERT INTO drops (
        id,
        sender_id,      -- Original receiver (responder)
        receiver_id,    -- Original sender
        status,
        distance_feet,
        sender_name,    -- Responder's info
        ...
        created_at
    ) VALUES (
        gen_random_uuid(),
        $1,  -- responder's user_id
        $2,  -- original sender's user_id
        'accepted',  -- Auto-accepted for mutual link
        $3,  -- Same distance
        $4,  -- Responder's name
        ...
        NOW()
    )
    RETURNING *;


┌─────────────────────────────────────────────────────────────────────────────────┐
│                         deleteDrop() Transaction                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

    SQL Executed (Soft Delete):
    ───────────────────────────
    UPDATE drops
    SET status = 'deleted',
        responded_at = NOW()
    WHERE id = $1
      AND (sender_id = $2 OR receiver_id = $2);  -- auth.uid()
    
    RLS Policy Check:
    ─────────────────
    • UPDATE allowed for sender OR receiver
    • Both parties can remove their view of the link
    
    Note: Row remains in database for:
    • Audit trail
    • The other party's link is NOT affected
    • Potential future "restore" feature


┌─────────────────────────────────────────────────────────────────────────────────┐
│                          getLinkedDrops() Query                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

    SQL Executed:
    ─────────────
    SELECT *
    FROM drops
    WHERE receiver_id = $1    -- auth.uid()
      AND status = 'returned'
    ORDER BY responded_at DESC;
    
    Index Used:
    ───────────
    • INDEX ON (receiver_id, status) - Compound index for efficient filtering
    
    Query Plan:
    ───────────
    Index Scan using drops_receiver_id_status_idx on drops
      Index Cond: (receiver_id = $1 AND status = 'returned')
      Sort: responded_at DESC (uses index if available)
    
    Why receiver_id only (not OR sender_id)?
    ────────────────────────────────────────
    For mutual links, there are 2 rows:
    • A→B (A's info, B is receiver) - B sees this
    • B→A (B's info, A is receiver) - A sees this
    
    Each user sees the row where they are receiver,
    which shows the OTHER person's info (sender_*)


┌─────────────────────────────────────────────────────────────────────────────────┐
│                      User Profile Query (BLE Lookup)                             │
└─────────────────────────────────────────────────────────────────────────────────┘

    SQL Executed:
    ─────────────
    SELECT user_id, name, username
    FROM user_profiles
    WHERE user_id ILIKE $1 || '%'  -- '29edbf25%'
    LIMIT 1;
    
    Index Used:
    ───────────
    • PRIMARY KEY (user_id) - But ILIKE may require seq scan
    
    Note: ILIKE with prefix match can use btree index if:
    • Pattern doesn't start with wildcard
    • Collation is C or POSIX
    
    Optimization Opportunity:
    ─────────────────────────
    Consider adding: INDEX ON (left(user_id::text, 8))
    for faster prefix lookups
```

---

## 12. Error Handling Flows

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          ERROR HANDLING FLOWS                                    │
└─────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Network Error Handling                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌────────────────────────────────────────────────────────────────────────────┐
    │                                                                            │
    │    API Request                                                             │
    │        │                                                                   │
    │        ▼                                                                   │
    │    ┌────────────┐                                                          │
    │    │  fetch()   │                                                          │
    │    └─────┬──────┘                                                          │
    │          │                                                                 │
    │          ▼                                                                 │
    │    ┌─────────────────────────────────────────────────────────────────┐     │
    │    │                    Error Type?                                  │     │
    │    └─────────────────────────────────────────────────────────────────┘     │
    │          │                                                                 │
    │    ┌─────┴──────┬────────────────┬─────────────────┐                       │
    │    │            │                │                 │                       │
    │    ▼            ▼                ▼                 ▼                       │
    │  Network     Timeout          HTTP 4xx         HTTP 5xx                    │
    │  Error       Error            (Client)         (Server)                    │
    │    │            │                │                 │                       │
    │    ▼            ▼                ▼                 ▼                       │
    │  ┌──────┐   ┌──────┐         ┌──────┐         ┌──────┐                     │
    │  │Retry │   │Retry │         │ No   │         │Retry │                     │
    │  │ 3x   │   │ 3x   │         │Retry │         │ 3x   │                     │
    │  │ exp  │   │      │         │      │         │ exp  │                     │
    │  │backoff│  │      │         │      │         │backoff│                    │
    │  └──┬───┘   └──┬───┘         └──┬───┘         └──┬───┘                     │
    │     │          │                │                │                         │
    │     ▼          ▼                ▼                ▼                         │
    │  ┌─────────────────────────────────────────────────────────────────┐       │
    │  │                   Still Failed?                                 │       │
    │  └─────────────────────────────────────────────────────────────────┘       │
    │     │                                                                      │
    │     ▼                                                                      │
    │  ┌─────────────────────────────────────────────────────────────────┐       │
    │  │  Show Toast: "Network error. Please check your connection."     │       │
    │  │  Log error to console                                           │       │
    │  │  Return error to caller                                         │       │
    │  └─────────────────────────────────────────────────────────────────┘       │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Authentication Error Handling                             │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌────────────────────────────────────────────────────────────────────────────┐
    │                                                                            │
    │    HTTP Response                                                           │
    │        │                                                                   │
    │        ▼                                                                   │
    │    ┌─────────────────────────────────────────────────────────────────┐     │
    │    │                    Status Code?                                 │     │
    │    └─────────────────────────────────────────────────────────────────┘     │
    │          │                                                                 │
    │    ┌─────┴──────────────────┬───────────────────────┐                      │
    │    │                        │                       │                      │
    │    ▼                        ▼                       ▼                      │
    │  401 Unauthorized      403 Forbidden          400 Bad Request              │
    │    │                        │                       │                      │
    │    ▼                        ▼                       ▼                      │
    │  ┌───────────────┐   ┌───────────────┐       ┌───────────────┐            │
    │  │ Try Refresh   │   │ RLS Policy    │       │ Invalid Data  │            │
    │  │ Token         │   │ Violation     │       │               │            │
    │  └───────┬───────┘   └───────┬───────┘       └───────┬───────┘            │
    │          │                   │                       │                    │
    │          ▼                   ▼                       ▼                    │
    │    ┌───────────┐       ┌───────────────┐       ┌───────────────┐          │
    │    │ Refresh   │       │ Show: "You    │       │ Show: specific │          │
    │    │ Failed?   │       │ don't have    │       │ validation    │          │
    │    └─────┬─────┘       │ permission"   │       │ error message │          │
    │          │             └───────────────┘       └───────────────┘          │
    │    Yes   │                                                                │
    │          ▼                                                                │
    │    ┌───────────────────────────────────────────────────────────────┐      │
    │    │  Clear session                                                │      │
    │    │  Set isAuthenticated = false                                  │      │
    │    │  Navigate to Login screen                                     │      │
    │    │  Show toast: "Session expired. Please log in again."          │      │
    │    └───────────────────────────────────────────────────────────────┘      │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BLE Error Handling                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌────────────────────────────────────────────────────────────────────────────┐
    │                                                                            │
    │    BLE Operation                                                           │
    │        │                                                                   │
    │        ▼                                                                   │
    │    ┌─────────────────────────────────────────────────────────────────┐     │
    │    │                    Error Type?                                  │     │
    │    └─────────────────────────────────────────────────────────────────┘     │
    │          │                                                                 │
    │    ┌─────┴──────┬────────────────┬─────────────────┐                       │
    │    │            │                │                 │                       │
    │    ▼            ▼                ▼                 ▼                       │
    │  Bluetooth   Permission       Scan             Advertise                   │
    │  Off         Denied           Failed           Failed                      │
    │    │            │                │                 │                       │
    │    ▼            ▼                ▼                 ▼                       │
    │  ┌──────────┐ ┌──────────┐   ┌──────────┐    ┌──────────┐                  │
    │  │ Show     │ │ Show     │   │ Stop scan│    │ Log error│                  │
    │  │ banner:  │ │ settings │   │ Retry in │    │ Set      │                  │
    │  │ "Turn on │ │ prompt   │   │ 5 seconds│    │isAdvertising│               │
    │  │Bluetooth"│ │          │   │          │    │ = false  │                  │
    │  └──────────┘ └──────────┘   └──────────┘    └──────────┘                  │
    │                                                                            │
    │    BLE State Listener:                                                     │
    │    ───────────────────                                                     │
    │    • PoweredOff → Show Bluetooth off message                               │
    │    • PoweredOn  → Resume scanning                                          │
    │    • Unauthorized → Request permissions                                    │
    │    • Unsupported → Show "Device not supported" message                     │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix: HTTP Request/Response Reference

### Request Headers (All Authenticated Requests)

```
Content-Type: application/json
apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  (Supabase anon key)
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  (User JWT)
Prefer: return=representation  (For INSERT/UPDATE to return data)
```

### Common Response Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response |
| 201 | Created | Resource created |
| 204 | No Content | Success, no body |
| 400 | Bad Request | Show validation error |
| 401 | Unauthorized | Refresh token or re-login |
| 403 | Forbidden | RLS policy violation |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate key |
| 500 | Server Error | Retry with backoff |

### Base URLs

```
REST API:  https://{project-ref}.supabase.co/rest/v1/
Auth:      https://{project-ref}.supabase.co/auth/v1/
Storage:   https://{project-ref}.supabase.co/storage/v1/
Realtime:  wss://{project-ref}.supabase.co/realtime/v1/  (not currently used)
```
