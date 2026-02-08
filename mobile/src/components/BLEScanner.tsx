import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { Device, State } from 'react-native-ble-plx';
import { DROPLINK_SERVICE_UUID, DROPLINK_DEVICE_PREFIX } from '../config/bleConfig';
import { bleManager } from '../services/bleManager';
import { supabase } from '../services/supabase';

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
  const startScanCountRef = useRef(0);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [devicesScanned, setDevicesScanned] = useState(0);
  const [recentScans, setRecentScans] = useState<RecentScanEntry[]>([]);
  
  // Ref to track scanning state for Bluetooth state listener (prevents stale closures)
  const isScanningRef = useRef(isScanning);
  useEffect(() => {
    isScanningRef.current = isScanning;
  }, [isScanning]);

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
    addDebugLog('startScan called');
    
    // Prevent multiple simultaneous scan starts
    if (isScanning) {
      addDebugLog('startScan: already scanning, skipping');
      console.log('[BLE-DEBUG] Already scanning, skipping startScan call');
      return;
    }

    startScanCountRef.current += 1;
    addDebugLog(`startScan: proceeding (count: ${startScanCountRef.current})`);
    console.log('[BLE-DEBUG] startScan called, count:', startScanCountRef.current, 'timestamp:', Date.now());
    setError(null);
    // FIX #2: Don't clear devices array - preserve existing devices and update them
    // setDevices([]); // REMOVED - this was causing devices to disappear
    
    // Web platform: BLE is not available, devices will remain empty
    if (Platform.OS === 'web') {
      console.log('[BLE-DEBUG] Web platform detected, BLE not available');
      return;
    }

    // Ensure bleManager exists
    if (!bleManager) {
      console.error('[BLE-DEBUG] BleManager not initialized');
      setError('Bluetooth manager not available');
      return;
    }

    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      console.warn('[BLE-DEBUG] Permissions not granted, cannot start scan');
      return;
    }

    setIsScanning(true);
    addDebugLog('setIsScanning(true)');

    try {
      // Scan for ALL BLE devices (no Service UUID filter) - for testing
      // TODO: Re-enable Service UUID filtering once advertising is working
      bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          addDebugLog(`scan error: ${error.message}`);
          console.error('[BLE-DEBUG] BLE scan error:', error);
          setError(error.message);
          setIsScanning(false);
          addDebugLog('setIsScanning(false) - from error');
          return;
        }

        // Add ALL detected devices (no filtering)
        if (device) {
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

          // Extract deviceId from device name if it matches "DL-XXXX" pattern
          const extractDeviceId = (name: string | null): string | null => {
            if (!name) return null;
            const match = name.match(new RegExp(`^${DROPLINK_DEVICE_PREFIX}(.+)$`));
            if (match && match[1]) {
              // Trim whitespace and return the extracted deviceId
              return match[1].trim();
            }
            return null;
          };

          const deviceId = extractDeviceId(device.name);
          
          // Lookup username and userId from Supabase if deviceId is found
          if (deviceId) {
            (async () => {
              try {
                const normalizedDeviceId = deviceId.toLowerCase().replace(/-/g, '').trim();
                let userId: string | null = null;
                let displayName: string | null = null;
                
                // Query user_profiles first (for display name)
                const { data: allUserProfiles, error: userProfileError } = await supabase
                  .from('user_profiles')
                  .select('user_id, name');
                
                if (!userProfileError && allUserProfiles) {
                  const userProfileData = allUserProfiles.find(profile => {
                    if (!profile.user_id) return false;
                    const normalizedProfileId = profile.user_id.toString().toLowerCase().replace(/-/g, '');
                    return normalizedProfileId.startsWith(normalizedDeviceId);
                  });
                  
                  if (userProfileData) {
                    userId = userProfileData.user_id;
                    displayName = userProfileData.name || deviceId || 'User';
                  }
                }
                
                // Fallback to profiles table if not found
                if (!userId) {
                  const { data: allProfiles, error: profileError } = await supabase
                    .from('profiles')
                    .select('id, username');
                  
                  if (!profileError && allProfiles) {
                    const profileData = allProfiles.find(profile => {
                      if (!profile.id) return false;
                      const normalizedProfileId = profile.id.toString().toLowerCase().replace(/-/g, '');
                      return normalizedProfileId.startsWith(normalizedDeviceId);
                    });
                    
                    if (profileData) {
                      userId = profileData.id;
                      displayName = profileData.username || deviceId || 'User';
                    }
                  }
                }
                
                // Update device if found, or use deviceId as fallback
                if (userId) {
                  setDevices(prevDevices => 
                    prevDevices.map(d => 
                      d.id === device.id
                        ? { ...d, username: displayName || deviceId || 'User', userId: userId }
                        : d
                    )
                  );
                } else {
                  // User not found in database, but device exists - use deviceId as identifier
                  // This allows the device to be displayed even if profile lookup fails
                  setDevices(prevDevices => 
                    prevDevices.map(d => 
                      d.id === device.id
                        ? { ...d, username: deviceId, userId: null }
                        : d
                    )
                  );
                }
              } catch (err) {
                // Silently fail - device will show without username
              }
            })();
          }

          // Add ALL devices to devices array (no filtering)
          setDevices(prevDevices => {
            const exists = prevDevices.find(d => d.id === device.id);
            const distanceFeet = calculateDistanceFeet(device.rssi || -100);
            // Use device name or generate a fallback name
            const deviceName = device.name || `BLE-Device-${device.id.substring(0, 8)}`;
            
            if (!exists) {
              // Add new device
              return [...prevDevices, {
                id: device.id,
                name: deviceName,
                rssi: device.rssi || -100,
                distanceFeet,
                serviceUUIDs: device.serviceUUIDs || undefined, // Store service UUIDs for UI filtering
                username: undefined, // Will be populated by async lookup if deviceId found
              }];
            } else {
              // Update existing device with new RSSI/distance (preserve username if already set)
              return prevDevices.map(d => 
                d.id === device.id 
                  ? { ...d, rssi: device.rssi || -100, distanceFeet, serviceUUIDs: device.serviceUUIDs || d.serviceUUIDs }
                  : d
              );
            }
          });
        }
      });
    } catch (err) {
      addDebugLog(`startScan exception: ${err instanceof Error ? err.message : 'unknown'}`);
      console.error('[BLE-DEBUG] Exception starting scan:', err);
      setError(err instanceof Error ? err.message : 'Failed to start scanning');
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
    addDebugLog('stopScan called');
    
    if (Platform.OS === 'web') {
      addDebugLog('stopScan: web platform, skipping');
      return;
    }

    if (!bleManager) {
      addDebugLog('stopScan: bleManager not initialized');
      console.warn('[BLE-DEBUG] BleManager not initialized, cannot stop scan');
      setIsScanning(false);
      return;
    }

    try {
      bleManager.stopDeviceScan();
      setIsScanning(false);
      addDebugLog('setIsScanning(false) - from stopScan');
      addDebugLog('stopScan: completed');
      console.log('[BLE-DEBUG] Scanning stopped');
    } catch (err) {
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
    if (Platform.OS === 'web' || !bleManager) return;

    // Track if we've already handled the initial state emission
    let hasHandledInitialState = false;

    const subscription = bleManager.onStateChange((state) => {
      addDebugLog(`stateChange: ${State[state]} (${state})`);
      
      // Skip the initial state emission if we're already scanning
      // This prevents the loop where PoweredOn -> startScan -> state change -> loop
      if (!hasHandledInitialState) {
        hasHandledInitialState = true;
        addDebugLog('stateChange: initial emission (skipping if already scanning)');
        // Only handle initial state if Bluetooth is off or unauthorized
        if (state === State.PoweredOff || state === State.Unauthorized) {
          if (state === State.PoweredOff) {
            addDebugLog('stateChange: PoweredOff (initial)');
            console.warn('[BLE-DEBUG] Bluetooth powered off, stopping scan');
            setDevices([]);
            setIsScanning(false);
            addDebugLog('setIsScanning(false) - from PoweredOff (initial)');
            setError('Bluetooth is disabled');
          } else if (state === State.Unauthorized) {
            addDebugLog('stateChange: Unauthorized (initial)');
            console.warn('[BLE-DEBUG] Bluetooth unauthorized');
            setError('Bluetooth permission denied');
            setIsScanning(false);
            addDebugLog('setIsScanning(false) - from Unauthorized (initial)');
          }
        } else {
          addDebugLog(`stateChange: ${State[state]} (initial, skipping)`);
        }
        return;
      }

      // Handle subsequent state changes
      if (state === State.PoweredOff) {
            addDebugLog('stateChange: PoweredOff -> stopping scan');
            console.warn('[BLE-DEBUG] Bluetooth powered off, stopping scan');
            setDevices([]);
            setIsScanning(false);
            addDebugLog('setIsScanning(false) - from PoweredOff');
            setError('Bluetooth is disabled');
      } else if (state === State.PoweredOn) {
        addDebugLog(`stateChange: PoweredOn (isScanningRef: ${isScanningRef.current})`);
        console.log('[BLE-DEBUG] Bluetooth powered on');
        setError(null);
        // Auto-restart scanning if we were scanning before
        if (isScanningRef.current) {
          addDebugLog('stateChange: PoweredOn -> restarting scan');
          console.log('[BLE-DEBUG] Restarting scan after Bluetooth re-enabled');
          startScanRef.current();
        } else {
          addDebugLog('stateChange: PoweredOn -> not restarting (was not scanning)');
        }
      } else if (state === State.Unauthorized) {
        addDebugLog('stateChange: Unauthorized -> stopping scan');
        console.warn('[BLE-DEBUG] Bluetooth unauthorized');
        setError('Bluetooth permission denied');
        setIsScanning(false);
        addDebugLog('setIsScanning(false) - from Unauthorized');
      }
    }, true); // true = emit current state immediately

    return () => {
      subscription.remove();
    };
  }, []); // Empty deps - listener never needs to be recreated

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (Platform.OS !== 'web' && bleManager) {
        // Only destroy if no other instances are using it
        // Note: bleManager is module-level, so we don't destroy it here
        // to avoid breaking other potential uses. The app lifecycle handles cleanup.
        stopScan();
      }
    };
  }, [stopScan]);

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
  };
};
