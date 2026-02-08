# Disable Email & Phone Verification - Implementation Plan

## Files That Need Changes

### 1. **AuthContext.tsx** - Disable AUTH_BYPASS
**Location:** `mobile/src/contexts/AuthContext.tsx`
**Line:** 25
**Current:**
```typescript
const AUTH_BYPASS_ENABLED = true;
```
**Change to:**
```typescript
const AUTH_BYPASS_ENABLED = false;
```
**Impact:** This will re-enable login/signup screens instead of auto-bypassing auth.

---

### 2. **SignupScreen.tsx** - Skip Email Verification
**Location:** `mobile/src/screens/SignupScreen.tsx`

#### Change 1: handleSignup() - Skip Verification Modal
**Lines:** 205-208
**Current:**
```typescript
// All validation passed, show verification modal
setError('');
setVerificationStep('confirm');
setShowVerificationModal(true);
```

**Change to:**
```typescript
// All validation passed, create account immediately (skip email verification)
setError('');
handleDirectSignup();
```

#### Change 2: Add New Function - handleDirectSignup()
**Add after handleSignup() function (around line 209):**
```typescript
const handleDirectSignup = async () => {
  setLoading(true);
  setError('');

  try {
    // Create account directly with Supabase (no email verification)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password: password,
      options: {
        data: { username: username },
        emailRedirectTo: undefined, // Disable email confirmation
      }
    });

    if (signUpError) {
      throw new Error(signUpError.message || 'Failed to create account');
    }

    if (!data.user) {
      throw new Error('Account creation failed. Please try again.');
    }

    const userId = data.user.id;
    console.log(`SUCCESS: Account created, userId: ${userId}`);

    // Create user_profiles record
    const { error: profileError } = await supabase.from('user_profiles').insert({
      user_id: userId,
      email: email,
      name: null,
      phone: null,
      bio: null,
      profile_photo: null,
      social_media: [],
      tutorial_home_completed: false,
      tutorial_drop_completed: false,
      tutorial_history_completed: false,
      tutorial_account_completed: false
    });

    if (profileError) {
      console.error(`ERROR: Failed to create user_profiles: ${profileError.message}`);
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }

    // Create user_settings record
    const { error: settingsError } = await supabase.from('user_settings').insert({
      user_id: userId,
      dark_mode: true,
      max_distance: 33
    });

    if (settingsError) {
      console.error(`ERROR: Failed to create user_settings: ${settingsError.message}`);
      throw new Error(`Failed to create settings: ${settingsError.message}`);
    }

    // Sign in the user immediately
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password: password,
    });

    if (signInError || !signInData.user) {
      throw new Error('Account created but sign-in failed. Please try logging in.');
    }

    // Update auth context
    const { signup } = useAuth();
    await signup(email, password, username);

    // Navigate to home
    if (typeof onSignupSuccess !== 'function') {
      throw new Error('Navigation handler is missing');
    }
    
    onSignupSuccess(undefined);
  } catch (err: any) {
    console.error(`ERROR: Direct signup error: ${err.message}`);
    setError(err.message || 'Something went wrong. Please try again.');
  } finally {
    setLoading(false);
  }
};
```

**Note:** The existing `handleVerifyAndSignup()` function can remain but won't be called. The verification modal UI can stay but won't be shown.

---

### 3. **DropScreen.tsx** - Remove Phone Verification Check
**Location:** `mobile/src/screens/DropScreen.tsx`

#### Change 1: Remove Phone Verification Check in handleDrop()
**Lines:** 54-62
**Current:**
```typescript
const handleDrop = async (device: BleDevice) => {
  if (!phoneVerified) {
    showToast({
      message: 'Please verify your phone number to start dropping',
      type: 'error',
      duration: 3000,
    });
    return;
  }
  try {
```

**Change to:**
```typescript
const handleDrop = async (device: BleDevice) => {
  // Phone verification check disabled
  try {
```

#### Change 2: Remove/Hide Phone Verification Banner
**Lines:** 185-204
**Current:**
```typescript
{/* Phone Verification Banner - Show only when not verified */}
{!phoneVerified ? (
  <View style={{...}}>
    <MaterialCommunityIcons name="phone-outline" ... />
    <Text>Verify your phone number to start sending and receiving drops!</Text>
    ...
  </View>
) : (
```

**Change to:**
```typescript
{/* Phone Verification Banner - DISABLED */}
{false && !phoneVerified ? (
  // Banner code remains but won't show
```

**OR** simply comment out or remove the entire banner block.

---

### 4. **HomeScreen.tsx** - Verify No Phone Checks
**Location:** `mobile/src/screens/HomeScreen.tsx`

**Status:** Already has comments saying "Phone verification check removed for testing" at lines 1330 and 3020. No changes needed - the checks are already disabled.

**Line 638:** `const phoneVerified = profile?.phoneVerified || false;` - This variable is defined but not used in blocking logic.

---

## Summary of Changes

1. ✅ **AuthContext.tsx** - Set `AUTH_BYPASS_ENABLED = false` (1 line change)
2. ✅ **SignupScreen.tsx** - Skip verification modal, create account directly (2 changes: modify handleSignup, add handleDirectSignup)
3. ✅ **DropScreen.tsx** - Remove phone verification check in handleDrop() and hide banner (2 changes)
4. ✅ **HomeScreen.tsx** - No changes needed (already disabled)

**Total Files to Modify:** 3 files
**Total Changes:** 5 code changes

---

## Verification Checks Found

### Email Verification:
- ✅ **SignupScreen.tsx line 205-208:** Shows verification modal instead of creating account
- ✅ **SignupScreen.tsx line 227-322:** `handleVerifyAndSignup()` requires OTP code verification

### Phone Verification:
- ✅ **DropScreen.tsx line 55:** Blocks drop sending if `!phoneVerified`
- ✅ **DropScreen.tsx line 186:** Shows banner when `!phoneVerified`
- ✅ **HomeScreen.tsx:** Already disabled (comments say "removed for testing")
- ✅ **AccountScreen.tsx:** Has phone verification modal but it's optional (not blocking)

---

## Expected Behavior After Changes

1. User opens app → Sees login/signup screens (AUTH_BYPASS disabled)
2. User signs up → Enters username/email/password → Account created immediately → Logged in → Can use app
3. User tries to drop → No phone verification check → Drop sends successfully
4. User logs in → Works normally (no changes needed)

