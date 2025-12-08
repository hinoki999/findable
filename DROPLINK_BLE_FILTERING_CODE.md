# Complete DropLink BLE Filtering Code Changes

## Overview
This document shows the complete, synergetic code changes to filter BLE scanning to only detect DropLink users.

---

## File 1: `mobile/src/components/BLEScanner.tsx`

### Complete File (After Changes)

```typescript
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

export interface BleDevice {
  id: string;
  name: string;
  rssi: number;
  distanceFeet: number;
  bio?: string;
}

interface UseBLEScannerReturn {
  devices: BleDevice[];
  isScanning: boolean;
  startScan: () => void;
  stopScan: () => void;
  error: string | null;
  startScanCount: number;
}

// Only create BleManager on native platforms (iOS/Android)
const bleManager = Platform.OS !== 'web' ? new BleManager() : null;

// DropLink Device Identifier Configuration
// Devices must have this prefix in their name to be detected as DropLink users
// FUTURE: Can be upgraded to Service UUID filtering when BLE advertising is implemented
const DROPLINK_DEVICE_PREFIX = 'DropLink-';

/**
 * Check if a BLE device is a DropLink user
 * @param device - The BLE device to check
 * @returns true if device is a DropLink user, false otherwise
 */
const isDropLinkDevice = (device: Device | null): boolean => {
  if (!device) return false;
  
  // Check device name for DropLink prefix
  if (device.name && device.name.startsWith(DROPLINK_DEVICE_PREFIX)) {
    return true;
  }
  
  // FUTURE: Add Service UUID check here when advertising is implemented
  // Example:
  // if (device.serviceUUIDs && device.serviceUUIDs.includes(DROPLINK_SERVICE_UUID)) {
  //   return true;
  // }
  
  // FUTURE: Add Manufacturer Data check here if needed
  // Example:
  // if (device.manufacturerData && containsDropLinkIdentifier(device.manufacturerData)) {
  //   return true;
  // }
  
  return false;
};

export const useBLEScanner = (): UseBLEScannerReturn => {
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startScanCountRef = useRef(0);

  // Calculate distance from RSSI using the formula from the original code
  const calculateDistanceFeet = useCallback((rssi: number): number => {
    const measuredPower = -59; // Typical measured power for BLE
    const distanceMeters = Math.pow(10, (measuredPower - rssi) / (10 * 2));
    return distanceMeters * 3.28084; // Convert meters to feet
  }, []);

  // Request necessary permissions for Android
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        
        const allGranted = Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED
        );
        
        if (!allGranted) {
          setError('Bluetooth permissions not granted');
          return false;
        }
      } catch (err) {
        console.warn('Permission request error:', err);
        setError('Failed to request permissions');
        return false;
      }
    }
    return true;
  }, []);

  // Start scanning for BLE devices
  const startScan = useCallback(async () => {
    startScanCountRef.current += 1;
    console.log('[BLE-DEBUG] startScan called, count:', startScanCountRef.current, 'timestamp:', Date.now());
    setError(null);
    // FIX #2: Don't clear devices array - preserve existing devices and update them
    // setDevices([]); // REMOVED - this was causing devices to disappear
    
    // Web platform: BLE is not available, devices will remain empty
    if (Platform.OS === 'web') {
      return;
    }

    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      return;
    }

    setIsScanning(true);

    bleManager!.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error('BLE scan error:', error);
        setError(error.message);
        setIsScanning(false);
        return;
      }

      // Filter: Only process DropLink users (devices with "DropLink-" prefix in name)
      if (device && isDropLinkDevice(device)) {
        setDevices(prevDevices => {
          const exists = prevDevices.find(d => d.id === device.id);
          const distanceFeet = calculateDistanceFeet(device.rssi || -100);
          // DropLink devices should always have a name (required prefix)
          const deviceName = device.name || `DropLink-Unknown (${device.id.substring(0, 8)})`;
          
          if (!exists) {
            // Add new DropLink device
            console.log('[BLE] DropLink device detected:', deviceName, `(${distanceFeet.toFixed(1)}ft)`);
            return [...prevDevices, {
              id: device.id,
              name: deviceName,
              rssi: device.rssi || -100,
              distanceFeet,
            }];
          } else {
            // Update existing DropLink device with new RSSI/distance
            return prevDevices.map(d => 
              d.id === device.id 
                ? { ...d, rssi: device.rssi || -100, distanceFeet }
                : d
            );
          }
        });
      }
      // Non-DropLink devices are silently ignored (filtered out)
    });

    // FIX #3 & #4: Remove 10-second timeout - scanning continues until stopScan() is called
    // Continuous scanning allows devices to be detected and updated in real-time
    // setTimeout(() => {
    //   stopScan();
    // }, 10000); // REMOVED - this was stopping scanning after 10 seconds
  }, [requestPermissions, calculateDistanceFeet]);

  // Stop scanning
  const stopScan = useCallback(() => {
    if (Platform.OS !== 'web' && bleManager) {
      bleManager.stopDeviceScan();
    }
    setIsScanning(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (Platform.OS !== 'web' && bleManager) {
        bleManager.destroy();
      }
    };
  }, []);

  return {
    devices,
    isScanning,
    startScan,
    stopScan,
    error,
    startScanCount: startScanCountRef.current,
  };
};
```

