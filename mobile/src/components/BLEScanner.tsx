import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { Device, State } from 'react-native-ble-plx';
import { DROPLINK_SERVICE_UUID, DROPLINK_DEVICE_PREFIX } from '../config/bleConfig';
import { bleManager } from '../services/bleManager';

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

// Use shared BleManager instance from bleManager.ts
// This prevents multiple instances and conflicting state listeners

/**
 * Normalize UUID for comparison (lowercase, no hyphens)
 * Handles UUIDs in different formats: with/without hyphens, different cases
 */
const normalizeUUID = (uuid: string): string => {
  return uuid.toLowerCase().replace(/-/g, '');
};

/**
 * Check if a BLE device is a DropLink user
 * @param device - The BLE device to check
 * @returns true if device is a DropLink user, false otherwise
 * 
 * Detection methods (in priority order):
 * 1. Service UUID check (primary - when advertising is implemented)
 *    - Uses normalized UUID comparison for robust matching
 * 2. Device name prefix (fallback - backward compatibility)
 */
const isDropLinkDevice = (device: Device | null): boolean => {
  if (!device) return false;

  // Primary: Check Service UUID (normalize both for comparison)
  if (device.serviceUUIDs && device.serviceUUIDs.length > 0) {
    const normalizedDropLinkUUID = normalizeUUID(DROPLINK_SERVICE_UUID);
    const hasDropLinkService = device.serviceUUIDs.some(
      uuid => normalizeUUID(uuid) === normalizedDropLinkUUID
    );
    if (hasDropLinkService) {
      return true;
    }
  }

  // Fallback: Check device name prefix (backward compatibility)
  if (device.name && device.name.startsWith(DROPLINK_DEVICE_PREFIX)) {
    return true;
  }

  return false;
};

export const useBLEScanner = (): UseBLEScannerReturn => {
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startScanCountRef = useRef(0);
  
  // Ref to track scanning state for Bluetooth state listener (prevents stale closures)
  const isScanningRef = useRef(isScanning);
  useEffect(() => {
    isScanningRef.current = isScanning;
  }, [isScanning]);

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
    // Prevent multiple simultaneous scan starts
    if (isScanning) {
      console.log('[BLE-DEBUG] Already scanning, skipping startScan call');
      return;
    }

    startScanCountRef.current += 1;
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

    try {
      bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('[BLE-DEBUG] BLE scan error:', error);
          setError(error.message);
          setIsScanning(false);
          return;
        }

        // Filter: Only process DropLink users (devices with "DropLink-" prefix in name)
        if (device && isDropLinkDevice(device)) {
          // Validate device has required properties
          if (!device.id) {
            console.warn('[BLE-DEBUG] Device missing ID, skipping:', device);
            return;
          }

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
    } catch (err) {
      console.error('[BLE-DEBUG] Exception starting scan:', err);
      setError(err instanceof Error ? err.message : 'Failed to start scanning');
      setIsScanning(false);
    }

    // FIX #3 & #4: Remove 10-second timeout - scanning continues until stopScan() is called
    // Continuous scanning allows devices to be detected and updated in real-time
    // setTimeout(() => {
    //   stopScan();
    // }, 10000); // REMOVED - this was stopping scanning after 10 seconds
  }, [requestPermissions, calculateDistanceFeet, isScanning]);

  // Stop scanning
  const stopScan = useCallback(() => {
    if (Platform.OS === 'web') {
      return;
    }

    if (!bleManager) {
      console.warn('[BLE-DEBUG] BleManager not initialized, cannot stop scan');
      setIsScanning(false);
      return;
    }

    try {
      bleManager.stopDeviceScan();
      setIsScanning(false);
      console.log('[BLE-DEBUG] Scanning stopped');
    } catch (err) {
      console.error('[BLE-DEBUG] Error stopping scan:', err);
      setIsScanning(false);
    }
  }, []);

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
      // Skip the initial state emission if we're already scanning
      // This prevents the loop where PoweredOn -> startScan -> state change -> loop
      if (!hasHandledInitialState) {
        hasHandledInitialState = true;
        // Only handle initial state if Bluetooth is off or unauthorized
        if (state === State.PoweredOff || state === State.Unauthorized) {
          if (state === State.PoweredOff) {
            console.warn('[BLE-DEBUG] Bluetooth powered off, stopping scan');
            setDevices([]);
            setIsScanning(false);
            setError('Bluetooth is disabled');
          } else if (state === State.Unauthorized) {
            console.warn('[BLE-DEBUG] Bluetooth unauthorized');
            setError('Bluetooth permission denied');
            setIsScanning(false);
          }
        }
        return;
      }

      // Handle subsequent state changes
      if (state === State.PoweredOff) {
        console.warn('[BLE-DEBUG] Bluetooth powered off, stopping scan');
        setDevices([]);
        setIsScanning(false);
        setError('Bluetooth is disabled');
      } else if (state === State.PoweredOn) {
        console.log('[BLE-DEBUG] Bluetooth powered on');
        setError(null);
        // Auto-restart scanning if we were scanning before
        if (isScanningRef.current) {
          console.log('[BLE-DEBUG] Restarting scan after Bluetooth re-enabled');
          startScanRef.current();
        }
      } else if (state === State.Unauthorized) {
        console.warn('[BLE-DEBUG] Bluetooth unauthorized');
        setError('Bluetooth permission denied');
        setIsScanning(false);
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
  };
};
