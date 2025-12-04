# Blips Not Appearing on HomeScreen Grid/Radar - Diagnostic Document

## 1. ISSUE DESCRIPTION

### Expected Behavior
- Blips (green dots) should appear on the radar/grid representing nearby BLE devices
- Blips should be positioned based on device distance and angle
- Blips should pulse at different speeds based on distance (closer = faster pulse)
- Blips should be tappable to open a modal for sending drops
- Grid should show devices within the `maxDistance` setting (default 33 feet)

### Actual Behavior
**TO BE FILLED BY USER:** Please describe exactly what you're seeing:
- [ ] Empty grid with no blips at all
- [ ] Grid appears but no blips even when devices are nearby
- [ ] Blips appear briefly then disappear
- [ ] Blips appear but are positioned incorrectly
- [ ] Blips appear but are not tappable
- [ ] Other: _______________

---

## 2. COMMIT HISTORY ANALYSIS

**NOTE: Git commands disabled per user request. Please provide the following information:**

### Required Git History Information:
1. **HomeScreen.tsx commits:**
   ```
   Please run: git log --oneline -30 -- mobile/src/screens/HomeScreen.tsx
   And provide the output
   ```

2. **BLE Scanner commits:**
   ```
   Please run: git log --oneline -30 -- mobile/src/components/BLEScanner.tsx
   And provide the output
   ```

3. **Blip-related commits:**
   ```
   Please run: git log --oneline --all --grep="blip" -20
   And provide the output
   ```

4. **Radar/grid-related commits:**
   ```
   Please run: git log --oneline --all --grep="radar" -20
   git log --oneline --all --grep="grid" -20
   And provide the output
   ```

### Partial History (from interrupted command):
```
57bb96a Implement Supabase-persisted tutorial system - simple, clean, rock-solid
1a84ff4 Remove all tutorial functionality - keep UI components only
cf0a723 Simplify tutorial system - remove backend logic, keep UI only
781115a Remove all emojis from codebase - improve professionalism and log parsing
3f8d538 Auto-backup: 2025-11-30_18-26-29
f59cd80 Add visible error logging to profile photo upload and remove debug logs from HomeScreen
e61e63b Auto-backup: 2025-11-26_11-11-52
9cd9579 Remove Supabase connection test from HomeScreen - connection verified working
9e1ee1f Update Supabase connection test to display full error message for debugging
f7ba393 Move Supabase connection test from App.tsx to HomeScreen with visible status indicator
995b02d Remove OTA test banner and fix raindrop positioning
ddb1860 Add OTA test banner and fix water drop position
4f01561 Fix "No drops nearby" text rotation
```

---

## 3. RECENT CHANGES

**TO BE FILLED BY USER:**
- **Last commit where blips were working:** _______________
- **Commits made after that:** _______________
- **Were any commits reverted?** [ ] Yes [ ] No
  - If yes, which ones: _______________
  - Why were they reverted: _______________

---

## 4. HYPOTHESES TESTED

**TO BE FILLED BY USER:** For each debugging attempt, please provide:

### Hypothesis 1:
- **What was the hypothesis?** _______________
- **What code change was made?** _______________
- **What was the result?** _______________
- **Was it kept or reverted?** [ ] Kept [ ] Reverted

### Hypothesis 2:
- **What was the hypothesis?** _______________
- **What code change was made?** _______________
- **What was the result?** _______________
- **Was it kept or reverted?** [ ] Kept [ ] Reverted

### Hypothesis 3:
- **What was the hypothesis?** _______________
- **What code change was made?** _______________
- **What was the result?** _______________
- **Was it kept or reverted?** [ ] Kept [ ] Reverted

---

## 5. CURRENT STATE ANALYSIS

### 5.1 Blip Rendering Logic (HomeScreen.tsx, Lines 1537-1556)

**Location:** `mobile/src/screens/HomeScreen.tsx:1537-1556`

