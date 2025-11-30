# Commented Code Inventory - Mobile App

## Overview

Comprehensive inventory of large commented-out code blocks (5+ lines) in `mobile/src/` directory.

**Date:** November 30, 2024

---

## Large Commented Blocks Found

### 1. SignupScreen.tsx - Tutorial Setup Block

**File:** `mobile/src/screens/SignupScreen.tsx`  
**Lines:** 297-330 (34 lines)  
**Type:** Multi-line comment block `/* */`

**What it does:**
```typescript
// TODO: Re-implement tutorials after signup flow is stable
// Tutorial setup temporarily disabled - was blocking signup navigation
// Original code preserved below for re-implementation:
/*
addLog('📚 Setting up tutorials...');
if (typeof enableTutorialsForSignup === 'function') {
  try {
    await enableTutorialsForSignup();
    addLog('✅ Tutorials enabled successfully');
  } catch (tutorialError: any) {
    addLog(`⚠️ enableTutorialsForSignup error (non-critical): ${tutorialError.message || 'Unknown error'}`);
  }
} else {
  addLog('⚠️ enableTutorialsForSignup not available (skipping)');
}

if (typeof startScreenTutorial === 'function') {
  try {
    await startScreenTutorial('Home', 5);
    addLog('✅ Home screen tutorial started');
  } catch (tutorialError: any) {
    addLog(`⚠️ startScreenTutorial error (non-critical): ${tutorialError.message || 'Unknown error'}`);
  }
} else {
  addLog('⚠️ startScreenTutorial not available (skipping)');
}

await new Promise(resolve => setTimeout(resolve, 200));
addLog('✅ AsyncStorage operations should be complete');
*/
```

**Purpose:** Tutorial initialization during signup  
**Why commented:** Was blocking signup navigation flow  
**Keep or Remove:** ⚠️ **KEEP** - Marked as TODO for re-implementation

---

### 2. SignupScreen.tsx - Tutorial Hook Import

**File:** `mobile/src/screens/SignupScreen.tsx`  
**Lines:** 8, 22 (2 lines, but related to block above)  
**Type:** Single-line comments `//`

**What it does:**
```typescript
// import { useTutorial } from '../contexts/TutorialContext';
// Line 22:
// const { enableTutorialsForSignup, startScreenTutorial } = useTutorial();
```

**Purpose:** Import and hook for tutorial system  
**Why commented:** Related to tutorial block above  
**Keep or Remove:** ⚠️ **KEEP** - Related to TODO

---

### 3. WelcomeScreen.tsx - Google Auth Integration

**File:** `mobile/src/screens/WelcomeScreen.tsx`  
**Lines:** 7, 21, 25-46 (26 lines total)  
**Type:** Mixed (`//` and multi-line block)

**What it does:**
```typescript
// import { useGoogleAuth, authenticateWithGoogle } from '../services/googleAuth';

// const { request, response, promptAsync } = useGoogleAuth();

// useEffect(() => {
//   if (response?.type === 'success') {
//     const { id_token } = response.params;
//     handleGoogleAuth(id_token);
//   }
// }, [response]);

// const handleGoogleAuth = async (idToken: string) => {
//   try {
//     setGoogleLoading(true);
//     const result = await authenticateWithGoogle(idToken);
//     
//     if (onGoogleLoginSuccess) {
//       onGoogleLoginSuccess(result.token, result.user_id, result.username);
//     }
//   } catch (error: any) {
//     console.error('Google auth error:', error);
//     Alert.alert('Authentication Failed', error.message || 'Failed to sign in with Google');
//   } finally {
//     setGoogleLoading(false);
//   }
// };
```

**Purpose:** Google OAuth sign-in integration  
**Why commented:** Feature incomplete, shows "coming soon" toast instead  
**Keep or Remove:** ⚠️ **KEEP for now** - Planned feature (see line 52: "Google Sign-In coming soon!")

---

### 4. AccountScreen.tsx - Report Issue Handler

**File:** `mobile/src/screens/AccountScreen.tsx`  
**Lines:** 338-345 (8 lines)  
**Type:** Single-line comments `//`

