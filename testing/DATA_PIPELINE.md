# DropLink Data Pipeline Documentation

Complete visual guide to data flows in the DropLink mobile application.

---

## 📊 Table of Contents

1. [User Registration Flow](#1-user-registration-flow)
2. [User Login Flow](#2-user-login-flow)
3. [Profile Creation & Updates](#3-profile-creation--updates)
4. [Tutorial System Data Flow](#4-tutorial-system-data-flow)
5. [Authentication & Token Management](#5-authentication--token-management)
6. [Profile Photo Upload](#6-profile-photo-upload)
7. [User Settings Management](#7-user-settings-management)
8. [Device/Contact Linking](#8-devicecontact-linking)
9. [Data Persistence Layers](#9-data-persistence-layers)
10. [Complete Data Model](#10-complete-data-model)

---

## 1. User Registration Flow

```
USER REGISTRATION (SignupScreen.tsx → POST /auth/register → Database)
│
├── 📱 FRONTEND (SignupScreen.tsx)
│   │
│   ├── User Input Collection
│   │   ├── username (3-20 chars, alphanumeric + underscore)
│   │   ├── email (valid email format)
│   │   ├── password (8+ chars, uppercase, lowercase, digit, special char)
│   │   ├── name (optional)
│   │   ├── phone (optional, formatted as (555) 123-4567)
│   │   └── bio (optional)
│   │
│   ├── Frontend Validation
│   │   ├── Username: length check, character validation
│   │   ├── Email: regex pattern match
│   │   ├── Password: strength requirements
│   │   └── Phone: format validation (if provided)
│   │
│   └── API Call
│       ├── POST /auth/register
│       ├── Body: { username, email, password }
│       └── Headers: { Content-Type: application/json }
│
├── 🔄 API ENDPOINT (main.py:1195)
│   │
│   ├── Request Validation (RegisterRequest model)
│   │   ├── username: string, required
│   │   ├── email: string, required
│   │   └── password: string, required
│   │
│   ├── Security Checks
│   │   ├── Convert username to lowercase
│   │   ├── Validate username (3-20 chars)
│   │   ├── Validate password (8+ chars, uppercase, lowercase, digit, special char)
│   │   ├── Check username uniqueness (case-insensitive)
│   │   └── Check email uniqueness (EXCEPT caitie690@gmail.com for testing)
│   │
│   ├── Password Security
│   │   ├── Hash password using bcrypt
│   │   ├── Salt rounds: 12
│   │   └── Result: $2b$12$... (60 chars)
│   │
│   ├── Database Operations
│   │   ├── INSERT INTO users (username, password_hash, email)
│   │   ├── Get inserted user_id (SERIAL/AUTOINCREMENT)
│   │   └── INSERT INTO user_settings (user_id, dark_mode=1, max_distance=33)
│   │
│   └── Response
│       ├── Generate JWT token (24h expiry)
│       ├── Return: { token, user_id, username }
│       └── Status: 200 OK
│
├── 💾 DATABASE (PostgreSQL/SQLite)
│   │
│   ├── users table
│   │   ├── id: INTEGER PRIMARY KEY AUTOINCREMENT
│   │   ├── username: TEXT UNIQUE NOT NULL (lowercase)
│   │   ├── password_hash: TEXT NOT NULL (bcrypt hash)
│   │   ├── email: TEXT (can be duplicate for caitie690@gmail.com)
│   │   ├── created_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
│   │   ├── failed_login_attempts: INTEGER DEFAULT 0
│   │   ├── locked_until: TEXT (NULL if not locked)
│   │   └── key_version: INTEGER DEFAULT 1
│   │
│   └── user_settings table (auto-created)
│       ├── user_id: INTEGER PRIMARY KEY
│       ├── dark_mode: INTEGER DEFAULT 1 (1=enabled)
│       └── max_distance: INTEGER DEFAULT 33 (feet)
│
└── 📱 FRONTEND RESPONSE HANDLING
    │
    ├── Store Authentication
    │   ├── AsyncStorage.setItem('token', data.token)
    │   ├── AsyncStorage.setItem('userId', data.user_id)
    │   └── AsyncStorage.setItem('username', data.username)
    │
    ├── Save Profile Data
    │   ├── POST /user/profile
    │   ├── Body: { name, phone, email, bio, hasCompletedOnboarding: true }
    │   └── Headers: { Authorization: Bearer {token} }
    │
    ├── Enable Tutorial System
    │   ├── Call enableTutorialsForSignup()
    │   └── AsyncStorage.setItem('@droplink_show_tutorials_flag', 'true')
    │
    └── Navigate to App
        └── Show profile photo upload prompt
```

---

## 2. User Login Flow

```
USER LOGIN (LoginScreen.tsx → POST /auth/login → Database)
│
├── 📱 FRONTEND (LoginScreen.tsx)
│   │
│   ├── User Input Collection
│   │   ├── username (case-insensitive)
│   │   └── password (plain text, will be compared against hash)
│   │
│   └── API Call
│       ├── POST /auth/login
│       ├── Body: { username, password }
│       └── Headers: { Content-Type: application/json }
│
├── 🔄 API ENDPOINT (main.py:1360)
│   │
│   ├── Account Lockout Check
│   │   ├── Check failed_login_attempts
│   │   ├── If >= 5 attempts: Check locked_until timestamp
│   │   └── If locked: Return 429 Too Many Requests
│   │
│   ├── User Lookup
│   │   ├── SELECT id, password_hash FROM users WHERE LOWER(username) = ?
│   │   └── Case-insensitive username matching
│   │
│   ├── Password Verification
│   │   ├── bcrypt.checkpw(password, password_hash)
│   │   ├── If valid: Reset failed_login_attempts to 0
│   │   └── If invalid: Increment failed_login_attempts
│   │
│   ├── Failed Login Handling
│   │   ├── Increment failed_login_attempts
│   │   ├── If attempts >= 5: Lock account for 15 minutes
│   │   ├── Update locked_until = CURRENT_TIMESTAMP + 15 minutes
│   │   └── Return 401 Unauthorized
│   │
│   └── Successful Login Response
│       ├── Generate JWT token (24h expiry)
│       ├── Reset failed_login_attempts to 0
│       ├── Clear locked_until
│       └── Return: { token, user_id, username }
│
└── 📱 FRONTEND RESPONSE HANDLING
    │
    ├── Store Authentication
    │   ├── AsyncStorage.setItem('token', data.token)
    │   ├── AsyncStorage.setItem('userId', data.user_id)
    │   └── AsyncStorage.setItem('username', data.username)
    │
    ├── Load User Data (App.tsx:loadUserData)
    │   ├── GET /user/profile (retrieve hasCompletedOnboarding)
    │   ├── GET /user/settings (retrieve dark_mode, max_distance)
    │   └── GET /user/profile/photo (retrieve profile_photo URL)
    │
    ├── Tutorial System Check
    │   ├── Check hasCompletedOnboarding from server
    │   ├── If true: Skip all tutorials
    │   └── If false: Check local @droplink_show_tutorials_flag
    │
    └── Navigate to Home Screen
        └── Tutorials will NOT show (no flag set on login)
```

---

## 3. Profile Creation & Updates

```
PROFILE MANAGEMENT (AccountScreen.tsx → POST /user/profile → Database)
│
├── 📱 FRONTEND (AccountScreen.tsx / SignupScreen.tsx)
│   │
│   ├── Profile Fields
│   │   ├── name: string (display name)
│   │   ├── email: string (contact email)
│   │   ├── phone: string (formatted: (555) 123-4567)
│   │   ├── bio: string (user description)
│   │   ├── socialMedia: array of { platform, handle }
│   │   └── hasCompletedOnboarding: boolean (tutorial completion flag)
│   │
│   ├── Frontend Data Preparation
│   │   ├── Phone: Format as (555) 123-4567
│   │   ├── Bio: Convert "Add bio" placeholder to empty string
│   │   └── Social Media: Array of objects
│   │
│   └── API Call
│       ├── POST /user/profile
│       ├── Body: { name, email, phone, bio, socialMedia, hasCompletedOnboarding }
│       └── Headers: { Authorization: Bearer {token}, Content-Type: application/json }
│
├── 🔄 API ENDPOINT (main.py:2537)
│   │
│   ├── Authentication
│   │   ├── Extract JWT from Authorization header
│   │   ├── Verify token validity
│   │   └── Extract user_id from token
│   │
│   ├── Data Sanitization
│   │   ├── Phone: Strip non-numeric characters
│   │   │   └── "(555) 123-4567" → "5551234567"
│   │   ├── Bio: Convert "Add bio" to empty string
│   │   └── Social Media: Convert to JSON string
│   │
│   ├── Validation Checks
│   │   ├── Phone uniqueness (if provided)
│   │   │   └── No other user can have same phone
│   │   ├── Email uniqueness (if provided)
│   │   │   └── No other user can have same email
│   │   └── If validation fails: Return 400 Bad Request
│   │
│   ├── Database Operation (UPSERT)
│   │   │
│   │   ├── PostgreSQL:
│   │   │   └── INSERT INTO user_profiles (...) VALUES (...)
│   │   │       ON CONFLICT (user_id) DO UPDATE SET ...
│   │   │
│   │   └── SQLite:
│   │       └── INSERT OR REPLACE INTO user_profiles (...) VALUES (...)
│   │
│   ├── Data Stored
│   │   ├── user_id: INTEGER PRIMARY KEY
│   │   ├── name: TEXT
│   │   ├── email: TEXT
│   │   ├── phone: TEXT (digits only)
│   │   ├── bio: TEXT (empty string if placeholder)
│   │   ├── social_media: TEXT (JSON array)
│   │   ├── profile_photo: TEXT (Cloudinary URL)
│   │   └── has_completed_onboarding: INTEGER (0 or 1)
│   │
│   └── Response
│       ├── Return: { success: true }
│       └── Status: 200 OK
│
├── 💾 DATABASE (user_profiles table)
│   │
│   └── user_profiles table
│       ├── user_id: INTEGER PRIMARY KEY (FK to users.id)
│       ├── name: TEXT (NULL if not provided)
│       ├── email: TEXT (NULL if not provided)
│       ├── phone: TEXT (digits only, NULL if not provided)
│       ├── bio: TEXT (empty string or actual bio)
│       ├── social_media: TEXT (JSON: [{"platform":"Instagram","handle":"@user"}])
│       ├── profile_photo: TEXT (Cloudinary URL)
│       └── has_completed_onboarding: INTEGER (0=false, 1=true)
│
└── 📱 FRONTEND RESPONSE HANDLING
    │
    ├── On Success
    │   ├── Show success toast
    │   ├── Update local UserProfileContext
    │   └── Refresh UI with new data
    │
    └── On Error
        ├── Show error toast with detail message
        └── Validation errors: "Phone already in use", "Email already exists"
```

---

## 4. Tutorial System Data Flow

```
TUTORIAL SYSTEM (Multi-layer persistence)
│
├── 📱 SIGNUP FLOW (SignupScreen.tsx)
│   │
│   ├── After Successful Registration
│   │   ├── Call enableTutorialsForSignup()
│   │   └── AsyncStorage.setItem('@droplink_show_tutorials_flag', 'true')
│   │
│   └── Save Profile with Onboarding Flag
│       ├── POST /user/profile
│       ├── Body: { ..., hasCompletedOnboarding: true }
│       └── Database: has_completed_onboarding = 1
│
├── 📱 LOGIN FLOW (LoginScreen.tsx)
│   │
│   ├── After Successful Login
│   │   ├── NO tutorial flag set (differs from signup)
│   │   └── AsyncStorage does NOT have '@droplink_show_tutorials_flag'
│   │
│   └── Load User Profile
│       ├── GET /user/profile
│       └── Receive: { ..., hasCompletedOnboarding: true/false }
│
├── 🎓 TUTORIAL START CHECK (TutorialContext.tsx:startScreenTutorial)
│   │
│   ├── Layer 1: Local Session Flag Check
│   │   ├── Check AsyncStorage: '@droplink_show_tutorials_flag'
│   │   ├── If !== 'true': SKIP TUTORIALS ❌
│   │   └── If === 'true': Continue to Layer 2 ✓
│   │
│   ├── Layer 2: Server Onboarding Status Check
│   │   ├── GET /user/profile
│   │   ├── Check: hasCompletedOnboarding
│   │   ├── If true: SKIP TUTORIALS ❌
│   │   └── If false: Continue to Layer 3 ✓
│   │
│   └── Layer 3: Local Screen Completion Check
│       ├── Check AsyncStorage: '@droplink_tutorial_screens'
│       ├── Check if this specific screen is complete
│       ├── If complete: SKIP THIS SCREEN ❌
│       └── If not complete: SHOW TUTORIAL ✓
│
├── 🎓 TUTORIAL COMPLETION (TutorialContext.tsx:completeScreenTutorial)
│   │
│   ├── Mark Screen Complete Locally
│   │   ├── Update AsyncStorage: '@droplink_tutorial_screens'
│   │   └── Set: { "Home": true, "Drop": true, ... }
│   │
│   ├── Check if ALL Screens Complete
│   │   ├── Screens: ['Home', 'Drop', 'History', 'Account']
│   │   └── If all true: Continue to backend update
│   │
│   ├── Clear Tutorial Flag
│   │   └── AsyncStorage.removeItem('@droplink_show_tutorials_flag')
│   │
│   └── Update Backend
│       ├── POST /user/profile
│       ├── Body: { hasCompletedOnboarding: true }
│       └── Database: has_completed_onboarding = 1
│
├── 💾 DATA PERSISTENCE (3 Layers)
│   │
│   ├── Layer 1: Session Flag (AsyncStorage)
│   │   ├── Key: '@droplink_show_tutorials_flag'
│   │   ├── Values: 'true' (show) or undefined (skip)
│   │   ├── Set: During signup only
│   │   ├── Cleared: After all tutorials complete or skip
│   │   └── Scope: Current app session only
│   │
│   ├── Layer 2: Screen Completion (AsyncStorage)
│   │   ├── Key: '@droplink_tutorial_screens'
│   │   ├── Value: {"Home":true, "Drop":false, "History":false, "Account":false}
│   │   ├── Updated: After each screen's tutorial completes
│   │   └── Scope: Persistent across app sessions
│   │
│   └── Layer 3: Onboarding Complete (Database)
│       ├── Table: user_profiles
│       ├── Column: has_completed_onboarding INTEGER
│       ├── Values: 0 (not complete) or 1 (complete)
│       ├── Set: During signup AND after all tutorials complete
│       └── Scope: Persistent across devices & reinstalls
│
└── 🔄 TUTORIAL FLOW SCENARIOS
    │
    ├── Scenario 1: New User Signup
    │   ├── Signup → enableTutorialsForSignup() → flag='true'
    │   ├── Navigate to Home → startScreenTutorial()
    │   ├── Layer 1 check: flag='true' ✓
    │   ├── Layer 2 check: hasCompletedOnboarding=true (set during signup)
    │   └── Result: TUTORIALS SKIPPED (server says already complete)
    │
    ├── Scenario 2: Existing User Login
    │   ├── Login → NO flag set
    │   ├── Navigate to Home → startScreenTutorial()
    │   ├── Layer 1 check: flag=undefined ❌
    │   └── Result: TUTORIALS SKIPPED (no session flag)
    │
    ├── Scenario 3: App Reinstall (Existing User)
    │   ├── Login → NO flag, NO local storage
    │   ├── Layer 1 check: flag=undefined ❌
    │   ├── Layer 2 check: GET /user/profile → hasCompletedOnboarding=true ❌
    │   └── Result: TUTORIALS SKIPPED (server remembers)
    │
    └── Scenario 4: Tutorial Skip
        ├── User taps "Skip Tutorial"
        ├── Clear flag: removeItem('@droplink_show_tutorials_flag')
        ├── Update server: hasCompletedOnboarding=true
        └── Result: TUTORIALS NEVER SHOW AGAIN
```

---

## 5. Authentication & Token Management

```
JWT TOKEN LIFECYCLE
│
├── 🔐 TOKEN GENERATION (Backend)
│   │
│   ├── When Generated
│   │   ├── After successful registration
│   │   └── After successful login
│   │
│   ├── Token Contents (JWT Payload)
│   │   ├── user_id: INTEGER (primary key from users table)
│   │   ├── username: string (lowercase)
│   │   ├── exp: timestamp (24 hours from creation)
│   │   └── iat: timestamp (issued at time)
│   │
│   ├── Token Creation (main.py:create_jwt_token)
│   │   ├── Algorithm: HS256
│   │   ├── Secret: JWT_SECRET_KEY environment variable
│   │   ├── Expiry: 24 hours
│   │   └── Format: "eyJ0eXAiOiJKV1QiLCJhbGc..."
│   │
│   └── Response
│       ├── token: string (JWT)
│       ├── user_id: integer
│       └── username: string
│
├── 📱 TOKEN STORAGE (Frontend - AsyncStorage)
│   │
│   ├── Storage Keys
│   │   ├── 'token': JWT string
│   │   ├── 'userId': user_id as string
│   │   └── 'username': username string
│   │
│   ├── Storage Location
│   │   ├── iOS: NSUserDefaults
│   │   ├── Android: SharedPreferences
│   │   └── Encrypted: No (consider upgrading to SecureStore)
│   │
│   └── Persistence
│       ├── Survives app restart: Yes
│       ├── Survives app reinstall: No
│       └── Shared between devices: No
│
├── 🔄 TOKEN USAGE (API Requests)
│   │
│   ├── Request Headers
│   │   ├── Authorization: "Bearer {token}"
│   │   └── Content-Type: "application/json"
│   │
│   ├── Backend Validation (get_current_user dependency)
│   │   ├── Extract token from Authorization header
│   │   ├── Decode JWT using JWT_SECRET_KEY
│   │   ├── Verify signature
│   │   ├── Check expiry (exp field)
│   │   └── Return user_id from payload
│   │
│   ├── Protected Endpoints (require auth)
│   │   ├── GET /user/profile
│   │   ├── POST /user/profile
│   │   ├── GET /user/settings
│   │   ├── POST /user/settings
│   │   ├── GET /user/profile/photo
│   │   ├── POST /user/profile/photo
│   │   ├── GET /devices
│   │   ├── POST /devices
│   │   ├── DELETE /devices/{id}
│   │   └── ... (all user-specific endpoints)
│   │
│   └── Error Responses
│       ├── 401 Unauthorized: Missing or invalid token
│       ├── 401 Unauthorized: Token expired
│       └── 403 Forbidden: Valid token but insufficient permissions
│
├── ⏰ TOKEN EXPIRY
│   │
│   ├── Expiry Time: 24 hours from creation
│   │
│   ├── Frontend Handling (App.tsx)
│   │   ├── No automatic refresh implemented
│   │   ├── User must re-login after 24 hours
│   │   └── API calls will return 401 after expiry
│   │
│   └── Backend Handling
│       ├── Check exp field in JWT payload
│       ├── If expired: Return 401 Unauthorized
│       └── Frontend must handle 401 → redirect to login
│
└── 🔓 LOGOUT (Frontend)
    │
    ├── Clear AsyncStorage
    │   ├── AsyncStorage.removeItem('token')
    │   ├── AsyncStorage.removeItem('userId')
    │   └── AsyncStorage.removeItem('username')
    │
    ├── Clear Application State
    │   ├── Reset AuthContext
    │   ├── Clear UserProfileContext
    │   └── Clear any cached user data
    │
    └── Navigate to Welcome Screen
        └── Token no longer exists → all API calls will fail with 401
```

---

## 6. Profile Photo Upload

```
PROFILE PHOTO UPLOAD (Cloudinary Integration)
│
├── 📱 FRONTEND (ProfilePhotoScreen.tsx)
│   │
│   ├── Image Selection
│   │   ├── expo-image-picker
│   │   ├── Source: Camera or Gallery
│   │   ├── Resize: 800x800 max
│   │   └── Format: JPEG, quality 80%
│   │
│   ├── Upload Process
│   │   ├── Create FormData
│   │   ├── Append: file (selected image)
│   │   └── POST /user/profile/photo
│   │
│   └── API Call
│       ├── Endpoint: POST /user/profile/photo
│       ├── Headers: { Authorization: Bearer {token} }
│       └── Body: FormData with image file
│
├── 🔄 API ENDPOINT (main.py:2634)
│   │
│   ├── File Upload (UploadFile from FastAPI)
│   │   ├── Receive multipart/form-data
│   │   ├── Extract file content
│   │   └── Validate file exists
│   │
│   ├── Cloudinary Upload
│   │   ├── Service: Cloudinary
│   │   ├── Folder: "droplink_profiles"
│   │   ├── Public ID: f"user_{user_id}"
│   │   ├── Transformation: Auto-optimize
│   │   └── Get URL: https://res.cloudinary.com/...
│   │
│   ├── Database Update
│   │   ├── UPSERT user_profiles
│   │   ├── Update profile_photo column with Cloudinary URL
│   │   └── Keep other profile fields unchanged
│   │
│   └── Response
│       ├── Return: { success: true, photo_url: "https://..." }
│       └── Status: 200 OK
│
├── 💾 DATABASE (user_profiles.profile_photo)
│   │
│   └── Stored Data
│       ├── Column: profile_photo TEXT
│       ├── Value: Full Cloudinary URL
│       └── Example: "https://res.cloudinary.com/dkjh3s7/image/upload/v1234/droplink_profiles/user_123.jpg"
│
└── 📱 FRONTEND DISPLAY
    │
    ├── Load Profile Photo
    │   ├── GET /user/profile/photo
    │   └── Response: { photo_url: "https://..." }
    │
    ├── Cache in Context
    │   ├── UserProfileContext.profilePhotoUri
    │   └── Update on upload success
    │
    └── Display
        ├── Component: <Image source={{ uri: profilePhotoUri }} />
        ├── Fallback: Default avatar icon
        └── Cached: React Native image cache
```

---

## 7. User Settings Management

```
USER SETTINGS (Dark Mode, Max Distance)
│
├── 📱 FRONTEND (AccountScreen.tsx → Settings)
│   │
│   ├── Available Settings
│   │   ├── dark_mode: boolean (toggle)
│   │   └── max_distance: integer (33-100 feet)
│   │
│   └── API Call
│       ├── POST /user/settings
│       ├── Body: { dark_mode: true, max_distance: 50 }
│       └── Headers: { Authorization: Bearer {token} }
│
├── 🔄 API ENDPOINTS
│   │
│   ├── GET /user/settings (main.py:2468)
│   │   ├── Query: SELECT dark_mode, max_distance FROM user_settings WHERE user_id = ?
│   │   ├── Default if not found: { dark_mode: 1, max_distance: 33 }
│   │   └── Response: { dark_mode: 1, max_distance: 33 }
│   │
│   └── POST /user/settings (main.py:2481)
│       ├── Body: { dark_mode, max_distance }
│       ├── Convert booleans to integers (true→1, false→0)
│       ├── UPSERT: INSERT OR REPLACE INTO user_settings
│       └── Response: { success: true }
│
├── 💾 DATABASE (user_settings table)
│   │
│   └── user_settings table
│       ├── user_id: INTEGER PRIMARY KEY (FK to users.id)
│       ├── dark_mode: INTEGER DEFAULT 1 (0=light, 1=dark)
│       └── max_distance: INTEGER DEFAULT 33 (feet, range 33-100)
│
└── 📱 FRONTEND STATE
    │
    ├── Context: UserSettingsContext (App.tsx)
    │   ├── isDarkMode: boolean
    │   ├── maxDistance: number
    │   └── updateSettings: function
    │
    ├── Theme Integration
    │   ├── DarkModeContext provides isDarkMode
    │   ├── getTheme(isDarkMode) returns colors
    │   └── All screens use theme.colors.*
    │
    └── Distance Filter
        ├── Used in: HomeScreen, DropScreen
        ├── Filters devices by distanceFeet <= maxDistance
        └── Real-time update when setting changes
```

---

## 8. Device/Contact Linking

```
DEVICE LINKING (BLE + Contact Cards)
│
├── 📱 DISCOVER (HomeScreen / DropScreen)
│   │
│   ├── BLE Scanning
│   │   ├── Scan for nearby devices
│   │   ├── Calculate distance from RSSI
│   │   ├── Filter by maxDistance setting
│   │   └── Display as dots on radar
│   │
│   └── Device Data
│       ├── name: Device name (from BLE)
│       ├── rssi: Signal strength
│       ├── distanceFeet: Calculated distance
│       └── timestamp: When detected
│
├── 🤝 LINK (Drop Request)
│   │
│   ├── User Action
│   │   ├── Tap device on radar/list
│   │   ├── Tap "Drop" button
│   │   └── Send drop request
│   │
│   └── API Call
│       ├── POST /devices
│       ├── Body: { name, rssi, distanceFeet, action: 'dropped' }
│       └── Headers: { Authorization: Bearer {token} }
│
├── 🔄 API ENDPOINT (main.py:2750)
│   │
│   ├── Receive Drop Request
│   │   ├── Validate: name, rssi, distanceFeet, action
│   │   └── Associate with authenticated user_id
│   │
│   ├── Database Insert
│   │   ├── INSERT INTO devices (name, rssi, distance_feet, action, user_id, timestamp)
│   │   └── action = 'dropped' (pending response)
│   │
│   └── Simulate Link Response (Test Mode)
│       ├── After 3 seconds, create "returned" device
│       ├── Include: phoneNumber, email, bio, socialMedia
│       └── This simulates the other person linking back
│
├── 💾 DATABASE (devices table)
│   │
│   └── devices table
│       ├── id: INTEGER PRIMARY KEY AUTOINCREMENT
│       ├── name: TEXT NOT NULL (device/user name)
│       ├── rssi: INTEGER (signal strength)
│       ├── distance_feet: REAL (calculated distance)
│       ├── action: TEXT ('dropped', 'returned', 'linked')
│       ├── timestamp: TEXT (ISO 8601 format)
│       ├── phone_number: TEXT (NULL until linked)
│       ├── email: TEXT (NULL until linked)
│       ├── bio: TEXT (NULL until linked)
│       ├── social_media: TEXT (JSON, NULL until linked)
│       └── user_id: INTEGER (FK to users.id)
│
├── 📥 RETRIEVE LINKS (HistoryScreen)
│   │
│   ├── API Call
│   │   ├── GET /devices
│   │   ├── Headers: { Authorization: Bearer {token} }
│   │   └── Returns: Array of linked devices/contacts
│   │
│   ├── Filter
│   │   ├── Only devices with action='returned' or 'linked'
│   │   ├── Sort by timestamp (newest first)
│   │   └── Include contact card data
│   │
│   └── Display
│       ├── List of contact cards
│       ├── Swipe right: Pin to top
│       ├── Tap: View full contact details
│       └── Refresh: Pull to reload from server
│
└── 📌 PIN CONTACTS
    │
    ├── API Call
    │   ├── POST /devices/{device_id}/pin
    │   └── Headers: { Authorization: Bearer {token} }
    │
    ├── Database Operation
    │   ├── INSERT INTO pinned_contacts (user_id, device_id)
    │   └── Unique constraint: (user_id, device_id)
    │
    └── Display
        ├── GET /pinned-contacts returns pinned device IDs
        ├── Sort: Pinned contacts appear first
        └── UI: Pin icon indicator
```

---

## 9. Data Persistence Layers

```
DATA PERSISTENCE ARCHITECTURE
│
├── 📱 FRONTEND PERSISTENCE (React Native)
│   │
│   ├── AsyncStorage (Key-Value Store)
│   │   │
│   │   ├── Authentication
│   │   │   ├── 'token': JWT string
│   │   │   ├── 'userId': user_id as string
│   │   │   └── 'username': username string
│   │   │
│   │   ├── Tutorial System
│   │   │   ├── '@droplink_show_tutorials_flag': 'true' or undefined
│   │   │   └── '@droplink_tutorial_screens': JSON {"Home":true,...}
│   │   │
│   │   └── Characteristics
│   │       ├── Persists across app restarts: Yes
│   │       ├── Persists across app reinstalls: No
│   │       ├── Encrypted: No
│   │       └── Shared across devices: No
│   │
│   ├── React Context (In-Memory State)
│   │   │
│   │   ├── AuthContext
│   │   │   ├── isAuthenticated: boolean
│   │   │   ├── userId: number
│   │   │   ├── username: string
│   │   │   └── Functions: login, logout, checkAuth
│   │   │
│   │   ├── UserProfileContext
│   │   │   ├── userProfile: { name, email, phone, bio, socialMedia }
│   │   │   ├── profilePhotoUri: string (Cloudinary URL)
│   │   │   └── Functions: updateProfile
│   │   │
│   │   ├── DarkModeContext
│   │   │   ├── isDarkMode: boolean
│   │   │   └── toggleDarkMode: function
│   │   │
│   │   ├── TutorialContext
│   │   │   ├── currentStep: number
│   │   │   ├── totalSteps: number
│   │   │   ├── isActive: boolean
│   │   │   ├── currentScreen: string
│   │   │   └── Functions: nextStep, skipTutorial, enableTutorialsForSignup
│   │   │
│   │   └── Characteristics
│   │       ├── Persists across screen navigation: Yes
│   │       ├── Persists across app restarts: No
│   │       └── Cleared on logout: Yes
│   │
│   └── Component State (useState)
│       ├── Form inputs (username, password, etc.)
│       ├── UI state (loading, modals, errors)
│       ├── Temporary data (not persisted)
│       └── Cleared on component unmount
│
├── 💾 BACKEND PERSISTENCE (PostgreSQL/SQLite)
│   │
│   ├── users table
│   │   ├── Primary user authentication data
│   │   ├── Password hashes (bcrypt)
│   │   ├── Account security (lockouts, failed attempts)
│   │   └── Persists: Forever (until account deleted)
│   │
│   ├── user_profiles table
│   │   ├── User profile information
│   │   ├── Contact details (name, phone, email)
│   │   ├── Bio and social media links
│   │   ├── Profile photo URL (Cloudinary)
│   │   ├── Tutorial completion status (has_completed_onboarding)
│   │   └── Persists: Forever (until account deleted)
│   │
│   ├── user_settings table
│   │   ├── User preferences
│   │   ├── Dark mode setting
│   │   ├── Max distance filter
│   │   └── Persists: Forever (until account deleted)
│   │
│   ├── devices table
│   │   ├── Discovered devices (BLE scans)
│   │   ├── Linked contacts (returned drops)
│   │   ├── Contact card data
│   │   └── Persists: Forever (manual delete only)
│   │
│   ├── pinned_contacts table
│   │   ├── User's pinned contacts
│   │   ├── Junction table (user_id, device_id)
│   │   └── Persists: Until unpinned
│   │
│   ├── privacy_zones table
│   │   ├── User-defined privacy zones
│   │   ├── Address and radius
│   │   └── Persists: Until deleted
│   │
│   └── audit_logs table
│       ├── Security audit trail
│       ├── User actions (login, registration, profile updates)
│       ├── IP addresses and user agents
│       └── Persists: Forever (compliance/security)
│
└── ☁️ EXTERNAL PERSISTENCE
    │
    ├── Cloudinary (Media Storage)
    │   ├── Profile photos
    │   ├── URL stored in user_profiles.profile_photo
    │   ├── Transformation: Auto-optimize
    │   └── Persists: Forever (until explicitly deleted)
    │
    └── EAS Updates (OTA Distribution)
        ├── JavaScript bundles
        ├── Asset manifests
        ├── Runtime versions
        └── Persists: 90 days on Expo servers
```

---

## 10. Complete Data Model

```
DATABASE SCHEMA (PostgreSQL/SQLite)
│
├── 👤 users
│   ├── id: INTEGER PRIMARY KEY AUTOINCREMENT
│   ├── username: TEXT UNIQUE NOT NULL (lowercase, case-insensitive)
│   ├── password_hash: TEXT NOT NULL (bcrypt, 60 chars)
│   ├── email: TEXT (can duplicate for caitie690@gmail.com)
│   ├── created_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
│   ├── failed_login_attempts: INTEGER DEFAULT 0
│   ├── locked_until: TEXT (NULL or ISO 8601 timestamp)
│   └── key_version: INTEGER DEFAULT 1
│
├── 📋 user_profiles
│   ├── user_id: INTEGER PRIMARY KEY → users.id
│   ├── name: TEXT (display name)
│   ├── phone: TEXT (digits only: "5551234567")
│   ├── email: TEXT (contact email)
│   ├── bio: TEXT (user description)
│   ├── social_media: TEXT (JSON array)
│   ├── profile_photo: TEXT (Cloudinary URL)
│   └── has_completed_onboarding: INTEGER DEFAULT 0 (0=false, 1=true)
│
├── ⚙️ user_settings
│   ├── user_id: INTEGER PRIMARY KEY → users.id
│   ├── dark_mode: INTEGER DEFAULT 1 (0=light, 1=dark)
│   └── max_distance: INTEGER DEFAULT 33 (feet, 33-100)
│
├── 📱 devices
│   ├── id: INTEGER PRIMARY KEY AUTOINCREMENT
│   ├── name: TEXT NOT NULL
│   ├── rssi: INTEGER (signal strength)
│   ├── distance_feet: REAL (calculated)
│   ├── action: TEXT ('dropped', 'returned', 'linked')
│   ├── timestamp: TEXT (ISO 8601)
│   ├── phone_number: TEXT (NULL until linked)
│   ├── email: TEXT (NULL until linked)
│   ├── bio: TEXT (NULL until linked)
│   ├── social_media: TEXT (JSON, NULL until linked)
│   └── user_id: INTEGER DEFAULT 1 → users.id
│
├── 📌 pinned_contacts
│   ├── user_id: INTEGER NOT NULL → users.id
│   ├── device_id: INTEGER NOT NULL → devices.id
│   └── PRIMARY KEY (user_id, device_id)
│
├── 🚫 privacy_zones
│   ├── id: INTEGER PRIMARY KEY AUTOINCREMENT
│   ├── user_id: INTEGER NOT NULL → users.id
│   ├── address: TEXT NOT NULL
│   └── radius: REAL NOT NULL (feet)
│
├── 📝 audit_logs
│   ├── id: INTEGER PRIMARY KEY AUTOINCREMENT
│   ├── user_id: INTEGER → users.id
│   ├── action: TEXT NOT NULL ('login', 'registration', etc.)
│   ├── details: TEXT (JSON)
│   ├── ip_address: TEXT
│   ├── user_agent: TEXT
│   └── timestamp: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
│
└── ✉️ verification_codes
    ├── id: INTEGER PRIMARY KEY AUTOINCREMENT
    ├── email: TEXT NOT NULL
    ├── code: TEXT NOT NULL (6-digit)
    ├── code_type: TEXT NOT NULL ('password_reset', 'username_recovery')
    ├── expires_at: TEXT NOT NULL (ISO 8601)
    └── created_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

---

## 🔄 Data Flow Summary

### Key Principles:

1. **Authentication First**
   - All protected endpoints require JWT token
   - Token validated on every request
   - User ID extracted from token payload

2. **Three-Layer Validation**
   - Frontend: UI/UX validation (immediate feedback)
   - API: Security validation (prevent bad data)
   - Database: Constraints (data integrity)

3. **Privacy & Security**
   - Passwords: Bcrypt hashed (never stored plain text)
   - Tokens: JWT with 24h expiry
   - Audit logs: Track all security-relevant actions
   - Account lockout: 5 failed attempts = 15 min lock

4. **Data Synchronization**
   - Frontend state synced with backend on load
   - Updates go through API (single source of truth)
   - AsyncStorage for offline/fast access
   - Database for persistent/cross-device data

5. **Tutorial System**
   - Multi-layer persistence (local + server)
   - Only shows for new signups
   - Never shows for returning users
   - Server flag prevents cross-device confusion

---

## 📚 API Endpoint Reference

### Authentication
- `POST /auth/register` - Create new user
- `POST /auth/login` - Authenticate user
- `POST /auth/send-recovery-code` - Send password reset code
- `POST /auth/verify-recovery-code` - Verify code and reset password

### User Profile
- `GET /user/profile` - Get user profile (includes hasCompletedOnboarding)
- `POST /user/profile` - Update user profile
- `GET /user/profile/photo` - Get profile photo URL
- `POST /user/profile/photo` - Upload profile photo

### User Settings
- `GET /user/settings` - Get user settings
- `POST /user/settings` - Update user settings

### Devices/Contacts
- `GET /devices` - Get user's linked devices
- `POST /devices` - Link new device
- `DELETE /devices/{id}` - Delete device
- `GET /pinned-contacts` - Get pinned contact IDs
- `POST /devices/{id}/pin` - Pin contact

### Admin
- `DELETE /admin/clear-all-data` - Wipe entire database (requires secret header)

---

**End of Data Pipeline Documentation**

*Last Updated: 2025-01-03*
*Version: 1.0*

