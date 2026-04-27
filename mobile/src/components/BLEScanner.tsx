import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { Device, State } from 'react-native-ble-plx';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
let permissionsGranted = false;
const BLE_PERMISSIONS_KEY = '@droplink_ble_permissions_granted';
// Set notification handler once at top level
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});
console.log('[PUSH-DEBUG] Notifications.setNotificationHandler registered at top level');
import { DROPLINK_SERVICE_UUID, DROPLINK_MANUFACTURER_ID } from '../config/bleConfig';
import { bleManager } from '../services/bleManager';
import { supabase } from '../services/supabase';

/**
 * Decode base64 manufacturer data and extract userId prefix
 * Uses atob() which is natively available in React Native
 * @param manufacturerData - Base64 encoded manufacturer data from BLE scan
 * @returns userId prefix string or null if not DropLink device
 */
const extractUserIdFromManufacturerData = (manufacturerData: string | null): string | null => {
  if (!manufacturerData) return null;
  
  try {
    // Decode base64 using atob (available in React Native)
    const binaryString = atob(manufacturerData);
    
    if (binaryString.length < 1) return null;
    
    // react-native-ble-plx may return manufacturer data in different formats:
    // Format A: Raw bytes without manufacturer ID prefix (just the deviceId)
    // Format B: [2-byte manufacturer ID (little-endian)] + [deviceId bytes]
    
    // Check if first 2 bytes are manufacturer ID 0xFFFF (little-endian: 0xFF, 0xFF)
    if (binaryString.length >= 3 && 
        binaryString.charCodeAt(0) === 0xFF && 
        binaryString.charCodeAt(1) === 0xFF) {
      // Format B: Skip manufacturer ID, return rest as deviceId
      const deviceId = binaryString.slice(2).trim();
      console.log('[BLE-ID] Extracted deviceId from manufacturer data (format B):', deviceId);
      return deviceId || null;
    }
    
    // Format A: Entire string is the deviceId
    // Verify it looks like a valid hex prefix (8 chars, alphanumeric)
    const deviceId = binaryString.trim();
    if (deviceId.length === 8 && /^[a-f0-9]+$/i.test(deviceId)) {
      console.log('[BLE-ID] Extracted deviceId from manufacturer data (format A):', deviceId);
      return deviceId;
    }
    
    console.log('[BLE-ID] Manufacturer data does not match expected format:', deviceId);
    return null;
  } catch (e) {
    console.error('[BLE-ID] Failed to decode manufacturer data:', e);
    return null;
  }
};
export interface BleDevice {
  id: string;
  name: string;
  rssi: number;
  distanceFeet: number;
  bio?: string;
  serviceUUIDs?: string[]; // Store service UUIDs for filtering in UI
  username?: string; // DropLink username from Supabase lookup
  userId?: string; // User ID from Supabase lookup (for sending drops)
}

export interface RecentScanEntry {
  name: string | null;
  id: string;
  hasDropLinkUUID: boolean;
}

interface UseBLEScannerReturn {
  devices: BleDevice[];
  isScanning: boolean;
  startScan: () => void;
  stopScan: () => void;
  error: string | null;
  startScanCount: number;
  debugLog: string[];
  devicesScanned: number; // Total devices detected
  recentScans: RecentScanEntry[]; // All scanned devices (for debugging)
  addDebugDevice: (device: BleDevice) => void; // Debug: inject a fake device
}

// Use shared BleManager instance from bleManager.ts
// This prevents multiple instances and conflicting state listeners

/**
 * Normalize UUID for comparison (lowercase, no hyphens)
 * Handles UUIDs in different formats: with/without hyphens, different cases
 */
const normalizeUUID = (uuid: string): string => {
  return uuid.toLowerCase().replace(/-/g, '');
};

