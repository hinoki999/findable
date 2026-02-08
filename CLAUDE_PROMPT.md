# Critical BLE DropLink Issue - First Principles Analysis Request

## Context: What Happened Since Claude Went Down

I was working on fixing BLE device discovery and drop functionality. The system uses:
- **BLE Advertising**: Devices advertise as "DL-XXXXXXXX" where XXXX is first 8 chars of userId
- **BLE Scanning**: Detects devices and looks up user info from Supabase
- **Modal Display**: Shows username when device is tapped
- **Drop Functionality**: Sends drops using userId from detected device

## Current Critical Issues

1. **Modal stuck on "Loading user..."** - Never shows username
2. **Drops fail** - Error: "user info null", "error stopping advertising", "error not advertising"
3. **User info is null** - Supabase lookup appears to be failing

## What We've Tried (All Failed)

### Attempt 1: Fixed Device ID Calculation
- **Problem**: Device was advertising as "DL-0000" instead of real deviceId
- **Fix**: Changed `startAdvertising` to calculate deviceId directly from userId instead of using stale state
- **Result**: Still failing - deviceId might be correct now but lookup still fails

### Attempt 2: Added Modal Sync
- **Problem**: Modal showed snapshot of device before username loaded
- **Fix**: Added `useEffect` to sync `selectedBlipDevice` with updated device in `devices` array
- **Result**: Still stuck on "Loading user..." - sync not working or lookup not completing

### Attempt 3: Fixed Table Queries
- **Problem**: Code was querying `profiles` table but users exist in `user_profiles`
- **Fix**: Changed to query `user_profiles` FIRST, then fallback to `profiles`
- **Result**: Still failing - queries might be wrong or data doesn't exist

### Attempt 4: Prioritized Display Names
- **Problem**: Showing technical username ("67ADJOOW81") instead of display name ("cheese")
- **Fix**: Always query `user_profiles.name` first (display name), fallback to `profiles.username` (technical)
- **Result**: Still failing - lookup not working at all

## Current Code Flow (What Should Happen)

1. **Device Advertising**:
   - `BLEAdvertiser.tsx` calculates `deviceId = userId.substring(0, 8)`
   - Advertises as `"DL-${deviceId}"` via native module
   - Should work if userId is available

2. **Device Scanning**:
   - `BLEScanner.tsx` detects device with name "DL-XXXXXXXX"
   - Extracts deviceId from name: `deviceId = "XXXXXXXX"` (8 chars)
   - Queries Supabase: `user_profiles` table with `.like('user_id', 'XXXXXXXX%')`
   - Should return: `{ user_id: "full-uuid", name: "cheese" }`
   - Updates `devices` array with `username` and `userId`

3. **Modal Display**:
   - User taps blip → `setSelectedBlipDevice(device)` (snapshot)
   - `useEffect` watches `devices` array
   - When device gets updated with username, syncs to `selectedBlipDevice`
   - Modal shows `selectedBlipDevice?.username`

4. **Drop Functionality**:
   - Uses `selectedBlipDevice.userId` to send drop
   - If null, tries lookup in drop handler
   - Should work if userId is available

## Critical Discovery: Type Mismatch?

From README.md, Supabase schema shows:
```sql
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  ...
);
```

**BUT** the code is using:
```typescript
.like('user_id', `${deviceId}%`)  // deviceId is 8-char string
```

**Questions:**
1. Does `.like()` work on UUID columns in Supabase?
2. Is `user_id` actually UUID or TEXT/INTEGER in your Supabase?
3. Should we be using a different query method?

## What's Actually Happening (Based on Errors)

Error messages suggest:
- "error stopping advertising" - Native module error?
- "error not advertising" - Advertising state issue?
- "user info null" - Supabase lookup returning null/undefined

## Files to Analyze

1. **`mobile/src/components/BLEScanner.tsx`** (lines 195-247)
   - Device detection and Supabase lookup
   - Queries `user_profiles` with `.like('user_id', '${deviceId}%')`

2. **`mobile/src/screens/HomeScreen.tsx`** (lines 934-947, 3059-3102)
   - Modal sync useEffect
   - Drop handler with fallback lookup

3. **`mobile/src/components/BLEAdvertiser.tsx`** (lines 48-120, 248-267)
   - DeviceId generation from userId
   - Advertising start logic

4. **`mobile/src/contexts/AuthContext.tsx`**
   - userId type: `string | null` (UUID string)
   - How userId is set and when it's available

## Root Cause Identified

**PRIMARY ISSUE**: The `.like()` query on UUID columns doesn't work in Supabase PostgREST because:
1. PostgREST doesn't support SQL casting syntax like `::text` in the query builder
2. UUIDs are stored with hyphens (e.g., "abc12345-def6-7890-abcd-ef1234567890")
3. deviceId is the first 8 chars without hyphens (e.g., "abc12345")
4. Direct LIKE matching fails because of the hyphen mismatch

**SOLUTION IMPLEMENTED**: 
- Changed queries to fetch ALL user_profiles/profiles and filter in JavaScript
- Remove hyphens from UUID before comparing: `profile.user_id.toString().toLowerCase().replace(/-/g, '').startsWith(deviceId.toLowerCase())`
- This works but is not ideal for performance (queries all rows)

**BETTER LONG-TERM SOLUTION** (not implemented yet):
- Create a database function or view that casts UUID to TEXT
- Or use UUID range queries with `.gte()` and `.lte()`
- Or add a computed column `user_id_prefix` that stores the first 8 chars

**SECONDARY ISSUE**: The async lookup completes but state updates might not trigger re-renders properly. The sync useEffect should handle this, but verify dependencies.

## What I Need

1. **Verify the actual Supabase schema** - Is `user_id` UUID, TEXT, or INTEGER?
2. **Test the query syntax** - Does `.like()` work on UUID columns?
3. **Check if data exists** - Are there actually rows in `user_profiles` table?
4. **Fix the query** - Use correct syntax for UUID prefix matching
5. **Ensure state updates trigger re-renders** - Fix sync logic if needed

## Expected Behavior

- Device advertises as "DL-XXXXXXXX" (first 8 chars of UUID)
- Scanner detects device and extracts "XXXXXXXX"
- Query finds user where UUID starts with "XXXXXXXX"
- Modal shows display name ("cheese") from `user_profiles.name`
- Drop uses full UUID from lookup
- Everything works even if `name` is null (uses deviceId as fallback)

Please analyze from first principles and identify the exact root cause and fix.

