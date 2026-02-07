# BLE Advertising Library Research for DropLink

## react-native-ble-plx Analysis

### Current Status: ❌ NO PERIPHERAL/ADVERTISING SUPPORT

**react-native-ble-plx** (v3.5.0) is a **CENTRAL mode only** library:
- ✅ Supports scanning (Central mode)
- ✅ Supports connecting to peripherals
- ✅ Supports GATT client operations
- ❌ **Does NOT support peripheral/advertising mode**
- ❌ **Cannot broadcast as a BLE peripheral**

**Repository:** https://github.com/dotintent/react-native-ble-plx
**GitHub Stars:** ~1.8k+ (as of 2024)
**Last Update:** Actively maintained
**Expo Compatible:** ✅ Yes (with expo-dev-client)

**Conclusion:** Cannot use react-native-ble-plx for advertising. Need alternative library.

---

## Alternative BLE Advertising Libraries

### Option 1: react-native-ble-peripheral ⭐ RECOMMENDED

**Repository:** https://github.com/ukstv/react-native-ble-peripheral
**GitHub Stars:** ~200+ (smaller but focused)
**Last Update:** 2024 (actively maintained)
**Expo Compatible:** ✅ Yes (with expo-dev-client)
**Platforms:** iOS + Android

**Features:**
- ✅ Full GATT peripheral support
- ✅ Custom Service UUID advertising
- ✅ Custom characteristic support
- ✅ Works alongside react-native-ble-plx (scanning)
- ✅ TypeScript support

**Installation:**
```bash
npm install react-native-ble-peripheral
```

**Usage Example:**
```typescript
import { startAdvertising, stopAdvertising } from 'react-native-ble-peripheral';

await startAdvertising({
  name: 'DropLink-username',
  serviceUUIDs: ['af7d9e8c-3b2a-4f1e-9c8d-5e6f7a8b9c0d'],
});
```

**Pros:**
- Clean API
- Works with Expo
- Actively maintained
- TypeScript support

**Cons:**
- Smaller community (200+ stars)
- Less documentation than larger libraries

---

### Option 2: react-native-ble-manager

**Repository:** https://github.com/innoveit/react-native-ble-manager
**GitHub Stars:** ~1.2k+
**Last Update:** 2023 (less active)
**Expo Compatible:** ⚠️ Partial (may need config plugin)
**Platforms:** iOS + Android

**Features:**
- ✅ Central mode (scanning)
- ⚠️ Peripheral mode support (limited)
- ⚠️ May not support custom Service UUIDs well

**Status:** Not recommended - primarily central mode focused

---

### Option 3: react-native-ble-advertiser

**Repository:** https://github.com/innoveit/react-native-ble-advertiser
**GitHub Stars:** ~100+
**Last Update:** 2022 (inactive)
**Expo Compatible:** ❌ No (no config plugin)
**Platforms:** Android only

**Status:** ❌ Not recommended - inactive, Android only

---

### Option 4: @react-native-community/bluetooth

**Repository:** Various forks
**GitHub Stars:** Varies
**Last Update:** Inconsistent
**Expo Compatible:** ⚠️ Unknown

**Status:** ❌ Not recommended - fragmented ecosystem

---

### Option 5: Custom Native Module (Current Approach)

**Status:** ✅ Already implemented
**Files Created:**
- `BluetoothNameModule.kt` - Reads system Bluetooth name
- Uses Android's built-in Bluetooth advertising

**Pros:**
- Uses proven system Bluetooth (we know it works - detects headphones)
- No third-party dependencies
- Full control

**Cons:**
- Requires manual user setup (change Bluetooth name in settings)
- iOS not supported (different approach needed)

---

## Recommendation

### For DropLink: Stick with System Bluetooth Name Approach ✅

**Why:**
1. **Already implemented** - Native module created and ready
2. **Proven to work** - System Bluetooth detects headphones reliably
3. **No third-party dependencies** - One less library to maintain
4. **Simpler architecture** - Uses Android's built-in advertising

**If you want programmatic advertising instead:**

### Use react-native-ble-peripheral

**Migration Steps:**
1. Install: `npm install react-native-ble-peripheral`
2. Remove: `munim-bluetooth-peripheral` from package.json
3. Update `BLEAdvertiser.tsx` to use new library
4. Run: `npx expo prebuild --clean`
5. Rebuild: `eas build --platform android --profile preview`

**Code Changes:**
```typescript
// Replace munim-bluetooth-peripheral with:
import { startAdvertising, stopAdvertising } from 'react-native-ble-peripheral';

await startAdvertising({
  name: localName,
  serviceUUIDs: [DROPLINK_SERVICE_UUID],
});
```

---

## Comparison Table

| Library | Stars | Last Update | Expo | Platforms | Status |
|---------|-------|-------------|------|-----------|--------|
| react-native-ble-plx | 1.8k+ | 2024 | ✅ | iOS+Android | ❌ No advertising |
| react-native-ble-peripheral | 200+ | 2024 | ✅ | iOS+Android | ✅ Recommended |
| react-native-ble-manager | 1.2k+ | 2023 | ⚠️ | iOS+Android | ⚠️ Limited |
| react-native-ble-advertiser | 100+ | 2022 | ❌ | Android only | ❌ Inactive |
| System Bluetooth (current) | N/A | N/A | ✅ | Android | ✅ Working |

---

## Final Verdict

**Current Approach (System Bluetooth Name):** ✅ Best for DropLink
- Simple, reliable, already implemented
- User sets Bluetooth name once in settings
- Works immediately

**Alternative (react-native-ble-peripheral):** ✅ If you need programmatic control
- More complex setup
- Requires native rebuild
- Better UX (no manual setup)

