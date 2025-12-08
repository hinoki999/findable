# BLE Advertising Implementation Plan
## DropLink - Make Devices Discoverable

**Created:** December 2024  
**Status:** Planning Phase  
**Priority:** High - Required for core functionality

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
- Maintain compatibility with existing scanning code

---

## Table of Contents

1. [Library Selection](#1-library-selection)
2. [Architecture Overview](#2-architecture-overview)
3. [Implementation Phases](#3-implementation-phases)
4. [Technical Specifications](#4-technical-specifications)
5. [Platform-Specific Requirements](#5-platform-specific-requirements)
6. [Integration Points](#6-integration-points)
7. [Testing Strategy](#7-testing-strategy)
8. [Rollout Plan](#8-rollout-plan)

---

## 1. Library Selection

### Current State
- **`react-native-ble-plx` (v3.5.0)**: Used for scanning (central mode) ✅
- **`expo-bluetooth` (v0.0.0)**: Present in package.json but not implemented ❌

### Required: BLE Advertising Library

**Option 1: `react-native-ble-advertiser` (RECOMMENDED)**
- ✅ Cross-platform (iOS + Android)
- ✅ Active maintenance
- ✅ Simple API
- ✅ Works with React Native 0.60+
- ⚠️ Requires native module linking

**Option 2: `react-native-peripheral`**
- ✅ iOS support
- ❌ No Android support
- ⚠️ Limited to iOS only

**Option 3: Custom Native Module**
- ✅ Full control
- ✅ Platform-specific optimizations
- ❌ High development time
- ❌ Requires native iOS/Android expertise

### Decision: Use `react-native-ble-advertiser`

**Rationale:**
- Cross-platform support is essential
- Simple API reduces implementation complexity
- Active maintenance ensures compatibility
- Can coexist with `react-native-ble-plx` (scanning)

---

## 2. Architecture Overview

### Component Structure

```
┌─────────────────────────────────────────┐
│         HomeScreen.tsx                  │
│  (Orchestrates BLE operations)         │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                 │
┌──────▼──────┐  ┌───────▼──────────┐
│ BLEScanner  │  │ BLEAdvertiser    │
│ (Central)   │  │ (Peripheral)     │
└─────────────┘  └──────────────────┘
       │                 │
       │                 │
┌──────▼─────────────────▼──────┐
│   react-native-ble-plx        │
│   react-native-ble-advertiser │
└────────────────────────────────┘
```

### Data Flow

1. **User opens HomeScreen**
   - `BLEAdvertiser` starts advertising with DropLink Service UUID
   - `BLEScanner` starts scanning for devices

2. **Device A advertises**
   - Broadcasts Service UUID: `DROPLINK_SERVICE_UUID`
   - Includes user ID in advertisement data (optional)

3. **Device B scans**
   - Detects Device A via Service UUID
   - Filters using `isDropLinkDevice()` (checks Service UUID)
   - Displays as blip on radar

4. **Mutual Detection**
   - Both devices can see each other
   - No manual device name changes required

---

## 3. Implementation Phases

### Phase 1: Library Installation & Configuration
**Duration:** 1-2 hours  
**Dependencies:** None

#### Tasks:
1. Install `react-native-ble-advertiser`
   ```bash
   cd mobile
   npm install react-native-ble-advertiser --save
   ```

2. Link native modules (if autolinking fails)
   ```bash
   # iOS
   cd ios && pod install && cd ..
   
   # Android - autolinking should handle it
   ```

3. Update `app.json` permissions
   - Add iOS Bluetooth permissions
   - Add Android `BLUETOOTH_ADVERTISE` permission

4. Configure iOS Info.plist
   - Add `NSBluetoothAlwaysUsageDescription`
   - Add `UIBackgroundModes` with `bluetooth-peripheral`

5. Update AndroidManifest.xml
   - Add `BLUETOOTH_ADVERTISE` permission
   - Ensure `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` exist

**Deliverables:**
- ✅ Library installed and linked
- ✅ Permissions configured for both platforms
- ✅ App builds successfully

---

### Phase 2: Create BLEAdvertiser Hook
**Duration:** 2-3 hours  
**Dependencies:** Phase 1 complete

#### File: `mobile/src/components/BLEAdvertiser.tsx`

**Responsibilities:**
- Start/stop BLE advertising
- Manage advertising state
- Handle permissions
- Lifecycle management (start on mount, stop on unmount)
- Error handling

**Interface:**
```typescript
interface UseBLEAdvertiserReturn {
  isAdvertising: boolean;
  startAdvertising: () => Promise<void>;
  stopAdvertising: () => Promise<void>;
  error: string | null;
}
```

**Key Functions:**
- `startAdvertising()`: Start broadcasting Service UUID
- `stopAdvertising()`: Stop broadcasting
- `requestPermissions()`: Request BLE advertising permissions
- `handleAppStateChange()`: Pause/resume advertising based on app state

**Implementation Details:**
- Use `AppState` listener to pause advertising when app goes to background
- Resume advertising when app returns to foreground
- Handle permission denials gracefully
- Log advertising state changes for debugging

**Deliverables:**
- ✅ `BLEAdvertiser.tsx` hook created
- ✅ Start/stop functionality working
- ✅ Permission handling implemented
- ✅ App state lifecycle management

---

### Phase 3: Define Service UUID & Configuration
**Duration:** 30 minutes  
**Dependencies:** Phase 2 complete

#### File: `mobile/src/config/bleConfig.ts`

**Service UUID Design:**
- Generate a unique UUID for DropLink
- Format: Standard 128-bit UUID (e.g., `"12345678-1234-1234-1234-123456789ABC"`)
- Must be consistent across all DropLink instances

**Configuration Constants:**
```typescript
export const DROPLINK_SERVICE_UUID = '12345678-1234-1234-1234-123456789ABC';
export const DROPLINK_DEVICE_PREFIX = 'DropLink-'; // Keep for backward compatibility
export const BLE_ADVERTISING_INTERVAL = 100; // ms (platform-dependent)
```

**UUID Generation:**
- Use online UUID generator: https://www.uuidgenerator.net/
- Ensure UUID is unique and not conflicting with other apps
- Document UUID in code comments

**Deliverables:**
- ✅ Service UUID defined
- ✅ Configuration file created
- ✅ UUID documented

---

### Phase 4: Update BLEScanner to Filter by Service UUID
**Duration:** 1-2 hours  
**Dependencies:** Phase 3 complete

#### File: `mobile/src/components/BLEScanner.tsx`

**Changes Required:**

1. **Import Service UUID:**
   ```typescript
   import { DROPLINK_SERVICE_UUID } from '../config/bleConfig';
   ```

2. **Update `isDropLinkDevice()` function:**
   ```typescript
   const isDropLinkDevice = (device: Device | null): boolean => {
     if (!device) return false;
     
     // Primary: Check Service UUID (most reliable)
     if (device.serviceUUIDs && device.serviceUUIDs.includes(DROPLINK_SERVICE_UUID)) {
       return true;
     }
     
     // Fallback: Check device name prefix (backward compatibility)
     if (device.name && device.name.startsWith(DROPLINK_DEVICE_PREFIX)) {
       return true;
     }
     
     return false;
   };
   ```

3. **Update comments:**
   - Remove "FUTURE" comments
   - Document Service UUID as primary detection method

**Deliverables:**
- ✅ Scanner filters by Service UUID
- ✅ Backward compatibility maintained (name prefix fallback)
- ✅ Code comments updated

---

### Phase 5: Integrate BLEAdvertiser into HomeScreen
**Duration:** 2-3 hours  
**Dependencies:** Phase 2, Phase 4 complete

#### File: `mobile/src/screens/HomeScreen.tsx`

**Integration Points:**

1. **Import BLEAdvertiser hook:**
   ```typescript
   import { useBLEAdvertiser } from '../components/BLEAdvertiser';
   ```

2. **Initialize advertising:**
   ```typescript
   const { isAdvertising, startAdvertising, stopAdvertising, error: advertisingError } = useBLEAdvertiser();
   ```

3. **Start advertising on mount:**
   ```typescript
   useEffect(() => {
     // Start advertising when HomeScreen mounts
     startAdvertising();
     
     return () => {
       // Stop advertising when HomeScreen unmounts
       stopAdvertising();
     };
   }, [startAdvertising, stopAdvertising]);
   ```

4. **Handle app state changes:**
   - Pause advertising when app goes to background
   - Resume advertising when app returns to foreground
   - Use `AppState` listener

5. **Error handling:**
   - Display advertising errors in UI (optional)
   - Log errors for debugging

**Deliverables:**
- ✅ Advertising starts when HomeScreen opens
- ✅ Advertising stops when HomeScreen closes
- ✅ App state changes handled
- ✅ Error handling implemented

---

### Phase 6: Testing & Validation
**Duration:** 4-6 hours  
**Dependencies:** All phases complete

#### Test Cases:

**1. Basic Functionality:**
- [ ] Device A starts advertising
- [ ] Device B detects Device A via Service UUID
- [ ] Device A detects Device B via Service UUID
- [ ] Both devices appear as blips on radar

**2. Permission Handling:**
- [ ] Android: Request `BLUETOOTH_ADVERTISE` permission
- [ ] iOS: Request Bluetooth permissions
- [ ] Handle permission denial gracefully
- [ ] Show appropriate error messages

**3. Lifecycle Management:**
- [ ] Advertising starts when HomeScreen opens
- [ ] Advertising stops when HomeScreen closes
- [ ] Advertising pauses when app goes to background
- [ ] Advertising resumes when app returns to foreground

**4. Edge Cases:**
- [ ] Multiple devices advertising simultaneously
- [ ] Device moves out of range (blip disappears)
- [ ] Device moves into range (blip appears)
- [ ] Bluetooth disabled (error handling)
- [ ] App killed while advertising (cleanup)

**5. Performance:**
- [ ] Battery impact acceptable
- [ ] No app crashes or memory leaks
- [ ] Advertising doesn't interfere with scanning

**6. Backward Compatibility:**
- [ ] Devices with name prefix still detected (fallback)
- [ ] Existing scanning code still works
- [ ] No breaking changes to existing functionality

**Deliverables:**
- ✅ All test cases passed
- ✅ No regressions in existing functionality
- ✅ Performance acceptable
- ✅ Documentation updated

---

## 4. Technical Specifications

### Service UUID Format

**Standard UUID Format:**
```
12345678-1234-1234-1234-123456789ABC
```

**Components:**
- 8 hex digits - 4 hex digits - 4 hex digits - 4 hex digits - 12 hex digits
- Total: 32 hex digits + 4 hyphens = 36 characters

**Generation:**
- Use UUID v4 (random) generator
- Ensure uniqueness (very low collision probability)
- Document UUID in code and README

### Advertising Data Structure

**Required:**
- Service UUID: `DROPLINK_SERVICE_UUID`
- Device name: Optional (can be user's DropLink username)

**Optional (Future Enhancement):**
- User ID in manufacturer data
- Profile photo hash
- Status (available, busy, etc.)

### Advertising Interval

**Platform-Specific:**
- **iOS:** 20ms - 10.24s (recommended: 100-200ms)
- **Android:** 20ms - 10.24s (recommended: 100-200ms)

**Trade-offs:**
- Faster interval = more battery drain
- Slower interval = less responsive detection

**Recommendation:** Start with 100ms, adjust based on testing

---

## 5. Platform-Specific Requirements

### iOS Requirements

#### Permissions (`Info.plist`):
```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>DropLink requires Bluetooth access to detect nearby users and make your device discoverable.</string>

<key>UIBackgroundModes</key>
<array>
    <string>bluetooth-peripheral</string>
</array>
```

#### Background Advertising Limitations:
- iOS restricts background advertising
- Local name not advertised in background
- Service UUIDs placed in "overflow area" (only discoverable by iOS devices)
- **Recommendation:** Pause advertising when app goes to background

#### Xcode Configuration:
- Enable "Uses Bluetooth LE Accessories" capability
- Add to "Signing & Capabilities" tab

### Android Requirements

#### Permissions (`AndroidManifest.xml`):
```xml
<!-- Existing permissions -->
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />

<!-- NEW: Required for advertising -->
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />

<!-- Location permission (required for BLE scanning) -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

#### Runtime Permissions (Android 12+):
- Request `BLUETOOTH_ADVERTISE` at runtime
- Request `BLUETOOTH_SCAN` at runtime (if not already requested)
- Handle permission denial gracefully

#### AndroidManifest.xml Updates:
```xml
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE"
    android:usesPermissionFlags="neverForLocation" />
```

### Web Platform

**Not Supported:**
- BLE advertising not available on web
- `BLEAdvertiser` should return early on web platform
- No errors thrown, just silent no-op

---

## 6. Integration Points

### Files to Modify

1. **`mobile/package.json`**
   - Add `react-native-ble-advertiser` dependency

2. **`mobile/app.json`**
   - Add iOS Bluetooth permissions
   - Add Android `BLUETOOTH_ADVERTISE` permission

3. **`mobile/src/config/bleConfig.ts`** (NEW)
   - Define Service UUID
   - Export configuration constants

4. **`mobile/src/components/BLEAdvertiser.tsx`** (NEW)
   - Create advertising hook
   - Implement start/stop functionality
   - Handle permissions and lifecycle

5. **`mobile/src/components/BLEScanner.tsx`**
   - Update `isDropLinkDevice()` to check Service UUID
   - Import Service UUID from config
   - Maintain backward compatibility

6. **`mobile/src/screens/HomeScreen.tsx`**
   - Import and use `useBLEAdvertiser` hook
   - Start advertising on mount
   - Stop advertising on unmount
   - Handle app state changes

### Files to Create

1. **`mobile/src/config/bleConfig.ts`** - BLE configuration constants
2. **`mobile/src/components/BLEAdvertiser.tsx`** - Advertising hook

### Dependencies

**New Dependencies:**
- `react-native-ble-advertiser` - BLE advertising library

**Existing Dependencies (No Changes):**
- `react-native-ble-plx` - BLE scanning (already installed)
- `react-native` - Core React Native (already installed)

---

## 7. Testing Strategy

### Unit Tests

**BLEAdvertiser Hook:**
- Test `startAdvertising()` function
- Test `stopAdvertising()` function
- Test permission handling
- Test error states

**BLEScanner Updates:**
- Test `isDropLinkDevice()` with Service UUID
- Test `isDropLinkDevice()` with name prefix (backward compatibility)
- Test filtering logic

### Integration Tests

**End-to-End Flow:**
1. Device A starts advertising
2. Device B scans and detects Device A
3. Device A scans and detects Device B
4. Both devices appear as blips
5. User can tap blip to open modal

### Manual Testing Checklist

**Setup:**
- [ ] Two physical devices (iOS/Android)
- [ ] Both devices have DropLink installed
- [ ] Both devices have Bluetooth enabled
- [ ] Both devices have location permissions granted

**Test Scenarios:**

1. **Basic Detection:**
   - [ ] Open DropLink on Device A
   - [ ] Open DropLink on Device B
   - [ ] Device A appears as blip on Device B's radar
   - [ ] Device B appears as blip on Device A's radar

2. **Permission Handling:**
   - [ ] Deny Bluetooth permission on Device A
   - [ ] Verify error message displayed
   - [ ] Verify advertising doesn't start
   - [ ] Grant permission and verify advertising starts

3. **Lifecycle:**
   - [ ] Start advertising on Device A
   - [ ] Put Device A in background
   - [ ] Verify advertising pauses (or continues based on platform)
   - [ ] Bring Device A to foreground
   - [ ] Verify advertising resumes

4. **Edge Cases:**
   - [ ] Disable Bluetooth while advertising
   - [ ] Kill app while advertising
   - [ ] Multiple devices advertising simultaneously
   - [ ] Device moves out of range

5. **Performance:**
   - [ ] Monitor battery usage during advertising
   - [ ] Check for memory leaks
   - [ ] Verify no app crashes

### Test Devices

**Recommended:**
- iPhone (iOS 14+)
- Android phone (Android 10+)
- Test both iOS-to-iOS and Android-to-Android
- Test cross-platform (iOS-to-Android)

---

## 8. Rollout Plan

### Pre-Implementation

1. **Review Plan:**
   - Review with team
   - Get approval for Service UUID
   - Confirm library choice

2. **Prepare Development Environment:**
   - Ensure Xcode installed (for iOS)
   - Ensure Android Studio installed (for Android)
   - Test devices available

### Implementation

1. **Phase 1-2:** Library installation and basic advertising hook (Day 1)
2. **Phase 3-4:** Service UUID configuration and scanner updates (Day 1-2)
3. **Phase 5:** HomeScreen integration (Day 2)
4. **Phase 6:** Testing and bug fixes (Day 3-4)

### Post-Implementation

1. **Documentation:**
   - Update README with BLE advertising details
   - Document Service UUID
   - Update architecture documentation

2. **Monitoring:**
   - Monitor for crashes related to BLE advertising
   - Monitor battery usage reports
   - Collect user feedback

3. **Iteration:**
   - Adjust advertising interval based on feedback
   - Optimize battery usage
   - Add features (user ID in advertisement, etc.)

---

## 9. Code Examples

### BLEAdvertiser Hook (Simplified)

```typescript
import { useState, useEffect, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import BleAdvertiser from 'react-native-ble-advertiser';
import { DROPLINK_SERVICE_UUID } from '../config/bleConfig';

export const useBLEAdvertiser = () => {
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startAdvertising = useCallback(async () => {
    if (Platform.OS === 'web') return; // Not supported on web
    
    try {
      // Request permissions first
      const hasPermission = await requestAdvertisingPermissions();
      if (!hasPermission) {
        setError('Bluetooth advertising permission denied');
        return;
      }

      // Start advertising with Service UUID
      await BleAdvertiser.startAdvertising({
        serviceUUIDs: [DROPLINK_SERVICE_UUID],
        localName: 'DropLink', // Optional
      });
      
      setIsAdvertising(true);
      setError(null);
    } catch (err) {
      setError(err.message);
      setIsAdvertising(false);
    }
  }, []);

  const stopAdvertising = useCallback(async () => {
    if (Platform.OS === 'web') return;
    
    try {
      await BleAdvertiser.stopAdvertising();
      setIsAdvertising(false);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Pause advertising when app goes to background (iOS limitation)
        if (Platform.OS === 'ios') {
          stopAdvertising();
        }
      } else if (nextAppState === 'active') {
        // Resume advertising when app returns to foreground
        startAdvertising();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [startAdvertising, stopAdvertising]);

  return {
    isAdvertising,
    startAdvertising,
    stopAdvertising,
    error,
  };
};
```

### Updated BLEScanner Filter

```typescript
import { DROPLINK_SERVICE_UUID, DROPLINK_DEVICE_PREFIX } from '../config/bleConfig';

const isDropLinkDevice = (device: Device | null): boolean => {
  if (!device) return false;
  
  // Primary: Check Service UUID (most reliable)
  if (device.serviceUUIDs && device.serviceUUIDs.includes(DROPLINK_SERVICE_UUID)) {
    return true;
  }
  
  // Fallback: Check device name prefix (backward compatibility)
  if (device.name && device.name.startsWith(DROPLINK_DEVICE_PREFIX)) {
    return true;
  }
  
  return false;
};
```

---

## 10. Risk Assessment

### Technical Risks

**Risk 1: Library Compatibility Issues**
- **Probability:** Medium
- **Impact:** High
- **Mitigation:** Test on multiple devices and OS versions before rollout

**Risk 2: Battery Drain**
- **Probability:** Medium
- **Impact:** Medium
- **Mitigation:** Optimize advertising interval, monitor battery usage

**Risk 3: iOS Background Limitations**
- **Probability:** High
- **Impact:** Medium
- **Mitigation:** Pause advertising in background, document limitation

**Risk 4: Permission Denial**
- **Probability:** Low
- **Impact:** High
- **Mitigation:** Clear permission request messages, graceful error handling

### Business Risks

**Risk 1: User Adoption**
- **Probability:** Low
- **Impact:** Low
- **Mitigation:** Feature works automatically, no user action required

**Risk 2: Privacy Concerns**
- **Probability:** Low
- **Impact:** Medium
- **Mitigation:** Only broadcast Service UUID, no personal data

---

## 11. Success Criteria

### Functional Requirements
- ✅ Devices can detect each other via Service UUID
- ✅ No manual device name changes required
- ✅ Backward compatibility maintained (name prefix still works)
- ✅ Advertising starts/stops automatically

### Non-Functional Requirements
- ✅ Battery impact < 5% per hour of advertising
- ✅ No app crashes related to advertising
- ✅ Permission handling works on both platforms
- ✅ Lifecycle management works correctly

### User Experience
- ✅ Seamless detection (no user action required)
- ✅ Clear error messages if advertising fails
- ✅ No noticeable performance impact

---

## 12. Future Enhancements

### Phase 2 Features (Post-Initial Implementation)

1. **User ID in Advertisement:**
   - Include user ID in manufacturer data
   - Enable faster profile lookup
   - Reduce API calls

2. **Profile Data in Advertisement:**
   - Broadcast basic profile info (name, photo hash)
   - Enable offline profile viewing
   - Reduce backend dependency

3. **Status Broadcasting:**
   - Available, busy, away status
   - Custom status messages
   - Privacy controls

4. **Background Advertising (iOS):**
   - Research iOS background advertising options
   - Implement if feasible
   - Optimize for battery life

5. **Advertising Analytics:**
   - Track how many devices detect each other
   - Measure detection success rate
   - Optimize advertising parameters

---

## 13. Documentation Updates Required

### Files to Update

1. **`README.md`**
   - Add BLE advertising section
   - Document Service UUID
   - Update architecture diagram
   - Add troubleshooting section

2. **`mobile/ARCHITECTURE.md`**
   - Update BLE architecture section
   - Document advertising flow
   - Update data flow diagrams

3. **`mobile/src/components/BLEAdvertiser.tsx`**
   - Add JSDoc comments
   - Document all functions
   - Include usage examples

4. **`mobile/src/config/bleConfig.ts`**
   - Document Service UUID
   - Explain configuration options
   - Include UUID generation notes

---

## 14. Timeline Estimate

**Total Estimated Time:** 2-3 days

**Breakdown:**
- Phase 1 (Library Installation): 1-2 hours
- Phase 2 (BLEAdvertiser Hook): 2-3 hours
- Phase 3 (Service UUID Config): 30 minutes
- Phase 4 (Scanner Updates): 1-2 hours
- Phase 5 (HomeScreen Integration): 2-3 hours
- Phase 6 (Testing): 4-6 hours
- Documentation: 2-3 hours

**Buffer Time:** 4-6 hours for unexpected issues

**Total:** 12-20 hours (1.5-2.5 days)

---

## 15. Conclusion

This plan provides a comprehensive roadmap for implementing BLE advertising in DropLink. The implementation will enable automatic mutual detection between DropLink users without requiring manual device name changes.

**Key Success Factors:**
1. Choose the right library (`react-native-ble-advertiser`)
2. Implement proper permission handling
3. Manage lifecycle correctly (start/stop advertising)
4. Test thoroughly on both platforms
5. Maintain backward compatibility

**Next Steps:**
1. Review and approve this plan
2. Generate and document Service UUID
3. Begin Phase 1 implementation
4. Test incrementally after each phase

---

**Document Version:** 1.0  
**Last Updated:** December 2024  
**Author:** AI Assistant  
**Status:** Ready for Implementation