```typescript
{filteredDevices.map((device) => {
  const position = getGridPosition(device);

  return (
    <DeviceBlip
      key={device.id || device.name}
      device={device}
      position={{ x: position.x, y: position.y }}
      depth={position.z}
      nucleusX={nucleusX}
      nucleusY={nucleusY}
      viewTransform={viewTransformTensor}
      onPress={() => {
        console.log('SUCCESS: Blip press handler called for:', device.name);
        setSelectedBlipDevice(device);
        setShowBlipModal(true);
      }}
    />
  );
})}
```

**Key Points:**
- Blips are rendered from `filteredDevices` array
- Each device is mapped to a position using `getGridPosition()`
- `DeviceBlip` component receives position, transform, and press handler

### 5.2 Data Source for Blips (HomeScreen.tsx, Lines 602, 767)

**BLE Scanner Hook (Line 602):**
```typescript
const { devices, isScanning, startScan, stopScan } = useBLEScanner();
```

**Filtered Devices (Line 767):**
```typescript
const filteredDevices = devices.filter(device => device.distanceFeet <= maxDistance);
```

**Key Points:**
- Data originates from `useBLEScanner()` hook
- Devices are filtered by `maxDistance` (default 33 feet)
- `devices` is an array of `BleDevice` objects

### 5.3 BLE Scanner Implementation (BLEScanner.tsx)

**File:** `mobile/src/components/BLEScanner.tsx`

**Key Features:**
- **Platform Check (Line 69-71):** Returns early on web platform (no BLE available)
- **10-Second Timeout (Lines 105-108):** Scanning stops after 10 seconds
- **Device Detection (Lines 88-102):** Only adds devices with a `name` property
- **Distance Calculation (Lines 30-34):** Uses RSSI to calculate distance in feet

**Critical Code Sections:**

```typescript
// Line 64-109: Start scanning
const startScan = useCallback(async () => {
  setError(null);
  setDevices([]);  // ← Clears devices at start
  
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

    if (device && device.name) {  // ← Only devices with names are added
      setDevices(prevDevices => {
        const exists = prevDevices.find(d => d.id === device.id);
        if (!exists) {
          const distanceFeet = calculateDistanceFeet(device.rssi || -100);
          return [...prevDevices, {
            id: device.id,
            name: device.name || 'Unknown Device',
            rssi: device.rssi || -100,
            distanceFeet,
          }];
        }
        return prevDevices;
      });
    }
  });

  // Stop scanning after 10 seconds
  setTimeout(() => {
    stopScan();
  }, 10000);
}, [requestPermissions, calculateDistanceFeet]);
```

**Potential Issues:**
1. **10-second timeout:** Scanning stops after 10 seconds, so devices discovered after that won't appear
2. **Name requirement:** Only devices with `device.name` are added (line 88)
3. **No device updates:** Existing devices aren't updated with new RSSI/distance values
4. **Web platform:** Returns early on web (no BLE support)

### 5.4 useEffect Hooks Related to Blips

**No explicit useEffect found that starts BLE scanning automatically.**

**Search Results:**
- No `useEffect` that calls `startScan()` on mount
- No `useEffect` that monitors `devices` array changes
- No `useEffect` that refreshes device list

**This is a potential issue:** BLE scanning may not be starting automatically when HomeScreen mounts.

### 5.5 DeviceBlip Component (HomeScreen.tsx, Lines 364-492)

**Component Definition:**
```typescript
const DeviceBlip: React.FC<{
  device: BleDevice;
  position: { x: number; y: number };
  nucleusX: number;
  nucleusY: number;
  viewTransform: Tensor2x2;
  depth?: number;
  onPress: () => void;
}> = ({ device, position, nucleusX, nucleusY, viewTransform, depth = 0, onPress }) => {
  // ... animation logic ...
  
  // Apply view transformation (rotation + zoom) to position
  const transformedPosition = TensorMath.transformVector(viewTransform, position);
  
  // ... rendering ...
  
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        onPress();
      }}
      style={{
        position: 'absolute',
        left: nucleusX + transformedPosition.x - (hitAreaSize / 2),
        top: nucleusY + transformedPosition.y - (hitAreaSize / 2),
        width: hitAreaSize,
        height: hitAreaSize,
        // ...
      }}
    >
      <Animated.View
        style={{
          width: BLIP_SIZE,
          height: BLIP_SIZE,
          borderRadius: BLIP_SIZE / 2,
          backgroundColor: '#00FF00',
          // ...
        }}
      />
    </Pressable>
  );
};
```