**What it does:**
```typescript
// Flag/Report button removed
// const handleReportIssue = () => {
//   showToast({
//     message: 'Report feature coming soon',
//     type: 'success',
//     duration: 2000,
//   });
// };
```

**Purpose:** Report issue button handler  
**Why commented:** Feature removed/not implemented  
**Keep or Remove:** ✅ **REMOVE** - Says "removed" in comment, no plans to implement

---

## Summary Table

| File | Lines | Lines Count | Type | Purpose | Keep or Remove? |
|------|-------|-------------|------|---------|-----------------|
| SignupScreen.tsx | 297-330 | 34 | `/* */` block | Tutorial initialization | ⚠️ KEEP (TODO) |
| SignupScreen.tsx | 8, 22 | 2 | `//` imports | Tutorial hooks | ⚠️ KEEP (related) |
| WelcomeScreen.tsx | 7, 21, 25-46 | 26 | Mixed | Google OAuth | ⚠️ KEEP (planned) |
| AccountScreen.tsx | 338-345 | 8 | `//` function | Report issue button | ✅ REMOVE |

**Total Large Blocks:** 4 blocks  
**Total Lines:** 70 lines commented  
**Recommended for removal:** 8 lines (Report Issue handler)  
**Keep (planned features):** 62 lines (Tutorials, Google Auth)

---

## Detailed Analysis

### Blocks to KEEP (Planned Features)

**1. Tutorial System (36 lines)**
- **Status:** Temporarily disabled
- **Reason:** Was blocking signup flow
- **TODO:** Re-implement after signup flow is stable
- **Evidence:** Line 297 says "TODO: Re-implement"

**2. Google OAuth (26 lines)**
- **Status:** Feature incomplete
- **Reason:** OAuth integration not finished
- **TODO:** Complete Google Sign-In feature
- **Evidence:** Line 52 shows toast "Google Sign-In coming soon!"

---

### Blocks to REMOVE (Obsolete)

**1. Report Issue Handler (8 lines)**
- **Status:** Feature removed
- **Reason:** Not needed or implemented
- **Evidence:** Comment says "Flag/Report button removed"
- **Action:** DELETE lines 338-345

---

## Additional Commented Code (Under 5 Lines)

### SignupScreen.tsx
- Line 8: Commented import (tutorial) - KEEP (related to TODO)
- Line 22: Commented hook (tutorial) - KEEP (related to TODO)

### WelcomeScreen.tsx
- Line 7: Commented import (Google Auth) - KEEP (planned feature)
- Line 21: Commented hook (Google Auth) - KEEP (planned feature)
- Line 49: Commented promptAsync() call - KEEP (planned feature)

### AccountScreen.tsx
- Already cleaned up Privacy Zones comments in previous step

---

## Documentation Comments (IGNORED as requested)

These files have JSDoc comments (/** */) which were correctly ignored:
- `mobile/src/services/storage.ts` - JSDoc for API documentation
- `mobile/src/services/activityMonitor.ts` - JSDoc for function documentation
- `mobile/src/utils/BLEErrorLogger.ts` - JSDoc for methods
- `mobile/src/utils/PerformanceLogger.ts` - JSDoc for methods
- `mobile/src/utils/ErrorLogger.ts` - JSDoc for methods

**Action:** No changes needed (these are proper documentation)

---

## Explanatory Comments (IGNORED as requested)

Single-line comments providing context:
- `// Connected to backend!` - Explanatory
- `// Only enforce HTTPS in production` - Explanatory
- `// Map frontend format to database format` - Explanatory
- `// For sub-screens like ProfilePhoto, SecuritySettings` - Explanatory

**Action:** Keep all explanatory comments

---

## Recommendation

### Immediate Action
✅ **DELETE:** `AccountScreen.tsx` lines 338-345 (Report Issue handler - 8 lines)

### Keep for Future
⚠️ **KEEP:** Tutorial system code (marked TODO, 36 lines)  
⚠️ **KEEP:** Google OAuth code (planned feature, 26 lines)

---

## Total Impact

| Category | Lines | Action |
|----------|-------|--------|
| Report Issue (obsolete) | 8 | DELETE |
| Tutorial System (TODO) | 36 | KEEP |
| Google OAuth (planned) | 26 | KEEP |
| **Recommended Removal** | **8 lines** | |


