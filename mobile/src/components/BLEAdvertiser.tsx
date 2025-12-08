import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus, PermissionsAndroid } from 'react-native';
import { DROPLINK_SERVICE_UUID } from '../config/bleConfig';

// Feature flag - can disable advertising if needed
const ADVERTISING_ENABLED = true;

// Import with error handling (library may not be available)
let MunimBluetoothPeripheral: any = null;
try {
  MunimBluetoothPeripheral = require('munim-bluetooth-peripheral');
} catch (error) {
  console.warn('[BLEAdvertiser] munim-bluetooth-peripheral not available:', error);
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
 * 
 * Library: munim-bluetooth-peripheral
 * API: startAdvertising({ serviceUUIDs, localName }), stopAdvertising()
 */
export const useBLEAdvertiser = (): UseBLEAdvertiserReturn => {
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAvailable = MunimBluetoothPeripheral !== null && ADVERTISING_ENABLED;

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

      // Start advertising with Service UUID using munim-bluetooth-peripheral API
      await MunimBluetoothPeripheral.startAdvertising({
        serviceUUIDs: [DROPLINK_SERVICE_UUID],
        localName: 'DropLink',
      });
      
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
      await MunimBluetoothPeripheral.stopAdvertising();
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