**Key Points:**
- Blip is positioned using `nucleusX/Y` + `transformedPosition`
- Position is transformed by `viewTransform` (rotation/zoom)
- Blip is green (`#00FF00`) with size 6 pixels
- Has a 30px hit area for tapping

---

## 6. DATA FLOW TRACE

### 6.1 Data Origin

**Step 1: BLE Scan Initiation**
- **Location:** `BLEScanner.tsx:startScan()`
- **Trigger:** Manual call (no automatic trigger found)
- **Action:** Starts `bleManager.startDeviceScan()`

**Step 2: Device Discovery**
- **Location:** `BLEScanner.tsx:80-103`
- **Callback:** `(error, device) => { ... }`
- **Filter:** Only devices with `device.name` are processed
- **Storage:** Added to `devices` state array

**Step 3: Distance Calculation**
- **Location:** `BLEScanner.tsx:30-34`
- **Formula:** `distanceMeters = 10^((measuredPower - rssi) / (10 * 2))`
- **Conversion:** Meters to feet (× 3.28084)

### 6.2 Data Storage

**State Management:**
- **Location:** `BLEScanner.tsx:25`
- **State:** `const [devices, setDevices] = useState<BleDevice[]>([]);`
- **Type:** Array of `BleDevice` objects
- **Lifetime:** Cleared on each `startScan()` call (line 66)

### 6.3 Data Flow to Render

**Step 1: Hook Usage**
- **Location:** `HomeScreen.tsx:602`
- **Code:** `const { devices, isScanning, startScan, stopScan } = useBLEScanner();`
- **Result:** `devices` array from BLE scanner

**Step 2: Filtering**
- **Location:** `HomeScreen.tsx:767`
- **Code:** `const filteredDevices = devices.filter(device => device.distanceFeet <= maxDistance);`
- **Result:** Only devices within `maxDistance` (default 33 feet)

**Step 3: Position Calculation**
- **Location:** `HomeScreen.tsx:794-870`
- **Function:** `getGridPosition(device)`
- **Result:** `{ x, y, z }` position coordinates

**Step 4: Rendering**
- **Location:** `HomeScreen.tsx:1537-1556`
- **Code:** `filteredDevices.map((device) => <DeviceBlip ... />)`
- **Result:** Rendered blips on screen

### 6.4 Conditions Controlling Blip Rendering

**Condition 1: Platform Check**
- **Location:** `BLEScanner.tsx:69-71`
- **Condition:** `if (Platform.OS === 'web') return;`
- **Impact:** No devices on web platform

**Condition 2: Permissions**
- **Location:** `BLEScanner.tsx:73-76`
- **Condition:** `if (!hasPermissions) return;`
- **Impact:** No devices if permissions denied

**Condition 3: Device Name**
- **Location:** `BLEScanner.tsx:88`
- **Condition:** `if (device && device.name)`
- **Impact:** Only named devices are added

**Condition 4: Distance Filter**
- **Location:** `HomeScreen.tsx:767`
- **Condition:** `device.distanceFeet <= maxDistance`
- **Impact:** Only devices within range are rendered

**Condition 5: Array Length**
- **Location:** `HomeScreen.tsx:1537`
- **Condition:** `filteredDevices.map(...)`
- **Impact:** Empty array = no blips rendered

---

## 7. POTENTIAL ROOT CAUSES

### 7.1 Most Likely Causes (Ordered by Probability)

#### **Cause 1: BLE Scanning Not Started Automatically** ⚠️ HIGH PROBABILITY
- **Evidence:** No `useEffect` found that calls `startScan()` on HomeScreen mount
- **Impact:** `devices` array remains empty
- **Fix:** Add `useEffect(() => { startScan(); }, [])` in HomeScreen

