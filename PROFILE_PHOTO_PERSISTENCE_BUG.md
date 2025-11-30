# Profile Photo Persistence Bug Analysis

## 🐛 **BUG FOUND: Profile Photos Don't Persist After App Restart**

---

## Root Cause

**Duplicate State Management** - Profile photo URL is stored in TWO places:

1. ✅ `userProfile.profilePhoto` (UserProfileContext)
2. ✅ `profilePhotoUri` (App.tsx local state)

**The bug:** Only ONE gets updated on app restart!

---

## The Problem

### **Two Separate State Variables:**

**Line 192 - Local State:**
```typescript
const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
```

**Line 179-185 - Context State:**
```typescript
const [userProfile, setUserProfile] = useState<UserProfile>({
  name: 'Your Name',
  phone: '(555) 123-4567',
  email: 'user@example.com',
  bio: 'Add bio',
  socialMedia: [],
  profilePhoto: undefined  // ← Photo URL stored here too!
});
```

**Line 743 - AccountScreen Receives Local State:**
```typescript
if (tab === 'Account') return <AccountScreen navigation={navigation} profilePhotoUri={profilePhotoUri} />;
```

---

## Data Flow Analysis

### **Upload Flow (WORKS ✅)**

```
1. User uploads photo
   └─> uploadProfilePhoto() saves to Supabase Storage
   └─> Returns publicUrl

2. AccountScreen onPhotoSaved callback (line 728)
   └─> setProfilePhotoUri(uri)  ✅ Sets local state
   └─> loadUserData(..., { onlyPhoto: true })  ✅ Verifies DB

3. onlyPhoto mode (line 295)
   └─> setProfilePhotoUri(profile.profile_photo)  ✅ Sets local state
   └─> return (exits early)
```

**Result:** ✅ Photo displays immediately after upload

---

### **App Restart Flow (BROKEN ❌)**

```
1. App launches, AuthContext restores session

2. useEffect triggers (line 350-354)
   └─> if (isAuthenticated && userId && !isSignupInProgress)
   └─> loadUserData(isAuthenticated, userId)  ← NO onlyPhoto flag!

3. loadUserData in FULL mode (lines 287-322)
   └─> Queries Supabase user_profiles (line 287-291)
   └─> Gets profile data including profile_photo
   
4. onlyPhoto check (line 294)
   └─> if (options?.onlyPhoto && profile)  ← FALSE (no option passed)
   └─> Does NOT call setProfilePhotoUri() ❌
   └─> Falls through to full profile load

5. Full profile load (line 313-321)
   └─> setUserProfile({ 
         profilePhoto: profile.profile_photo  ✅ Sets context
       })
   └─> Does NOT call setProfilePhotoUri() ❌

6. AccountScreen renders (line 743)
   └─> Receives profilePhotoUri prop
   └─> Value: null ❌ (never set on restart)
   └─> Shows placeholder instead of photo
```

**Result:** ❌ Photo lost on app restart

---

## The Missing Link

### **Line 313-322: Full Profile Load**

```typescript
if (profile) {
  setUserProfile({
    name: profile.name || 'Your Name',
    phone: profile.phone || '(555) 123-4567',
    email: profile.email || 'user@example.com',
    bio: profile.bio || 'Add bio',
    profilePhoto: profile.profile_photo,  // ← Sets context
    socialMedia: profile.social_media || [],
  });
  // ❌ MISSING: setProfilePhotoUri(profile.profile_photo);
}
```

**The bug:** `setProfilePhotoUri()` is never called during full data load!

---

## Why This Happens

### **Conditional Logic Bug:**

```typescript
// Handle onlyPhoto option
if (options?.onlyPhoto && profile) {
  setProfilePhotoUri(profile.profile_photo);  // ✅ Called if onlyPhoto: true
  return;
}

// ... load settings and devices ...

if (profile) {
  setUserProfile({...});  // ✅ Called in full load
  // ❌ setProfilePhotoUri() is NOT called here
}
```

**On app restart:** No `onlyPhoto` flag → falls through to full load → `setProfilePhotoUri()` never called

---

## AsyncStorage Removal Impact

### **Before (With AsyncStorage Caching):**

