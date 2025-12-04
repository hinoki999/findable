# Comprehensive Handoff Document: Post-Code-Cleanup Implementation

## Overview
This document covers all work completed after the "clean up the code" prompt. It includes real code snippets, logic explanations, design concepts, and implementation details for the tutorial system overhaul and phone verification feature.

---

## 1. Tutorial System Overhaul: Per-Screen Tracking

### Problem Statement
The original tutorial system used a single `has_completed_onboarding` flag, which meant completing or skipping any tutorial would disable all others. This created an "all-or-nothing" experience that didn't allow users to see tutorials for specific screens independently.

### Solution: Per-Screen Tutorial Tracking

#### Database Schema Changes
**New Columns in `user_profiles` table:**
- `tutorial_home_completed` (BOOLEAN, default: false)
- `tutorial_drop_completed` (BOOLEAN, default: false)
- `tutorial_history_completed` (BOOLEAN, default: false)
- `tutorial_account_completed` (BOOLEAN, default: false)

**Removed:**
- `has_completed_onboarding` (replaced by per-screen flags)

#### Core Implementation: `TutorialContext.tsx`

**Key Changes:**

1. **State Structure:**
```typescript
// Before: Single boolean flag
const [shouldShowTutorials, setShouldShowTutorials] = useState(true);

// After: Per-screen completion tracking
const [completedTutorials, setCompletedTutorials] = useState<Record<ScreenName, boolean>>({
  Home: false,
  Drop: false,
  History: false,
  Account: false,
});
const [isLoaded, setIsLoaded] = useState(false); // Track when data is fetched
```

2. **Initialization Logic:**
```typescript
const initializeTutorials = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      // No session: mark all as completed (don't show tutorials)
      setCompletedTutorials({
        Home: true,
        Drop: true,
        History: true,
        Account: true,
      });
      setIsLoaded(true);
      return;
    }
    
    // Query all four tutorial completion flags from Supabase
    const { data, error } = await supabase
      .from('user_profiles')
      .select('tutorial_home_completed, tutorial_drop_completed, tutorial_history_completed, tutorial_account_completed')
      .eq('user_id', session.user.id)
      .single();
    
    if (error) {
      // Fail-safe: mark all as completed on error
      setCompletedTutorials({
        Home: true,
        Drop: true,
        History: true,
        Account: true,
      });
      setIsLoaded(true);
      return;
    }
    
    // Treat NULL as FALSE (show tutorial if not explicitly completed)
    const completed = {
      Home: data?.tutorial_home_completed ?? false,
      Drop: data?.tutorial_drop_completed ?? false,
      History: data?.tutorial_history_completed ?? false,
      Account: data?.tutorial_account_completed ?? false,
    };
    
    setCompletedTutorials(completed);
    setIsLoaded(true);
  } catch (error) {
    console.error('[TUTORIAL] initializeTutorials error:', error);
    // Fail-safe: mark all as completed
    setCompletedTutorials({
      Home: true,
      Drop: true,
      History: true,
      Account: true,
    });
    setIsLoaded(true);
  }
};
```

3. **Screen-Specific Tutorial Start:**
```typescript
const startScreenTutorial = (screen: ScreenName, steps: number) => {
  // Check 1: Is data loaded?
  if (!isLoaded) {
    console.log(`[TUTORIAL] Tutorial data not loaded yet, skipping`);
    return;
  }
  
  // Check 2: Already completed this specific screen?
  if (completedTutorials[screen]) {
    console.log(`[TUTORIAL] "${screen}" tutorial already completed, skipping`);
    return;
  }
  
  // Check 3: Already shown this screen this session?
  if (shownScreens.current.has(screen)) {
    console.log(`[TUTORIAL] Already shown "${screen}" this session, skipping`);
    return;
  }
  
  // Show tutorial
  console.log(`[TUTORIAL] Showing tutorial for "${screen}"`);
  shownScreens.current.add(screen);
  setCurrentScreen(screen);
  setTotalSteps(steps);
  setCurrentStep(1);
  setIsActive(true);
};
```

