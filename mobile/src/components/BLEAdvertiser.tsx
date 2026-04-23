import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus, PermissionsAndroid } from 'react-native';
import { State } from 'react-native-ble-plx';
import { DROPLINK_SERVICE_UUID } from '../config/bleConfig';
import { bleManager } from '../services/bleManager';
import { useAuth } from '../contexts/AuthContext';
import BLEAdvertiserNative, { isBLEAdvertiserAvailable } from '../native/BLEAdvertiserNative';
import { supabase } from '../services/supabase';

// Feature flag - can disable advertising if needed
const ADVERTISING_ENABLED = true;
let permissionsGranted = false;

// Use shared BleManager instance from bleManager.ts
// This prevents multiple instances and conflicting state listeners

interface UseBLEAdvertiserReturn {
  isAdvertising: boolean;
  startAdvertising: () => Promise<void>;
  stopAdvertising: () => Promise<void>;
  error: string | null;
  isAvailable: boolean;
  localName: string;
  broadcastName: string | null; // Actual name being broadcast (set when advertising starts)
  deviceId: string; // Device identifier (1-4 characters) used for advertising
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
 * Library: Native Android BLE Advertiser Module
 * API: startAdvertising(serviceUUID), stopAdvertising()
 */
export const useBLEAdvertiser = (): UseBLEAdvertiserReturn => {
  const { username, userId, loading } = useAuth();
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broadcastName, setBroadcastName] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>('0000');
  
  // Compute isAvailable - false when loading to prevent operations during auth
  const isAvailable = !loading && Platform.OS === 'android' && ADVERTISING_ENABLED && isBLEAdvertiserAvailable;

  // localName is no longer used for device identification (manufacturer data is used instead)
  // Keep for display/logging purposes only
  const localName = `DropLink-${deviceId}`;

  // ========== USER ID TRACING ==========
  // Log userId immediately when component mounts/updates
  useEffect(() => {
    console.log('[BLE-ADV-USERID-TRACE] ========== USER ID CHECK ==========');
    console.log('[BLE-ADV-USERID-TRACE] loading:', loading);
    console.log('[BLE-ADV-USERID-TRACE] userId type:', typeof userId);
    console.log('[BLE-ADV-USERID-TRACE] userId value:', userId);
    console.log('[BLE-ADV-USERID-TRACE] userId === null:', userId === null);
    console.log('[BLE-ADV-USERID-TRACE] userId === undefined:', userId === undefined);
    console.log('[BLE-ADV-USERID-TRACE] userId truthy check:', !!userId);
    console.log('[BLE-ADV-USERID-TRACE] userId length:', userId ? userId.length : 'N/A');
    console.log('[BLE-ADV-USERID-TRACE] username:', username);
    console.log('[BLE-ADV-USERID-TRACE] ====================================');
  }, [loading, userId, username]);

  // Generate device ID from userId on mount and when userId changes
  useEffect(() => {
    console.log('[BLE-ADV-DEVICEID] ========== DEVICE ID GENERATION ==========');
    console.log('[BLE-ADV-DEVICEID] userId received:', userId);
    console.log('[BLE-ADV-DEVICEID] userId type:', typeof userId);
    console.log('[BLE-ADV-DEVICEID] userId is null?', userId === null);
    console.log('[BLE-ADV-DEVICEID] userId is undefined?', userId === undefined);
    console.log('[BLE-ADV-DEVICEID] userId truthy?', !!userId);

    if (userId) {
      console.log('[BLE-ADV-DEVICEID] ✅ userId exists, generating deviceId');
      console.log('[BLE-ADV-DEVICEID] userId string:', userId);
      console.log('[BLE-ADV-DEVICEID] userId length:', userId.length);

      // Use first 8 characters of userId as deviceId
      const newDeviceId = userId.substring(0, 8);
      console.log('[BLE-ADV-DEVICEID] Generated deviceId:', newDeviceId);
      console.log('[BLE-ADV-DEVICEID] deviceId length:', newDeviceId.length);
      console.log('[BLE-ADV-DEVICEID] Current deviceId state:', deviceId);

      // Only update if different (prevents unnecessary re-renders)
      setDeviceId(prevDeviceId => {
        if (prevDeviceId !== newDeviceId) {
          console.log('[BLE-ADV-DEVICEID] Updating deviceId state from', prevDeviceId, 'to', newDeviceId);
          return newDeviceId;
        }
        return prevDeviceId;
      });
    } else {
      console.log('[BLE-ADV-DEVICEID] ❌ userId is null/undefined, using fallback');
      console.log('[BLE-ADV-DEVICEID] Setting deviceId to fallback: 0000');
      setDeviceId(prevDeviceId => prevDeviceId !== '0000' ? '0000' : prevDeviceId);
    }
    console.log('[BLE-ADV-DEVICEID] ===========================================');
  }, [userId]); // Only depend on userId - HomeScreen handles advertising start

