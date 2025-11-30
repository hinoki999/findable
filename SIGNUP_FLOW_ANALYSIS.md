# Signup Flow Analysis - Profile Creation vs Photo Upload

## Executive Summary

✅ **Status:** The current implementation is **CORRECT** and should work properly.

**Key Finding:** The profile row is created **BEFORE** the photo upload prompt appears, so using `UPDATE` is appropriate.

---

## Signup Flow Sequence

### 1. **SignupScreen.tsx** - User enters details and verifies email

**Lines 240-306:**
```typescript
const handleVerifyAndSignup = async () => {
  // Step 1: Verify OTP (logs user in via Supabase Auth)
  await verifyOtpCode(email, verificationCode, 'signup');
  
  // Step 2: Set password
  await supabase.auth.updateUser({
    password: password,
    data: { username: username }
  });
  
  // Step 3: Get user ID from session
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  
  // Step 4: CREATE user_profiles row (profile_photo = null)
  await supabase.from('user_profiles').insert({
    user_id: userId,
    email: email,
    name: null,
    phone: null,
    bio: null,
    profile_photo: null,  // ← Row created with NULL photo
    social_media: [],
    has_completed_onboarding: false
  });
  
  // Step 5: Create user_settings row
  await supabase.from('user_settings').insert({
    user_id: userId,
    dark_mode: true,
    max_distance: 33
  });
  
  // Step 6: Call onSignupSuccess (navigates to App.tsx)
  onSignupSuccess();
}
```

### 2. **App.tsx** - Handles signup completion

**Lines 380-416:**
```typescript
const handleSignupSuccess = async () => {
  await refreshAuth();  // Refresh auth state
  
  setIsFirstTimeUser(true);
  setShowProfilePhotoPrompt(true);  // ← Show photo prompt AFTER profile created
  setIsSignupInProgress(false);
};
```

### 3. **App.tsx** - Shows ProfilePhotoPromptScreen

**Lines 662-710:**
```typescript
if (isAuthenticated && showProfilePhotoPrompt) {
  return (
    <ProfilePhotoPromptScreen 
      onComplete={handleProfilePhotoPromptComplete}
    />
  );
}
```

### 4. **ProfilePhotoPromptScreen.tsx** - User uploads photo

**Lines 48-70:**
```typescript
const handleUpload = async () => {
  await uploadProfilePhoto(selectedImage, userId);  // ← UPDATE existing row
  onComplete();
};
```

### 5. **api.ts - uploadProfilePhoto()** - Updates database

**Lines 828-834:**
```typescript
// Update database (row already exists from Step 4)
const { error: dbError } = await supabase
  .from('user_profiles')
  .update({ profile_photo: publicUrl })  // ← UPDATE, not INSERT
  .eq('user_id', userId);
```

---

## Database State Timeline

| Step | Action | user_profiles.profile_photo Value |
|------|--------|-----------------------------------|
| 1 | Signup OTP verification | (row doesn't exist yet) |
| 2 | **SignupScreen creates row** | `NULL` |
| 3 | Navigate to photo prompt | `NULL` |
| 4 | User selects photo | `NULL` |
| 5 | **uploadProfilePhoto() runs** | `https://...supabase.co/.../abc123.jpg` |

---

## Why UPDATE is Correct

1. ✅ **Row exists before photo upload**
   - Created in SignupScreen.tsx line 277-286
   - Contains profile_photo = NULL

2. ✅ **Photo upload happens AFTER row creation**
   - ProfilePhotoPromptScreen appears after handleSignupSuccess
   - handleSignupSuccess is called after user_profiles INSERT completes

3. ✅ **UPDATE vs INSERT**
   - UPDATE: Modifies existing row ✅ **CORRECT**
   - INSERT: Would cause primary key violation ❌

---

## Potential Issues (None Found)

### ❓ Could there be a race condition?
**No** - The signup flow is synchronous:
1. SignupScreen waits for INSERT to complete
2. Only then calls onSignupSuccess
3. Only then shows ProfilePhotoPromptScreen

### ❓ Could the row not exist yet?
**No** - SignupScreen would throw an error if INSERT failed:
```typescript
if (profileError) {
  throw new Error(`Failed to create profile: ${profileError.message}`);
}
```

### ❓ Could there be multiple users uploading simultaneously?
**No issue** - Each user has unique user_id (UUID from Supabase Auth)

---

## Backend vs Supabase Auth

**IMPORTANT:** The app uses **Supabase Auth directly**, NOT the legacy backend signup endpoint.

### Legacy Backend Endpoint (NOT USED)
```python
# backend/main.py lines 1357-1359
INSERT INTO user_profiles (user_id, email, has_completed_onboarding)
VALUES (?, ?, ?)
```
This is part of the **Railway backend** which is being deprecated.

### Current Flow (Supabase Auth)
```typescript
// SignupScreen.tsx lines 277-286
await supabase.from('user_profiles').insert({...});
```
This is the **active implementation** used by the mobile app.

---

## Database Triggers

**Finding:** No automatic triggers found in Supabase.

The app **manually** creates the user_profiles row during signup, it's not auto-created by a database trigger.

---

## Conclusion

The current implementation is **architecturally sound**:

1. ✅ Profile row created during signup (before photo prompt)
2. ✅ Photo uploaded after row exists (UPDATE is appropriate)
3. ✅ No race conditions (synchronous flow)
4. ✅ Error handling in place (would catch missing row)

**No changes needed** to the signup flow or uploadProfilePhoto() function.

---

## Related Commits

- `a28815d` - Simplified uploadProfilePhoto to use Supabase SDK
- `f73422b` - Fixed base64 to binary conversion
- `1520a6d` - Removed debug logging from upload handlers
- `2aa2662` - Removed AsyncStorage caching layer
- `2531d08` - Deleted legacy Cloudinary endpoints

---

## Next Build Requirements

Since `react-native-blob-util` is now enabled, a full EAS build is required:

```bash
cd mobile
eas build --platform android --profile preview
```

OTA updates (`eas update`) **will not work** for native module changes.