4. **Completion Logic:**
```typescript
const completeTutorial = async () => {
  if (!currentScreen) return;
  
  // Close tutorial immediately (optimistic UI)
  setIsActive(false);
  setCurrentStep(0);
  const screenToComplete = currentScreen;
  setCurrentScreen(null);
  
  // Update local state
  setCompletedTutorials(prev => ({
    ...prev,
    [screenToComplete]: true,
  }));
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      console.error('[TUTORIAL] No session, cannot mark complete');
      return;
    }
    
    // Map screen name to database column
    const columnMap: Record<ScreenName, string> = {
      Home: 'tutorial_home_completed',
      Drop: 'tutorial_drop_completed',
      History: 'tutorial_history_completed',
      Account: 'tutorial_account_completed',
    };
    
    const columnName = columnMap[screenToComplete];
    
    // Update specific column in Supabase
    const { error } = await supabase
      .from('user_profiles')
      .update({ [columnName]: true })
      .eq('user_id', session.user.id);
    
    if (error) {
      console.error(`[TUTORIAL] Error marking "${screenToComplete}" complete:`, error);
      // Don't revert UI state - fail gracefully
    } else {
      console.log(`[TUTORIAL] Successfully marked "${screenToComplete}" tutorial complete in Supabase`);
    }
  } catch (error) {
    console.error('[TUTORIAL] completeTutorial error:', error);
  }
};
```

#### Screen Integration

**HomeScreen.tsx:**
```typescript
const { isActive, currentStep, totalSteps, currentScreen, startScreenTutorial, nextStep, prevStep, skipTutorial } = useTutorial();

// Start Home screen tutorial when component mounts
useEffect(() => {
  startScreenTutorial('Home', 1);
}, []);

// Tutorial steps definition
const tutorialSteps = [
  {
    message: 'Welcome to DropLink! Tap and hold to zoom, drag to rotate the radar. Tap a blip to send a drop!',
    position: { 
      top: screenHeight * 0.35, 
      left: 30, 
      right: 30 
    },
  },
];

// Render tutorial overlay
{isActive && currentScreen === 'Home' && currentStep > 0 && (
  <TutorialOverlay
    step={tutorialSteps[currentStep - 1]}
    currentStepNumber={currentStep}
    totalSteps={totalSteps}
    onNext={nextStep}
    onBack={prevStep}
    onSkip={skipTutorial}
  />
)}
```

**DropScreen.tsx:**
```typescript
const { isActive, currentStep, totalSteps, currentScreen, startScreenTutorial, nextStep, prevStep, skipTutorial } = useTutorial();

useEffect(() => {
  startScreenTutorial('Drop', 1);
}, []);

const tutorialSteps = [
  {
    message: 'This page shows all nearby users within your 33 ft radius—tap their card to send a drop!',
    position: { 
      top: screenHeight * 0.35, 
      left: 30, 
      right: 30 
    },
  },
];
```

**HistoryScreen.tsx:**
```typescript
const { isActive, currentStep, totalSteps, currentScreen, startScreenTutorial, nextStep, prevStep, skipTutorial } = useTutorial();

useEffect(() => {
  startScreenTutorial('History', 1);
}, []);

const tutorialSteps = [
  {
    message: 'When you link with someone (have a mutual drop), you can view their contact here!',
    position: { 
      top: screenHeight * 0.35, 
      left: 30, 
      right: 30 
    },
  },
];
```

**AccountScreen.tsx:**
```typescript
const { isActive, currentStep, totalSteps, currentScreen, startScreenTutorial, nextStep, prevStep, skipTutorial } = useTutorial();

useEffect(() => {
  startScreenTutorial('Account', 1);
}, []);

const tutorialSteps = [
  {
    message: 'Update your profile information any time and view your contact card here! Note: You must confirm your phone number before sending drops.',
    position: { 
      top: screenHeight * 0.32, 
      left: 30, 
      right: 30 
    },
  },
];
```

#### Signup Flow Update

**SignupScreen.tsx:**
```typescript
// Create user_profiles record with per-screen tutorial flags
const { error: profileError } = await supabase.from('user_profiles').insert({
  user_id: userId,
  email: email,
  name: null,
  phone: null,
  bio: null,
  profile_photo: null,
  social_media: [],
  tutorial_home_completed: false,      // ← New
  tutorial_drop_completed: false,      // ← New
  tutorial_history_completed: false,   // ← New
  tutorial_account_completed: false     // ← New
});
```

#### Tutorial Initializer Component