  // Log availability on mount
  useEffect(() => {
    console.log('[BLE-ADV-DIAG] ========== ADVERTISER MOUNT ==========');
    console.log('[BLE-ADV-DIAG] Library: Native Android BLE Advertiser');
    console.log('[BLE-ADV-DIAG] ADVERTISING_ENABLED:', ADVERTISING_ENABLED);
    console.log('[BLE-ADV-DIAG] loading:', loading);
    console.log('[BLE-ADV-DIAG] isAvailable:', isAvailable);
    console.log('[BLE-ADV-DIAG] Platform:', Platform.OS);
    console.log('[BLE-ADV-DIAG] Service UUID:', DROPLINK_SERVICE_UUID);
    console.log('[BLE-ADV-DIAG] Will broadcast as:', localName);
    console.log('[BLE-ADV-DIAG] Username:', username || 'null');
    console.log('[BLE-ADV-DIAG] UserId:', userId || 'null');
    console.log('[BLE-ADV-DIAG] =======================================');
  }, [loading, localName, username, userId, isAvailable]);

  // Ref to track advertising state for AppState listener (prevents stale closures)
  const isAdvertisingRef = useRef(isAdvertising);
  useEffect(() => {
    isAdvertisingRef.current = isAdvertising;
  }, [isAdvertising]);

  // Synchronous ref to prevent multiple concurrent startAdvertising calls
  // This is set immediately when startAdvertising begins and cleared when it completes
  // Unlike isAdvertisingRef (which syncs via useEffect), this is updated synchronously
  const isStartingRef = useRef(false);

  // Request BLE advertising permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    console.log('[BLE-ADV-DIAG] requestPermissions called, Platform:', Platform.OS);
    if (permissionsGranted) {
      return true;
    }
    if (Platform.OS === 'web') {
      console.log('[BLE-ADV-DIAG] Web platform - no permissions needed');
      return false;
    }

