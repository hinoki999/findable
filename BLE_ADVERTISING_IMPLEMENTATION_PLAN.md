# BLE Advertising Implementation Plan
## DropLink - Make Devices Discoverable

**Created:** December 2024  
**Updated:** December 2024 (Critical Safeguards Added)  
**Status:** Planning Phase - Awaiting Approval  
**Priority:** High - Required for core functionality

---

## ⚠️ CRITICAL SAFEGUARDS & REQUIREMENTS

### Core Principles
1. **DO NOT modify existing working code** in `BLEScanner.tsx` or `HomeScreen.tsx` unless absolutely necessary for integration
2. **Isolated module design** - BLEAdvertiser must be completely separate and can be enabled/disabled without affecting scanning
3. **Additive only** - All changes must be additions, not modifications to existing functionality
4. **Backward compatibility** - Existing scanning must continue to work even if advertising fails
5. **Rollback capability** - Quick disable mechanism if advertising causes issues

### Pre-Implementation Review Process
- **List every file** that will be modified BEFORE making changes
- **Explain exactly** what will change in each file
- **Show changes for review** before applying them
- **Verify** existing functionality still works after each phase

---

## Executive Summary

Currently, DropLink only implements **BLE scanning (central mode)** - it can detect other devices but cannot make itself discoverable. This plan outlines the implementation of **BLE advertising (peripheral mode)** to enable mutual detection between DropLink users.

**Current Limitation:**
- App scans for devices with names starting with `"DropLink-"`
- Users must manually change their Bluetooth device name (not practical)
- No Service UUID broadcasting
- No automatic discoverability

**Goal:**
- Implement BLE advertising so DropLink users are automatically discoverable
- Broadcast a unique Service UUID that identifies DropLink users
- Enable mutual detection without manual device name changes
- **Maintain 100% compatibility with existing scanning code**

---

## Table of Contents