**App.tsx:**
```typescript
// Tutorial initializer component (must be inside TutorialProvider)
const TutorialInitializer = () => {
  const { initializeTutorials } = useTutorial();
  
  useEffect(() => {
    if (isAuthenticated && userId) {
      console.log('[TUTORIAL] Auth state changed - initializing tutorials');
      initializeTutorials();
    }
  }, [isAuthenticated, userId, initializeTutorials]);
  
  return null; // This component doesn't render anything
};

// In render:
return (
  <TutorialProvider>
    <TutorialInitializer />  {/* ← Must be inside provider */}
    {/* ... rest of app ... */}
  </TutorialProvider>
);
```

**Why TutorialInitializer is needed:**
- `useTutorial()` hook can only be called inside `TutorialProvider`
- `initializeTutorials()` must be called after authentication
- This component ensures the hook is called in the correct context

---

## 2. Phone Verification Feature (Partial Implementation)

### Problem Statement
Users need to verify their phone number before sending or receiving drops. This ensures contact information is valid and reduces spam/fake accounts.

### Design Requirements
1. **UI Indicator:** "Verify" button in phone number input row (same design as "Reset" button on HomeScreen)
2. **Verification Flow:** Modal matching email verification modal design
3. **Re-verification:** If user changes phone number, verification resets
4. **Blocking Logic:** 
   - Users can view blips and modals
   - Cannot send drops without verification
   - Toast message: "Please verify your phone number to drop"
5. **HomeScreen Banner:** Persistent blue text at bottom: "Verify your phone number to send and receive drops"

### Database Schema

**Migration SQL (`PHONE_VERIFICATION_MIGRATION.sql`):**
```sql
-- Add phone verification columns to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS phone_verification_code TEXT,
ADD COLUMN IF NOT EXISTS verification_code_expires TIMESTAMPTZ;

-- Create index for faster verification lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_phone_verified 
ON user_profiles(phone_verified);
```

### API Implementation: `api.ts`

**Send Phone Verification Code:**
```typescript
export async function sendPhoneVerificationCode(phoneNumber: string, userId: string): Promise<void> {
  try {
    // Supabase phone OTP requires phone in E.164 format (+1234567890)
    // Format phone number to E.164 if not already
    let formattedPhone = phoneNumber.replace(/\D/g, ''); // Remove non-digits
    if (!formattedPhone.startsWith('1')) {
      formattedPhone = '1' + formattedPhone; // Add US country code
    }
    formattedPhone = '+' + formattedPhone;

    const { error } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
      options: {
        shouldCreateUser: false, // Don't create new auth user, just send verification
      },
    });

    if (error) {
      console.error('Failed to send phone OTP:', error);
      throw new Error('Failed to send verification code. Please check your phone number.');
    }

    console.log(`SUCCESS: Phone OTP sent to ${formattedPhone}`);
  } catch (error: any) {
    console.error('ERROR: Send phone OTP error:', error);
    throw new Error(error.message || 'Failed to send verification code. Please try again.');
  }
}
```

**Verify Phone Code:**
```typescript
export async function verifyPhoneCode(phoneNumber: string, code: string, userId: string): Promise<void> {
  try {
    // Format phone number to E.164
    let formattedPhone = phoneNumber.replace(/\D/g, '');
    if (!formattedPhone.startsWith('1')) {
      formattedPhone = '1' + formattedPhone;
    }
    formattedPhone = '+' + formattedPhone;

    const { data, error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token: code,
      type: 'sms'
    });

    if (error) {
      console.error('Failed to verify phone OTP:', error);
      throw new Error('Invalid or expired code. Please try again.');
    }

    if (!data.user) {
      throw new Error('Verification failed. Please try again.');
    }

    // Update user_profiles to mark phone as verified
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ 
        phone_verified: true,
        phone_verification_code: null, // Clear verification code
        verification_code_expires: null
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Failed to update phone verification status:', updateError);
      throw new Error('Verification succeeded but failed to save status. Please contact support.');
    }

    console.log('SUCCESS: Phone verified and status updated');
  } catch (error: any) {
    console.error('ERROR: Verify phone code error:', error);
    throw new Error(error.message || 'Invalid or expired code. Please try again.');
  }
}
```

### UI Implementation: `AccountScreen.tsx`

**State Variables:**
```typescript
// Phone verification modal state
const [showPhoneVerificationModal, setShowPhoneVerificationModal] = useState(false);
const [phoneVerificationStep, setPhoneVerificationStep] = useState<'confirm' | 'enter-code'>('confirm');
const [phoneVerificationCode, setPhoneVerificationCode] = useState('');
const [sendingPhoneCode, setSendingPhoneCode] = useState(false);
const [phoneVerificationError, setPhoneVerificationError] = useState('');
```

