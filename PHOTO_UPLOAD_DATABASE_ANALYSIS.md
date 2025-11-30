# Profile Photo Upload - Database Access Analysis

## Executive Summary

The profile photo upload flow **only directly accesses 2 database objects**:
1. ✅ `storage.objects` (Supabase Storage)
2. ✅ `user_profiles` table

**However**, the post-upload reload in AccountScreen **also queries**:
3. ⚠️ `user_settings` table (loaded but not modified)
4. ⚠️ `devices` table (loaded but not modified)

---

## Direct Upload Operations

### **uploadProfilePhoto() Function**
**File:** `mobile/src/services/api.ts` (lines 794-846)

#### **Database Operations (in order):**

```typescript
// 1. Auth Session Check
const { data: { session }, error: sessionError } = await supabase.auth.getSession();
// Table: auth.users (read-only check)

// 2. Storage Upload
await supabase.storage
  .from('profile_photos')
  .upload(filePath, bytes.buffer, {...});
// Table: storage.objects (INSERT)

// 3. Get Public URL
const { data: { publicUrl } } = supabase.storage
  .from('profile_photos')
  .getPublicUrl(filePath);
// Table: storage.buckets (SELECT)

// 4. Update Profile Photo URL
await supabase
  .from('user_profiles')
  .update({ profile_photo: publicUrl })
  .eq('user_id', userId);
// Table: user_profiles (UPDATE)
```

### **Tables Accessed:**
| Table | Operation | Column Modified | Purpose |
|-------|-----------|----------------|---------|
| `auth.users` | SELECT | - | Session validation |
| `storage.objects` | INSERT | all | Upload file |
| `storage.buckets` | SELECT | - | Get public URL |
| `user_profiles` | UPDATE | `profile_photo` | Save URL |

**❌ Does NOT access:**
- `user_settings`
- `devices`
- `pinned_contacts`
- Any other tables

---

## Post-Upload Operations

### **AccountScreen Photo Upload Flow**
**File:** `mobile/App.tsx` (lines 726-732)

```typescript
onPhotoSaved={async (uri) => {
  // 1. Optimistic UI update
  setProfilePhotoUri(uri);

  // 2. Reload to verify database
  await loadUserData(isAuthenticated, userId, { onlyPhoto: true });
}}
```

### **loadUserData() Function**
**File:** `mobile/App.tsx` (lines 282-346)

#### **When called with `onlyPhoto: true` option:**

```typescript
// Load profile from Supabase
const { data: profile } = await supabase
  .from('user_profiles')
  .select('*')
  .eq('user_id', uid)
  .single();

// Handle onlyPhoto option
if (options?.onlyPhoto && profile) {
  setProfilePhotoUri(profile.profile_photo);
  return;  // ← EXITS HERE for photo-only reload
}
```

**Table Accessed:**
- `user_profiles` (SELECT)

**❌ Does NOT load** `user_settings` or `devices` when `onlyPhoto: true`

---

### **When called WITHOUT `onlyPhoto` option:**

```typescript
// Load profile from Supabase
const { data: profile } = await supabase
  .from('user_profiles')
  .select('*')
  .eq('user_id', uid)
  .single();

// Load settings from Supabase
const { data: settings } = await supabase
  .from('user_settings')
  .select('*')
  .eq('user_id', uid)
  .single();

// Load devices/contacts from Supabase
const { data: devices } = await supabase
  .from('devices')
  .select('*')
  .eq('user_id', uid)
  .order('last_seen', { ascending: false });
```

**Tables Accessed:**
- `user_profiles` (SELECT)
- `user_settings` (SELECT)
- `devices` (SELECT)

**Note:** This full reload happens on app start, NOT during photo upload.

---

## ProfilePhotoPromptScreen (Signup Flow)

### **Post-Upload Operation**
**File:** `mobile/App.tsx` (line 702)

```typescript
<ProfilePhotoScreen
  navigation={promptNavigation}
  onPhotoSaved={(uri) => {
    // Pass URI to handler to avoid race condition
    handleProfilePhotoPromptComplete(uri);
  }}
/>
```