1. [Library Selection](#1-library-selection)
2. [Architecture Overview](#2-architecture-overview)
3. [Files That Will Be Modified](#3-files-that-will-be-modified)
4. [Implementation Phases with Verification](#4-implementation-phases-with-verification)
5. [Rollback Plan](#5-rollback-plan)
6. [Testing Strategy](#6-testing-strategy)
7. [Technical Specifications](#7-technical-specifications)

---

## 1. Library Selection

### Decision: Use `react-native-ble-peripheral`

**Rationale:**
- ✅ Cross-platform support (iOS + Android)
- ✅ Full GATT peripheral support (not just iBeacon)
- ✅ Can broadcast custom Service UUIDs (required for DropLink)
- ✅ Works alongside `react-native-ble-plx` (scanning)
- ✅ Compatible with Expo custom development builds (expo-dev-client)
- ✅ Actively maintained
- ✅ Compatible with React Native 0.81.5

**Installation:**
```bash
cd mobile
npm install react-native-ble-peripheral
```

**Expo Compatibility:**
- Works with `expo-dev-client` (custom development build)
- Requires `npx expo prebuild` after installation
- Requires rebuilding development client

---

## 2. Architecture Overview

### Component Structure (Isolated Design)

```
┌─────────────────────────────────────────┐
│         HomeScreen.tsx                  │
│  (Orchestrates BLE operations)         │
│  - Uses BLEScanner (existing)          │
│  - Uses BLEAdvertiser (NEW, isolated) │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                 │
┌──────▼──────┐  ┌───────▼──────────┐
│ BLEScanner  │  │ BLEAdvertiser    │
│ (Central)   │  │ (Peripheral)     │
│ EXISTING    │  │ NEW - ISOLATED   │
│ NO CHANGES  │  │ CAN BE DISABLED  │
└─────────────┘  └──────────────────┘
       │                 │
       │                 │
┌──────▼──────┐  ┌───────▼──────────┐
│ react-native│  │ react-native-ble │
│ -ble-plx    │  │ -peripheral      │
└─────────────┘  └──────────────────┘
```

### Isolation Strategy

**BLEAdvertiser Module:**
- Completely self-contained
- No dependencies on BLEScanner
- Can be disabled via feature flag
- Fails gracefully if library unavailable
- Does not affect scanning if advertising fails

**BLEScanner (Existing):**
- **NO CHANGES** to core scanning logic
- Only additive change: Service UUID check in filter function
- Backward compatible: Still checks name prefix
- Scanning works independently of advertising

---

## 3. Files That Will Be Modified

### Files to CREATE (New - No Risk to Existing Code)

1. **`mobile/src/config/bleConfig.ts`** (NEW)
   - Purpose: Centralized BLE configuration
   - Contents: Service UUID, constants
   - Risk: None (new file)

2. **`mobile/src/components/BLEAdvertiser.tsx`** (NEW)
   - Purpose: Isolated advertising hook
   - Contents: Advertising logic, lifecycle management
   - Risk: None (new file, isolated)

### Files to MODIFY (Minimal Changes)

3. **`mobile/src/components/BLEScanner.tsx`**
   - **Change Type:** Additive only
   - **Exact Changes:**
     - Add import: `import { DROPLINK_SERVICE_UUID } from '../config/bleConfig';`
     - Update `isDropLinkDevice()` function to check Service UUID FIRST, then fallback to name prefix
     - **NO changes to scanning logic, device management, or state handling**
   - **Risk Level:** Low (additive change, backward compatible)
   - **Rollback:** Remove Service UUID check, keep name prefix only

4. **`mobile/src/screens/HomeScreen.tsx`**
   - **Change Type:** Additive only
   - **Exact Changes:**
     - Add import: `import { useBLEAdvertiser } from '../components/BLEAdvertiser';`
     - Add hook call: `const { isAdvertising, startAdvertising, stopAdvertising } = useBLEAdvertiser();`
     - Add useEffect to start/stop advertising (separate from scanning useEffect)
     - **NO changes to existing scanning logic, blip rendering, or grid code**
   - **Risk Level:** Low (additive, isolated useEffect)
   - **Rollback:** Remove import, remove hook call, remove useEffect

5. **`mobile/package.json`**
   - **Change Type:** Additive only
   - **Exact Changes:**
     - Add dependency: `"react-native-ble-peripheral": "^x.x.x"`
   - **Risk Level:** None (dependency addition)

6. **`mobile/app.json`**
   - **Change Type:** Additive only
   - **Exact Changes:**
     - Add iOS permission: `NSBluetoothAlwaysUsageDescription` (if not present)
     - Add Android permission: `BLUETOOTH_ADVERTISE` (if not present)
   - **Risk Level:** None (permission addition)

### Files That Will NOT Be Modified

- ✅ `mobile/src/services/BLEService.ts` - No changes
- ✅ Any other existing BLE-related files - No changes
- ✅ DropScreen.tsx - No changes
- ✅ Any other screen files - No changes

---

## 4. Implementation Phases with Verification

### Phase 1: Library Installation Only
**Duration:** 30 minutes  
**Dependencies:** None  
**Risk Level:** Low (dependency addition only)

#### Tasks:
1. Install `react-native-ble-peripheral`
   ```bash
   cd mobile
   npm install react-native-ble-peripheral --save
   ```

2. Run Expo prebuild (generates native code)
   ```bash
   npx expo prebuild
   ```

3. **DO NOT rebuild development client yet** - verify app still runs first

#### Verification Checklist:
- [ ] App starts without errors
- [ ] No new console errors
- [ ] BLE scanning still works (test on device)
- [ ] HomeScreen renders correctly
- [ ] Blips appear if devices are nearby
- [ ] No crashes or warnings

#### Rollback (if verification fails):
```bash
cd mobile
npm uninstall react-native-ble-peripheral
```

#### Approval Required:
✅ **STOP HERE** - Show verification results before proceeding to Phase 2

---

### Phase 2: Create Configuration File
**Duration:** 15 minutes  
**Dependencies:** Phase 1 verified  
**Risk Level:** None (new file only)

#### File to Create: `mobile/src/config/bleConfig.ts`

**Exact Contents:**
```typescript
/**
 * BLE Configuration for DropLink
 * Centralized configuration for BLE advertising and scanning
 */

// DropLink Service UUID - Used for advertising and device detection
// Format: Standard 128-bit UUID
// Generated: [TO BE GENERATED - use https://www.uuidgenerator.net/]
export const DROPLINK_SERVICE_UUID = '12345678-1234-1234-1234-123456789ABC';

// Device name prefix - Backward compatibility for devices without Service UUID
export const DROPLINK_DEVICE_PREFIX = 'DropLink-';

// Advertising configuration
export const BLE_ADVERTISING_INTERVAL = 100; // ms (platform-dependent)
```

#### Verification Checklist:
- [ ] File created successfully
- [ ] No TypeScript errors
- [ ] App still runs without errors
- [ ] BLE scanning still works
- [ ] No impact on existing functionality

#### Approval Required:
✅ **STOP HERE** - Show verification results before proceeding to Phase 3

---

### Phase 3: Create BLEAdvertiser Hook (Isolated)
**Duration:** 2-3 hours  
**Dependencies:** Phase 2 verified  
**Risk Level:** Low (new file, isolated, can be disabled)

#### File to Create: `mobile/src/components/BLEAdvertiser.tsx`

**Exact Contents (Full Implementation):**
```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus, PermissionsAndroid } from 'react-native';
import { DROPLINK_SERVICE_UUID } from '../config/bleConfig';

// Feature flag - can disable advertising if needed
const ADVERTISING_ENABLED = true;

// Import with error handling (library may not be available)
let BlePeripheral: any = null;
try {
  BlePeripheral = require('react-native-ble-peripheral');
} catch (error) {
  console.warn('[BLEAdvertiser] react-native-ble-peripheral not available:', error);
}

interface UseBLEAdvertiserReturn {
  isAdvertising: boolean;
  startAdvertising: () => Promise<void>;
  stopAdvertising: () => Promise<void>;
  error: string | null;
  isAvailable: boolean;
}

/**
 * Isolated BLE Advertising Hook
 * 
 * This hook is completely separate from BLEScanner and can be disabled
 * without affecting scanning functionality.
 * 
 * Features:
 * - Starts advertising when enabled
 * - Stops advertising when app goes to background (iOS limitation)
 * - Resumes advertising when app returns to foreground
 * - Handles permission denials gracefully
 * - Fails silently if library unavailable
 */
export const useBLEAdvertiser = (): UseBLEAdvertiserReturn => {
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAvailable = BlePeripheral !== null && ADVERTISING_ENABLED;

  // Request BLE advertising permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      return false;
    }

    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        
        const allGranted = Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED
        );
        
        if (!allGranted) {
          setError('Bluetooth advertising permissions not granted');
          return false;
        }
      } catch (err) {
        console.warn('[BLEAdvertiser] Permission request error:', err);
        setError('Failed to request permissions');
        return false;
      }
    }
    
    return true;
  }, []);

  // Start advertising
  const startAdvertising = useCallback(async () => {
    if (!isAvailable) {
      console.log('[BLEAdvertiser] Advertising not available (library not loaded or disabled)');
      return;
    }

    if (Platform.OS === 'web') {
      console.log('[BLEAdvertiser] Web platform - advertising not supported');
      return;
    }

    if (isAdvertising) {
      console.log('[BLEAdvertiser] Already advertising, skipping start');
      return;
    }

    try {
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) {
        return;
      }

      // Start advertising with Service UUID
      await BlePeripheral.startAdvertising(DROPLINK_SERVICE_UUID, 'DropLink');
      
      setIsAdvertising(true);
      setError(null);
      console.log('[BLEAdvertiser] Advertising started with Service UUID:', DROPLINK_SERVICE_UUID);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start advertising';
      console.error('[BLEAdvertiser] Error starting advertising:', errorMessage);
      setError(errorMessage);
      setIsAdvertising(false);
    }
  }, [isAvailable, isAdvertising, requestPermissions]);

  // Stop advertising
  const stopAdvertising = useCallback(async () => {
    if (!isAvailable || !isAdvertising) {
      return;
    }

    try {
      await BlePeripheral.stopAdvertising();
      setIsAdvertising(false);
      setError(null);
      console.log('[BLEAdvertiser] Advertising stopped');
    } catch (err) {
      console.error('[BLEAdvertiser] Error stopping advertising:', err);
      setError('Failed to stop advertising');
    }
  }, [isAvailable, isAdvertising]);

  // Handle app state changes (pause advertising in background on iOS)
  useEffect(() => {
    if (!isAvailable) return;

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Pause advertising when app goes to background (iOS limitation)
        if (Platform.OS === 'ios' && isAdvertising) {
          console.log('[BLEAdvertiser] App going to background, pausing advertising');
          stopAdvertising();
        }
      } else if (nextAppState === 'active') {
        // Resume advertising when app returns to foreground
        if (Platform.OS === 'ios' && !isAdvertising) {
          console.log('[BLEAdvertiser] App returning to foreground, resuming advertising');
          startAdvertising();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAvailable, isAdvertising, startAdvertising, stopAdvertising]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isAdvertising) {
        stopAdvertising();
      }
    };
  }, [isAdvertising, stopAdvertising]);

  return {
    isAdvertising,
    startAdvertising,
    stopAdvertising,
    error,
    isAvailable,
  };
};
```

#### Verification Checklist:
- [ ] File created successfully
- [ ] No TypeScript errors
- [ ] No import errors (library available)
- [ ] App still runs without errors
- [ ] BLE scanning still works (test on device)
- [ ] HomeScreen renders correctly
- [ ] No crashes or warnings
- [ ] Hook can be imported without errors

#### Rollback (if verification fails):
- Delete `mobile/src/components/BLEAdvertiser.tsx`
- No other changes needed (isolated module)

#### Approval Required:
✅ **STOP HERE** - Show verification results before proceeding to Phase 4

---

### Phase 4: Update BLEScanner to Detect Service UUID (Additive Only)
**Duration:** 30 minutes  
**Dependencies:** Phase 3 verified  
**Risk Level:** Low (additive change, backward compatible)

#### File to Modify: `mobile/src/components/BLEScanner.tsx`

**Exact Changes (Line-by-Line):**

**Change 1: Add import at top of file (after existing imports)**
```typescript
// ADD THIS LINE (around line 3, after other imports)
import { DROPLINK_SERVICE_UUID, DROPLINK_DEVICE_PREFIX } from '../config/bleConfig';
```

**Change 2: Update `isDropLinkDevice()` function (around line 35-56)**
```typescript
// REPLACE the entire function with this:
const isDropLinkDevice = (device: Device | null): boolean => {
  if (!device) return false;
  
  // Primary: Check Service UUID (most reliable - when advertising is implemented)
  if (device.serviceUUIDs && device.serviceUUIDs.includes(DROPLINK_SERVICE_UUID)) {
    return true;
  }
  
  // Fallback: Check device name prefix (backward compatibility - existing functionality)
  if (device.name && device.name.startsWith(DROPLINK_DEVICE_PREFIX)) {
    return true;
  }
  
  return false;
};
```

**That's it - NO other changes to BLEScanner.tsx**

#### Verification Checklist:
- [ ] Import added successfully
- [ ] Function updated correctly
- [ ] No TypeScript errors
- [ ] App still runs without errors
- [ ] **BLE scanning still works** (test on device)
- [ ] **Devices with name prefix still detected** (backward compatibility)
- [ ] **Devices with Service UUID detected** (if advertising is active)
- [ ] HomeScreen renders correctly
- [ ] Blips appear for both name prefix and Service UUID devices
- [ ] No crashes or warnings

#### Rollback (if verification fails):
- Revert `isDropLinkDevice()` function to original (name prefix only)
- Remove import
- Scanning continues to work with name prefix

#### Approval Required:
✅ **STOP HERE** - Show verification results before proceeding to Phase 5

---

### Phase 5: Integrate BLEAdvertiser into HomeScreen (Additive Only)
**Duration:** 30 minutes  
**Dependencies:** Phase 4 verified  
**Risk Level:** Low (additive, isolated useEffect)

#### File to Modify: `mobile/src/screens/HomeScreen.tsx`

**Exact Changes (Line-by-Line):**

**Change 1: Add import (around line 12, after other component imports)**
```typescript
// ADD THIS LINE
import { useBLEAdvertiser } from '../components/BLEAdvertiser';
```

**Change 2: Add hook call (around line 602, after useBLEScanner)**
```typescript
// ADD THESE LINES (after the useBLEScanner hook call)
const { isAdvertising, startAdvertising, stopAdvertising, error: advertisingError, isAvailable } = useBLEAdvertiser();
```

**Change 3: Add advertising useEffect (around line 691, after scanning useEffect)**
```typescript
// ADD THIS ENTIRE useEffect BLOCK (after the scanning useEffect, before fetchLinkedDevices useEffect)
// Start BLE advertising when component mounts (isolated from scanning)
useEffect(() => {
  if (!isAvailable) {
    console.log('[HomeScreen] BLE advertising not available, skipping');
    return;
  }

  // Start advertising when HomeScreen mounts
  startAdvertising();
  
  return () => {
    // Stop advertising when HomeScreen unmounts
    stopAdvertising();
  };
}, [isAvailable, startAdvertising, stopAdvertising]);
```

**That's it - NO other changes to HomeScreen.tsx**

#### Verification Checklist:
- [ ] Import added successfully
- [ ] Hook called correctly
- [ ] useEffect added correctly
- [ ] No TypeScript errors
- [ ] App still runs without errors
- [ ] **BLE scanning still works** (test on device)
- [ ] **Advertising starts** (check console logs)
- [ ] **Advertising stops** when leaving HomeScreen
- [ ] HomeScreen renders correctly
- [ ] Blips appear correctly
- [ ] No crashes or warnings
- [ ] No interference between scanning and advertising

#### Rollback (if verification fails):
- Remove import
- Remove hook call
- Remove useEffect
- Scanning continues to work independently

#### Approval Required:
✅ **STOP HERE** - Show verification results before final testing

---

### Phase 6: Final Testing & Verification
**Duration:** 1-2 hours  
**Dependencies:** All phases verified  
**Risk Level:** None (testing only)

#### Comprehensive Test Checklist:

**Basic Functionality:**
- [ ] App starts without errors
- [ ] HomeScreen renders correctly
- [ ] BLE scanning works (devices detected)
- [ ] BLE advertising works (check console logs)
- [ ] No crashes or memory leaks

**Device Detection:**
- [ ] Devices with Service UUID are detected
- [ ] Devices with name prefix are still detected (backward compatibility)
- [ ] Both detection methods work simultaneously
- [ ] Blips appear on radar for detected devices

**Lifecycle:**
- [ ] Advertising starts when HomeScreen opens
- [ ] Advertising stops when HomeScreen closes
- [ ] Advertising pauses when app goes to background (iOS)
- [ ] Advertising resumes when app returns to foreground (iOS)

**Error Handling:**
- [ ] App handles permission denial gracefully
- [ ] App handles library unavailability gracefully
- [ ] Scanning continues to work if advertising fails
- [ ] No crashes on error conditions

**Performance:**
- [ ] No noticeable battery drain
- [ ] No performance degradation
- [ ] No memory leaks

---

## 5. Rollback Plan

### Quick Disable (Feature Flag)

**File:** `mobile/src/components/BLEAdvertiser.tsx`

**Change:**
```typescript
// Change this line:
const ADVERTISING_ENABLED = true;

// To this:
const ADVERTISING_ENABLED = false;
```

**Result:**
- Advertising immediately disabled
- Scanning continues to work
- No other changes needed

### Complete Rollback (Remove All Changes)

**Step 1: Remove BLEAdvertiser integration from HomeScreen**
- Remove import
- Remove hook call
- Remove useEffect

**Step 2: Revert BLEScanner changes**
- Remove Service UUID import
- Revert `isDropLinkDevice()` to name prefix only

**Step 3: Delete new files (optional)**
- Delete `mobile/src/components/BLEAdvertiser.tsx`
- Delete `mobile/src/config/bleConfig.ts` (or keep for future use)

**Step 4: Uninstall library (optional)**
```bash
cd mobile
npm uninstall react-native-ble-peripheral
```

**Result:**
- App returns to pre-advertising state
- All existing functionality preserved
- No permanent changes

---

## 6. Testing Strategy

### Pre-Implementation Baseline
- Document current BLE scanning behavior
- Test device detection with name prefix
- Verify blip rendering
- Check for any existing errors

### Post-Phase Verification
- After each phase, verify baseline still works
- Test new functionality in isolation
- Check for regressions

### Final Integration Testing
- Test with two devices
- Verify mutual detection
- Test edge cases (permissions, background, etc.)

---

## 7. Technical Specifications

### Service UUID Format

**Standard UUID Format:**
```
12345678-1234-1234-1234-123456789ABC
```

**Generation:**
- Use UUID v4 (random) generator
- Ensure uniqueness
- Document UUID in code and README

### Advertising Data Structure

**Required:**
- Service UUID: `DROPLINK_SERVICE_UUID`
- Device name: `'DropLink'` (optional, can be user's username)

**Future Enhancement (Not in Initial Implementation):**
- User ID in manufacturer data
- Profile photo hash
- Status (available, busy, etc.)

### Platform-Specific Behavior

**iOS:**
- Advertising pauses in background (iOS limitation)
- Resumes when app returns to foreground
- Requires `NSBluetoothAlwaysUsageDescription` permission

**Android:**
- Advertising continues in background (if app has permission)
- Requires `BLUETOOTH_ADVERTISE` permission (Android 12+)
- Requires `BLUETOOTH_CONNECT` permission

**Web:**
- Advertising not supported
- Hook returns early, no errors thrown

---

## Summary

This implementation plan ensures:
- ✅ **Zero risk to existing functionality** - All changes are additive
- ✅ **Isolated module** - Advertising can be disabled without affecting scanning
- ✅ **Backward compatibility** - Name prefix detection still works
- ✅ **Rollback capability** - Quick disable or complete removal
- ✅ **Phased approach** - Verification after each phase
- ✅ **Clear documentation** - Exact changes listed for review

**Next Steps:**
1. Review this plan
2. Approve Phase 1 (library installation)
3. Proceed with verification after each phase
4. Stop if any verification fails

---

**Document Version:** 2.0  
**Last Updated:** December 2024  
**Status:** Ready for Review and Approval