**Phone Number Row with Verify Button:**
```typescript
{/* Phone Number Row */}
<View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
  <Text style={[theme.type.muted, { flex: 1 }]}>Phone number</Text>
  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
    <Text style={[theme.type.body, { color: theme.colors.blue, marginRight: 8 }]}>{phone || '(555) 123-4567'}</Text>
    {!phoneVerified && (
      <Pressable
        onPress={() => setShowPhoneVerificationModal(true)}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.blue,
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 4,
          marginRight: 8,
        }}
      >
        <Text style={{ color: theme.colors.blue, fontSize: 11, fontWeight: '600' }}>
          Verify
        </Text>
      </Pressable>
    )}
    <Pressable style={{ padding: 4 }} onPress={() => handleEdit('phone')}>
      <MaterialCommunityIcons name="pencil" size={16} color={theme.colors.muted} />
    </Pressable>
  </View>
</View>
```

**Phone Verification Modal:**
```typescript
{/* Phone Verification Modal */}
<Modal
  visible={showPhoneVerificationModal}
  transparent={true}
  animationType="fade"
  onRequestClose={() => {
    if (!sendingPhoneCode) {
      setShowPhoneVerificationModal(false);
      setPhoneVerificationStep('confirm');
      setPhoneVerificationCode('');
      setPhoneVerificationError('');
    }
  }}
>
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={{ flex: 1 }}
  >
    <View style={{
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    }}>
      <View style={{
        width: '100%',
        maxWidth: 400,
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        backgroundColor: theme.colors.white,
      }}>
        {/* Close Button */}
        <Pressable
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            padding: 4,
            zIndex: 1,
          }}
          onPress={() => {
            if (!sendingPhoneCode) {
              setShowPhoneVerificationModal(false);
              setPhoneVerificationStep('confirm');
              setPhoneVerificationCode('');
              setPhoneVerificationError('');
            }
          }}
          disabled={sendingPhoneCode}
        >
          {({ pressed }) => (
            <MaterialCommunityIcons
              name="close"
              size={24}
              color={theme.colors.muted}
              style={{ opacity: pressed ? 0.6 : 1 }}
            />
          )}
        </Pressable>

        {phoneVerificationStep === 'confirm' ? (
          <>
            <MaterialCommunityIcons name="phone-outline" size={48} color={theme.colors.blue} style={{ marginBottom: 16 }} />
            <Text style={{
              fontSize: 20,
              fontWeight: '600',
              fontFamily: 'Inter_500Medium',
              marginBottom: 8,
              textAlign: 'center',
              color: theme.colors.text,
            }}>
              Phone verification needed
            </Text>
            <Text style={{
              fontSize: 15,
              fontFamily: 'Inter_400Regular',
              textAlign: 'center',
              marginBottom: 24,
              lineHeight: 22,
              color: theme.colors.muted,
            }}>
              We'll send a confirmation code to {phone}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <Pressable
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderColor: theme.colors.blue,
                  opacity: pressed ? 0.6 : 1,
                })}
                onPress={() => {
                  setShowPhoneVerificationModal(false);
                  setPhoneVerificationStep('confirm');
                  setPhoneVerificationCode('');
                  setPhoneVerificationError('');
                }}
                disabled={sendingPhoneCode}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  fontFamily: 'Inter_500Medium',
                  color: theme.colors.blue,
                }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.blue,
                  opacity: pressed || sendingPhoneCode ? 0.6 : 1,
                  minHeight: 48,
                })}
                onPress={handleSendPhoneCode}
                disabled={sendingPhoneCode}
              >
                {sendingPhoneCode ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={{
                    color: '#FFFFFF',
                    fontSize: 16,
                    fontWeight: '600',
                    fontFamily: 'Inter_500Medium',
                  }}>
                    Send Code
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <MaterialCommunityIcons name="phone-check-outline" size={48} color={theme.colors.blue} style={{ marginBottom: 16 }} />
            <Text style={{
              fontSize: 20,
              fontWeight: '600',
              fontFamily: 'Inter_500Medium',
              marginBottom: 8,
              textAlign: 'center',
              color: theme.colors.text,
            }}>
              Enter Verification Code
            </Text>
            <Text style={{
              fontSize: 15,
              fontFamily: 'Inter_400Regular',
              textAlign: 'center',
              marginBottom: 24,
              lineHeight: 22,
              color: theme.colors.muted,
            }}>
              We sent a 6-digit code to {phone}
            </Text>
            <TextInput
              style={{
                width: '100%',
                fontSize: 24,
                fontWeight: '600',
                fontFamily: 'Inter_500Medium',
                textAlign: 'center',
                paddingVertical: 16,
                paddingHorizontal: 24,
                borderWidth: 2,
                borderRadius: 12,
                marginBottom: 8,
                letterSpacing: 8,
                color: theme.colors.text,
                borderColor: theme.colors.border,
              }}
              value={phoneVerificationCode}
              onChangeText={(text) => setPhoneVerificationCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={theme.colors.muted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              editable={!sendingPhoneCode}
            />
            {phoneVerificationError && (
              <Text style={{
                fontSize: 13,
                color: '#FF3B30',
                fontFamily: 'Inter_400Regular',
                marginBottom: 8,
                textAlign: 'center',
              }}>
                {phoneVerificationError}
              </Text>
            )}
            <Pressable
              style={({ pressed }) => ({
                paddingVertical: 8,
                paddingHorizontal: 16,
                marginBottom: 8,
                opacity: pressed || sendingPhoneCode ? 0.6 : 1,
              })}
              onPress={handleSendPhoneCode}
              disabled={sendingPhoneCode}
            >
              <Text style={{
                fontSize: 15,
                fontFamily: 'Inter_400Regular',
                textAlign: 'center',
                color: theme.colors.blue,
              }}>
                {sendingPhoneCode ? 'Sending...' : 'Resend code'}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => ({
                width: '100%',
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: phoneVerificationCode.length === 6 && !sendingPhoneCode ? theme.colors.blue : theme.colors.muted,
                opacity: pressed && phoneVerificationCode.length === 6 ? 0.6 : 1,
                marginTop: 16,
              })}
              onPress={handleVerifyPhoneCode}
              disabled={phoneVerificationCode.length !== 6 || sendingPhoneCode}
            >
              {sendingPhoneCode ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={{
                  color: '#FFFFFF',
                  fontSize: 16,
                  fontWeight: '600',
                  fontFamily: 'Inter_500Medium',
                }}>
                  Verify
                </Text>
              )}
            </Pressable>
          </>
        )}
      </View>
    </View>
  </KeyboardAvoidingView>
</Modal>
```

