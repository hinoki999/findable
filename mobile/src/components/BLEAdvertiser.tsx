import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus, PermissionsAndroid } from 'react-native';
import { State } from 'react-native-ble-plx';
import { DROPLINK_SERVICE_UUID } from '../config/bleConfig';
import { bleManager } from '../services/bleManager';

// Feature flag - can disable advertising if needed
const ADVERTISING_ENABLED = true;

// Import with error handling (library may not be available)
// Library exports: startAdvertising, stopAdvertising, setServices, etc.
let startAdvertisingNative: ((options: { serviceUUIDs: string[]; localName?: string }) => void) | null = null;
let stopAdvertisingNative: (() => void) | null = null;
try {
  const MunimBluetoothPeripheral = require('munim-bluetooth-peripheral');
  startAdvertisingNative = MunimBluetoothPeripheral.startAdvertising;
  stopAdvertisingNative = MunimBluetoothPeripheral.stopAdvertising;
} catch (error) {
  console.warn('[BLEAdvertiser] munim-bluetooth-peripheral not available:', error);
}

// Use shared BleManager instance from bleManager.ts
// This prevents multiple instances and conflicting state listeners

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
  const isAvailable = startAdvertisingNative !== null && stopAdvertisingNative !== null && ADVERTISING_ENABLED;
  
  // Ref to track advertising state for AppState listener (prevents stale closures)
  const isAdvertisingRef = useRef(isAdvertising);
  useEffect(() => {
    isAdvertisingRef.current = isAdvertising;
  }, [isAdvertising]);

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
      // Note: startAdvertising is synchronous (returns void), no await needed
      if (!startAdvertisingNative) {
        throw new Error('startAdvertising function not available');
      }
      
      startAdvertisingNative({
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
      // Note: stopAdvertising is synchronous (returns void), no await needed
      if (!stopAdvertisingNative) {
        throw new Error('stopAdvertising function not available');
      }
      
      stopAdvertisingNative();
      setIsAdvertising(false);
      setError(null);
      console.log('[BLEAdvertiser] Advertising stopped');
    } catch (err) {
      console.error('[BLEAdvertiser] Error stopping advertising:', err);
      setError('Failed to stop advertising');
    }
  }, [isAvailable, isAdvertising]);

  // Handle app state changes (pause advertising in background on iOS)
  // NOTE: We only pause on background, NOT resume on foreground.
  // HomeScreen controls resume based on isDiscoverable toggle state.
  useEffect(() => {
    if (!isAvailable) return;

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Pause advertising when app goes to background (iOS limitation)
        // Use ref to avoid stale closure
        if (Platform.OS === 'ios' && isAdvertisingRef.current) {
          console.log('[BLEAdvertiser] App going to background, pausing advertising');
          stopAdvertising();
        }
      }
      // Removed auto-resume on foreground - let HomeScreen control via isDiscoverable toggle
      // This prevents advertising from resuming if user toggled it off while backgrounded
    });

    return () => {
      subscription.remove();
    };
  }, [isAvailable, stopAdvertising]); // Removed isAdvertising and startAdvertising from deps

  // Monitor Bluetooth state changes (handle Bluetooth being disabled during advertising)
  // Use empty deps to prevent listener recreation - only create once
  useEffect(() => {
    if (Platform.OS === 'web' || !bleManager || !isAvailable) return;

    // Track if we've already handled the initial state emission
    let hasHandledInitialState = false;

    const subscription = bleManager.onStateChange((state) => {
      // Skip initial state emission to prevent loops
      if (!hasHandledInitialState) {
        hasHandledInitialState = true;
        // Only handle initial state if Bluetooth is off or unauthorized
        if (state === State.PoweredOff || state === State.Unauthorized) {
          if (state === State.PoweredOff && isAdvertisingRef.current) {
            setIsAdvertising(false);
            setError('Bluetooth is disabled');
          } else if (state === State.Unauthorized && isAdvertisingRef.current) {
            setIsAdvertising(false);
            setError('Bluetooth permission denied');
          }
        }
        return;
      }

      // Handle subsequent state changes
      if (state === State.PoweredOff) {
        console.warn('[BLEAdvertiser] Bluetooth powered off, stopping advertising');
        if (isAdvertisingRef.current) {
          setIsAdvertising(false);
          setError('Bluetooth is disabled');
        }
      } else if (state === State.PoweredOn) {
        console.log('[BLEAdvertiser] Bluetooth powered on');
        setError(null);
        // Note: We don't auto-restart advertising here - HomeScreen controls it via isDiscoverable
      } else if (state === State.Unauthorized) {
        console.warn('[BLEAdvertiser] Bluetooth unauthorized');
        setError('Bluetooth permission denied');
        if (isAdvertisingRef.current) {
          setIsAdvertising(false);
        }
      }
    }, true); // true = emit current state immediately

    return () => {
      subscription.remove();
    };
  }, [isAvailable]); // Only recreate if isAvailable changes

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Use ref to avoid stale closure in cleanup
      if (isAdvertisingRef.current) {
        stopAdvertising();
      }
    };
  }, [stopAdvertising]);

  return {
    isAdvertising,
    startAdvertising,
    stopAdvertising,
    error,
    isAvailable,
  };
};