### Key Changes Summary:

1. **Added DropLink Configuration (Lines 24-26):**
   - `DROPLINK_DEVICE_PREFIX = 'DropLink-'` constant
   - Configurable for easy updates

2. **Added Filter Helper Function (Lines 28-50):**
   - `isDropLinkDevice()` checks if device name starts with "DropLink-"
   - Includes comments for future Service UUID upgrade
   - Returns `false` for non-DropLink devices

3. **Modified Device Processing (Lines 93-120):**
   - Changed from `if (device)` to `if (device && isDropLinkDevice(device))`
   - Only DropLink devices are added/updated in the devices array
   - Non-DropLink devices are silently ignored
   - Added console log for detected DropLink devices

---

## File 2: `mobile/src/screens/HomeScreen.tsx`

### No Changes Required ✅

**Why:** HomeScreen already uses `filteredDevices` which comes from the scanner's `devices` array. Since the scanner now only contains DropLink devices, HomeScreen automatically only shows DropLink blips.

**Current Code (Unchanged):**
```typescript
// Line 602: Get devices from scanner (now filtered to DropLink only)
const { devices, isScanning, startScan, stopScan, startScanCount } = useBLEScanner();

// Line 777: Filter by distance (DropLink devices only)
const filteredDevices = devices.filter(device => device.distanceFeet <= maxDistance);

// Line 1547: Render blips (only DropLink devices)
{filteredDevices.map((device) => {
  // ... DeviceBlip rendering
})}
```

---

## File 3: `mobile/src/screens/DropScreen.tsx`

### No Changes Required ✅

**Why:** DropScreen also uses the scanner's `devices` array, which now only contains DropLink devices.

**Current Code (Unchanged):**
```typescript
// Line 37: Get devices from scanner (now filtered to DropLink only)
const { devices, isScanning, startScan, stopScan, error } = useBLEScanner();

// Line 40-42: Filter by distance and sort (DropLink devices only)
const filteredDevices = devices
  .filter(device => device.distanceFeet <= maxDistance)
  .sort((a, b) => a.distanceFeet - b.distanceFeet);
```

---

## Synergy Verification

### Data Flow (All Synergetic):

```
1. BLE Scanner (BLEScanner.tsx)
   └─> Scans ALL BLE devices
   └─> Filters to only DropLink devices (isDropLinkDevice check)
   └─> Returns: devices[] (DropLink users only)

2. HomeScreen.tsx
   └─> Receives: devices[] (DropLink users only)
   └─> Filters by: maxDistance
   └─> Renders: DeviceBlip components (DropLink users only)
   └─> Shows: LinkMarker components (from API, separate system)

3. DropScreen.tsx
   └─> Receives: devices[] (DropLink users only)
   └─> Filters by: maxDistance
   └─> Renders: DeviceCard components (DropLink users only)
```

### Integration Points:

✅ **Scanner → HomeScreen:** Filtered devices flow correctly
✅ **Scanner → DropScreen:** Filtered devices flow correctly
✅ **Link Markers:** Separate system (from API), unaffected
✅ **Modal Functionality:** Works with filtered DropLink devices
✅ **Distance Filtering:** Still works (applied after DropLink filtering)

---

## Testing Requirements

### For Testing DropLink Detection:

**Device Name Requirements:**
- Device name must start with "DropLink-" prefix
- Examples:
  - ✅ "DropLink-John" - Will be detected
  - ✅ "DropLink-User123" - Will be detected
  - ✅ "DropLink-Device" - Will be detected
  - ❌ "John's iPhone" - Will be filtered out
  - ❌ "AirPods Pro" - Will be filtered out
  - ❌ "Unknown Device" - Will be filtered out

**To Test:**
1. Change a test device's Bluetooth name to "DropLink-TestUser"
2. Ensure device is within maxDistance (default 33 ft)
3. Verify blip appears on HomeScreen
4. Verify device appears in DropScreen list
5. Verify modal opens when blip is clicked

---

## Future Upgrade Path (Service UUID)

When BLE advertising is implemented, upgrade `isDropLinkDevice()`:

```typescript
const DROPLINK_SERVICE_UUID = '12345678-1234-1234-1234-123456789ABC';

const isDropLinkDevice = (device: Device | null): boolean => {
  if (!device) return false;
  
  // Primary: Check Service UUID (most reliable)
  if (device.serviceUUIDs && device.serviceUUIDs.includes(DROPLINK_SERVICE_UUID)) {
    return true;
  }
  
  // Fallback: Check device name prefix (for backward compatibility)
  if (device.name && device.name.startsWith(DROPLINK_DEVICE_PREFIX)) {
    return true;
  }
  
  return false;
};
```

**No other code changes needed** - the filtering logic remains the same.

---

## Rollback Instructions

If issues occur, revert by changing line 93 in `BLEScanner.tsx`:

**Current (Filtered):**
```typescript
if (device && isDropLinkDevice(device)) {
```

**Revert to (All Devices):**
```typescript
if (device) {
```

This restores the original behavior of showing all Bluetooth devices.