**Handler Functions:**
```typescript
const handleSendPhoneCode = async () => {
  if (!phone || !userId) {
    setPhoneVerificationError('Phone number is required');
    return;
  }

  setSendingPhoneCode(true);
  setPhoneVerificationError('');

  try {
    await sendPhoneVerificationCode(phone, userId);
    setPhoneVerificationStep('enter-code');
  } catch (err: any) {
    setPhoneVerificationError(err.message || 'Failed to send verification code. Please try again.');
  } finally {
    setSendingPhoneCode(false);
  }
};

const handleVerifyPhoneCode = async () => {
  if (!phone || !userId) {
    setPhoneVerificationError('Phone number is required');
    return;
  }

  if (phoneVerificationCode.length !== 6) {
    setPhoneVerificationError('Please enter a 6-digit code');
    return;
  }

  setSendingPhoneCode(true);
  setPhoneVerificationError('');

  try {
    await verifyPhoneCode(phone, phoneVerificationCode, userId);
    
    // Update local profile state
    updateProfile({ phoneVerified: true });
    
    // Close modal and reset state
    setShowPhoneVerificationModal(false);
    setPhoneVerificationStep('confirm');
    setPhoneVerificationCode('');
    
    showToast({
      message: 'Phone number verified successfully!',
      type: 'success',
      duration: 3000,
    });
  } catch (err: any) {
    setPhoneVerificationError(err.message || 'Invalid or expired code. Please try again.');
  } finally {
    setSendingPhoneCode(false);
  }
};
```

**Phone Number Change Handler:**
```typescript
const handleSave = async () => {
  // ... validation ...
  
  if (editingField === 'phone') {
    error = validatePhone(tempValue);
    if (error) {
      setValidationError(error);
      return;
    }
    
    // Reset verification when phone changes
    await updateProfile({ phone: tempValue, phoneVerified: false });
    // ...
  }
  // ...
};
```

### App.tsx Integration