```typescript
// Old code (removed in commit 2aa2662)
const cachedPhoto = await AsyncStorage.getItem('profilePhotoUri');
if (cachedPhoto) {
  setProfilePhotoUri(cachedPhoto);  // ← This hid the bug!
}
```

**The AsyncStorage load was MASKING the bug** by setting `profilePhotoUri` before Supabase loaded!

### **After (Without AsyncStorage):**

```typescript
// Current code - no cache
// loadUserData() must set both:
// 1. userProfile.profilePhoto ✅ (working)
// 2. profilePhotoUri ❌ (missing)
```

---

## Proof of Bug

### **State After App Restart:**

| State Variable | Value | Why |
|----------------|-------|-----|
| `userProfile.profilePhoto` | `https://...profile.jpg` | ✅ Set by loadUserData line 319 |
| `profilePhotoUri` | `null` | ❌ Never set by loadUserData |
| AccountScreen prop | `null` | ❌ Receives profilePhotoUri (null) |

---

## Fix Required

### **Option 1: Set Both States in Full Load**

Add line after 321:

```typescript
if (profile) {
  setUserProfile({
    name: profile.name || 'Your Name',
    phone: profile.phone || '(555) 123-4567',
    email: profile.email || 'user@example.com',
    bio: profile.bio || 'Add bio',
    profilePhoto: profile.profile_photo,
    socialMedia: profile.social_media || [],
  });
  setProfilePhotoUri(profile.profile_photo);  // ← ADD THIS LINE
}
```

### **Option 2: Use Context State Only (Better)**

Remove `profilePhotoUri` state entirely and get photo from UserProfileContext in AccountScreen:

```typescript
// AccountScreen.tsx
const { profile } = useUserProfile();
// Use profile.profilePhoto instead of prop
```

---

## Related Code Sections

**State Declaration:**
- Line 192: `profilePhotoUri` state
- Line 179-185: `userProfile` state

**State Updates:**
- Line 295: `setProfilePhotoUri` (onlyPhoto mode only)
- Line 319: `userProfile.profilePhoto` (full load)
- Line 444: `setProfilePhotoUri` (upload success)
- Line 728: `setProfilePhotoUri` (account screen upload)

**Prop Passing:**
- Line 743: AccountScreen receives `profilePhotoUri` prop

---

## AsyncStorage Search Results

**Pattern:** `AsyncStorage.*profilePhoto|profilePhoto.*AsyncStorage`

**Results:** ✅ **NO MATCHES**

AsyncStorage caching was completely removed in commit `2aa2662`. This is correct, but it revealed the persistence bug.

---

## Why AsyncStorage Removal Was Correct

✅ Single source of truth (Supabase database)
✅ No sync issues between cache and DB
✅ Simpler architecture

**BUT:** It revealed that `profilePhotoUri` state was relying on AsyncStorage and is NOT set from Supabase on app restart.

---

## Timeline

1. **Commit 2aa2662** - Removed AsyncStorage caching
2. **Bug introduced** - profilePhotoUri no longer set on restart
3. **Symptom** - Photos upload successfully but disappear on restart
4. **Root cause** - Duplicate state with inconsistent updates

---

## Recommended Fix

**Option 1 is fastest** - Add one line to set both states:

```typescript
// Line 322 (after setUserProfile)
setProfilePhotoUri(profile.profile_photo);
```

**Option 2 is cleaner** - Refactor to use context state only (removes duplicate state).

---

## Test Case

### **Before Fix:**
1. Upload profile photo
2. Photo displays ✅
3. Close app
4. Reopen app
5. Photo gone ❌ (profilePhotoUri = null)

### **After Fix:**
1. Upload profile photo
2. Photo displays ✅
3. Close app
4. Reopen app
5. Photo displays ✅ (profilePhotoUri set from Supabase)

---

## Conclusion

**The bug is clear:**

❌ `profilePhotoUri` is never set during full data load (app restart)
✅ `userProfile.profilePhoto` IS set, but AccountScreen doesn't use it
✅ AsyncStorage removal was correct - it just exposed this existing bug

**Fix:** Add `setProfilePhotoUri(profile.profile_photo);` after line 321

---

## Commits

```bash
a99505c Revert temporary logging - analyze code instead
50771b8 Switch to folder-based file structure for Supabase Storage RLS
```