### **handleProfilePhotoPromptComplete()**
**File:** `mobile/App.tsx` (lines 435-449)

```typescript
const handleProfilePhotoPromptComplete = async (uploadedPhotoUri?: string) => {
  setShowProfilePhotoPrompt(false);

  if (uploadedPhotoUri) {
    // Use uploaded URI directly (no database query)
    setProfilePhotoUri(uploadedPhotoUri);
  } else {
    // Only if skipped - loads from database
    await loadUserData(isAuthenticated, userId, { onlyPhoto: true });
  }
};
```

**Database Operations:**
- **If photo uploaded:** None (uses URI directly)
- **If skipped:** SELECT from `user_profiles` only

---

## Database Triggers

### **Checked for:**
- ✅ Triggers on `user_profiles` table
- ✅ Triggers on `storage.objects` table
- ✅ CASCADE operations
- ✅ Auto-update of other tables

### **Finding:**
**❌ NO TRIGGERS FOUND**

No database triggers are configured to automatically:
- Update `user_settings` when `user_profiles` changes
- Update `devices` when `user_profiles` changes
- Perform any cascade operations

---

## RLS Policy Implications

### **Tables Requiring RLS Checks During Upload:**

#### **1. storage.objects (Supabase Storage)**
```sql
-- Policy must allow INSERT for authenticated users
CREATE POLICY "Allow authenticated users to upload profile photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile_photos');
```

#### **2. user_profiles**
```sql
-- Policy must allow UPDATE for user's own profile
CREATE POLICY "Users can update own profile"
ON user_profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

### **Tables NOT involved in upload:**
- ❌ `user_settings` - Not accessed during upload
- ❌ `devices` - Not accessed during upload

---

## Potential RLS Issues

### **If upload fails with RLS error, check:**

1. ✅ **storage.objects policy**
   - Does it allow INSERT for authenticated users?
   - Is `bucket_id = 'profile_photos'` in the policy?

2. ✅ **user_profiles policy**
   - Does it allow UPDATE where `user_id = auth.uid()`?
   - Is the policy enabled?

3. ❌ **NOT user_settings or devices**
   - These are never accessed during upload
   - Their RLS policies are irrelevant to photo upload

---

## Summary Table

| Operation | Tables Accessed | RLS Checks Required |
|-----------|-----------------|---------------------|
| **uploadProfilePhoto()** | `storage.objects`, `user_profiles` | storage INSERT, profiles UPDATE |
| **AccountScreen reload** | `user_profiles` only (onlyPhoto: true) | profiles SELECT |
| **Signup prompt** | None (uses URI directly) | None |
| **Full app reload** | `user_profiles`, `user_settings`, `devices` | All 3 SELECT policies |

---

## Key Findings

1. ✅ **Photo upload is isolated** - Only touches storage and user_profiles
2. ✅ **No triggers exist** - No automatic side effects
3. ✅ **user_settings and devices are NOT involved** - Only loaded on app start
4. ✅ **RLS failures must be in storage.objects or user_profiles** - No other tables matter

---

## Debugging Checklist

If photo upload fails:

- [ ] Check `storage.objects` RLS policy (INSERT)
- [ ] Check `user_profiles` RLS policy (UPDATE)
- [ ] Verify session auth token is valid
- [ ] Confirm userId matches session.user.id
- ❌ ~~Check user_settings RLS~~ (not accessed)
- ❌ ~~Check devices RLS~~ (not accessed)

---

## Code References

**Upload Function:**
- `mobile/src/services/api.ts` lines 794-846

**Post-Upload Reload:**
- `mobile/App.tsx` lines 282-346 (loadUserData)
- `mobile/App.tsx` lines 726-732 (AccountScreen callback)
- `mobile/App.tsx` lines 435-449 (Signup prompt handler)

**Screen Components:**
- `mobile/src/screens/ProfilePhotoScreen.tsx` (no direct DB access)
- `mobile/src/screens/ProfilePhotoPromptScreen.tsx` (no direct DB access)