**UserProfile Interface:**
```typescript
interface UserProfile {
  name: string;
  phone: string;
  email: string;
  bio: string;
  socialMedia: SocialMediaAccount[];
  profilePhoto?: string;
  phoneVerified?: boolean;  // ← New field
}
```

**Default Profile State:**
```typescript
const [userProfile, setUserProfile] = useState<UserProfile>({
  name: 'Your Name',
  phone: '(555) 123-4567',
  email: 'user@example.com',
  bio: 'Add bio',
  socialMedia: [],
  phoneVerified: false,  // ← Added to default state
});
```

**Load User Data:**
```typescript
const loadUserData = useCallback(async (auth: boolean, uid: string | null, options?: { onlyPhoto?: boolean }) => {
  if (!auth || !uid) return;
  
  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', uid)
      .single();
    
    if (profile) {
      setUserProfile({
        name: profile.name || 'Your Name',
        phone: profile.phone || '(555) 123-4567',
        email: profile.email || 'user@example.com',
        bio: profile.bio || 'Add bio',
        profilePhoto: profile.profile_photo,
        socialMedia: profile.social_media || [],
        phoneVerified: profile.phone_verified || false,  // ← Load from database
      });
      setProfilePhotoUri(profile.profile_photo);
    }
    // ...
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}, []);
```

**Update Profile:**
```typescript
const updateProfile = async (updates: Partial<UserProfile>) => {
  const newProfile = { ...userProfile, ...updates };
  
  try {
    if (!userId) return;
    
    // Update user_profiles in Supabase
    await supabase
      .from('user_profiles')
      .update({
        name: newProfile.name,
        email: newProfile.email,
        phone: newProfile.phone,
        bio: newProfile.bio,
        social_media: newProfile.socialMedia,
        phone_verified: newProfile.phoneVerified || false,  // ← Include in update
      })
      .eq('user_id', userId);
    
    // Update local state
    setUserProfile(newProfile);
    
    console.log('✅ Profile updated successfully');
    showToast({ message: 'Profile updated', type: 'success', duration: 2000 });
  } catch (error: any) {
    console.error('Error updating profile:', error);
    showToast({
      message: error.message || 'Failed to update profile',
      type: 'error',
      duration: 3000
    });
    throw error;
  }
};
```

### Pending Implementation (Not Yet Complete)

**Phase 5: HomeScreen UI**
- [ ] Add persistent "Verify your phone number" banner at the bottom of HomeScreen
- [ ] Make banner tappable to navigate to AccountScreen

**Phase 6: Drop Blocking Logic**
- [ ] Modify "Send Drop" button in HomeScreen blip modal to check `phoneVerified`
- [ ] Show toast message "Please verify your phone number to drop" if not verified

**Phase 7: Testing**
- [ ] Run database migration SQL
- [ ] Test phone verification flow (send code, enter code, verify)
- [ ] Test phone number change re-verification
- [ ] Test drop blocking on HomeScreen
- [ ] Test HomeScreen banner visibility

---

## 3. Key Design Patterns and Concepts

### Context API Pattern
All global state is managed through React Context:
- `TutorialContext`: Per-screen tutorial completion tracking
- `AuthContext`: Authentication state
- `UserProfileContext`: User profile data
- `DarkModeContext`: Theme preferences
- `PinnedProfilesContext`: Pinned contacts
- `ToastContext`: Toast notifications
- `LinkNotificationsContext`: Link notifications
- `SettingsContext`: App settings (max distance, etc.)

### Supabase Integration Pattern
All database operations use Supabase client:
```typescript
import { supabase } from '../services/supabase';

// Query pattern
const { data, error } = await supabase
  .from('table_name')
  .select('columns')
  .eq('user_id', userId)
  .single();

// Update pattern
const { error } = await supabase
  .from('table_name')
  .update({ column: value })
  .eq('user_id', userId);
```

