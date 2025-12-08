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
