import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus, PermissionsAndroid } from 'react-native';
import { State } from 'react-native-ble-plx';
import { DROPLINK_SERVICE_UUID, DROPLINK_DEVICE_PREFIX } from '../config/bleConfig';
import { bleManager } from '../services/bleManager';
import { useAuth } from '../contexts/AuthContext';

// Feature flag - can disable advertising if needed
const ADVERTISING_ENABLED = true;

// Import with error handling (library may not be available)
// Library exports: startAdvertising, stopAdvertising, setServices, etc.
let startAdvertisingNative: ((options: { serviceUUIDs: string[]; localName?: string }) => void) | null = null;
let stopAdvertisingNative: (() => void) | null = null;
let importError: any = null;

console.log('[BLE-ADV-DIAG] ========== MODULE IMPORT DIAGNOSTIC ==========');
try {
  console.log('[BLE-ADV-DIAG] Attempting to require munim-bluetooth-peripheral...');
  const MunimBluetoothPeripheral = require('munim-bluetooth-peripheral');
  console.log('[BLE-ADV-DIAG] ✅ Module loaded successfully');
  console.log('[BLE-ADV-DIAG] Module keys:', Object.keys(MunimBluetoothPeripheral));
  console.log('[BLE-ADV-DIAG] startAdvertising type:', typeof MunimBluetoothPeripheral.startAdvertising);
  console.log('[BLE-ADV-DIAG] stopAdvertising type:', typeof MunimBluetoothPeripheral.stopAdvertising);
  
  startAdvertisingNative = MunimBluetoothPeripheral.startAdvertising;
  stopAdvertisingNative = MunimBluetoothPeripheral.stopAdvertising;
  
  const isStartFunction = startAdvertisingNative !== null && typeof startAdvertisingNative === 'function';
  const isStopFunction = stopAdvertisingNative !== null && typeof stopAdvertisingNative === 'function';
  
  console.log('[BLE-ADV-DIAG] startAdvertisingNative:', isStartFunction ? '✅ FUNCTION' : '❌ NULL/UNDEFINED');
  console.log('[BLE-ADV-DIAG] stopAdvertisingNative:', isStopFunction ? '✅ FUNCTION' : '❌ NULL/UNDEFINED');
  console.log('[BLE-ADV-DIAG] Native module status:', isStartFunction && isStopFunction ? '✅ READY' : '❌ NOT READY');
} catch (error) {
  importError = error;
  console.error('[BLE-ADV-DIAG] ❌ FAILED to import munim-bluetooth-peripheral');
  console.error('[BLE-ADV-DIAG] Error type:', error?.constructor?.name);
  console.error('[BLE-ADV-DIAG] Error message:', error instanceof Error ? error.message : String(error));
  console.error('[BLE-ADV-DIAG] Full error:', error);
  console.warn('[BLEAdvertiser] munim-bluetooth-peripheral not available:', error);
  startAdvertisingNative = null;
  stopAdvertisingNative = null;
}
console.log('[BLE-ADV-DIAG] ============================================');

// Use shared BleManager instance from bleManager.ts
// This prevents multiple instances and conflicting state listeners