export const useBLEScanner = (): UseBLEScannerReturn => {
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<string | null>(null);
  const startScanCountRef = useRef(0);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [devicesScanned, setDevicesScanned] = useState(0);
  const [recentScans, setRecentScans] = useState<RecentScanEntry[]>([]);

  // Ref to track scanning state for Bluetooth state listener (prevents stale closures)
  const isScanningRef = useRef(isScanning);
  useEffect(() => {
    isScanningRef.current = isScanning;
  }, [isScanning]);

  // Ref to store rolling RSSI history for smoothing distance calculations
  // Maps device.id to array of last 5 RSSI readings
  const rssiHistoryRef = useRef<Map<string, number[]>>(new Map());

  // Debug logging helper
  const addDebugLog = useCallback((message: string) => {
    const timestamp = Date.now() % 100000; // Last 5 digits for readability
    setDebugLog(prev => [...prev.slice(-9), `${timestamp}: ${message}`]);
  }, []);

  // Calculate distance from RSSI using the formula from the original code
  const calculateDistanceFeet = useCallback((rssi: number): number => {
    const measuredPower = -59; // Typical measured power for BLE
    const distanceMeters = Math.pow(10, (measuredPower - rssi) / (10 * 2));
    return distanceMeters * 3.28084; // Convert meters to feet
  }, []);

  // Request necessary permissions for Android
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    console.log('[PERMS-DEBUG] requestPermissions called, Platform.OS:', Platform.OS);
    
    // Check in-session cache first
    if (permissionsGranted) {
      return true;
    }

    // Check persistent cache
    try {
      const stored = await AsyncStorage.getItem(BLE_PERMISSIONS_KEY);
      console.log('[PERMS-DEBUG] AsyncStorage cached value:', stored);
      if (stored === 'true') {
        permissionsGranted = true;
        return true;
      }
    } catch (err) {
      console.warn('[PERMS-DEBUG] AsyncStorage read error:', err);
    }

    if (Platform.OS === 'android') {
      try {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];

        // Check current status first before requesting
        const checkResults = await Promise.all(
          permissions.map(p => PermissionsAndroid.check(p))
        );
        const alreadyGranted = checkResults.every(result => result === true);
        console.log('[PERMS-DEBUG] Pre-check alreadyGranted:', alreadyGranted);

        if (!alreadyGranted) {
          console.log('[PERMS-DEBUG] Before PermissionsAndroid.requestMultiple...');
          const granted = await PermissionsAndroid.requestMultiple(permissions);
          console.log('[PERMS-DEBUG] After PermissionsAndroid.requestMultiple');
          console.log('[PERMS-DEBUG] Granted object:', JSON.stringify(granted, null, 2));

          const allGranted = Object.values(granted).every(
            permission =>
              permission === PermissionsAndroid.RESULTS.GRANTED ||
              permission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
          );
          console.log('[PERMS-DEBUG] allGranted:', allGranted);

          if (!allGranted) {
            console.log('[PERMS-DEBUG] Not all permissions granted, returning false');
            errorRef.current = 'Bluetooth permissions not granted';
            setError('Bluetooth permissions not granted');
            return false;
          }
        }
      } catch (err) {
        console.warn('Permission request error:', err);
        errorRef.current = 'Failed to request permissions';
        setError('Failed to request permissions');
        return false;
      }
    }

    // Persist granted state
    try {
      await AsyncStorage.setItem(BLE_PERMISSIONS_KEY, 'true');
    } catch (err) {
      console.warn('[PERMS-DEBUG] AsyncStorage write error:', err);
    }

    setTimeout(async () => {
      try {
        await Notifications.requestPermissionsAsync();
      } catch (error) {
        console.warn('[PERMS-DEBUG] Notification permission request error:', error);
      }
    }, 500);

    permissionsGranted = true;
    return true;
  }, []);

  // Start scanning for BLE devices
  const startScan = useCallback(async () => {
    console.log('[BLE-SCAN] startScan ENTRY - timestamp:', Date.now());
    addDebugLog('startScan called');

    // Prevent multiple simultaneous scan starts
    if (isScanning) {
      console.log('[BLE-SCAN] Already scanning - SKIPPING start');
      addDebugLog('startScan: already scanning, skipping');
      console.log('[BLE-DEBUG] Already scanning, skipping startScan call');
      return;
    }

    startScanCountRef.current += 1;
    console.log('[BLE-SCAN] Starting scan #', startScanCountRef.current);
    addDebugLog(`startScan: proceeding (count: ${startScanCountRef.current})`);
    console.log('[BLE-DEBUG] startScan called, count:', startScanCountRef.current, 'timestamp:', Date.now());
    if (errorRef.current !== 'Bluetooth is disabled') {
      errorRef.current = null;
      setError(null);
    }
    // FIX #2: Don't clear devices array - preserve existing devices and update them
    // setDevices([]); // REMOVED - this was causing devices to disappear

    // Web platform: BLE is not available, devices will remain empty
    if (Platform.OS === 'web') {
      console.log('[BLE-SCAN] Web platform - BLE not available');
      console.log('[BLE-DEBUG] Web platform detected, BLE not available');
      return;
    }

    // Ensure bleManager exists
    if (!bleManager) {
      console.error('[BLE-SCAN] bleManager not initialized - ABORT');
      console.error('[BLE-DEBUG] BleManager not initialized');
      errorRef.current = 'Bluetooth manager not available';
      setError('Bluetooth manager not available');
      return;
    }

    console.log('[BLE-SCAN] Requesting permissions...');
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      console.warn('[BLE-SCAN] Permissions denied - ABORT');
      console.warn('[BLE-DEBUG] Permissions not granted, cannot start scan');
      return;
    }

    console.log('[BLE-SCAN] Permissions granted - starting device scan');
    setIsScanning(true);
    addDebugLog('setIsScanning(true)');

    try {
      console.log('[BLE-SCAN] Calling bleManager.startDeviceScan()');
      // Scan for ALL BLE devices (no Service UUID filter) - for testing
      // TODO: Re-enable Service UUID filtering once advertising is working
      bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('[BLE-SCAN] Scan error:', error.message);
          addDebugLog(`scan error: ${error.message}`);
          console.error('[BLE-DEBUG] BLE scan error:', error);
          errorRef.current = error.message;
          setError(error.message);
          setIsScanning(false);
          addDebugLog('setIsScanning(false) - from error');
          return;
        }

        // Add ALL detected devices (no filtering)
        if (device) {
          console.log('[BLE-SCAN] Device found - id:', device.id, 'name:', device.name, 'rssi:', device.rssi);
          console.log('[BLE-ID] RAW BLE detection - device:', JSON.stringify({ id: device.id, name: device.name, rssi: device.rssi, serviceUUIDs: device.serviceUUIDs }, null, 2));
          setDevicesScanned(prev => prev + 1);

          // Check if device has DropLink Service UUID (for recent scans tracking)
          let hasDropLinkUUID = false;
          if (device.serviceUUIDs && device.serviceUUIDs.length > 0) {
            const normalizedDropLinkUUID = normalizeUUID(DROPLINK_SERVICE_UUID);
            hasDropLinkUUID = device.serviceUUIDs.some(
              uuid => normalizeUUID(uuid) === normalizedDropLinkUUID
            );
          }

          // Add to recent scans list (keep all devices, remove duplicates)
          setRecentScans(prev => {
            const newEntry: RecentScanEntry = {
              name: device.name || null,
              id: device.id,
              hasDropLinkUUID,
            };
            // Remove duplicates (same ID) and add new entry at the end
            const filtered = prev.filter(entry => entry.id !== device.id);
            return [...filtered, newEntry];
          });

          // Validate device has required properties
          if (!device.id) {
            return;
          }

          // Extract deviceId from manufacturer data (not device name)
          const deviceId = extractUserIdFromManufacturerData(device.manufacturerData);
          console.log('[BLE-ID] Device:', device.id, 'manufacturerData:', device.manufacturerData, 'extracted deviceId:', deviceId);

          // Lookup username and userId from Supabase if deviceId is found
          if (deviceId) {
            console.log('[BLE-ID] Starting Supabase profile lookup for deviceId:', deviceId);
            (async () => {
              try {
                const normalizedDeviceId = deviceId.toLowerCase().trim();
                let userId: string | null = null;
                let displayName: string | null = null;

                // Query user_profiles via RPC function (handles uuid::text cast server-side)
                // deviceId is first 8 chars of UUID, so we match user_id starting with deviceId
                console.log('[BLE-ID] Calling RPC get_profile_by_user_id_prefix with:', normalizedDeviceId);
                const { data: userProfileData, error: userProfileError } = await supabase
                  .rpc('get_profile_by_user_id_prefix', { prefix: normalizedDeviceId });

                if (userProfileError) {
                  console.error('[BLE-ID] Supabase RPC lookup error:', JSON.stringify(userProfileError, null, 2));
                }

                // RPC returns an array, get first result
                const profile = Array.isArray(userProfileData) ? userProfileData[0] : userProfileData;

                if (!userProfileError && profile) {
                  userId = profile.user_id;
                  // Use name for display, fall back to username, then deviceId
                  displayName = profile.name || profile.username || deviceId || 'User';
                  console.log('[BLE-ID] Profile lookup SUCCESS - userId:', userId, 'displayName:', displayName);
                  console.log('[BLE-ID] Full profile data:', JSON.stringify(profile, null, 2));
                } else {
                  console.log('[BLE-ID] No profile found for deviceId:', deviceId);
                }

                // Update device if found, or use deviceId as fallback
                if (userId) {
                  console.log('[BLE-ID] Updating device with profile - deviceId:', device.id, 'username:', displayName, 'userId:', userId);
                  console.log('[BLE-DUPE] setDevices (profile update) - device.id:', device.id);
                  setDevices(prevDevices => {
                    console.log('[BLE-DUPE] Profile update - prevDevices.length:', prevDevices.length);
                    return prevDevices.map(d =>
                      d.id === device.id
                        ? { ...d, username: displayName || deviceId || 'User', userId: userId }
                        : d
                    );
                  });
                } else {
                  // User not found in database, but device exists - use deviceId as identifier
                  // This allows the device to be displayed even if profile lookup fails
                  console.log('[BLE-ID] Using deviceId as fallback identifier:', deviceId);
                  console.log('[BLE-DUPE] setDevices (deviceId fallback) - device.id:', device.id);
                  setDevices(prevDevices => {
                    console.log('[BLE-DUPE] DeviceId fallback - prevDevices.length:', prevDevices.length);
                    return prevDevices.map(d =>
                      d.id === device.id
                        ? { ...d, username: deviceId, userId: undefined }
                        : d
                    );
                  });
                }
              } catch (err: any) {
                console.error('[BLE-ID] Profile lookup EXCEPTION:', err?.message);
                // Silently fail - device will show without username
              }
            })();
          }

          // Add ALL devices to devices array (no filtering)
          console.log('[BLE-DUPE] About to update devices array - device.id:', device.id, 'device.name:', device.name);
          setDevices(prevDevices => {
            const exists = prevDevices.find(d => d.id === device.id);
            const currentRssi = device.rssi || -100;
            
            // Update RSSI history for rolling average
            const rssiHistory = rssiHistoryRef.current.get(device.id) || [];
            rssiHistory.push(currentRssi);
            // Keep only last 5 readings
            if (rssiHistory.length > 5) {
              rssiHistory.shift();
            }
            rssiHistoryRef.current.set(device.id, rssiHistory);
            
            // Calculate averaged RSSI from history
            const averagedRssi = rssiHistory.reduce((sum, val) => sum + val, 0) / rssiHistory.length;
            const distanceFeet = calculateDistanceFeet(averagedRssi);
            
            // Use device name or generate a fallback name
            const deviceName = device.name || `BLE-Device-${device.id.substring(0, 8)}`;

            console.log('[BLE-DUPE] Dedup check - exists:', !!exists, 'device.id:', device.id, 'prevDevices.length:', prevDevices.length);
            console.log('[BLE-RSSI] Device:', device.id, 'raw:', currentRssi, 'avg:', averagedRssi.toFixed(1), 'history:', rssiHistory.length);
            
            if (!exists) {
              // Add new device (RSSI history already initialized above)
              console.log('[BLE-DUPE] ADDING new device - id:', device.id, 'name:', deviceName, 'arrayLengthBefore:', prevDevices.length, 'arrayLengthAfter:', prevDevices.length + 1);
              console.log('[BLE-ID] New device added to array - using identifier:', deviceName);
              return [...prevDevices, {
                id: device.id,
                name: deviceName,
                rssi: currentRssi,
                distanceFeet,
                serviceUUIDs: device.serviceUUIDs || undefined, // Store service UUIDs for UI filtering
                username: undefined, // Will be populated by async lookup if deviceId found
              }];
            } else {
              // Update existing device with new RSSI/distance (preserve username if already set)
              console.log('[BLE-DUPE] UPDATING existing device - id:', device.id, 'keeping arrayLength:', prevDevices.length);
              return prevDevices.map(d =>
                d.id === device.id
                  ? { ...d, rssi: currentRssi, distanceFeet, serviceUUIDs: device.serviceUUIDs || d.serviceUUIDs }
                  : d
              );
            }
          });
        }
      });
      console.log('[BLE-SCAN] bleManager.startDeviceScan() callback registered');
    } catch (err: any) {
      console.error('[BLE-SCAN] EXCEPTION starting scan:', err?.message);
      console.error('[BLE-SCAN] Full error:', JSON.stringify(err, null, 2));
      addDebugLog(`startScan exception: ${err instanceof Error ? err.message : 'unknown'}`);
      console.error('[BLE-DEBUG] Exception starting scan:', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to start scanning';
      errorRef.current = errMsg;
      setError(errMsg);
      setIsScanning(false);
      addDebugLog('setIsScanning(false) - from exception');
    }

    // FIX #3 & #4: Remove 10-second timeout - scanning continues until stopScan() is called
    // Continuous scanning allows devices to be detected and updated in real-time
    // setTimeout(() => {
    //   stopScan();
    // }, 10000); // REMOVED - this was stopping scanning after 10 seconds
  }, [requestPermissions, calculateDistanceFeet, addDebugLog]);

  // Stop scanning
  const stopScan = useCallback(() => {
    console.log('[BLE-SCAN] stopScan called - timestamp:', Date.now());
    addDebugLog('stopScan called');

    if (Platform.OS === 'web') {
      console.log('[BLE-SCAN] stopScan - web platform, skipping');
      addDebugLog('stopScan: web platform, skipping');
      return;
    }

    if (!bleManager) {
      console.warn('[BLE-SCAN] stopScan - bleManager not initialized');
      addDebugLog('stopScan: bleManager not initialized');
      console.warn('[BLE-DEBUG] BleManager not initialized, cannot stop scan');
      setIsScanning(false);
      return;
    }

    try {
      console.log('[BLE-SCAN] Calling bleManager.stopDeviceScan()');
      bleManager.stopDeviceScan();
      setIsScanning(false);
      console.log('[BLE-SCAN] Scan stopped successfully');
      addDebugLog('setIsScanning(false) - from stopScan');
      addDebugLog('stopScan: completed');
      console.log('[BLE-DEBUG] Scanning stopped');
    } catch (err: any) {
      console.error('[BLE-SCAN] stopScan EXCEPTION:', err?.message);
      addDebugLog(`stopScan error: ${err instanceof Error ? err.message : 'unknown'}`);
      console.error('[BLE-DEBUG] Error stopping scan:', err);
      setIsScanning(false);
      addDebugLog('setIsScanning(false) - from stopScan error');
    }
  }, [addDebugLog]);

  // Monitor Bluetooth state changes (handle Bluetooth being disabled)
  // Use ref for startScan to avoid recreating listener when startScan changes
  const startScanRef = useRef(startScan);
  useEffect(() => {
    startScanRef.current = startScan;
  }, [startScan]);

  useEffect(() => {
    if (Platform.OS === 'web' || !bleManager) {
      console.log('[BLE-SCAN] State change listener skip - web or no bleManager');
      return;
    }

    console.log('[BLE-SCAN] Registering Bluetooth state change listener');
    // Track if we've already handled the initial state emission
    let hasHandledInitialState = false;

    const subscription = bleManager.onStateChange((state) => {
      console.log('[BLE-SCAN] Bluetooth state changed to:', State[state]);
      addDebugLog(`stateChange: ${State[state]} (${state})`);

      // Skip the initial state emission if we're already scanning
      // This prevents the loop where PoweredOn -> startScan -> state change -> loop
      if (!hasHandledInitialState) {
        hasHandledInitialState = true;
        console.log('[BLE-SCAN] Initial state emission - handling...');
        addDebugLog('stateChange: initial emission (skipping if already scanning)');
        // Only handle initial state if Bluetooth is off or unauthorized
        if (state === State.PoweredOff || state === State.Unauthorized) {
          if (state === State.PoweredOff) {
            console.warn('[BLE-SCAN] Bluetooth PoweredOff (initial) - clearing devices');
            addDebugLog('stateChange: PoweredOff (initial)');
            console.warn('[BLE-DEBUG] Bluetooth powered off, stopping scan');
            console.log('[BLE-DUPE] setDevices([]) - from PoweredOff initial');
            setDevices([]);
            setIsScanning(false);
            addDebugLog('setIsScanning(false) - from PoweredOff (initial)');
            errorRef.current = 'Bluetooth is disabled';
            setError('Bluetooth is disabled');
          } else if (state === State.Unauthorized) {
            console.warn('[BLE-SCAN] Bluetooth Unauthorized (initial)');
            addDebugLog('stateChange: Unauthorized (initial)');
            console.warn('[BLE-DEBUG] Bluetooth unauthorized');
            errorRef.current = 'Bluetooth permission denied';
            setError('Bluetooth permission denied');
            setIsScanning(false);
            addDebugLog('setIsScanning(false) - from Unauthorized (initial)');
          }
        } else {
          console.log('[BLE-SCAN] Initial state:', State[state], '- no action needed');
          addDebugLog(`stateChange: ${State[state]} (initial, skipping)`);
        }
        return;
      }

      // Handle subsequent state changes
      if (state === State.PoweredOff) {
        console.warn('[BLE-SCAN] Bluetooth PoweredOff - STOPPING scan and clearing devices');
        addDebugLog('stateChange: PoweredOff -> stopping scan');
        console.warn('[BLE-DEBUG] Bluetooth powered off, stopping scan');
        console.log('[BLE-DUPE] setDevices([]) - from PoweredOff');
        setDevices([]);
        setIsScanning(false);
        addDebugLog('setIsScanning(false) - from PoweredOff');
        errorRef.current = 'Bluetooth is disabled';
        setError('Bluetooth is disabled');
      } else if (state === State.PoweredOn) {
        console.log('[BLE-SCAN] Bluetooth PoweredOn - isScanningRef:', isScanningRef.current);
        addDebugLog(`stateChange: PoweredOn (isScanningRef: ${isScanningRef.current})`);
        console.log('[BLE-DEBUG] Bluetooth powered on');
        errorRef.current = null;
        setError(null);
        // Auto-restart scanning if we were scanning before
        if (isScanningRef.current) {
          console.log('[BLE-SCAN] Auto-restarting scan after Bluetooth re-enabled');
          addDebugLog('stateChange: PoweredOn -> restarting scan');
          console.log('[BLE-DEBUG] Restarting scan after Bluetooth re-enabled');
          startScanRef.current();
        } else {
          console.log('[BLE-SCAN] Not restarting scan - was not scanning before');
          addDebugLog('stateChange: PoweredOn -> not restarting (was not scanning)');
        }
      } else if (state === State.Unauthorized) {
        console.warn('[BLE-SCAN] Bluetooth Unauthorized - STOPPING scan');
        addDebugLog('stateChange: Unauthorized -> stopping scan');
        console.warn('[BLE-DEBUG] Bluetooth unauthorized');
        errorRef.current = 'Bluetooth permission denied';
        setError('Bluetooth permission denied');
        setIsScanning(false);
        addDebugLog('setIsScanning(false) - from Unauthorized');
      }
    }, true); // true = emit current state immediately

    return () => {
      console.log('[BLE-SCAN] Removing Bluetooth state change listener');
      subscription.remove();
    };
  }, []); // Empty deps - listener never needs to be recreated

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[BLE-SCAN] Cleanup on unmount - stopping scan');
      if (Platform.OS !== 'web' && bleManager) {
        // Only destroy if no other instances are using it
        // Note: bleManager is module-level, so we don't destroy it here
        // to avoid breaking other potential uses. The app lifecycle handles cleanup.
        stopScan();
      }
    };
  }, [stopScan]);

  // Debug function to inject a fake device for testing
  const addDebugDevice = useCallback((device: BleDevice) => {
    console.log('[BLE-DEBUG] Adding debug device:', device);
    console.log('[BLE-DUPE] addDebugDevice called - device:', JSON.stringify(device, null, 2));
    setDevices(prevDevices => {
      const exists = prevDevices.find(d => d.id === device.id);
      console.log('[BLE-DUPE] addDebugDevice - exists:', !!exists, 'prevLength:', prevDevices.length);
      if (exists) {
        console.log('[BLE-DUPE] addDebugDevice - UPDATING existing device');
        return prevDevices.map(d => d.id === device.id ? device : d);
      }
      console.log('[BLE-DUPE] addDebugDevice - ADDING new device, newLength:', prevDevices.length + 1);
      return [...prevDevices, device];
    });
  }, []);

  return {
    devices,
    isScanning,
    startScan,
    stopScan,
    error,
    startScanCount: startScanCountRef.current,
    debugLog,
    devicesScanned,
    recentScans,
    addDebugDevice,
  };
};
