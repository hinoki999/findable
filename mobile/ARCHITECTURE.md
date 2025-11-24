# DropLink Architecture Documentation

**Last Updated:** November 24, 2025  
**Version:** 1.0

---

## Table of Contents

1. [Overview](#overview)
2. [Frontend Architecture](#frontend-architecture)
3. [Backend Architecture](#backend-architecture)
4. [BLE Architecture](#ble-architecture)
5. [Data Flows](#data-flows)
6. [Known Issues](#known-issues)
7. [Security](#security)

---

## Overview

DropLink is a proximity-based profile sharing application that uses Bluetooth Low Energy (BLE) to detect nearby users and exchange contact information. The app consists of a React Native mobile frontend and a Python FastAPI backend with PostgreSQL database.

### Tech Stack

**Frontend:**
- React Native with Expo
- TypeScript
- React Native BLE PLX
- AsyncStorage for local persistence
- Context API for state management

**Backend:**
- Python 3.9+
- FastAPI
- PostgreSQL (production) / SQLite (development)
- JWT authentication
- Bcrypt for password hashing

---

## Frontend Architecture

### Project Structure

```
mobile/
├── App.tsx                 # Root component, main contexts
├── src/
│   ├── screens/           # All UI screens
│   ├── components/        # Reusable UI components
│   ├── contexts/          # React Context providers
│   ├── services/          # API and BLE services
│   └── theme.ts           # Theme configuration
```

---

### Screens

#### 1. **WelcomeScreen** (`src/screens/WelcomeScreen.tsx`)
**Purpose:** Initial landing page for unauthenticated users

**Features:**
- App introduction
- Navigation to Login or Signup
- No authentication required

**Navigation:**
- Login button → `LoginScreen`
- Signup button → `SignupScreen`

---

#### 2. **SignupScreen** (`src/screens/SignupScreen.tsx`)
**Purpose:** New user registration

**Features:**
- Multi-step signup flow
- Username, email, password collection
- Profile information (name, phone, bio)
- Password strength validation
- Email/username uniqueness checks

**API Calls:**
- `POST /auth/check-username` - Validate username availability
- `POST /auth/check-email` - Validate email availability
- `POST /auth/register` - Create new user account

**Flow:**
1. User enters credentials
2. Frontend validates input
3. Calls backend `/auth/register`
4. Backend creates user + user_profiles + user_settings rows
5. Returns JWT token
6. Frontend saves token to AsyncStorage
7. Navigates to ProfilePhotoPromptScreen

**Known Issue:** 
- Screen flashes old version briefly on load

---

#### 3. **LoginScreen** (`src/screens/LoginScreen.tsx`)
**Purpose:** User authentication

**Features:**
- Username/email + password login
- Account lockout after 5 failed attempts
- Remember credentials option

**API Calls:**
- `POST /auth/login` - Authenticate user

**Flow:**
1. User enters credentials
2. Frontend calls `/auth/login`
3. Backend validates credentials, checks lockout
4. Returns JWT token + user_id + username
5. Frontend saves token to AsyncStorage via `AuthContext.login()`
6. Navigates to Home tab
7. `App.tsx` triggers `loadUserData()` after 200ms delay

**Known Issue:**
- 2 second delay navigating to homepage after login

---

#### 4. **HomeScreen** (`src/screens/HomeScreen.tsx`)
**Purpose:** Main interactive grid display with BLE proximity detection

**Features:**
- Central nucleus (user's position)
- Blips for nearby devices
- Pinch/rotate gestures for zoom
- Tap blips to view details
- Real-time BLE scanning
- Tutorial overlay for first-time users

**State Management:**
- `devices` - Array of nearby BLE devices
- `blipOpacity` - Fade in/out animations
- `scale`, `rotation` - Transform values for gestures
- `nucleusX`, `nucleusY` - Center position tracking

**BLE Integration:**
- Starts BLE scanning on mount
- Calls `BLEService.startScanning()`
- Updates devices array with RSSI/distance
- Filters by `maxDistance` setting

**Gestures:**
- Pinch: Zoom in/out
- Rotate: Rotate grid
- Tap blip: Navigate to DeviceDetail

**Known Issues:**
- Blips barely show up (BLE detection failing)
- Blip pressability not functional (gestures intercept taps)

---

#### 5. **AccountScreen** (`src/screens/AccountScreen.tsx`)
**Purpose:** User profile management

**Features:**
- Display profile photo, name, email, phone, bio
- Edit all profile fields
- Add/remove social media links
- Change username
- Change password
- Dark mode toggle
- Max distance slider
- Logout
- Delete account (non-functional)

**Context Dependencies:**
- `useUserProfile()` - Profile data
- `useAuth()` - Username, userId, logout
- `useDarkMode()` - Theme toggle
- `useToast()` - Success/error messages

**Profile Destructuring:**
```typescript
const { name, phone, email, bio, socialMedia } = profile;
```

**API Calls:**
- `POST /user/profile` - Update profile fields
- `POST /auth/change-username` - Update username
- `POST /auth/change-password` - Update password
- `DELETE /user/delete` - Delete account (broken)

**Known Issues:**
- **CRITICAL BUG:** `socialMedia.map()` and `socialMedia.length` crash when `socialMedia` is `undefined`
- Lines 475-480 and 907 have no null checks
- Cannot delete account (backend endpoint broken)

---

#### 6. **HistoryScreen** (`src/screens/HistoryScreen.tsx`)
**Purpose:** View past link exchanges and contact history

**Features:**
- List of all saved contacts
- Pin/unpin contacts
- Delete contacts
- View contact details
- Search/filter (future)

**API Calls:**
- `GET /devices` - Load all saved contacts
- `POST /user/pinned/{device_id}` - Pin contact
- `DELETE /user/pinned/{device_id}` - Unpin contact
- `DELETE /devices/{device_id}` - Delete contact

**State:**
- `linkNotifications` - Array of contacts from backend
- `pinnedIds` - Set of pinned device IDs

---

#### 7. **ScannerScreen** (`src/screens/ScannerScreen.tsx`)
**Purpose:** Manual BLE device scanning

**Features:**
- List view of nearby BLE devices
- RSSI signal strength
- Distance calculation
- Device name display

**BLE Integration:**
- Starts scan on mount
- 10 second timeout
- Updates device list in real-time

---

#### 8. **DeviceDetail** (`src/screens/DeviceDetail.tsx`)
**Purpose:** View detailed information about a nearby device/contact

**Features:**
- Display profile photo
- Show name, phone, email, bio
- Show social media links
- Distance from user
- Save contact to history

**API Calls:**
- `POST /devices` - Save contact to backend

---

#### 9. **DropScreen** (`src/screens/DropScreen.tsx`)
**Purpose:** Display user's own profile for sharing

**Features:**
- Show QR code with profile data
- Display profile photo
- Show all contact information
- Broadcast profile via BLE

**Use Case:**
- User opens this screen to share their profile
- Nearby users' apps detect the broadcast
- Profile appears as a blip on their HomeScreen

---

#### 10. **ProfilePhotoPromptScreen** (`src/screens/ProfilePhotoPromptScreen.tsx`)
**Purpose:** Prompt new users to upload profile photo after signup

**Features:**
- Upload photo button
- Skip button
- Only shown once after registration

**API Calls:**
- `POST /user/profile/photo` - Upload image

**Flow:**
1. Shown after successful signup
2. User uploads photo or skips
3. Navigates to Home tab
4. Never shown again (tracked by `showProfilePhotoPrompt` state)

---

#### 11. **ProfilePhotoScreen** (`src/screens/ProfilePhotoScreen.tsx`)
**Purpose:** Upload/change profile photo from AccountScreen

**Features:**
- Select image from gallery
- Crop/resize
- Upload to backend
- Delete photo

**API Calls:**
- `POST /user/profile/photo` - Upload
- `DELETE /user/profile/photo` - Delete

---

#### 12. **SecuritySettingsScreen** (`src/screens/SecuritySettingsScreen.tsx`)
**Purpose:** Security and privacy settings

**Features:**
- Change password
- Two-factor authentication (future)
- Privacy zones configuration
- Session management

---

#### 13. **PrivacyZonesScreen** (`src/screens/PrivacyZonesScreen.tsx`)
**Purpose:** Configure geographic areas where profile is hidden

**Features:**
- Add privacy zones (address + radius)
- View existing zones
- Delete zones
- Map view of zones

**API Calls:**
- `GET /user/privacy-zones` - Load zones
- `POST /user/privacy-zones` - Add zone
- `DELETE /user/privacy-zones/{zone_id}` - Delete zone

**Feature Status:** Partially implemented, not fully functional

---

### Contexts

#### 1. **AuthContext** (`src/contexts/AuthContext.tsx`)

**Purpose:** Manages authentication state and token storage

**State:**
```typescript
{
  isAuthenticated: boolean;
  userId: number | null;
  username: string | null;
  authToken: string | null;
}
```

**Functions:**
- `login(token, userId, username)` - Save auth state and token
- `logout()` - Clear auth state and token
- `getToken()` - Retrieve current JWT token

**Storage:**
- Uses AsyncStorage for token persistence
- Key: `'authToken'`

**Critical Feature:**
- 150ms delay after `AsyncStorage.setItem()` to ensure write completes before token is read

---

#### 2. **TutorialContext** (`src/contexts/TutorialContext.tsx`)

**Purpose:** Manages onboarding tutorial state

**State:**
```typescript
{
  isActive: boolean;
  currentScreen: string;
  currentStep: number;
  hasCompletedOnboarding: boolean;
}
```

**Functions:**
- `startScreenTutorial(screenName)` - Start tutorial for specific screen
- `nextStep()` - Advance to next tutorial step
- `completeTutorial()` - Mark tutorial as complete
- `skipTutorial()` - Skip tutorial
- `enableTutorialsForSignup()` - Reset for new users

**Tutorial Screens:**
- Home (main grid navigation)
- History (contact management)
- Account (profile editing)

---

#### 3. **UserContext** (`src/contexts/UserContext.tsx`)

**Purpose:** Originally managed user profile state, now mostly replaced by App.tsx contexts

**Status:** Deprecated, functionality moved to `UserProfileContext` in `App.tsx`

---

#### 4. **UserProfileContext** (in `App.tsx`)

**Purpose:** Manages user profile data globally

**State:**
```typescript
{
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
  debugSetProfileCalls: number; // Debug counter
}
```

**UserProfile Interface:**
```typescript
interface UserProfile {
  name: string;
  phone: string;
  email: string;
  bio: string;
  socialMedia: SocialMediaAccount[];
  profilePhoto?: string;
}
```

**Functions:**
- `updateProfile(updates)` - Merge updates with current profile, save to backend

---

#### 5. **DarkModeContext** (in `App.tsx`)

**Purpose:** Manages theme state

**State:**
```typescript
{
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}
```

**Persistence:** Synced with backend `/user/settings` endpoint

---

#### 6. **PinnedProfilesContext** (in `App.tsx`)

**Purpose:** Manages pinned contacts

**State:**
```typescript
{
  pinnedIds: Set<number>;
  togglePin: (deviceId: number) => void;
}
```

**Persistence:** Synced with backend `/user/pinned` endpoints

---

#### 7. **ToastContext** (in `App.tsx`)

**Purpose:** Global toast notifications

**Function:**
```typescript
showToast({
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
})
```

---

#### 8. **SettingsContext** (in `App.tsx`)

**Purpose:** App-wide settings

**State:**
```typescript
{
  maxDistance: number;
  setMaxDistance: (distance: number) => void;
}
```

**Use:** Controls how far away devices can be detected (in feet)

---

#### 9. **LinkNotificationsContext** (in `App.tsx`)

**Purpose:** Manages contact exchange notifications

**State:**
```typescript
{
  linkNotifications: LinkNotification[];
  addLinkNotification: (notification) => void;
  markAsViewed: (id) => void;
  dismissNotification: (id) => void;
  hasUnviewedLinks: boolean;
}
```

---

### Services

#### 1. **api.ts** (`src/services/api.ts`)

**Purpose:** All backend API communication

**Base URL:**
```typescript
const BASE_URL = 'https://droplink-production.up.railway.app';
```

**Core Functions:**

**Authentication Helpers:**
```typescript
async function getAuthToken(): Promise<string | null>
async function getAuthHeaders(): Promise<HeadersInit>
```

**Secure Fetch Wrapper:**
```typescript
async function secureFetch(url: string, options: RequestInit): Promise<Response>
```
- Automatically adds Authorization header
- Handles token refresh
- Throws errors on non-2xx responses

**API Functions:**

| Function | Endpoint | Method | Purpose |
|----------|----------|--------|---------|
| `getUserProfile()` | `/user/profile` | GET | Load user profile |
| `saveUserProfile(profile)` | `/user/profile` | POST | Update profile |
| `getUserSettings()` | `/user/settings` | GET | Load settings |
| `saveUserSettings(settings)` | `/user/settings` | POST | Update settings |
| `getDevices()` | `/devices` | GET | Load all contacts |
| `saveDevice(device)` | `/devices` | POST | Save new contact |
| `deleteDevice(deviceId)` | `/devices/{id}` | DELETE | Delete contact |
| `getPrivacyZones()` | `/user/privacy-zones` | GET | Load privacy zones |
| `savePrivacyZone(zone)` | `/user/privacy-zones` | POST | Add zone |
| `deletePrivacyZone(zoneId)` | `/user/privacy-zones/{id}` | DELETE | Remove zone |
| `getPinnedContacts()` | `/user/pinned` | GET | Load pinned IDs |
| `pinContact(deviceId)` | `/user/pinned/{id}` | POST | Pin contact |
| `unpinContact(deviceId)` | `/user/pinned/{id}` | DELETE | Unpin contact |
| `changeUsername(newUsername)` | `/auth/change-username` | POST | Update username |
| `changePassword(current, new)` | `/auth/change-password` | POST | Update password |
| `deleteAccount()` | `/user/delete` | DELETE | Delete user account |
| `uploadProfilePhoto(imageUri)` | `/user/profile/photo` | POST | Upload image |

---

#### 2. **BLEService.ts** (`src/services/BLEService.ts`)

**Purpose:** Bluetooth Low Energy device scanning and management

**Core Functions:**

```typescript
async requestPermissions(): Promise<boolean>
```
- Requests Bluetooth and Location permissions on Android

```typescript
async checkBluetoothState(): Promise<boolean>
```
- Checks if Bluetooth is powered on

```typescript
calculateDistance(rssi: number, txPower: number = -59): number
```
- Converts RSSI (signal strength) to distance in meters
- Formula: Path loss model

```typescript
startScanning(
  onDeviceFound: (device) => void,
  onError: (error) => void
): void
```
- Starts continuous BLE scan
- Calls `onDeviceFound` for each discovered device

```typescript
stopScanning(): void
```
- Stops BLE scan

**Known Issues:**
- BLE detection very unreliable
- Blips barely show up
- May need beacon implementation instead of general BLE scan

---

#### 3. **authStorage.ts** (`src/services/authStorage.ts`)

**Purpose:** Secure token storage

**Functions:**
```typescript
async saveToken(token: string): Promise<void>
async getToken(): Promise<string | null>
async removeToken(): Promise<void>
```

**Implementation:** Uses `@react-native-async-storage/async-storage`

---

#### 4. **storage.ts** (`src/services/storage.ts`)

**Purpose:** General app data storage

**Wrapper around AsyncStorage for:**
- Profile data
- Settings
- Cache management

---

#### 5. **activityMonitor.ts** (`src/services/activityMonitor.ts`)

**Purpose:** Frontend diagnostics and logging

**Functions:**
```typescript
logAction(action: string, metadata?: object): void
logStateChange(state: string, from: any, to: any): void
logAPICall(endpoint: string, method: string, success: boolean): void
```

**Use:** Debug logging, analytics, error tracking

---

### AsyncStorage Keys

| Key | Type | Purpose | Set By | Read By |
|-----|------|---------|--------|---------|
| `'authToken'` | string | JWT auth token | AuthContext.login() | api.ts getAuthToken() |
| `'userProfile'` | JSON string | Cached profile | App.tsx auto-save | App.tsx loadProfileFromCache() |
| `'profilePhotoUri'` | string | Cached photo URI | App.tsx auto-save | App.tsx loadProfileFromCache() |

---

### State Management Architecture

**Global State Flow:**
```
App.tsx (Root)
  ├─ AuthContext
  │   └─ isAuthenticated, userId, username
  ├─ UserProfileContext
  │   └─ profile, updateProfile
  ├─ DarkModeContext
  │   └─ isDarkMode, toggleDarkMode
  ├─ ToastContext
  │   └─ showToast
  ├─ SettingsContext
  │   └─ maxDistance, setMaxDistance
  ├─ PinnedProfilesContext
  │   └─ pinnedIds, togglePin
  └─ LinkNotificationsContext
      └─ notifications, add, mark, dismiss
```

**Local State:** Each screen manages its own UI state (modals, inputs, loading states)

---

## Backend Architecture

### Project Structure

```
backend/
├── main.py                 # FastAPI app, all endpoints
├── middleware/
│   └── auth.py            # JWT authentication middleware
├── serializers/
│   └── profile_serializer.py  # Snake_case ↔ camelCase conversion
└── migrations/
    └── fix_migrations.py  # Database schema updates
```

---

### Database Schema

#### 1. **users** table

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | INTEGER/SERIAL | PRIMARY KEY | User ID |
| `username` | TEXT/VARCHAR | UNIQUE NOT NULL | Login username |
| `password_hash` | TEXT/VARCHAR | NOT NULL | Bcrypt hash |
| `email` | TEXT/VARCHAR | NULLABLE | Email address |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Registration date |
| `failed_login_attempts` | INTEGER | DEFAULT 0 | Lockout counter |
| `locked_until` | TEXT/TIMESTAMP | NULLABLE | Lockout expiry |
| `key_version` | INTEGER | DEFAULT 1 | JWT key rotation |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `username`

**Relationships:**
- ONE-TO-ONE with `user_profiles`
- ONE-TO-ONE with `user_settings`
- ONE-TO-MANY with `devices`

---

#### 2. **user_profiles** table

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `user_id` | INTEGER | PRIMARY KEY | FK to users.id |
| `name` | TEXT | NULLABLE | Display name |
| `phone` | TEXT | NULLABLE | Phone number |
| `email` | TEXT | NULLABLE | Contact email |
| `bio` | TEXT | NULLABLE | Biography |
| `social_media` | TEXT (JSON) | NULLABLE | Array of social links |
| `profile_photo` | TEXT | NULLABLE | Photo URL/URI |
| `has_completed_onboarding` | INTEGER | DEFAULT 0 | Tutorial flag |

**Relationships:**
- FOREIGN KEY `user_id` → `users.id`

**Known Issues:**
- `social_media` column exists but is NOT included in GET `/user/profile` SELECT query
- This causes crashes in AccountScreen when `socialMedia` is `undefined`

---

#### 3. **user_settings** table

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `user_id` | INTEGER | PRIMARY KEY | FK to users.id |
| `dark_mode` | INTEGER (BOOLEAN) | DEFAULT 0 | Theme preference |
| `max_distance` | INTEGER | DEFAULT 50 | BLE range in feet |

**Relationships:**
- FOREIGN KEY `user_id` → `users.id`

---

#### 4. **devices** table

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | INTEGER/SERIAL | PRIMARY KEY | Device/contact ID |
| `user_id` | INTEGER | FK | Owner's user ID |
| `name` | TEXT | NOT NULL | Contact name |
| `rssi` | INTEGER | NOT NULL | Signal strength |
| `distance_feet` | REAL/FLOAT | NOT NULL | Calculated distance |
| `action` | TEXT | NULLABLE | accepted/returned/pending |
| `timestamp` | TEXT/TIMESTAMP | NULLABLE | Last seen time |
| `phone_number` | TEXT | NULLABLE | Contact phone |
| `email` | TEXT | NULLABLE | Contact email |
| `bio` | TEXT | NULLABLE | Contact bio |
| `social_media` | TEXT (JSON) | NULLABLE | Social links |

**Relationships:**
- FOREIGN KEY `user_id` → `users.id`
- MANY-TO-MANY with `pinned_contacts`

---

#### 5. **pinned_contacts** table

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `user_id` | INTEGER | PRIMARY KEY (composite) | FK to users.id |
| `device_id` | INTEGER | PRIMARY KEY (composite) | FK to devices.id |

**Relationships:**
- FOREIGN KEY `user_id` → `users.id`
- FOREIGN KEY `device_id` → `devices.id`

---

#### 6. **privacy_zones** table

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | INTEGER/SERIAL | PRIMARY KEY | Zone ID |
| `user_id` | INTEGER | FK | Owner's user ID |
| `address` | TEXT | NOT NULL | Location address |
| `radius` | REAL/FLOAT | NOT NULL | Radius in meters |

**Relationships:**
- FOREIGN KEY `user_id` → `users.id`

---

#### 7. **audit_logs** table

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | INTEGER/SERIAL | PRIMARY KEY | Log entry ID |
| `user_id` | INTEGER | NULLABLE | FK to users.id |
| `action` | TEXT | NOT NULL | Action description |
| `details` | TEXT | NULLABLE | JSON details |
| `ip_address` | TEXT | NULLABLE | Client IP |
| `user_agent` | TEXT | NULLABLE | Client user agent |
| `timestamp` | TIMESTAMP | DEFAULT NOW() | Log time |

**Purpose:** Security auditing, debugging

---

#### 8. **verification_codes** table

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | INTEGER/SERIAL | PRIMARY KEY | Code ID |
| `email` | TEXT | NOT NULL | Target email |
| `code` | TEXT | NOT NULL | 6-digit code |
| `code_type` | TEXT | NOT NULL | verification/recovery |
| `expires_at` | TEXT/TIMESTAMP | NOT NULL | Expiration time |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation time |

**Purpose:** Email verification, password recovery

---

#### 9. **api_call_logs** table

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | SERIAL | PRIMARY KEY | Log ID |
| `timestamp` | TIMESTAMP | NOT NULL | Call time |
| `endpoint` | TEXT | NOT NULL | API path |
| `method` | TEXT | NOT NULL | HTTP method |
| `user_id` | INTEGER | NULLABLE | FK to users.id |
| `success` | BOOLEAN | NOT NULL | Success flag |
| `status_code` | INTEGER | NOT NULL | HTTP status |
| `error` | TEXT | NULLABLE | Error message |

**Purpose:** API monitoring, debugging

---

### API Endpoints

#### Authentication Endpoints

##### POST `/auth/register`

**Purpose:** Create new user account

**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "email": "string (optional)"
}
```

**Response:**
```json
{
  "token": "jwt_string",
  "user_id": 123,
  "username": "string"
}
```

**Process:**
1. Validate username/password
2. Check username uniqueness
3. Hash password with bcrypt
4. `INSERT INTO users (username, password_hash, email)`
5. `INSERT INTO user_settings (user_id, dark_mode=1, max_distance=33)`
6. `INSERT INTO user_profiles (user_id, email)`
7. Generate JWT token
8. Return token + user info

**Known Issue:**
- User profile row is created but with NULL for most fields

---

##### POST `/auth/login`

**Purpose:** Authenticate user

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "jwt_string",
  "user_id": 123,
  "username": "string"
}
```

**Process:**
1. Find user by username
2. Check if account is locked (`locked_until`)
3. Verify password with bcrypt
4. Reset `failed_login_attempts` to 0 on success
5. Increment `failed_login_attempts` on failure (lock after 5)
6. Generate JWT token
7. Return token + user info

**Lockout Logic:**
- 5 failed attempts → locked for 15 minutes
- Lockout tracked in `users.locked_until`

---

##### POST `/auth/check-username`

**Purpose:** Validate username availability

**Request:** `{ "username": "string" }`

**Response:** `{ "available": boolean }`

---

##### POST `/auth/check-email`

**Purpose:** Validate email availability

**Request:** `{ "email": "string" }`

**Response:** `{ "available": boolean }`

---

##### POST `/auth/change-username`

**Purpose:** Update username (requires authentication)

**Headers:** `Authorization: Bearer <token>`

**Request:** `{ "newUsername": "string" }`

**Response:**
```json
{
  "token": "new_jwt_string",
  "username": "new_username"
}
```

**Process:**
1. Verify JWT
2. Check new username uniqueness
3. `UPDATE users SET username = ? WHERE id = ?`
4. Generate new JWT with updated username
5. Return new token

---

##### POST `/auth/change-password`

**Purpose:** Update password (requires authentication)

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

**Response:** `{ "message": "Password changed successfully" }`

**Process:**
1. Verify JWT
2. Verify current password
3. Hash new password with bcrypt
4. `UPDATE users SET password_hash = ? WHERE id = ?`

---

#### Profile Endpoints

##### GET `/user/profile`

**Purpose:** Load user profile data

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "username": "string",
  "email": "string",
  "name": "string",
  "phone": "string",
  "bio": "string",
  "profilePhoto": "string",
  "hasCompletedOnboarding": boolean,
  "createdAt": "timestamp"
}
```

**Process:**
1. Verify JWT via `JWTBearer` middleware
2. Extract `user_id` from JWT payload
3. Query users table: `SELECT username, email, created_at FROM users WHERE id = ?`
4. Query user_profiles: `SELECT name, phone, profile_photo, has_completed_onboarding, bio FROM user_profiles WHERE user_id = ?`
5. Build response dict (snake_case)
6. Convert to camelCase via `serialize_profile()`
7. Return JSON

**Critical Bug:**
- Query does NOT include `social_media` column
- Frontend expects `socialMedia` field
- Missing field causes `undefined` in frontend
- AccountScreen crashes on `socialMedia.map()` when undefined

**Fix Needed:**
```python
# Line 2649 - Add social_media to SELECT
execute_query(cursor,
    "SELECT name, phone, profile_photo, has_completed_onboarding, bio, social_media FROM user_profiles WHERE user_id = ?",
    (user_id,)
)
```

---

##### POST `/user/profile`

**Purpose:** Update user profile

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "string",
  "phone": "string",
  "email": "string",
  "bio": "string",
  "socialMedia": [
    { "platform": "string", "handle": "string" }
  ]
}
```

**Response:** `{ "message": "Profile updated successfully" }`

**Process:**
1. Verify JWT
2. Convert `socialMedia` array to JSON string
3. `INSERT OR REPLACE INTO user_profiles (user_id, name, email, phone, bio, social_media) VALUES (...)`
4. PostgreSQL: `ON CONFLICT (user_id) DO UPDATE`
5. Commit transaction

---

##### POST `/user/profile/photo`

**Purpose:** Upload profile photo

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "image": "base64_encoded_image_string"
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://cloudinary.com/..."
}
```

**Process:**
1. Verify JWT
2. Decode base64 image
3. Upload to Cloudinary (if configured)
4. Get public URL
5. `UPDATE user_profiles SET profile_photo = ? WHERE user_id = ?`
6. Return URL

---

##### DELETE `/user/profile/photo`

**Purpose:** Remove profile photo

**Headers:** `Authorization: Bearer <token>`

**Response:** `{ "message": "Photo deleted" }`

**Process:**
1. Verify JWT
2. `UPDATE user_profiles SET profile_photo = NULL WHERE user_id = ?`

---

#### Settings Endpoints

##### GET `/user/settings`

**Purpose:** Load user settings

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "darkMode": boolean,
  "maxDistance": number
}
```

**Process:**
1. Verify JWT
2. `SELECT dark_mode, max_distance FROM user_settings WHERE user_id = ?`
3. If no row exists, return defaults: `{"darkMode": true, "maxDistance": 33}`
4. Convert to camelCase
5. Return JSON

**Bug Fixed (Nov 24, 2025):**
- Was using index access `row[0]`, `row[1]`
- PostgreSQL RealDictCursor returns dicts, not tuples
- Now uses: `get_value(row, 'dark_mode' if USE_POSTGRES else 0)`

---

##### POST `/user/settings`

**Purpose:** Save user settings

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "darkMode": boolean,
  "maxDistance": number
}
```

**Response:** `{ "message": "Settings saved" }`

**Process:**
1. Verify JWT
2. `INSERT OR REPLACE INTO user_settings (user_id, dark_mode, max_distance) VALUES (?, ?, ?)`
3. PostgreSQL: `ON CONFLICT (user_id) DO UPDATE`

---

#### Devices (Contacts) Endpoints

##### POST `/devices`

**Purpose:** Save new contact/device

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "string",
  "rssi": number,
  "distanceFeet": number,
  "action": "accepted | returned | pending",
  "timestamp": "ISO_8601_string",
  "phoneNumber": "string",
  "email": "string",
  "bio": "string",
  "socialMedia": [...]
}
```

**Response:**
```json
{
  "id": 456,
  "name": "string",
  ...same fields as request...
}
```

**Process:**
1. Verify JWT
2. Convert `socialMedia` to JSON string
3. Check if device exists: `SELECT id FROM devices WHERE name = ? AND user_id = ?`
4. If exists: `UPDATE devices SET ... WHERE id = ?`
5. If not: `INSERT INTO devices (...) VALUES (...)`
6. Return device with ID

---

##### GET `/devices`

**Purpose:** Load all saved contacts

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
[
  {
    "id": 456,
    "name": "string",
    "rssi": number,
    "distanceFeet": number,
    "action": "string",
    "timestamp": "string",
    "phoneNumber": "string",
    "email": "string",
    "bio": "string",
    "socialMedia": [...]
  }
]
```

**Process:**
1. Verify JWT
2. `SELECT * FROM devices WHERE user_id = ? ORDER BY timestamp DESC`
3. Parse `social_media` JSON for each row
4. Convert to camelCase
5. Return array

---

##### GET `/devices/{device_id}`

**Purpose:** Get single device by ID

**Headers:** `Authorization: Bearer <token>`

**Response:** Same as single device object from GET `/devices`

---

##### DELETE `/devices/{device_id}`

**Purpose:** Delete contact

**Headers:** `Authorization: Bearer <token>`

**Response:** `{ "message": "Device deleted" }`

**Process:**
1. Verify JWT
2. Verify ownership: `SELECT user_id FROM devices WHERE id = ?`
3. Check if user owns device
4. `DELETE FROM devices WHERE id = ?`
5. Also removes from `pinned_contacts` (cascade or manual)

---

#### Pinned Contacts Endpoints

##### GET `/user/pinned`

**Purpose:** Get list of pinned device IDs

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "pinned": [123, 456, 789]
}
```

**Process:**
1. Verify JWT
2. `SELECT device_id FROM pinned_contacts WHERE user_id = ?`
3. Return array of IDs

---

##### POST `/user/pinned/{device_id}`

**Purpose:** Pin a contact

**Headers:** `Authorization: Bearer <token>`

**Response:** `{ "message": "Contact pinned" }`

**Process:**
1. Verify JWT
2. `INSERT OR IGNORE INTO pinned_contacts (user_id, device_id) VALUES (?, ?)`

---

##### DELETE `/user/pinned/{device_id}`

**Purpose:** Unpin a contact

**Headers:** `Authorization: Bearer <token>`

**Response:** `{ "message": "Contact unpinned" }`

**Process:**
1. Verify JWT
2. `DELETE FROM pinned_contacts WHERE user_id = ? AND device_id = ?`

---

#### Account Management

##### DELETE `/user/delete`

**Purpose:** Delete user account and all associated data

**Headers:** `Authorization: Bearer <token>`

**Response:** `{ "message": "Account deleted" }`

**Process (INTENDED):**
1. Verify JWT
2. Begin transaction
3. `DELETE FROM devices WHERE user_id = ?`
4. `DELETE FROM user_profiles WHERE user_id = ?`
5. `DELETE FROM user_settings WHERE user_id = ?`
6. `DELETE FROM pinned_contacts WHERE user_id = ?`
7. `DELETE FROM privacy_zones WHERE user_id = ?`
8. `DELETE FROM users WHERE id = ?`
9. Commit transaction

**Known Issue:**
- **BROKEN:** Endpoint returns 500 error
- Frontend cannot delete accounts
- Users are stuck

---

### Authentication Flow

#### JWT Token Structure

**Header:**
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload:**
```json
{
  "user_id": 123,
  "username": "johndoe",
  "exp": 1638316800
}
```

**Signature:** HMAC SHA-256 with secret key from `JWT_SECRET_KEY` environment variable

---

#### Token Lifecycle

1. **Generation:**
   - On successful login/register
   - Function: `create_access_token(data: dict)`
   - Expiration: 30 days (`timedelta(days=30)`)

2. **Storage (Frontend):**
   - Saved to AsyncStorage via `AuthContext.login()`
   - Key: `'authToken'`
   - Retrieved by `api.ts` `getAuthToken()`

3. **Transmission:**
   - Sent in `Authorization: Bearer <token>` header
   - Automatically added by `secureFetch()` wrapper

4. **Verification (Backend):**
   - `JWTBearer` middleware class (in `middleware/auth.py`)
   - Checks Authorization header, cookies, query params
   - Decodes JWT with `jwt.decode(token, SECRET_KEY, algorithms=["HS256"])`
   - Validates expiration
   - Returns payload dict with `user_id`, `username`

5. **Refresh:**
   - POST `/auth/refresh` endpoint (not actively used)
   - Frontend typically just re-authenticates

---

#### Middleware: JWTBearer

**File:** `backend/middleware/auth.py`

**Purpose:** Extract and validate JWT from multiple sources

**Token Sources (in order):**
1. `Authorization: Bearer <token>` header
2. `authToken` cookie
3. `token` query parameter

**Process:**
```python
async def __call__(self, request: Request):
    # Try Authorization header
    token = request.headers.get('Authorization')
    if token:
        token = token.replace('Bearer ', '')
    
    # Try cookie
    if not token:
        token = request.cookies.get('authToken')
    
    # Try query param
    if not token:
        token = request.query_params.get('token')
    
    if not token:
        raise HTTPException(401, "Not authenticated")
    
    # Verify token
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload  # {"user_id": 123, "username": "..."}
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
```

---

#### Dependency: get_current_user

**Alternative authentication method for some endpoints**

**Usage:**
```python
@app.get("/endpoint")
def some_endpoint(user_id: int = Depends(get_current_user)):
    # user_id is extracted from token
    ...
```

**Process:**
1. Extracts token from Authorization header
2. Decodes JWT
3. Returns `user_id` as integer

**Note:** Most new endpoints use `JWTBearer` instead

---

### Helper Functions

#### get_value(row, key)

**Purpose:** Handle PostgreSQL (dict) vs SQLite (tuple) result differences

**Usage:**
```python
name = get_value(row, 'name' if USE_POSTGRES else 0)
```

**Implementation:**
```python
def get_value(row, key):
    if isinstance(row, dict):
        return row.get(key)  # PostgreSQL RealDictCursor
    else:
        return row[key]      # SQLite tuple
```

**Critical:** Must be used for ALL database result access to avoid crashes

---

#### execute_query(cursor, query, params)

**Purpose:** Safely execute parameterized queries

**Usage:**
```python
execute_query(cursor, "SELECT * FROM users WHERE id = ?", (user_id,))
```

**Features:**
- Parameter sanitization
- SQL injection protection
- PostgreSQL vs SQLite syntax handling

---

#### serialize_profile(data)

**File:** `backend/serializers/profile_serializer.py`

**Purpose:** Convert database snake_case to API camelCase

**Example:**
```python
# Input (from database)
{
    'profile_photo': 'https://...',
    'has_completed_onboarding': 1,
    'social_media': '[...]'
}

# Output (to API)
{
    'profilePhoto': 'https://...',
    'hasCompletedOnboarding': true,
    'socialMedia': [...]
}
```

---

### Error Handling Patterns

#### Backend Error Responses

**Standard Format:**
```json
{
  "detail": "error message or code"
}
```

**HTTP Status Codes:**
- `200` - Success
- `400` - Bad request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (account locked)
- `404` - Not found (user/device doesn't exist)
- `500` - Internal server error

**Example:**
```python
raise HTTPException(status_code=404, detail="User not found")
```

---

#### Frontend Error Handling

**API Wrapper:**
```typescript
try {
  const response = await secureFetch(url, options);
  const data = await response.json();
  return data;
} catch (error) {
  console.error('API Error:', error);
  showToast({
    message: 'An error occurred',
    type: 'error'
  });
  throw error;
}
```

**Toast Notifications:**
- Success: Green toast
- Error: Red toast
- Info: Blue toast

---

## BLE Architecture

### Bluetooth Low Energy Overview

**Purpose:** Detect nearby users running DropLink app

**Technology:** `react-native-ble-plx` library

**Permissions Required:**
- Android: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION`
- iOS: Bluetooth usage descriptions in Info.plist

---

### BLE Service Implementation

**File:** `mobile/src/services/BLEService.ts`

**Singleton Instance:**
```typescript
export default new BLEService();
```

---

### Distance Calculation

**Formula:** Path Loss Model
```typescript
calculateDistance(rssi: number, txPower: number = -59): number {
  if (rssi === 0) return -1;
  
  const ratio = rssi / txPower;
  if (ratio < 1.0) {
    return Math.pow(ratio, 10);
  } else {
    return (0.89976) * Math.pow(ratio, 7.7095) + 0.111;
  }
}
```

**Inputs:**
- `rssi` - Received Signal Strength Indicator (negative dBm)
- `txPower` - Transmit power at 1 meter (default -59 dBm)

**Output:** Distance in meters

---

### Scanning Process

**Lifecycle:**
1. Request permissions
2. Check Bluetooth state (powered on)
3. Start scanning with `manager.startDeviceScan()`
4. Receive callbacks for each discovered device
5. Calculate distance from RSSI
6. Filter by max distance setting
7. Update UI (blips on HomeScreen)
8. Stop scanning on unmount or manual stop

**Scan Options:**
```typescript
{
  allowDuplicates: false  // Only report each device once
}
```

---

### Data Transmitted

**Current Implementation:**
- Standard BLE advertisement packets
- Device name (if available)
- RSSI value
- No custom data in advertisement

**Limitation:** 
- Cannot transmit profile data via BLE advertisement
- Profile exchange requires backend API call
- User must be in database to share profile

**Future Enhancement:**
- Implement iBeacon or custom BLE service
- Broadcast user ID in advertisement data
- Enable offline profile sharing

---

### Integration with Backend

**Flow:**
1. HomeScreen detects nearby device via BLE
2. User taps blip to view details
3. Frontend calls `GET /devices/{device_id}` or searches by name
4. Backend returns profile data
5. Frontend displays in DeviceDetail screen
6. User can save contact via `POST /devices`

---

### Known Issues

#### 1. **BLE Detection Unreliable**
- Blips barely show up on HomeScreen
- Many devices not detected
- Intermittent scanning failures

**Potential Causes:**
- Generic BLE scanning (not beacon-specific)
- Permission issues
- Background restrictions
- iOS vs Android differences

**Possible Solutions:**
- Implement iBeacon protocol
- Use Eddystone format
- Custom BLE GATT service
- Improve scan parameters

---

#### 2. **Blip Pressability Issues**
- Tap gestures intercepted by pinch/rotate handlers
- Difficult to select blips
- Gesture conflict

**Solution Needed:**
- Implement gesture priority
- Use `PanResponder` or Gesture Handler properly
- Separate gesture zones

---

#### 3. **No Offline Capability**
- Profile sharing requires internet
- Backend API call required
- Cannot exchange profiles via BLE alone

**Enhancement:**
- Broadcast user ID in BLE advertisement
- Allow direct profile exchange
- Cache profile data locally

---

## Data Flows

### 1. Signup Flow

**Sequence:**

```
User → SignupScreen
  ↓ Enters credentials
  ↓ POST /auth/register
Backend
  ↓ Creates users row
  ↓ Creates user_settings row
  ↓ Creates user_profiles row (minimal data)
  ↓ Returns JWT token
Frontend
  ↓ AuthContext.login(token, userId, username)
  ↓ Saves token to AsyncStorage
  ↓ setIsAuthenticated(true)
  ↓ setUserId(userId)
  ↓ Navigates to ProfilePhotoPromptScreen
User
  ↓ Uploads photo OR skips
  ↓ POST /user/profile/photo (if uploaded)
Frontend
  ↓ Navigates to Home tab
  ↓ App.tsx useEffect triggers after 200ms delay
  ↓ loadUserData(isAuthenticated, userId) called
  ↓ GET /user/profile
Backend
  ↓ Returns profile data
Frontend
  ↓ setUserProfile() with backend data (REPLACE path)
  ↓ Saves to AsyncStorage
  ↓ Tutorial starts (if first time)
```

**Code Snippet (App.tsx):**
```typescript
const handleSignupSuccess = async (token: string, userId: number, username: string, email: string, profileData?: any) => {
  setIsSignupInProgress(true);
  
  if (profileData) {
    setUserProfile({
      name: profileData.name || 'Your Name',
      phone: phoneDigitsOnly ? formatPhoneNumber(phoneDigitsOnly) : '(555) 123-4567',
      email: email || 'user@example.com',
      bio: profileData.bio || 'Add bio',
      socialMedia: [],
      // BUG: Missing profilePhoto field!
    });
  }
  
  setIsFirstTimeUser(true);
  await login(token, userId, username);
  
  setShowProfilePhotoPrompt(true);
  setTab('Home');
  setSubScreen(null);
};
```

---

### 2. Login Flow

**Sequence:**

```
User → LoginScreen
  ↓ Enters credentials
  ↓ POST /auth/login
Backend
  ↓ Validates credentials
  ↓ Checks account lockout
  ↓ Returns JWT token
Frontend
  ↓ AuthContext.login(token, userId, username)
  ↓ Saves token to AsyncStorage (with 150ms delay)
  ↓ setIsAuthenticated(true)
  ↓ setUserId(userId)
  ↓ Navigates to Home tab
App.tsx
  ↓ useEffect detects isAuthenticated && userId && !isSignupInProgress
  ↓ setTimeout 200ms (ensures token write completes)
  ↓ loadUserData(isAuthenticated, userId) called
  ↓ GET /user/profile
Backend
  ↓ Returns profile data
Frontend
  ↓ hasCachedProfileRef.current = true (from AsyncStorage load)
  ↓ setUserProfile() with MERGE logic
  ↓ Defensive merge (don't overwrite with undefined)
  ↓ Saves merged data to AsyncStorage
```

**Critical Code (App.tsx):**
```typescript
// Load user data when authenticated
useEffect(() => {
  if (isAuthenticated && userId && !isSignupInProgress) {
    const timeoutId = setTimeout(() => {
      loadUserData(isAuthenticated, userId);
    }, 200); // Delay to ensure AsyncStorage write completes
    
    return () => clearTimeout(timeoutId);
  }
}, [isAuthenticated, userId, isSignupInProgress, loadUserData]);
```

---

### 3. Profile Loading Flow

**Sequence:**

```
App Mount
  ↓ loadProfileFromCache() runs
  ↓ AsyncStorage.getItem('userProfile')
  ↓ If cached data exists:
      ↓ hasCachedProfileRef.current = true
      ↓ setUserProfile(cachedProfile)
  ↓ If no cache:
      ↓ hasCachedProfileRef.current = false
      ↓ Fresh install detected
  ↓
  ↓ If isAuthenticated:
      ↓ loadUserData(isAuthenticated, userId) runs
      ↓ GET /user/profile
      ↓ Backend returns profile data
      ↓
      ↓ if (!hasCachedProfileRef.current):
          ↓ REPLACE path (fresh install)
          ↓ setUserProfile(backendData with ?? fallbacks)
      ↓ else:
          ↓ MERGE path (has cache)
          ↓ setUserProfile(prev => merge with !== undefined checks)
      ↓
      ↓ Auto-save useEffect triggers
      ↓ AsyncStorage.setItem('userProfile', JSON.stringify(userProfile))
```

**Code Snippet (REPLACE vs MERGE):**
```typescript
if (!hasCachedProfileRef.current) {
  // FRESH INSTALL: Replace with backend data
  const newProfileData = {
    name: profileData.name ?? '',
    email: profileData.email ?? '',
    phone: profileData.phone ? formatPhoneNumber(profileData.phone) : '',
    bio: profileData.bio ?? '',
    socialMedia: profileData.socialMedia ?? [],
    profilePhoto: profileData.profilePhoto,
  };
  setUserProfile(newProfileData);
  hasCachedProfileRef.current = true;
} else {
  // HAS CACHE: Defensive merge
  setUserProfile(prev => ({
    name: profileData.name !== undefined ? profileData.name : prev.name,
    phone: profileData.phone !== undefined ? (profileData.phone ? formatPhoneNumber(profileData.phone) : prev.phone) : prev.phone,
    email: profileData.email !== undefined ? profileData.email : prev.email,
    bio: profileData.bio !== undefined ? profileData.bio : prev.bio,
    socialMedia: profileData.socialMedia !== undefined ? profileData.socialMedia : prev.socialMedia,
    profilePhoto: profileData.profilePhoto !== undefined ? profileData.profilePhoto : prev.profilePhoto,
  }));
}
```

---

### 4. Profile Update Flow

**Sequence:**

```
User → AccountScreen
  ↓ Taps edit button
  ↓ Modal opens with current value
  ↓ User edits field
  ↓ Taps save
  ↓
AccountScreen
  ↓ updateProfile({ field: newValue })
  ↓ Calls UserProfileContext.updateProfile()
  ↓
App.tsx updateProfile()
  ↓ Merges updates with current profile
  ↓ POST /user/profile with merged data
  ↓
Backend
  ↓ Validates data
  ↓ Converts socialMedia array to JSON string
  ↓ INSERT OR REPLACE INTO user_profiles
  ↓ Returns success
  ↓
Frontend
  ↓ setUserProfile(newProfile) - state updates
  ↓ Auto-save useEffect triggers
  ↓ AsyncStorage.setItem('userProfile', ...)
  ↓ Toast notification: "Profile updated"
  ↓ Modal closes
  ↓ UI reflects new value
```

**Code Snippet (App.tsx):**
```typescript
const updateProfile = async (updates: Partial<UserProfile>) => {
  try {
    const newProfile = { ...userProfile, ...updates };
    
    // Save to backend
    await import('./src/services/api').then(m => m.saveUserProfile(newProfile));
    
    // Update local state
    setUserProfile(newProfile);
    
    // AsyncStorage auto-save happens via useEffect
    
    showToast({
      message: 'Profile updated successfully!',
      type: 'success'
    });
  } catch (error) {
    showToast({
      message: 'Failed to update profile',
      type: 'error'
    });
  }
};
```

---

### 5. Logout → Login Flow

**Issue Sequence (Current Bug):**

```
User logged in with cached profile
  ↓ socialMedia: []
  ↓
User taps Logout
  ↓ AuthContext.logout()
  ↓ Clears token from AsyncStorage
  ↓ setIsAuthenticated(false)
  ↓ setUserId(null)
  ↓ Profile cache REMAINS in AsyncStorage
  ↓
User closes app
  ↓
User reopens app
  ↓ loadProfileFromCache() runs
  ↓ Loads profile with socialMedia: []
  ↓ hasCachedProfileRef.current = true
  ↓
User taps Login
  ↓ POST /auth/login succeeds
  ↓ Token saved to AsyncStorage
  ↓ Navigate to Home
  ↓
App.tsx useEffect triggers
  ↓ loadUserData(isAuthenticated, userId)
  ↓ GET /user/profile
  ↓ Backend returns data WITHOUT socialMedia field
  ↓ profileData.socialMedia = undefined
  ↓
  ↓ hasCachedProfileRef.current = true (from earlier cache load)
  ↓ MERGE path executes
  ↓ socialMedia: undefined !== undefined ? undefined : prev.socialMedia
  ↓ Result: socialMedia = prev.socialMedia = []
  ↓ setUserProfile({ ..., socialMedia: [] })
  ↓
  ↓ App works fine (socialMedia is array)
  ↓
BUT EDGE CASE:
  ↓ If cache was corrupted or old format
  ↓ prev.socialMedia might not exist
  ↓ Result: socialMedia = undefined
  ↓
AccountScreen renders
  ↓ const { socialMedia } = profile;
  ↓ socialMedia.length  ← CRASH! undefined.length
  ↓ socialMedia.map()   ← CRASH! undefined.map()
  ↓
Gray Screen 💥
```

---

## Known Issues

### Critical Bugs

#### 1. **AccountScreen Crash: socialMedia.map() on undefined**

**Severity:** 🔴 CRITICAL - App crashes

**Location:** `mobile/src/screens/AccountScreen.tsx` lines 475-480, 907

**Root Cause:**
1. Backend GET `/user/profile` does NOT include `social_media` in SELECT query
2. Frontend receives `profileData` without `socialMedia` field
3. MERGE logic in `App.tsx` falls back to `prev.socialMedia`
4. If `prev.socialMedia` doesn't exist (corrupted cache), result is `undefined`
5. AccountScreen calls `socialMedia.length` and `socialMedia.map()` without null check
6. **TypeError: Cannot read property 'length' of undefined**

**Code Causing Crash:**
```typescript
// Line 475-480
{socialMedia.length === 0 && (
  <Text>No social media accounts added yet.</Text>
)}
{socialMedia.map((social, index) => (
  // ... render social media
))}
```

**Fixes Required:**

**Fix 1 (Backend) - Add social_media to SELECT:**
```python
# backend/main.py line 2649
execute_query(cursor,
    "SELECT name, phone, profile_photo, has_completed_onboarding, bio, social_media FROM user_profiles WHERE user_id = ?",
    (user_id,)
)

# Then add to response_data dict:
response_data = {
    ...
    'social_media': get_value(profile, 'social_media' if USE_POSTGRES else 5),
}

# serializer will convert to socialMedia
```

**Fix 2 (Frontend) - Add null check:**
```typescript
// AccountScreen.tsx line 475
{socialMedia && socialMedia.length === 0 && (
  <Text>No social media accounts added yet.</Text>
)}
{socialMedia && socialMedia.map((social, index) => (
  // ... render
))}
```

**Fix 3 (Frontend) - Ensure socialMedia always exists in MERGE:**
```typescript
// App.tsx line 407
socialMedia: profileData.socialMedia !== undefined ? profileData.socialMedia : (prev.socialMedia ?? []),
```

---

#### 2. **Backend 500 Error: Missing social_media in GET /user/profile**

**Severity:** 🔴 CRITICAL - Breaks frontend

**Location:** `backend/main.py` line 2649

**Issue:**
```python
execute_query(cursor,
    "SELECT name, phone, profile_photo, has_completed_onboarding, bio FROM user_profiles WHERE user_id = ?",
    (user_id,)
)
# Missing: social_media column!
```

**Impact:**
- Frontend expects `socialMedia` field
- Backend doesn't send it
- `profileData.socialMedia = undefined`
- Causes crashes in AccountScreen

**Fix:** See Fix 1 above

---

#### 3. **Fresh Install Placeholder Bug**

**Severity:** 🟡 HIGH - Bad UX

**Status:** ✅ RESOLVED (Nov 23, 2025)

**History:**
- Took 15+ fix attempts over 2 weeks
- Root cause: Stale closure in `loadUserData()`
- `useCallback` had empty dependencies but used `isAuthenticated` and `userId`
- Function captured stale values, always returned early

**Final Fix:**
```typescript
// App.tsx - Pass auth values as parameters
const loadUserData = useCallback(async (auth: boolean, uid: number | null, options?: { onlyPhoto?: boolean }) => {
  if (!auth || !uid) return;
  // ... rest of function uses auth and uid parameters
}, []); // Empty deps now correct

// Call site
loadUserData(isAuthenticated, userId);
```

**Lesson Learned:**
- Adding a debug line with template literal accidentally fixed it by forcing re-evaluation
- Proper fix is to pass values as parameters, not rely on closure

---

#### 4. **Cannot Delete Account**

**Severity:** 🟡 HIGH - Users are stuck

**Location:** `backend/main.py` DELETE `/user/delete` endpoint

**Issue:**
- Endpoint returns 500 error
- Unknown database constraint violation
- Users cannot delete their accounts

**Investigation Needed:**
- Check foreign key constraints
- Verify cascading deletes
- Test transaction rollback

---

#### 5. **Blips Not Showing (BLE Detection Failure)**

**Severity:** 🟡 HIGH - Core feature broken

**Location:** `mobile/src/screens/HomeScreen.tsx` + BLEService

**Symptoms:**
- Very few devices detected
- Blips appear intermittently
- BLE scanning unreliable

**Potential Causes:**
- Generic BLE scan (not beacon-specific)
- Permission issues
- Background restrictions
- Scan parameters need tuning

**Solutions to Try:**
- Implement iBeacon protocol
- Use Eddystone format
- Increase scan duration
- Check permission handling

---

#### 6. **Blip Pressability Not Functional**

**Severity:** 🟠 MEDIUM - UX issue

**Location:** `mobile/src/screens/HomeScreen.tsx`

**Issue:**
- Pinch and rotate gestures intercept tap events
- Cannot tap blips to view details
- Gesture conflict

**Fix Needed:**
- Gesture priority configuration
- Use Gesture Handler's simultaneous gestures
- Separate gesture zones
- Implement hit testing

---

#### 7. **Signup Page Flashes Old Version**

**Severity:** 🟢 LOW - Visual glitch

**Location:** `mobile/src/screens/SignupScreen.tsx`

**Symptoms:**
- Brief flash of old UI on load
- Then correct UI appears

**Likely Cause:**
- React Native rendering sequence
- State initialization timing
- AsyncStorage read timing

---

#### 8. **2 Second Delay After Login**

**Severity:** 🟢 LOW - UX issue

**Location:** `mobile/src/screens/LoginScreen.tsx` → `App.tsx`

**Issue:**
- After successful login
- 2 second delay before Home tab appears

**Investigation Needed:**
- Profile API call blocking render
- Animation timing
- Navigation stack issues

---

### 500 Errors Fixed

#### ✅ GET `/user/settings` - Index Access Bug

**Fixed:** November 24, 2025

**Issue:**
```python
return {
    "darkMode": bool(row[0]),  # Crashes with PostgreSQL
    "maxDistance": row[1]
}
```

**Fix:**
```python
return {
    "darkMode": bool(get_value(row, 'dark_mode' if USE_POSTGRES else 0)),
    "maxDistance": get_value(row, 'max_distance' if USE_POSTGRES else 1)
}
```

---

## Security

### Password Storage

**Algorithm:** Bcrypt with salt rounds

**Registration:**
```python
password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
```

**Verification:**
```python
bcrypt.checkpw(password.encode('utf-8'), stored_hash)
```

---

### JWT Tokens

**Secret Key:** Environment variable `JWT_SECRET_KEY`

**Expiration:** 30 days

**Algorithm:** HS256 (HMAC SHA-256)

**Payload:**
```json
{
  "user_id": 123,
  "username": "johndoe",
  "exp": 1638316800
}
```

---

### Account Lockout

**Trigger:** 5 failed login attempts

**Duration:** 15 minutes

**Implementation:**
```python
if user['failed_login_attempts'] >= 5:
    locked_until = datetime.now() + timedelta(minutes=15)
    execute_query(cursor, 
        "UPDATE users SET locked_until = ? WHERE id = ?",
        (locked_until.isoformat(), user['id'])
    )
```

---

### SQL Injection Protection

**Method:** Parameterized queries

**Example:**
```python
execute_query(cursor, 
    "SELECT * FROM users WHERE username = ?",
    (username,)  # Parameter is escaped
)
```

**Never do this:**
```python
cursor.execute(f"SELECT * FROM users WHERE username = '{username}'")  # VULNERABLE!
```

---

### Environment Variables

**Required:**
- `JWT_SECRET_KEY` - JWT signing secret
- `DATABASE_URL` - PostgreSQL connection string (production)
- `PORT` - API port (default 8000)

**Optional:**
- `USE_POSTGRES` - Database type flag
- `CLOUDINARY_URL` - Image hosting

---

## Deployment

### Frontend (Expo)

**Platform:** Expo EAS Build

**Build Commands:**
```bash
# Development build
eas build --profile development --platform android

# Production build
eas build --profile production --platform android
```

**OTA Updates:**
- Enabled in `App.tsx`
- Checks on app launch
- Auto-downloads and reloads

---

### Backend (Railway)

**Platform:** Railway.app

**URL:** `https://droplink-production.up.railway.app`

**Database:** PostgreSQL managed by Railway

**Deployment:**
- Auto-deploy on git push to main
- Runs migrations via `railway.toml` startCommand

**Start Command:**
```bash
python migrations/fix_migrations.py && uvicorn main:app --host 0.0.0.0 --port $PORT
```

---

## Appendix

### TypeScript Interfaces

#### Frontend Types

```typescript
interface UserProfile {
  name: string;
  phone: string;
  email: string;
  bio: string;
  socialMedia: SocialMediaAccount[];
  profilePhoto?: string;
}

interface SocialMediaAccount {
  platform: string;
  handle: string;
}

interface Device {
  id?: number;
  name: string;
  rssi: number;
  distanceFeet: number;
  action?: string;
  timestamp?: string;
  phoneNumber?: string;
  email?: string;
  bio?: string;
  socialMedia?: SocialMediaAccount[];
}

interface UserSettings {
  darkMode: boolean;
  maxDistance: number;
}

interface PrivacyZone {
  id?: number;
  address: string;
  radius: number;
}

interface LinkNotification {
  id: number;
  name: string;
  phoneNumber: string;
  email: string;
  bio: string;
  socialMedia: SocialMediaAccount[];
  timestamp: number;
  viewed: boolean;
  dismissed: boolean;
  deviceId?: number;
}
```

---

### Backend Models (Pydantic)

```python
class DeviceUpdate(BaseModel):
    name: constr(min_length=1, max_length=100)
    rssi: int
    distanceFeet: float
    action: Optional[str] = None
    timestamp: Optional[str] = None
    phoneNumber: Optional[constr(max_length=20)] = None
    email: Optional[constr(max_length=100)] = None
    bio: Optional[constr(max_length=500)] = None
    socialMedia: Optional[List[dict]] = None

class AuthResponse(BaseModel):
    token: str
    user_id: int
    username: str

class UserProfileUpdate(BaseModel):
    name: Optional[constr(max_length=100)] = None
    phone: Optional[str] = None
    bio: Optional[constr(max_length=500)] = None
    socialMedia: Optional[List[dict]] = None
```

---

### Database Migrations

**Location:** `backend/migrations/fix_migrations.py`

**Purpose:** Add missing columns to existing tables

**Usage:**
```bash
python migrations/fix_migrations.py
```

**Functions:**
```python
def safe_add_column(cursor, table: str, column: str, column_type: str)
def fix_production_database()
```

---

### API Base URL Configuration

**Development:**
```typescript
const BASE_URL = 'http://localhost:8000';
```

**Production:**
```typescript
const BASE_URL = 'https://droplink-production.up.railway.app';
```

**Change in:** `mobile/src/services/api.ts` line 13

---

## End of Architecture Document

**For questions or updates, contact the development team.**

**Last Updated:** November 24, 2025

