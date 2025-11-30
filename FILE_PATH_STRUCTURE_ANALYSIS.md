# Profile Photo File Path Structure Analysis

## Executive Summary

✅ **ONLY ONE LOCATION** in the entire mobile codebase constructs profile photo file paths.

**File:** `mobile/src/services/api.ts`
**Function:** `uploadProfilePhoto()`
**Line:** 809

```typescript
const filePath = `${userId}.${extension}`;
```

---

## Current File Structure

### **Flat Structure (Current Implementation)**
```
profile_photos/
  ├── abc123-def456-ghij789-klmn012.jpg
  ├── xyz789-abc123-def456-ghij789.png
  └── qrs456-tuv789-wxy012-zab345.jpg
```

**File naming pattern:** `{userId}.{extension}`

**Example:** `abc123-def456-ghij789-klmn012.jpg`

---

## Complete Code Reference Search Results

### **1. File Path Construction**

**ONLY LOCATION:** `mobile/src/services/api.ts` line 809

```typescript
export async function uploadProfilePhoto(imageUri: string, userId: string): Promise<string> {
  // ...
  const extension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
  const filePath = `${userId}.${extension}`;  // ← ONLY place filePath is constructed
  // ...
}
```

---

### **2. Storage Upload Operations**

**ONLY LOCATION:** `mobile/src/services/api.ts` line 824

```typescript
await supabase.storage
  .from('profile_photos')
  .upload(filePath, bytes.buffer, {  // ← Uses filePath variable
    contentType: `image/${extension}`,
    upsert: true
  });
```

---

### **3. Storage URL Retrieval**

**ONLY LOCATION:** `mobile/src/services/api.ts` line 834

```typescript
const { data: { publicUrl } } = supabase.storage
  .from('profile_photos')
  .getPublicUrl(filePath);  // ← Uses filePath variable
```

---

### **4. Storage Downloads**

**FOUND:** ❌ **NONE**

No code downloads files from `profile_photos` bucket. All access is via public URLs.

---

### **5. Profile Photo Display**

Profile photos are displayed via **public URLs stored in database**, NOT by constructing file paths:

#### **AccountScreen.tsx** (lines 426-429)
```typescript
{profilePhotoUri ? (
  <Image 
    source={{ uri: profilePhotoUri }}  // ← Uses URL from database
    style={{ width: 50, height: 50 }}
  />
) : (
  <MaterialCommunityIcons name="account" size={24} color={theme.colors.blue} />
)}
```

**Key:** `profilePhotoUri` comes from `user_profiles.profile_photo` column (database), not constructed from `userId`.

#### **HistoryScreen.tsx** (lines 423-428)
```typescript
{item.profilePhoto ? (
  <Image source={{ uri: item.profilePhoto }} />  // ← Uses URL from device data
) : (
  <Text>{getInitials(item.name)}</Text>
)}
```

**Key:** `item.profilePhoto` comes from devices table (or contact data), not constructed.

---

## Data Flow

```
┌─────────────────────────────────────────┐
│ 1. Upload Photo                         │
│    api.ts:809 - Construct filePath      │
│    filePath = `${userId}.${extension}`  │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 2. Upload to Storage                    │
│    api.ts:824 - Upload file             │
│    supabase.storage.upload(filePath)    │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 3. Get Public URL                       │
│    api.ts:834 - Get URL from Storage    │
│    supabase.storage.getPublicUrl()      │
│    Returns: https://...supabase.co/...  │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 4. Save URL to Database                 │
│    api.ts:839 - UPDATE user_profiles    │
│    profile_photo = publicUrl            │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 5. Display Image                        │
│    <Image source={{ uri: photoUrl }} /> │
│    Uses URL from database ← NO PATH     │
└─────────────────────────────────────────┘
```

**Critical:** After upload, the **public URL** is stored in the database. All display code uses the **URL**, not the file path.

---

## File Structure Change Impact

### **If changing to folder structure:**

```
profile_photos/
  ├── abc123-def456/
  │   └── profile.jpg
  ├── xyz789-abc123/
  │   └── profile.jpg
  └── qrs456-tuv789/
      └── profile.jpg
```

**File naming pattern:** `{userId}/profile.{extension}`

---

