# Type Mismatch Analysis - userId Parameter

## Executive Summary

✅ **NO TYPE MISMATCH FOUND**

All userId values are consistently handled as **strings (UUID format)** throughout the codebase.

---

## Data Flow Analysis

### 1. **Supabase Auth Returns String (UUID)**

**Source:** `@supabase/supabase-js` library

```typescript
// Supabase auth.signInWithPassword() returns
{
  data: {
    user: {
      id: string  // ← UUID in string format: "abc123-def456-..."
    }
  }
}
```

**Comment in code (AuthContext.tsx line 82):**
```typescript
// Supabase user ID is UUID string
const userId = data.user.id;
```

---

### 2. **AuthContext Stores as String**

**File:** `mobile/src/contexts/AuthContext.tsx`

```typescript
interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;  // ← Explicitly typed as string
  username: string | null;
  token: string | null;
  loading: boolean;
}
```

**Line 47:**
```typescript
userId: session.user.id,  // String UUID from Supabase
```

---

### 3. **Components Receive String from useAuth()**

#### **ProfilePhotoScreen.tsx (line 21)**
```typescript
const { userId } = useAuth();  // ← string | null
```

#### **ProfilePhotoPromptScreen.tsx (line 17)**
```typescript
const { userId } = useAuth();  // ← string | null
```

---

### 4. **uploadProfilePhoto() Expects String**

**File:** `mobile/src/services/api.ts` (line 794)

```typescript
export async function uploadProfilePhoto(
  imageUri: string, 
  userId: string  // ← Explicitly typed as string
): Promise<string>
```

**Usage (line 832):**
```typescript
.eq('user_id', userId)  // ← String passed to Supabase query
```

---

### 5. **Database Column Type: UUID**

**File:** `README.md` (line 350)

```sql
user_profiles:
  user_id UUID PRIMARY KEY REFERENCES auth.users(id)
```

**Important:** PostgreSQL UUID type **accepts string representations** of UUIDs.

---

## Type Compatibility

### **JavaScript/TypeScript → PostgreSQL**

| Source | Type | Example Value |
|--------|------|---------------|
| Supabase Auth | `string` | `"abc123-def456-ghij789-klmn012"` |
| AuthContext | `string \| null` | `"abc123-def456-ghij789-klmn012"` |
| uploadProfilePhoto param | `string` | `"abc123-def456-ghij789-klmn012"` |
| PostgreSQL column | `UUID` | Accepts string format ✅ |

### **PostgreSQL UUID Type Behavior**

```sql
-- PostgreSQL automatically converts string to UUID
UPDATE user_profiles 
SET profile_photo = 'url...' 
WHERE user_id = 'abc123-def456-ghij789-klmn012'  -- ✅ Works fine
```

---

## Potential Issues Checked

### ❓ Could there be a string vs UUID mismatch?
**No** - PostgreSQL UUID columns accept string representations

### ❓ Could Supabase SDK convert types incorrectly?
**No** - Supabase JS SDK handles UUID as strings natively

### ❓ Could there be case sensitivity issues?
**No** - UUIDs are case-insensitive

### ❓ Could there be leading/trailing whitespace?
**No** - No `.trim()` needed, Supabase returns clean UUIDs

---

## Signup Flow Type Trace

```
1. SignupScreen.tsx (line 267)
   └─> const userId = session?.user?.id;
   └─> Type: string (UUID from Supabase)

2. Insert into user_profiles (line 278)
   └─> user_id: userId
   └─> Database column: UUID
   └─> Conversion: Automatic (PostgreSQL handles it)

3. ProfilePhotoPromptScreen appears
   └─> const { userId } = useAuth();
   └─> Type: string | null

4. uploadProfilePhoto(selectedImage, userId)
   └─> Parameter type: string
   └─> Type match: ✅ Correct

5. Supabase query (line 832)
   └─> .eq('user_id', userId)
   └─> Comparison: UUID = string
   └─> PostgreSQL: ✅ Implicit conversion works
```

---

## RLS Policy Implications

### **Supabase Storage RLS**

```sql
-- Example RLS policy on storage.objects
CREATE POLICY "Allow authenticated users upload" 
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile_photos' 
  AND auth.uid() = (storage.foldername(name))[1]::uuid
);
```

### **Type in RLS Context**

- `auth.uid()` returns UUID type
- `userId` parameter is string
- Comparison works because PostgreSQL auto-converts

---

## Conclusion

**No type mismatch exists.** The entire flow uses strings consistently:

1. ✅ Supabase Auth returns string (UUID format)
2. ✅ AuthContext stores string
3. ✅ Components receive string
4. ✅ uploadProfilePhoto expects string
5. ✅ PostgreSQL UUID column accepts string
6. ✅ RLS policies compare correctly

---

## Why Photo Upload Was Failing (Historical Context)

The photo upload RLS error was **NOT** due to type mismatch. It was due to:

1. ❌ Manual REST API calls bypassing SDK auth injection
2. ❌ Incorrect base64 decoding (using `decode()` instead of `atob()`)
3. ❌ AsyncStorage caching layer causing stale data

**All resolved in commits:**
- `a28815d` - Use Supabase SDK (auth auto-injected)
- `f73422b` - Fix base64 conversion
- `2aa2662` - Remove AsyncStorage caching

---

## Recommendations

### ✅ Current Implementation is Correct

No changes needed. Types are handled correctly throughout.

### 💡 Optional: Add TypeScript Types

Could generate Supabase types for better type safety:

```bash
npx supabase gen types typescript --project-id jfuhplqtujaakksmixii > mobile/src/types/database.types.ts
```

This would provide:
```typescript
export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          user_id: string  // UUID as string
          profile_photo: string | null
          // ...
        }
      }
    }
  }
}
```

But **not required** - current string typing is correct and works.