### Phone Number Formatting
Phone numbers are stored in database as raw digits, but displayed/formatted in UI:
```typescript
const formatPhoneNumber = (text: string) => {
  const cleaned = text.replace(/\D/g, '');
  const limited = cleaned.slice(0, 10);
  
  if (limited.length <= 3) {
    return limited ? `(${limited}` : '';
  } else if (limited.length <= 6) {
    return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
  } else {
    return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
  }
};
```

### E.164 Phone Format for Supabase
Supabase phone OTP requires E.164 format (+1234567890):
```typescript
let formattedPhone = phoneNumber.replace(/\D/g, '');
if (!formattedPhone.startsWith('1')) {
  formattedPhone = '1' + formattedPhone; // Add US country code
}
formattedPhone = '+' + formattedPhone;
```

### Optimistic UI Updates
Tutorial completion uses optimistic updates:
1. Update local state immediately
2. Show UI change right away
3. Update database in background
4. Fail gracefully if database update fails (don't revert UI)

### Session-Based Security
All database operations filter by `user_id` from session:
```typescript
const { data: { session } } = await supabase.auth.getSession();
if (!session?.user) {
  throw new Error('User not authenticated');
}

// Always filter by user_id for security
.eq('user_id', session.user.id)
```

---

## 4. File Structure

### Modified Files
- `mobile/src/contexts/TutorialContext.tsx` - Complete rewrite for per-screen tracking
- `mobile/src/screens/HomeScreen.tsx` - Tutorial integration
- `mobile/src/screens/DropScreen.tsx` - Tutorial integration
- `mobile/src/screens/HistoryScreen.tsx` - Tutorial integration
- `mobile/src/screens/AccountScreen.tsx` - Tutorial integration + phone verification UI
- `mobile/src/screens/SignupScreen.tsx` - Updated to create per-screen tutorial flags
- `mobile/App.tsx` - Tutorial initializer, phoneVerified state management
- `mobile/src/services/api.ts` - Phone verification API functions
- `PHONE_VERIFICATION_MIGRATION.sql` - Database migration script

### New Concepts
- Per-screen tutorial completion tracking
- Phone verification flow with Supabase OTP
- E.164 phone number formatting
- Session-based database security

---

## 5. Known Issues and Next Steps

### Known Issues
1. **Phone Verification UI Not Showing:**
   - `phoneVerified` was missing from default `userProfile` state in `App.tsx`
   - **Status:** Fixed (added `phoneVerified: false` to default state)
   - **Note:** Database migration may not have been run yet

2. **HomeScreen Banner Not Implemented:**
   - Persistent "Verify your phone number" banner at bottom of HomeScreen
   - **Status:** Pending implementation

3. **Drop Blocking Not Implemented:**
   - "Send Drop" button should check `phoneVerified` before allowing drop
   - **Status:** Pending implementation

### Next Steps
1. Run database migration: `PHONE_VERIFICATION_MIGRATION.sql` in Supabase SQL Editor
2. Implement HomeScreen banner (Phase 5)
3. Implement drop blocking logic (Phase 6)
4. Test complete phone verification flow (Phase 7)
5. Update README with phone verification details (Phase 8)

---

## 6. Testing Checklist

### Tutorial System
- [x] Per-screen tutorial flags load correctly on app startup
- [x] Tutorials show once per screen (not on every mount)
- [x] Completing tutorial updates database
- [x] Skipping tutorial marks as complete
- [x] Tutorials don't show if already completed
- [x] New users see all tutorials
- [x] Tutorial initializer works correctly

### Phone Verification (Partial)
- [ ] "Verify" button appears when `phoneVerified === false`
- [ ] "Verify" button disappears when `phoneVerified === true`
- [ ] Modal opens when "Verify" button is pressed
- [ ] Code sending works (Supabase OTP)
- [ ] Code verification works (Supabase OTP)
- [ ] Phone number change resets verification
- [ ] Database migration runs successfully

### Pending Tests
- [ ] HomeScreen banner shows when not verified
- [ ] HomeScreen banner navigates to AccountScreen
- [ ] Drop button blocks when not verified
- [ ] Toast message shows when trying to drop without verification

---

## 7. Code Quality Notes

### Error Handling
- All async operations wrapped in try/catch
- User-friendly error messages
- Graceful degradation (fail-safe defaults)
- Console logging for debugging

### Type Safety
- TypeScript interfaces for all data structures
- Optional chaining for nullable fields
- Type guards where needed

### Performance
- Memoization of expensive calculations
- Optimistic UI updates
- Lazy loading of tutorial data
- Session-based caching

### Security
- All database queries filter by `user_id`
- Phone numbers validated before sending OTP
- E.164 formatting for Supabase compatibility
- Session validation before sensitive operations

---

## End of Handoff Document

This document covers all implementation work completed after the "clean up the code" prompt. The tutorial system is fully functional, and phone verification is partially implemented with clear next steps outlined.