#### **Cause 2: 10-Second Scan Timeout** ⚠️ HIGH PROBABILITY
- **Evidence:** `BLEScanner.tsx:105-108` stops scanning after 10 seconds
- **Impact:** Devices discovered after 10 seconds won't appear
- **Fix:** Remove timeout or make it configurable

#### **Cause 3: Platform Check (Web Development)** ⚠️ MEDIUM PROBABILITY
- **Evidence:** `BLEScanner.tsx:69-71` returns early on web
- **Impact:** No BLE devices on web platform
- **Fix:** Add mock data for web development

#### **Cause 4: Device Name Requirement** ⚠️ MEDIUM PROBABILITY
- **Evidence:** `BLEScanner.tsx:88` only adds devices with names
- **Impact:** Devices without names are ignored
- **Fix:** Use device ID or generate name for unnamed devices

#### **Cause 5: Permissions Not Granted** ⚠️ MEDIUM PROBABILITY
- **Evidence:** `BLEScanner.tsx:73-76` returns if permissions denied
- **Impact:** No devices if permissions not granted
- **Fix:** Check permission status and show error message

#### **Cause 6: Distance Filter Too Restrictive** ⚠️ LOW PROBABILITY
- **Evidence:** `HomeScreen.tsx:767` filters by `maxDistance`
- **Impact:** Devices beyond range won't appear
- **Fix:** Check `maxDistance` value (should be 33 feet default)

#### **Cause 7: Position Calculation Error** ⚠️ LOW PROBABILITY
- **Evidence:** Complex `getGridPosition()` function with sphere projection
- **Impact:** Blips may be positioned off-screen
- **Fix:** Add console logs to verify position values

#### **Cause 8: Transform/Coordinate Mismatch** ⚠️ LOW PROBABILITY
- **Evidence:** `DeviceBlip` uses `viewTransform` for positioning
- **Impact:** Blips may be rendered but not visible due to transform
- **Fix:** Verify transform calculations

---

## 8. RECOMMENDED NEXT STEPS

### Step 1: Verify BLE Scanning is Starting
**Action:** Add console logging to verify scan initiation
**Location:** `HomeScreen.tsx` after line 602
**Code:**
```typescript
useEffect(() => {
  console.log('🔍 [DIAGNOSTIC] HomeScreen mounted, starting BLE scan');
  startScan();
  return () => {
    console.log('🔍 [DIAGNOSTIC] HomeScreen unmounting, stopping BLE scan');
    stopScan();
  };
}, []);
```

### Step 2: Add Diagnostic Logging to BLE Scanner
**Action:** Log device discovery and filtering
**Location:** `BLEScanner.tsx:88-102`
**Code:**
```typescript
if (device && device.name) {
  console.log('📱 [DIAGNOSTIC] BLE device discovered:', {
    id: device.id,
    name: device.name,
    rssi: device.rssi,
    hasName: !!device.name,
  });
  // ... existing code ...
} else {
  console.log('⚠️ [DIAGNOSTIC] Device ignored (no name):', {
    id: device?.id,
    name: device?.name,
  });
}
```

### Step 3: Log Filtered Devices
**Action:** Log filtered devices array
**Location:** `HomeScreen.tsx` after line 767
**Code:**
```typescript
const filteredDevices = devices.filter(device => device.distanceFeet <= maxDistance);

console.log('🔍 [DIAGNOSTIC] Device filtering:', {
  totalDevices: devices.length,
  filteredDevices: filteredDevices.length,
  maxDistance,
  devices: devices.map(d => ({
    name: d.name,
    distanceFeet: d.distanceFeet,
    withinRange: d.distanceFeet <= maxDistance,
  })),
});
```

