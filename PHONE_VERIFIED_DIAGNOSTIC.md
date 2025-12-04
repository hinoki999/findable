# Phone Verification Data Flow Diagnostic

## Objective
Trace the complete `phoneVerified` data flow from database to UI to identify why the "Verify" button may not be appearing.

---

## Step 1: Check Supabase Schema

### Task
Verify the database schema has the `phone_verified` column.

### Commands/Queries
```sql
-- Run in Supabase SQL Editor
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles'
AND column_name = 'phone_verified';
```

### Expected Output
```
column_name      | data_type | column_default | is_nullable
phone_verified   | boolean   | false          | true
```

### If Column Doesn't Exist
Run the migration:
```sql
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;
```

### Check Current User's Data
```sql
-- Replace 'USER_ID_HERE' with actual user_id from auth.users
SELECT user_id, phone, phone_verified
FROM user_profiles
WHERE user_id = 'USER_ID_HERE';
```

---

## Step 2: Check App.tsx loadUserData()

### File Location
`mobile/App.tsx`

### Task 1: Find the Query
**Search for:** `supabase.from('user_profiles').select`

**Expected location:** Inside `loadUserData` function (around line 283-349)

**Check:**
1. Does the `.select()` include `'phone_verified'` or `'*'`?
2. If it's `'*'`, it should include all columns including `phone_verified`
3. If it's a specific list, verify `'phone_verified'` is in the list

**Expected Code:**
```typescript
const { data: profile } = await supabase
  .from('user_profiles')
  .select('*')  // ← Should be '*' or include 'phone_verified'
  .eq('user_id', uid)
  .single();
```

**If Missing:**
Change `.select('*')` to `.select('*, phone_verified')` or ensure `'*'` is used.

### Task 2: Find the State Setter
**Search for:** `setUserProfile({`

**Expected location:** Inside `loadUserData` function, after the profile query

**Check:**
1. Does the object include `phoneVerified: profile.phone_verified || false`?
2. Is it using snake_case (`phone_verified`) from database and converting to camelCase (`phoneVerified`) for state?

**Expected Code:**
```typescript
if (profile) {
  setUserProfile({
    name: profile.name || 'Your Name',
    phone: profile.phone || '(555) 123-4567',
    email: profile.email || 'user@example.com',
    bio: profile.bio || 'Add bio',
    profilePhoto: profile.profile_photo,
    socialMedia: profile.social_media || [],
    phoneVerified: profile.phone_verified || false,  // ← MUST BE HERE
  });
  setProfilePhotoUri(profile.profile_photo);
}
```

**If Missing:**
Add `phoneVerified: profile.phone_verified || false,` to the `setUserProfile` call.

---

## Step 3: Check UserProfile Interface in App.tsx

### File Location
`mobile/App.tsx`

### Task
**Search for:** `interface UserProfile`

**Expected location:** Around line 53-61

**Check:**
1. Does the interface include `phoneVerified?: boolean;`?

**Expected Code:**
```typescript
interface UserProfile {
  name: string;
  phone: string;
  email: string;
  bio: string;
  socialMedia: SocialMediaAccount[];
  profilePhoto?: string;
  phoneVerified?: boolean;  // ← MUST BE HERE
}
```

**If Missing:**
Add `phoneVerified?: boolean;` to the interface.

### Also Check Default State
**Search for:** `useState<UserProfile>({`

**Expected location:** Around line 179-186

**Check:**
1. Does the default state include `phoneVerified: false`?

**Expected Code:**
```typescript
const [userProfile, setUserProfile] = useState<UserProfile>({
  name: 'Your Name',
  phone: '(555) 123-4567',
  email: 'user@example.com',
  bio: 'Add bio',
  socialMedia: [],
  phoneVerified: false,  // ← MUST BE HERE
});
```

**If Missing:**
Add `phoneVerified: false,` to the default state.

---

## Step 4: Check AccountScreen.tsx

### File Location
`mobile/src/screens/AccountScreen.tsx`

### Task 1: How phoneVerified is Received

