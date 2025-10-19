import React, { useState, useEffect, useCallback } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

export interface BleDevice {
  id: string;
  name: string;
  rssi: number;
  distanceFeet: number;
}

interface UseBLEScannerReturn {
  devices: BleDevice[];
  isScanning: boolean;
  startScan: () => void;
  stopScan: () => void;
  error: string | null;
}

// Only create BleManager on native platforms (iOS/Android)
const bleManager = Platform.OS !== 'web' ? new BleManager() : null;

export const useBLEScanner = (): UseBLEScannerReturn => {
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    setDevices([]);
    
    // Mock data for web platform
    if (Platform.OS === 'web') {
      setIsScanning(true);
      
      // Simulate scanning with mock devices
      setTimeout(() => {
        const mockDevices: BleDevice[] = [
          { id: '0', name: 'Jamie Parker', rssi: -35, distanceFeet: 5.0 },
          { id: '1', name: 'Sarah Chen', rssi: -45, distanceFeet: 8.5 },
          { id: '2', name: 'Alex Rivera', rssi: -60, distanceFeet: 12.0 },
          { id: '3', name: 'Jordan Kim', rssi: -55, distanceFeet: 15.5 },
          { id: '4', name: 'Taylor Smith', rssi: -70, distanceFeet: 18.0 },
          { id: '5', name: 'Morgan Lee', rssi: -50, distanceFeet: 10.5 },
          { id: '6', name: 'Casey Brown', rssi: -48, distanceFeet: 9.0 },
          { id: '7', name: 'Riley Davis', rssi: -65, distanceFeet: 20.0 },
          { id: '8', name: 'Avery Wilson', rssi: -58, distanceFeet: 14.0 },
          { id: '9', name: 'Quinn Taylor', rssi: -52, distanceFeet: 11.5 },
          { id: '10', name: 'Sage Anderson', rssi: -62, distanceFeet: 17.0 },
          { id: '11', name: 'Phoenix Martinez', rssi: -68, distanceFeet: 25.0 },
          { id: '12', name: 'Skylar Johnson', rssi: -54, distanceFeet: 13.0 },
          { id: '13', name: 'Dakota White', rssi: -72, distanceFeet: 28.0 },
          { id: '14', name: 'Charlie Garcia', rssi: -56, distanceFeet: 16.0 },
          { id: '15', name: 'River Thompson', rssi: -64, distanceFeet: 19.5 },
          { id: '16', name: 'Kai Moore', rssi: -74, distanceFeet: 30.0 },
          { id: '17', name: 'Blake Jackson', rssi: -66, distanceFeet: 22.5 },
          { id: '18', name: 'Rowan Martin', rssi: -59, distanceFeet: 14.5 },
          { id: '19', name: 'Ember Clark', rssi: -76, distanceFeet: 32.0 },
        ];
        setDevices(mockDevices);
        setIsScanning(false);
      }, 2000);
      
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

      if (device && device.name) {
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
  };
};
