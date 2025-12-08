# DropLink BLE Filtering Implementation Plan

## Overview
Filter BLE scanning to only detect and display DropLink users, excluding all other Bluetooth devices.

## Implementation Strategy

**Approach:** Device Name Pattern Filtering (can be upgraded to Service UUID later)

**Rationale:**
- No existing BLE advertising implementation found
- Device name pattern is simplest to implement
- Can be upgraded to Service UUID filtering without breaking changes
- Allows for easy testing and configuration

## Step-by-Step Implementation Plan

### Step 1: Add DropLink Device Identifier Configuration
**File:** `mobile/src/components/BLEScanner.tsx`
- Add constant for DropLink device name prefix/pattern
- Add helper function to check if device is DropLink user
- Make it configurable for future Service UUID upgrade

### Step 2: Filter Devices in Scanner
**File:** `mobile/src/components/BLEScanner.tsx`
- Modify `startScan` callback to only process DropLink devices
- Add filtering logic before adding/updating devices
- Log filtered devices for debugging

### Step 3: Verify Integration Points
**Files:** `mobile/src/screens/HomeScreen.tsx`, `mobile/src/screens/DropScreen.tsx`
- Confirm filtered devices flow correctly
- Ensure no additional filtering needed (already handled in scanner)

## Configuration

**DropLink Device Identifier:**
- **Pattern:** Device name must start with "DropLink-" prefix
- **Example:** "DropLink-John", "DropLink-User123"
- **Fallback:** Can check manufacturer data or service UUIDs in future

**Future Upgrade Path:**
- Replace name pattern with Service UUID filtering
- Add BLE advertising implementation to broadcast DropLink service UUID
- No changes needed to scanner filtering logic (just swap helper function)

## Code Changes Summary

### File 1: `mobile/src/components/BLEScanner.tsx`
- Add `DROPLINK_DEVICE_PREFIX` constant
- Add `isDropLinkDevice()` helper function
- Modify device processing to filter non-DropLink devices

### File 2: No changes needed
- `HomeScreen.tsx` - Already uses filtered devices from scanner
- `DropScreen.tsx` - Already uses filtered devices from scanner

## Testing Checklist

- [ ] DropLink devices (name starts with "DropLink-") appear as blips
- [ ] Non-DropLink devices (phones, headphones, etc.) are filtered out
- [ ] Devices without names are filtered out (unless they have DropLink identifier)
- [ ] Link markers still display correctly
- [ ] Modal functionality works for DropLink devices
- [ ] Distance filtering still works correctly

## Rollback Plan

If issues occur, revert by:
1. Remove `isDropLinkDevice()` check in scanner
2. Restore original device processing logic
3. All devices will be shown again (original behavior)