**Search for:** `useUserProfile` or `const { profile }`

**Expected location:** Around line 49-54

**Check:**
1. Is it using `const { profile } = useUserProfile();`?
2. Is it destructuring `phoneVerified` from profile?
3. Is there a fallback value?

**Expected Code:**
```typescript
const { profile, updateProfile } = useUserProfile();
const { name, phone, email, bio, socialMedia, phoneVerified } = profile || {};
```

**Alternative (if not destructured):**
```typescript
const { profile } = useUserProfile();
const phoneVerified = profile?.phoneVerified ?? false;
```

### Task 2: Verify Button Conditional

**Search for:** `{!phoneVerified &&`

**Expected location:** Around line 517-533 (in the phone number row)

**Check:**
1. What is the exact conditional?
2. Is it checking `!phoneVerified` or `phoneVerified === false`?
3. Are there any other conditions (e.g., `phone && !phoneVerified`)?

**Expected Code:**
```typescript
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
```

**Common Issues:**
- Conditional might be `phoneVerified === undefined` (should be `!phoneVerified`)
- Conditional might be checking `profile.phoneVerified` instead of destructured `phoneVerified`
- Conditional might have extra checks like `phone && !phoneVerified`

### Task 3: Add Console Logging

**Add this console.log at the top of AccountScreen component (after destructuring):**

```typescript
export default function AccountScreen({ navigation, profilePhotoUri }: AccountScreenProps) {
  // ... existing code ...
  const { profile, updateProfile } = useUserProfile();
  const { name, phone, email, bio, socialMedia, phoneVerified } = profile || {};
  
  // ADD THIS DIAGNOSTIC LOG
  console.log('🔍 [DIAGNOSTIC] AccountScreen render:', {
    'profile exists': !!profile,
    'phoneVerified value': phoneVerified,
    'phoneVerified type': typeof phoneVerified,
    'phoneVerified === false': phoneVerified === false,
    'phoneVerified === undefined': phoneVerified === undefined,
    '!phoneVerified': !phoneVerified,
    'full profile': profile,
  });
  
  // ... rest of component ...
}
```

**Also add logging in the render where the button should appear:**
```typescript
{/* Phone Number Row */}
<View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
  <Text style={[theme.type.muted, { flex: 1 }]}>Phone number</Text>
  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
    <Text style={[theme.type.body, { color: theme.colors.blue, marginRight: 8 }]}>{phone || '(555) 123-4567'}</Text>
    
    {/* ADD THIS DIAGNOSTIC LOG */}
    {console.log('🔍 [DIAGNOSTIC] Verify button conditional check:', {
      'phoneVerified': phoneVerified,
      '!phoneVerified': !phoneVerified,
      'should show button': !phoneVerified,
    })}
    
    {!phoneVerified && (
      <Pressable
        // ... button code ...
      >
        <Text style={{ color: theme.colors.blue, fontSize: 11, fontWeight: '600' }}>
          Verify
        </Text>
      </Pressable>
    )}
    {/* ... rest of row ... */}
  </View>
</View>
```

---

## Step 5: Check UserProfileContext Provider

### File Location
`mobile/App.tsx`

### Task
**Search for:** `UserProfileContext.Provider`

**Expected location:** Around line 764

**Check:**
1. Is `userProfile` state being passed as `profile` prop?
2. Does the `userProfile` state include `phoneVerified`?

**Expected Code:**
```typescript
<UserProfileContext.Provider value={{ profile: userProfile, updateProfile }}>
  {/* ... children ... */}
</UserProfileContext.Provider>
```

**Verify:**
The `userProfile` state object should have `phoneVerified` property (from Step 3).

---

## Step 6: Check updateProfile Function

### File Location
`mobile/App.tsx`

### Task
**Search for:** `const updateProfile = async`

**Expected location:** Around line 513-546

**Check:**
1. Does the Supabase update include `phone_verified`?
2. Is it mapping camelCase to snake_case correctly?