    if (Platform.OS === 'android') {
      try {
        // Android 12+ (API 31+) requires BLUETOOTH_ADVERTISE, BLUETOOTH_CONNECT, BLUETOOTH_SCAN
        // Android 6-11 (API 23-30) requires ACCESS_FINE_LOCATION
        const androidVersion = Platform.Version;

        if (androidVersion >= 31) {
          // Android 12+
          console.log('[BLE-ADV-DIAG] Requesting Android 12+ permissions: BLUETOOTH_ADVERTISE, BLUETOOTH_CONNECT, BLUETOOTH_SCAN');
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
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
          permissionsGranted = true;
          return true;
        } else if (androidVersion >= 23) {
          // Android 6-11
          console.log('[BLE-ADV-DIAG] Requesting Android 6-11 permission: ACCESS_FINE_LOCATION');
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );

          console.log('[BLE-ADV-DIAG] Permission result:', granted);

          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            console.error('[BLE-ADV-DIAG] ❌ Permission not granted:', granted);
            setError('Location permission required for Bluetooth advertising');
            return false;
          }

          console.log('[BLE-ADV-DIAG] ✅ Permission granted');
          permissionsGranted = true;
          return true;
        } else {
          // Android 5 and below - no runtime permissions needed
          console.log('[BLE-ADV-DIAG] Android 5 or below - no runtime permissions needed');
          permissionsGranted = true;
          return true;
        }
      } catch (err) {
        console.error('[BLE-ADV-DIAG] ❌ Permission request error:', err);
        setError('Failed to request permissions');
        return false;
      }
    }

    console.log('[BLE-ADV-DIAG] ✅ Permissions OK (non-Android platform)');
    permissionsGranted = true;
    return true;
  }, []);

  // Start advertising
  const startAdvertising = useCallback(async () => {
    console.log('[GHOST-MODE] ========== startAdvertising() CALLED ==========');
    console.log('[GHOST-MODE] Platform:', Platform.OS);
    console.log('[GHOST-MODE] isAvailable:', isAvailable);
    console.log('[GHOST-MODE] isAdvertisingRef.current:', isAdvertisingRef.current);
    console.log('[GHOST-MODE] isStartingRef.current:', isStartingRef.current);
    console.log('[GHOST-MODE] UserId:', userId ? userId.substring(0, 8) + '...' : 'null');

    // SYNCHRONOUS GUARD: Prevent multiple concurrent start attempts
    // This catches rapid-fire calls before any async operations begin
    if (isStartingRef.current) {
      console.log('[BLE-ADV-DIAG] ⏳ startAdvertising already in progress, skipping duplicate call');
      console.log('[GHOST-MODE] ============================================');
      return;
    }

    if (!isAvailable) {
      console.error('[BLE-ADV-DIAG] ❌ Advertising not available (not Android or disabled)');
      console.log('[BLE-ADV-DIAG] Platform:', Platform.OS);
      console.log('[BLE-ADV-DIAG] ADVERTISING_ENABLED:', ADVERTISING_ENABLED);
      return;
    }

    if (Platform.OS === 'web') {
      console.log('[BLE-ADV-DIAG] Web platform - advertising not supported');
      return;
    }

    if (isAdvertisingRef.current) {
      console.log('[BLE-ADV-DIAG] Already advertising, skipping start');
      return;
    }

    // Wait for userId before starting advertising
    if (!userId) {
      console.log('[BLE-ADV-DIAG] ⏳ Waiting for userId, skipping start');
      return;
    }

    // SET SYNCHRONOUS GUARD immediately before any async operations
    isStartingRef.current = true;
    console.log('[BLE-ADV-DIAG] 🔒 Set isStartingRef = true (preventing concurrent calls)');

    try {
      console.log('[BLE-ADV-DIAG] Step 1: Requesting permissions...');
      const hasPermissions = await requestPermissions();
      console.log('[BLE-ADV-DIAG] Permissions result:', hasPermissions);
      if (!hasPermissions) {
        console.error('[BLE-ADV-DIAG] ❌ Permissions denied, cannot start advertising');
        return;
      }

      // Calculate deviceId directly from userId (don't rely on state which might be stale)
      // Use first 8 characters of userId as deviceId
      const calculatedDeviceId = userId.substring(0, 8);
      // localName is no longer used for device identification (manufacturer data is used instead)
      const currentLocalName = `DropLink-${calculatedDeviceId}`;

      console.log('[BLE-ADV-DIAG] Step 2: Starting native BLE advertising...');
      console.log('[BLE-ADV-DIAG] UserId:', userId);
      console.log('[BLE-ADV-DIAG] Calculated Device ID:', calculatedDeviceId);
      console.log('[BLE-ADV-DIAG] Device ID from state:', deviceId);
      console.log('[BLE-ADV-DIAG] Service UUID:', DROPLINK_SERVICE_UUID);
      console.log('[BLE-ADV-DIAG] Device name will be set to:', currentLocalName);

      // Validate deviceId is not the fallback value
      if (calculatedDeviceId === '0000' || calculatedDeviceId.length === 0) {
        throw new Error('Invalid deviceId: userId not properly loaded');
      }

      // Start advertising with Service UUID and deviceId using native module
      // The native module handles setting the device name and advertising the UUID
      const result = await BLEAdvertiserNative.startAdvertising(DROPLINK_SERVICE_UUID, calculatedDeviceId);

      if (result.success) {
        // Store the actual name being broadcast for verification
        setBroadcastName(currentLocalName);
        console.log('[GHOST-MODE] ✅ SUCCESS: Native module returned success');
        setIsAdvertising(true);
        setError(null);
        console.log('[GHOST-MODE] ✅ Broadcasting as:', currentLocalName);
        console.log('[GHOST-MODE] ✅ Service UUID:', DROPLINK_SERVICE_UUID);
        console.log('[GHOST-MODE] ✅ RESULT: Advertising is NOW ACTIVE');
        console.log('[GHOST-MODE] ✅ You are now VISIBLE to nearby devices');
      } else {
        // Native module not available, advertising disabled
        console.log('[BLE-ADV-DIAG] Native module unavailable, advertising disabled');
        setError('Advertising not available on this device');
        setIsAdvertising(false);
        setBroadcastName(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start advertising';
      console.error('[GHOST-MODE] ❌ FAILED: startAdvertising error:', errorMessage);
      console.error('[GHOST-MODE] ❌ Error details:', err);
      console.error('[GHOST-MODE] ❌ RESULT: Advertising did NOT start');
      setError(errorMessage);
      setIsAdvertising(false);
      setBroadcastName(null);
    } finally {
      // ALWAYS clear the synchronous guard when operation completes (success or failure)
      isStartingRef.current = false;
      console.log('[BLE-ADV-DIAG] 🔓 Set isStartingRef = false (allowing future calls)');
      console.log('[GHOST-MODE] ============================================');
    }
  }, [isAvailable, requestPermissions, userId]); // Removed isAdvertising - use ref to prevent useEffect re-triggers

  // Stop advertising
  const stopAdvertising = useCallback(async () => {
    console.log('[GHOST-MODE] ========== stopAdvertising() CALLED ==========');
    console.log('[GHOST-MODE] isAvailable:', isAvailable);
    console.log('[GHOST-MODE] isAdvertisingRef.current:', isAdvertisingRef.current);

    if (!isAvailable || !isAdvertisingRef.current) {
      console.log('[GHOST-MODE] Skip: Not available or not currently advertising');
      console.log('[GHOST-MODE] ============================================');
      return;
    }

    try {
      console.log('[GHOST-MODE] Calling native stopAdvertising()...');
      await BLEAdvertiserNative.stopAdvertising();
      setIsAdvertising(false);
      setBroadcastName(null);
      setError(null);
      console.log('[GHOST-MODE] ✅ SUCCESS: Advertising stopped');
      console.log('[GHOST-MODE] ✅ You are now INVISIBLE (Ghost Mode)');
      console.log('[GHOST-MODE] ============================================');
    } catch (err) {
      console.error('[GHOST-MODE] ❌ FAILED: stopAdvertising error:', err);
      setError('Failed to stop advertising');
      console.log('[GHOST-MODE] ============================================');
    }
  }, [isAvailable]); // Removed isAdvertising - use ref to prevent useEffect re-triggers

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
    localName,
    broadcastName, // Actual name being broadcast (null when not advertising)
    deviceId, // Device identifier (1-4 characters) used for advertising
  };
};

