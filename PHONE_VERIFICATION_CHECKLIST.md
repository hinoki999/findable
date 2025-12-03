# Phone Verification Implementation Checklist

**Status:** In Progress  
**Started:** December 2, 2024

---

## PHASE 1: Database Setup (Supabase)

- [x] Create SQL migration file (`PHONE_VERIFICATION_MIGRATION.sql`)
- [ ] Run migration in Supabase SQL Editor
  - [ ] Add `phone_verified` column (BOOLEAN, default false)
  - [ ] Add `phone_verification_code` column (TEXT, nullable)
  - [ ] Add `verification_code_expires` column (TIMESTAMPTZ, nullable)
  - [ ] Create index on `phone_verified` for performance
  - [ ] Verify columns created successfully

---

## PHASE 2: Backend API Functions

- [x] Add `sendPhoneVerificationCode()` function to `api.ts`
  - [x] Format phone to E.164 format (+1234567890)
  - [x] Use Supabase `signInWithOtp()` with phone
  - [x] Error handling
  - [x] Logging

- [x] Add `verifyPhoneCode()` function to `api.ts`
  - [x] Format phone to E.164 format
  - [x] Use Supabase `verifyOtp()` with type 'sms'
  - [x] Update `user_profiles.phone_verified = true`
  - [x] Clear verification code from database
  - [x] Error handling
  - [x] Logging

---

## PHASE 3: State Management

- [x] Update `UserProfile` interface in `App.tsx`
  - [x] Add `phoneVerified?: boolean` field

- [x] Update default profile in context
  - [x] Set `phoneVerified: false` as default

- [x] Update `loadUserData()` function
  - [x] Query `phone_verified` from `user_profiles` table
  - [x] Set `phoneVerified` in `setUserProfile()`

---

## PHASE 4: AccountScreen UI Components

- [ ] Add "Verify" button next to phone number
  - [ ] Find phone number display section in AccountScreen
  - [ ] Design: Blue text button (match homepage "reset" style)
  - [ ] Show when: `phoneVerified === false`
  - [ ] Hide when: `phoneVerified === true`
  - [ ] Position: Inside phone input/display area

- [ ] Create phone verification modal
  - [ ] Copy email verification modal design from SignupScreen
  - [ ] Two-step flow:
    - [ ] Step 1: Confirm phone number, "Send Code" button
    - [ ] Step 2: Enter 6-digit code input
  - [ ] State management:
    - [ ] `showPhoneVerificationModal` state
    - [ ] `verificationStep` state ('confirm' | 'enter-code')
    - [ ] `verificationCode` state
    - [ ] `sendingCode` state
  - [ ] Styling: Match existing modal (lines 780-879 in SignupScreen)
  - [ ] Error handling and display

- [ ] Wire up verification flow
  - [ ] "Verify" button opens modal
  - [ ] "Send Code" calls `sendPhoneVerificationCode()`
  - [ ] Code input validates 6 digits
  - [ ] "Verify Code" calls `verifyPhoneCode()`
  - [ ] On success: Close modal, refresh profile, show success toast
  - [ ] On error: Show error message

- [ ] Handle phone number changes
  - [ ] When user updates phone in edit modal
  - [ ] Set `phoneVerified = false` in state
  - [ ] Trigger re-verification requirement

---

## PHASE 5: HomeScreen UI Components

- [ ] Add bottom persistent banner
  - [ ] Location: Bottom of screen, always visible
  - [ ] Text: "Verify your phone number to send and receive drops"
  - [ ] Color: Blue (`#007AFF` or `theme.colors.blue`)
  - [ ] Font: Small, minimalistic
  - [ ] Show when: `phoneVerified === false`
  - [ ] Hide when: `phoneVerified === true`
  - [ ] Tappable: Navigate to AccountScreen when clicked
  - [ ] Position: Fixed at bottom, above tab bar

- [ ] Add verification check to "Send Drop" button
  - [ ] Location: Blip modal "Drop" button (line ~2653)
  - [ ] Before saving device, check `phoneVerified`
  - [ ] If false: Show toast "Please verify your phone number to drop"
  - [ ] If true: Proceed with existing drop logic
  - [ ] Keep modal open if verification fails

---

## PHASE 6: Integration & Testing

- [ ] Test complete verification flow
  - [ ] User enters phone number
  - [ ] Clicks "Verify" button
  - [ ] Receives SMS code
  - [ ] Enters code
  - [ ] Phone marked as verified
  - [ ] Verify button disappears
  - [ ] Bottom banner disappears

- [ ] Test drop blocking
  - [ ] Unverified user tries to send drop
  - [ ] Toast appears with message
  - [ ] Drop not sent
  - [ ] Verified user can send drops normally

- [ ] Test phone number change
  - [ ] Verified user changes phone number
  - [ ] Verification status resets to false
  - [ ] Verify button reappears
  - [ ] Bottom banner reappears
  - [ ] User must re-verify

- [ ] Test edge cases
  - [ ] Invalid phone number format
  - [ ] Wrong verification code
  - [ ] Expired verification code
  - [ ] Network errors during verification
  - [ ] User closes modal mid-verification

- [ ] Verify UI consistency
  - [ ] Verify button matches "reset" button style
  - [ ] Modal matches email verification modal
  - [ ] Banner text is minimalistic and blue
  - [ ] Toast messages are clear and concise

---

## PHASE 7: Documentation & Cleanup

- [ ] Update README.md with phone verification feature
- [ ] Document Supabase phone provider setup
- [ ] Remove any debug console.logs
- [ ] Verify no linter errors
- [ ] Test on physical device
- [ ] Commit all changes

---

## Files Modified/Created

### Created:
- [x] `PHONE_VERIFICATION_MIGRATION.sql`
- [ ] `PHONE_VERIFICATION_CHECKLIST.md` (this file)

### Modified:
- [x] `mobile/src/services/api.ts` - Added phone verification functions
- [x] `mobile/App.tsx` - Added phoneVerified to UserProfile, updated loadUserData
- [ ] `mobile/src/screens/AccountScreen.tsx` - Add verify button and modal
- [ ] `mobile/src/screens/HomeScreen.tsx` - Add bottom banner and drop blocking

---

## Current Status

**Completed:** 3/7 phases (43%)
- ✅ Phase 1: Database Setup (migration file created, needs to be run)
- ✅ Phase 2: Backend API Functions
- ✅ Phase 3: State Management
- ⏳ Phase 4: AccountScreen UI (not started)
- ⏳ Phase 5: HomeScreen UI (not started)
- ⏳ Phase 6: Integration & Testing (not started)
- ⏳ Phase 7: Documentation & Cleanup (not started)

---

## Next Steps

1. **Run SQL migration in Supabase** (5 minutes)
2. **Implement AccountScreen verify button and modal** (30-45 minutes)
3. **Implement HomeScreen bottom banner** (15 minutes)
4. **Add drop blocking logic** (10 minutes)
5. **Test complete flow** (20 minutes)

**Estimated remaining time:** ~1.5 hours