**Expected Code:**
```typescript
const updateProfile = async (updates: Partial<UserProfile>) => {
  const newProfile = { ...userProfile, ...updates };
  
  try {
    if (!userId) return;
    
    await supabase
      .from('user_profiles')
      .update({
        name: newProfile.name,
        email: newProfile.email,
        phone: newProfile.phone,
        bio: newProfile.bio,
        social_media: newProfile.socialMedia,
        phone_verified: newProfile.phoneVerified || false,  // ← MUST BE HERE
      })
      .eq('user_id', userId);
    
    setUserProfile(newProfile);
    // ...
  } catch (error) {
    // ...
  }
};
```

---

## Expected Output Summary

After completing all steps, provide:

1. **Database Query:**
   ```typescript
   // Exact line from App.tsx loadUserData()
   const { data: profile } = await supabase
     .from('user_profiles')
     .select('???')  // ← What is here?
     .eq('user_id', uid)
     .single();
   ```

2. **State Object:**
   ```typescript
   // Exact object from setUserProfile() in loadUserData()
   setUserProfile({
     // ... list all properties including phoneVerified ...
   });
   ```

3. **Verify Button Conditional:**
   ```typescript
   // Exact conditional from AccountScreen.tsx
   {??? && (  // ← What is the condition?
     <Pressable>Verify</Pressable>
   )}
   ```

4. **Console Log Output:**
   ```
   🔍 [DIAGNOSTIC] AccountScreen render: {
     profile exists: true/false,
     phoneVerified value: ???,
     phoneVerified type: 'boolean' | 'undefined' | 'null',
     !phoneVerified: true/false,
     full profile: { ... }
   }
   ```

---

## Common Issues and Fixes

### Issue 1: phoneVerified is undefined
**Symptom:** Console log shows `phoneVerified: undefined`
**Fix:** 
- Check `loadUserData()` includes `phoneVerified: profile.phone_verified || false`
- Check database column exists and has data

### Issue 2: phoneVerified is null
**Symptom:** Console log shows `phoneVerified: null`
**Fix:**
- Use `profile.phone_verified ?? false` instead of `|| false`
- Or use `profile.phone_verified !== null ? profile.phone_verified : false`

### Issue 3: Button shows when it shouldn't
**Symptom:** Button appears even when `phoneVerified === true`
**Fix:**
- Check conditional is `!phoneVerified` not `phoneVerified`
- Check for type coercion issues (string "true" vs boolean true)

### Issue 4: Button doesn't show when it should
**Symptom:** Button doesn't appear when `phoneVerified === false`
**Fix:**
- Check conditional logic
- Check if `phoneVerified` is actually `false` (not `undefined` or `null`)
- Check if there are other conditions blocking it (e.g., `phone && !phoneVerified`)

---

## Quick Fix Checklist

If you find issues, apply these fixes in order:

- [ ] Run database migration: `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;`
- [ ] Update `loadUserData()` to include `phoneVerified: profile.phone_verified || false`
- [ ] Update `UserProfile` interface to include `phoneVerified?: boolean;`
- [ ] Update default state to include `phoneVerified: false`
- [ ] Update `updateProfile()` to include `phone_verified: newProfile.phoneVerified || false`
- [ ] Add console logging to AccountScreen
- [ ] Verify conditional is `!phoneVerified` (not `phoneVerified === undefined`)

---

## Next Steps After Diagnosis

1. **If database column missing:** Run migration SQL
2. **If query missing field:** Add `'phone_verified'` to `.select()` or use `'*'`
3. **If state missing field:** Add `phoneVerified` to `setUserProfile()` call
4. **If interface missing:** Add `phoneVerified?: boolean;` to interface
5. **If conditional wrong:** Fix the conditional logic
6. **If value is wrong type:** Add type coercion or null checks

---

## Testing After Fix

1. **Clear app data** (or log out and log back in)
2. **Check console logs** for diagnostic output
3. **Verify button appears** when `phoneVerified === false`
4. **Verify button disappears** after successful verification
5. **Test phone number change** resets verification

---

End of Diagnostic Document