### **Required Changes:**

#### **ONLY ONE LINE NEEDS TO CHANGE:**

**File:** `mobile/src/services/api.ts` line 809

**Before:**
```typescript
const filePath = `${userId}.${extension}`;
```

**After:**
```typescript
const filePath = `${userId}/profile.${extension}`;
```

---

### **No Other Changes Required:**

✅ **AccountScreen.tsx** - Uses URL from database (no changes)
✅ **HistoryScreen.tsx** - Uses URL from database (no changes)
✅ **App.tsx** - Passes URL from database (no changes)
✅ **ProfilePhotoScreen.tsx** - Only calls uploadProfilePhoto (no changes)
✅ **ProfilePhotoPromptScreen.tsx** - Only calls uploadProfilePhoto (no changes)

---

## Why This Works

### **URL-Based Display System**

The app doesn't construct file paths for display. It:

1. ✅ Uploads file with specific path
2. ✅ Gets public URL from Supabase Storage
3. ✅ Saves URL to `user_profiles.profile_photo`
4. ✅ Displays using saved URL

**Example URL:**
```
https://jfuhplqtujaakksmixii.supabase.co/storage/v1/object/public/profile_photos/abc123-def456.jpg
```

Or with folder structure:
```
https://jfuhplqtujaakksmixii.supabase.co/storage/v1/object/public/profile_photos/abc123-def456/profile.jpg
```

**The display code doesn't care** - it just uses whatever URL is stored in the database.

---

## Search Results Summary

### **Files Checked:**

| File | Contains File Path? | Contains Storage Ops? | Display Only? |
|------|--------------------|-----------------------|---------------|
| `api.ts` | ✅ YES (1 line) | ✅ YES | - |
| `AccountScreen.tsx` | ❌ No | ❌ No | ✅ URL display |
| `HistoryScreen.tsx` | ❌ No | ❌ No | ✅ URL display |
| `ProfilePhotoScreen.tsx` | ❌ No | ❌ No | ✅ Calls api.ts |
| `ProfilePhotoPromptScreen.tsx` | ❌ No | ❌ No | ✅ Calls api.ts |
| `App.tsx` | ❌ No | ❌ No | ✅ Passes URL |

---

## Grep Search Patterns Used

```bash
# Pattern 1: File path construction
\$\{userId\}

# Pattern 2: Storage operations
getPublicUrl|storage\.from|\.upload\(|\.download\(

# Pattern 3: File extensions
\.jpg|\.png|\.jpeg

# Pattern 4: Bucket references
profile_photos
```

**Results:** Only `mobile/src/services/api.ts` matched all patterns.

---

## Potential File Structure Changes

### **Option 1: Keep Flat Structure (Current)** ✅
```
profile_photos/abc123.jpg
```
- Pros: Simple, one file per user
- Cons: All files in root (could be messy with many users)

### **Option 2: Folder per User**
```
profile_photos/abc123/profile.jpg
```
- Pros: Organized, allows multiple photos per user in future
- Cons: Requires ONE line change (line 809)

### **Option 3: Date-based Folders**
```
profile_photos/2025/11/30/abc123.jpg
```
- Pros: Time-based organization
- Cons: Harder to find latest photo

---

## Conclusion

**✅ The file path structure is COMPLETELY ISOLATED to one location:**

- **ONLY** `mobile/src/services/api.ts` line 809 constructs file paths
- **ONLY** `uploadProfilePhoto()` function accesses storage
- **ALL** display code uses database URLs (path-agnostic)

**To change file structure:**
1. Modify line 809 in api.ts
2. That's it!

**No other files need changes.**

---

## Related Files

**Core Upload:**
- `mobile/src/services/api.ts` (lines 794-846)

**Display Only (URL-based):**
- `mobile/src/screens/AccountScreen.tsx` (lines 426-429, 897-903)
- `mobile/src/screens/HistoryScreen.tsx` (lines 423-428)
- `mobile/App.tsx` (lines 287-295, 726-732)

**No Storage Operations:**
- `mobile/src/screens/ProfilePhotoScreen.tsx`
- `mobile/src/screens/ProfilePhotoPromptScreen.tsx`
- `mobile/src/contexts/AuthContext.tsx`

