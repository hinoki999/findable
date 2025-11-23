# DropLink - Project Summary

## 🎯 What It Is

**DropLink** is a proximity-based social networking mobile app that allows users to discover and connect with nearby people (within 33 feet) via Bluetooth Low Energy (BLE). Users can exchange contact information ("drop" their info) and build a network of local connections.

Think: "AirDrop for contact sharing" + "LinkedIn meets proximity networking"

---

## 🏗️ Architecture

### **Tech Stack**

**Frontend (Mobile):**
- React Native (v0.81.5) with Expo (v54)
- TypeScript
- React Native Gesture Handler (for zoom/rotate)
- Expo Router for navigation
- BLE PLX for Bluetooth scanning
- AsyncStorage for local data
- Animated API for UI animations

**Backend:**
- FastAPI (Python)
- PostgreSQL database (Railway hosted)
- JWT authentication
- Bcrypt for password hashing
- Pydantic for validation

**Infrastructure:**
- Backend: Railway (https://findable-production.up.railway.app)
- Mobile: EAS (Expo Application Services)
- CI/CD: GitHub Actions
- OTA Updates: Expo Updates (channel: `preview`)

### **Project Structure**

```
droplin/
├── mobile/                      # React Native app
│   ├── src/
│   │   ├── screens/            # Main screens (Home, Drop, Links, Account)
│   │   ├── components/         # Reusable components (TopBar, TutorialOverlay, etc.)
│   │   ├── contexts/           # React contexts (TutorialContext)
│   │   ├── services/           # API calls, BLE scanning
│   │   └── theme.ts            # Color/typography theme
│   ├── app.json                # Expo config (runtime v1.0.1, channel: preview)
│   ├── App.tsx                 # Main entry point, context providers
│   └── package.json
├── backend/
│   └── main.py                 # FastAPI server (~3400 lines)
├── testing/                    # Test suite
│   ├── backend-tests/          # Pytest tests
│   ├── integration-tests/      # Jest tests
│   ├── ota-monitor.js          # OTA deployment checker
│   └── DATA_PIPELINE.md        # Data flow documentation
└── .github/workflows/          # GitHub Actions CI/CD
    ├── ota-update.yml          # Auto-publish OTA updates on push to develop
    └── test-suite.yml          # Run tests on push/PR
```

---

## 🎨 Key Features

### **1. Proximity Radar (Home Screen)**
- **3D curved grid** with sphere projection (33-foot radius)
- **Real-time BLE scanning** shows nearby users as green pulsating dots
- **Pinch-to-zoom and rotate** gestures (nucleus-centered transform)
- **Distance-based dot pulsation** (closer = faster pulse)
- **Grid snapping** (dots align to 3-foot grid intersections)
- **Discoverable toggle** (users can go "ghost mode" to be invisible)

**Technical Details:**
- 6,440+ View components rendering curved grid lines
- Tensor mathematics for spatial positioning
- Cubed sphere projection for 3D effect
- Currently experiencing performance issues during gestures (being optimized)

### **2. Drop Functionality (Drop Screen)**
- View list of nearby discovered users
- Send your contact info ("drop") to selected users
- Displays distance in feet for each nearby person
- Shows profile pictures, names, bios

### **3. Links Management (Links Screen)**
- View all accepted link connections
- Contact cards with full profile information
- Swipe right to pin favorites
- Swipe left to delete (with undo via backend restore)
- Search/filter contacts

### **4. User Profiles (Account Screen)**
- Profile photo upload
- Editable fields: name, phone, email, bio
- Social media links (Instagram, Twitter, LinkedIn, TikTok, Snapchat, Facebook)
- Password/username recovery
- Logout with data persistence

### **5. Tutorial System**
- First-time user onboarding (6 screens)
- Context-aware tooltips with arrow indicators
- Triple-layer persistence:
  1. Local session flag (`@droplink_show_tutorials_flag`)
  2. Server-side onboarding flag (`has_completed_onboarding`)
  3. Per-screen completion tracking (AsyncStorage)
- Only shown on signup, never on login
- "Tap anywhere to continue" interaction

---

## 🔐 Authentication & Data Flow

### **Registration Flow**
```
SignupScreen → POST /auth/register → JWT token
                ↓
         Create profile record (has_completed_onboarding: false)
                ↓
         Enable tutorials
                ↓
         Navigate to Home
```

### **Login Flow**
```
LoginScreen → POST /auth/login → JWT token
               ↓
        Load user profile
               ↓
        Check has_completed_onboarding
               ↓
        Skip tutorials if true
```

### **Profile Data**
- Stored in PostgreSQL `user_profiles` table
- Fields: `user_id`, `name`, `email`, `phone`, `bio`, `profile_photo`, `social_media`, `has_completed_onboarding`
- Phone numbers stored as digits only (frontend strips formatting)
- "Add bio" placeholder converted to empty string before saving

### **Special Test Account**
- Email: `caitie690@gmail.com`
- Allowed to create multiple accounts for testing (bypasses unique email constraint)

---

## 🎨 UI/UX Design

### **Branding**
- **Logo:** "DropLink" with orange→blue gradient
  - Colors: `#FF6B4A` (orange) → `#FFB199` → `#FFF5F3` (whitish) → `#C5E8FF` → `#4A90FF` (blue)
- **Theme:** Inter font family, clean modern design
- **Page Headers:** TopBar component with logo mode and icon indicators

### **Key Screens**

1. **Home (Radar):**
   - Central raindrop icon (visible when devices nearby)
   - 3D curved grid background
   - Green dot blips for nearby users
   - Reset View button
   - Discoverable toggle (top-right)

2. **Drop:**
   - List view of nearby users
   - Profile photos with distance indicators
   - Empty state: "When people are nearby, they will appear here!"

3. **Links:**
   - Swipeable contact cards
   - Pin/delete functionality
   - Empty state with gradient "drops" text

4. **Account:**
   - Profile photo (circular)
   - Editable fields (tap to edit)
   - Social media links
   - Settings and logout

---

## 🚀 Recent Development Work

### **Major Fixes (Last Session)**

1. **Tutorial System Overhaul:**
   - Fixed: Tutorials not showing for new signups
   - Changed: `hasCompletedOnboarding` set to `false` during signup (was `true`)
   - Result: Tutorials now show correctly for new users

2. **Grid Performance Optimization (In Progress):**
   - Identified: 6,440 View components recalculating 60fps during gestures
   - Issue: Double transformation bug (parent + grid calculations both apply scale/rotate)
   - Plan: Memoize static grid, remove viewTransformTensor from calculations
   - Expected gain: 10-40x performance improvement

3. **Gesture Handler Implementation:**
   - Replaced: Raw touch event handlers with react-native-gesture-handler
   - Added: `Gesture.Pinch()` and `Gesture.Rotation()` with simultaneous support
   - Fixed: Zoom now ignores `focalX`/`focalY` (only uses scale distance)
   - Result: More reliable gesture detection

4. **Zoom Center Fix:**
   - Problem: Zoom following pinch location instead of centering on nucleus
   - Solution: Simple transform origin pattern (translate → scale → translate back)
   - Status: Implemented with gesture handler

5. **OTA Update Configuration:**
   - Added: `"channel": "preview"` to `app.json` updates config
   - Fixed: App wasn't receiving updates (channel mismatch)
   - Status: Requires rebuild with new config

6. **Grid Alignment:**
   - Fixed: Blips appearing between grid lines
   - Changed: `GRID_SPACING_FEET` from 1.5 to 3 (matches grid rendering)
   - Result: Dots now snap to grid intersections

7. **Profile Persistence:**
   - Fixed: Profile data not saving/loading correctly
   - Backend changes: Strip non-numeric chars from phone, convert "Add bio" placeholder to empty string
   - Result: Profile data persists across login/logout

8. **Empty State UI:**
   - Removed: Mock BLE data and placeholder text
   - Added: Gradient effect on "drops" text (matches branding)
   - Removed: Raindrop icon when no devices nearby

9. **Testing Suite:**
   - Created: Comprehensive test infrastructure
   - Backend tests: Pytest (auth, profile, persistence)
   - Integration tests: Jest (OTA validation, tutorial flow)
   - Monitoring: ota-monitor.js (GitHub Actions + EAS checks)
   - Fixed: Broken GraphQL queries, missing tokens handling

10. **Database Migration:**
    - Added: `has_completed_onboarding` column migration in `init_db()`
    - Status: Gracefully handles existing/new installations

---

## 🐛 Known Issues

### **High Priority**

1. **Grid Performance During Gestures:**
   - **Issue:** Janky animations during pinch/zoom/rotate
   - **Cause:** 6,440 components recalculating at 60fps
   - **Status:** Optimization plan created, ready to implement
   - **ETA:** Next session

2. **Initial Grid Render:**
   - **Issue:** First render may be slow (6,440 components)
   - **Mitigation:** Consider reducing segmentsPerLine from 20 to 10
   - **Status:** Will assess after memoization

### **Medium Priority**

3. **OTA Updates Not Received:**
   - **Issue:** App not checking correct channel
   - **Fix:** Added `"channel": "preview"` to app.json
   - **Status:** Needs rebuild to take effect

4. **Android Safe Area Handling:**
   - **Status:** Fixed (TopBar and bottom nav use useSafeAreaInsets)

### **Low Priority / Future**

5. **BLE Permission Handling:**
   - **Status:** Basic implementation, may need refinement

6. **Offline Mode:**
   - **Status:** Not implemented

---

## 📊 Current State of Development

### **✅ Completed Features**
- ✅ User authentication (signup/login/logout)
- ✅ Profile management (create/edit/save)
- ✅ BLE scanning and proximity detection
- ✅ Real-time nearby user display
- ✅ Contact linking (drop/accept)
- ✅ Tutorial system (with persistence)
- ✅ 3D curved grid visualization
- ✅ Pinch-to-zoom and rotation gestures
- ✅ Profile photo upload
- ✅ Social media links
- ✅ Password/username recovery
- ✅ Swipe gestures (pin/delete contacts)
- ✅ Android safe area handling
- ✅ OTA update infrastructure
- ✅ Comprehensive test suite
- ✅ CI/CD pipeline (GitHub Actions)

### **🔧 In Progress**
- 🔧 Grid performance optimization (memoization)
- 🔧 Gesture smoothness improvements

### **📋 Planned / Future**
- 📋 iOS build and testing
- 📋 Push notifications
- 📋 Chat/messaging feature
- 📋 Group events/meetups
- 📋 Profile verification
- 📋 Analytics dashboard
- 📋 Canvas/Skia grid rendering (if memoization insufficient)

---

## 🔑 Key Code Locations

### **Critical Files**

| File | Purpose | Key Features |
|------|---------|--------------|
| `mobile/App.tsx` | Main entry, contexts | Auth, profile loading, OTA checks, navigation |
| `mobile/src/screens/HomeScreen.tsx` | Radar screen | Grid rendering, BLE scanning, gesture handling (3112 lines) |
| `mobile/src/contexts/TutorialContext.tsx` | Tutorial logic | Triple-layer persistence, screen tracking |
| `mobile/src/components/TopBar.tsx` | Header component | Gradient logo, safe area handling |
| `mobile/src/components/TutorialOverlay.tsx` | Tutorial UI | Bubble design, arrow indicators |
| `backend/main.py` | API server | All endpoints, auth, database (~3400 lines) |
| `mobile/app.json` | Expo config | Runtime version, updates channel, projectId |

### **Important Endpoints**

**Auth:**
- `POST /auth/register` - Create account
- `POST /auth/login` - Get JWT token
- `POST /auth/send-recovery-code` - Forgot password/username
- `POST /auth/verify-recovery-code` - Verify recovery code

**Profile:**
- `GET /user/profile` - Get user profile (includes `hasCompletedOnboarding`)
- `POST /user/profile` - Save/update profile
- `POST /user/profile-photo` - Upload profile picture

**Devices (BLE):**
- `POST /devices/save` - Save nearby device
- `GET /devices` - Get linked devices
- `DELETE /devices/{device_id}` - Delete device
- `POST /devices/{device_id}/restore` - Restore deleted device

**Settings:**
- `GET /user/settings` - Get user settings (e.g., discoverable state)
- `POST /user/settings` - Update settings

**Admin:**
- `DELETE /admin/clear-all-data` - Wipe database (header: `secret: delete-all-profiles-2024`)

---

## 🧪 Testing

### **Test User Accounts**
- Email: `caitie690@gmail.com` (can create multiple accounts)
- Create test usernames: `caitie690_test`, `caitie691`, etc.

### **Running Tests**
```bash
# Backend tests
cd testing
pytest backend-tests/

# Integration tests  
cd testing
npm test

# OTA monitoring
node testing/ota-monitor.js

# All tests
.\testing\run-all-tests.ps1
```

### **Automated Testing**
- GitHub Actions runs tests on push/PR
- Tests include: auth, profile, persistence, OTA validation

---

## 🚀 Deployment

### **Development Workflow**
```bash
# Start dev server
cd mobile
npx expo start --clear

# Build preview
npx eas build --platform android --profile preview

# Publish OTA update
npx eas update --branch preview --message "Your message"
```

### **Automated OTA Updates**
- Push to `develop` branch → GitHub Actions publishes OTA update
- Updates appear on Expo dashboard: https://expo.dev/@hirule/mobile

### **Environment Variables**
- `EXPO_TOKEN` - For EAS CLI authentication
- `GITHUB_TOKEN` - For GitHub API access (optional for monitoring)
- Backend: `JWT_SECRET_KEY`, `DATABASE_URL`

---

## 💾 Database Schema

### **Key Tables**

**users:**
- `id`, `username`, `email`, `password_hash`, `created_at`

**user_profiles:**
- `user_id`, `name`, `email`, `phone`, `bio`, `profile_photo`, `social_media` (JSON), `has_completed_onboarding`

**user_settings:**
- `user_id`, `is_discoverable`, `notification_enabled`

**devices:**
- `id`, `user_id`, `name`, `phone_number`, `email`, `bio`, `social_media` (JSON), `action`, `deleted_at`

---

## 📝 Development Notes

### **Code Patterns**

1. **Async Storage Keys:**
   - `@auth_token` - JWT token
   - `@user_id` - Current user ID
   - `@profile_photo_uri` - Profile photo path
   - `@tutorial_completed_{screen}` - Per-screen tutorial tracking
   - `@droplink_show_tutorials_flag` - Session tutorial flag

2. **Theme Usage:**
   ```typescript
   const { isDarkMode } = useDarkMode();
   const theme = getTheme(isDarkMode);
   // Use: theme.colors.blue, theme.type.h1, etc.
   ```

3. **API Calls:**
   ```typescript
   import { secureFetch, BASE_URL } from '../services/api';
   const response = await secureFetch(`${BASE_URL}/endpoint`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(data)
   });
   ```

4. **Toasts:**
   ```typescript
   const { showToast } = useToast();
   showToast({ message: 'Success!', type: 'success', duration: 3000 });
   ```

### **Performance Considerations**

- Grid rendering is currently the main bottleneck
- BLE scanning runs every 5 seconds (not continuous)
- Profile photos are base64 encoded (consider switching to file URLs)
- Tutorial checks happen on every screen mount (acceptable overhead)

### **Git Workflow**

- `main` - Production branch
- `develop` - Development branch (triggers OTA updates)
- Feature branches → PR to `develop`
- Automated hourly backups to `backup-branch`

---

## 🎯 Next Steps

### **Immediate (This Session)**
1. Implement grid memoization optimization
2. Test gesture performance on device
3. If needed: Reduce segmentsPerLine or GRID_SPACING_FEET

### **Short Term (Next Session)**
1. Rebuild app with OTA channel configuration
2. Test OTA updates end-to-end
3. Verify tutorial flow works in production build
4. iOS testing and build

### **Medium Term**
1. Push notifications infrastructure
2. Chat/messaging feature
3. Group events/meetups
4. Enhanced profile features

---

## 📚 Additional Documentation

- **Data Pipeline:** `testing/DATA_PIPELINE.md` - Complete data flow diagrams
- **Test Suite README:** `testing/README.md` - Testing infrastructure guide
- **Quick Start:** `testing/QUICKSTART.md` - Testing setup guide

---

**Last Updated:** Current session  
**App Version:** 1.0.1  
**Runtime Version:** 1.0.1  
**Status:** Active development, functional prototype with performance optimization in progress