interface UseBLEAdvertiserReturn {
  isAdvertising: boolean;
  startAdvertising: () => Promise<void>;
  stopAdvertising: () => Promise<void>;
  error: string | null;
  isAvailable: boolean;
  broadcastName: string | null; // Actual name being broadcast (set when advertising starts)
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
  const { username, userId } = useAuth();
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broadcastName, setBroadcastName] = useState<string | null>(null);
  const isAvailable = startAdvertisingNative !== null && stopAdvertisingNative !== null && ADVERTISING_ENABLED;
  
  // Generate localName: "DropLink-" + username (or userId if username is null)
  const localName = `${DROPLINK_DEVICE_PREFIX}${username || userId || 'Unknown'}`;
  
  // Log availability on mount
  useEffect(() => {
    console.log('[BLE-ADV-DIAG] ========== ADVERTISER MOUNT ==========');
    console.log('[BLE-ADV-DIAG] startAdvertisingNative exists:', startAdvertisingNative !== null);
    console.log('[BLE-ADV-DIAG] stopAdvertisingNative exists:', stopAdvertisingNative !== null);
    console.log('[BLE-ADV-DIAG] ADVERTISING_ENABLED:', ADVERTISING_ENABLED);
    console.log('[BLE-ADV-DIAG] isAvailable:', isAvailable);
    console.log('[BLE-ADV-DIAG] Platform:', Platform.OS);
    console.log('[BLE-ADV-DIAG] Service UUID:', DROPLINK_SERVICE_UUID);
    console.log('[BLE-ADV-DIAG] Will broadcast as:', localName);
    console.log('[BLE-ADV-DIAG] Username:', username || 'null');
    console.log('[BLE-ADV-DIAG] UserId:', userId || 'null');
    console.log('[BLE-ADV-DIAG] =======================================');
  }, [localName, username, userId, isAvailable]);
  
  // Ref to track advertising state for AppState listener (prevents stale closures)
  const isAdvertisingRef = useRef(isAdvertising);
  useEffect(() => {
    isAdvertisingRef.current = isAdvertising;
  }, [isAdvertising]);

  // Request BLE advertising permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    console.log('[BLE-ADV-DIAG] requestPermissions called, Platform:', Platform.OS);
    
    if (Platform.OS === 'web') {
      console.log('[BLE-ADV-DIAG] Web platform - no permissions needed');
      return false;
    }

    if (Platform.OS === 'android') {
      try {
        console.log('[BLE-ADV-DIAG] Requesting Android permissions: BLUETOOTH_ADVERTISE, BLUETOOTH_CONNECT');
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        
        console.log('[BLE-ADV-DIAG] Permission results:', JSON.stringify(granted, null, 2));
        
        const allGranted = Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED
        );
        
        if (!allGranted) {
          console.error('[BLE-ADV-DIAG] ❌ Not all permissions granted:', granted);
          setError('Bluetooth advertising permissions not granted');
          return false;
        }
        
        console.log('[BLE-ADV-DIAG] ✅ All permissions granted');
        return true;
      } catch (err) {
        console.error('[BLE-ADV-DIAG] ❌ Permission request error:', err);
        setError('Failed to request permissions');
        return false;
      }
    }
    
    console.log('[BLE-ADV-DIAG] ✅ Permissions OK (non-Android platform)');
    return true;
  }, []);

  // Start advertising
  const startAdvertising = useCallback(async () => {
    console.log('[BLE-ADV-DIAG] ========== startAdvertising CALLED ==========');
    console.log('[BLE-ADV-DIAG] isAvailable:', isAvailable);
    console.log('[BLE-ADV-DIAG] isAdvertising (current):', isAdvertising);
    console.log('[BLE-ADV-DIAG] Platform:', Platform.OS);
    
    if (!isAvailable) {
      console.error('[BLE-ADV-DIAG] ❌ Advertising not available (library not loaded or disabled)');
      console.log('[BLE-ADV-DIAG] startAdvertisingNative:', startAdvertisingNative !== null);
      console.log('[BLE-ADV-DIAG] stopAdvertisingNative:', stopAdvertisingNative !== null);
      console.log('[BLE-ADV-DIAG] ADVERTISING_ENABLED:', ADVERTISING_ENABLED);
      return;
    }

    if (Platform.OS === 'web') {
      console.log('[BLE-ADV-DIAG] Web platform - advertising not supported');
      return;
    }

    if (isAdvertising) {
      console.log('[BLE-ADV-DIAG] Already advertising, skipping start');
      return;
    }

    try {
      console.log('[BLE-ADV-DIAG] Step 1: Requesting permissions...');
      const hasPermissions = await requestPermissions();
      console.log('[BLE-ADV-DIAG] Permissions result:', hasPermissions);
      if (!hasPermissions) {
        console.error('[BLE-ADV-DIAG] ❌ Permissions denied, cannot start advertising');
        return;
      }

      // Calculate localName with current username/userId (ensures latest values)
      // Format: "DropLink-" + username (or userId if username is null, or 'Unknown' if both null)
      const currentLocalName = `${DROPLINK_DEVICE_PREFIX}${username || userId || 'Unknown'}`;
      
      // Start advertising with Service UUID using munim-bluetooth-peripheral API
      // Note: startAdvertising is synchronous (returns void), no await needed
      if (!startAdvertisingNative) {
        console.error('[BLE-ADV-DIAG] ❌ startAdvertisingNative is null!');
        throw new Error('startAdvertising function not available');
      }
      
      console.log('[BLE-ADV-DIAG] Step 2: Calling startAdvertisingNative...');
      console.log('[BLE-ADV-DIAG] Username:', username || 'null');
      console.log('[BLE-ADV-DIAG] UserId:', userId || 'null');
      console.log('[BLE-ADV-DIAG] Options:', {
        serviceUUIDs: [DROPLINK_SERVICE_UUID],
        localName: currentLocalName,
      });
      console.log('[BLE-ADV-DIAG] Broadcasting as:', currentLocalName);
      console.log('[BLE-ADV-DIAG] startAdvertisingNative type:', typeof startAdvertisingNative);
      
      startAdvertisingNative({
        serviceUUIDs: [DROPLINK_SERVICE_UUID],
        localName: currentLocalName,
      });
      
      // Store the actual name being broadcast for verification
      setBroadcastName(currentLocalName);
      
      console.log('[BLE-ADV-DIAG] Step 3: startAdvertisingNative called (no return value)');
      setIsAdvertising(true);
      setError(null);
      console.log('[BLE-ADV-DIAG] ✅ Step 4: State set to isAdvertising=true');
      console.log('[BLE-ADV-DIAG] ✅ Advertising started successfully');
      console.log('[BLE-ADV-DIAG] ✅ Service UUID:', DROPLINK_SERVICE_UUID);
      console.log('[BLE-ADV-DIAG] ✅ Broadcasting as:', currentLocalName);
      console.log('[BLE-ADV-DIAG] ✅ RESULT: SUCCESS - Advertising is now ACTIVE');
      console.log('[BLE-ADV-DIAG] ============================================');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start advertising';
      console.error('[BLE-ADV-DIAG] ❌ ERROR in startAdvertising:', errorMessage);
      console.error('[BLE-ADV-DIAG] Error details:', err);
      console.error('[BLE-ADV-DIAG] ❌ RESULT: FAILED - Advertising did not start');
      setError(errorMessage);
      setIsAdvertising(false);
      setBroadcastName(null);
      console.log('[BLE-ADV-DIAG] ============================================');
    }
  }, [isAvailable, isAdvertising, requestPermissions, username, userId]);

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
      setBroadcastName(null);
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
    broadcastName, // Actual name being broadcast (null when not advertising)
  };
};