### Step 4: Verify Position Calculations
**Action:** Log position values for each device
**Location:** `HomeScreen.tsx:1537-1556`
**Code:**
```typescript
{filteredDevices.map((device) => {
  const position = getGridPosition(device);
  console.log('📍 [DIAGNOSTIC] Blip position:', {
    deviceName: device.name,
    position,
    nucleusX,
    nucleusY,
    screenWidth,
    screenHeight,
  });
  // ... rest of code ...
})}
```

### Step 5: Check Platform
**Action:** Verify platform detection
**Location:** `HomeScreen.tsx` after line 602
**Code:**
```typescript
console.log('🔍 [DIAGNOSTIC] Platform:', Platform.OS);
console.log('🔍 [DIAGNOSTIC] BLE Scanner state:', {
  devicesCount: devices.length,
  isScanning,
  error,
});
```

### Step 6: Test with Mock Data
**Action:** Temporarily add mock devices to verify rendering
**Location:** `HomeScreen.tsx` after line 767
**Code:**
```typescript
// TEMPORARY: Mock data for testing
const mockDevices: BleDevice[] = [
  {
    id: 'mock-1',
    name: 'Test Device 1',
    rssi: -60,
    distanceFeet: 10,
  },
  {
    id: 'mock-2',
    name: 'Test Device 2',
    rssi: -70,
    distanceFeet: 20,
  },
];

const filteredDevices = [...devices, ...mockDevices].filter(device => device.distanceFeet <= maxDistance);
```

### Step 7: Check Permissions
**Action:** Verify Bluetooth permissions are granted
**Location:** `BLEScanner.tsx:37-61`
**Code:**
```typescript
const requestPermissions = useCallback(async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.requestMultiple([...]);
      console.log('🔍 [DIAGNOSTIC] Permission results:', granted);
      // ... rest of code ...
    }
  }
  return true;
}, []);
```

### Step 8: Remove 10-Second Timeout (If Needed)
**Action:** Make scanning continuous or configurable
**Location:** `BLEScanner.tsx:105-108`
**Code:**
```typescript
// REMOVE OR COMMENT OUT:
// setTimeout(() => {
//   stopScan();
// }, 10000);

// OR make it configurable:
// const SCAN_DURATION = 30000; // 30 seconds
// setTimeout(() => {
//   stopScan();
// }, SCAN_DURATION);
```

---

## 9. DEBUGGING CHECKLIST

Use this checklist to systematically diagnose the issue:

- [ ] **Platform Check:** Verify you're testing on iOS/Android (not web)
- [ ] **BLE Scanning:** Confirm `startScan()` is being called
- [ ] **Permissions:** Verify Bluetooth permissions are granted
- [ ] **Device Discovery:** Check console for "BLE device discovered" logs
- [ ] **Device Filtering:** Verify devices are within `maxDistance`
- [ ] **Array State:** Confirm `filteredDevices.length > 0`
- [ ] **Position Calculation:** Verify position values are valid
- [ ] **Rendering:** Check if blips are rendered but off-screen
- [ ] **Transform:** Verify `viewTransform` isn't hiding blips
- [ ] **Z-Index:** Check if blips are behind other elements

---

## 10. QUICK FIXES TO TRY

### Fix 1: Add Auto-Start Scanning
```typescript
// In HomeScreen.tsx, add after line 602:
useEffect(() => {
  startScan();
  return () => stopScan();
}, []);
```

### Fix 2: Remove 10-Second Timeout
```typescript
// In BLEScanner.tsx, comment out lines 105-108:
// setTimeout(() => {
//   stopScan();
// }, 10000);
```

### Fix 3: Add Mock Data for Testing
```typescript
// In HomeScreen.tsx, after line 767:
const mockDevices: BleDevice[] = Platform.OS === 'web' ? [
  { id: 'mock-1', name: 'Test Device', rssi: -60, distanceFeet: 15 },
] : [];

const filteredDevices = [...devices, ...mockDevices].filter(device => device.distanceFeet <= maxDistance);
```

---

## END OF DIAGNOSTIC DOCUMENT

**Next Action:** Fill in sections 1-4 with user-provided information, then proceed with debugging steps 5-8.

