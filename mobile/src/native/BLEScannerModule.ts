import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

// Types for background BLE devices
export interface BackgroundBLEDevice {
  id: string;
  deviceId?: string;
  name: string;
  rssi: number;
  distanceFeet: number;
  lastSeen?: number;
}

// Native module interface
interface BLEScannerModuleInterface {
  startBackgroundScan(): Promise<boolean>;
  stopBackgroundScan(): Promise<boolean>;
  isServiceRunning(): Promise<boolean>;
  getDetectedDevices(): Promise<BackgroundBLEDevice[]>;
  clearDetectedDevices(): Promise<boolean>;
}

const { BLEScannerModule } = NativeModules;

// Check if module exists (Android only)
export const isBackgroundScanAvailable = Platform.OS === 'android' && BLEScannerModule != null;

// Create event emitter for device found events (only if module available)
export const backgroundScannerEmitter = isBackgroundScanAvailable 
  ? new NativeEventEmitter(BLEScannerModule)
  : null;

// Event names
export const BLE_EVENTS = {
  DEVICE_FOUND: 'BLEBackgroundDeviceFound',
  DEVICES_UPDATED: 'BLEBackgroundDevicesUpdated',
};

// Stub implementation for non-Android platforms
const BLEScannerStub: BLEScannerModuleInterface = {
  async startBackgroundScan() {
    console.log('[BG-SCAN] Background scanning not available on this platform');
    return false;
  },
  async stopBackgroundScan() {
    return false;
  },
  async isServiceRunning() {
    return false;
  },
  async getDetectedDevices() {
    return [];
  },
  async clearDetectedDevices() {
    return false;
  },
};

// Export typed module
const BackgroundBLEScanner: BLEScannerModuleInterface = isBackgroundScanAvailable 
  ? (BLEScannerModule as BLEScannerModuleInterface)
  : BLEScannerStub;

export default BackgroundBLEScanner;

// ==================== Convenience Functions ====================

/**
 * Start background BLE scanning service
 * Shows persistent notification on Android
 */
export async function startBackgroundScan(): Promise<boolean> {
  if (!isBackgroundScanAvailable) {
    console.log('[BG-SCAN] Background scanning not available');
    return false;
  }
  
  try {
    console.log('[BG-SCAN] Starting background scan service...');
    const result = await BackgroundBLEScanner.startBackgroundScan();
    console.log('[BG-SCAN] Background scan started:', result);
    return result;
  } catch (error) {
    console.error('[BG-SCAN] Failed to start background scan:', error);
    return false;
  }
}

/**
 * Stop background BLE scanning service
 */
export async function stopBackgroundScan(): Promise<boolean> {
  if (!isBackgroundScanAvailable) return false;
  
  try {
    console.log('[BG-SCAN] Stopping background scan service...');
    const result = await BackgroundBLEScanner.stopBackgroundScan();
    console.log('[BG-SCAN] Background scan stopped:', result);
    return result;
  } catch (error) {
    console.error('[BG-SCAN] Failed to stop background scan:', error);
    return false;
  }
}

/**
 * Check if background scanning service is running
 */
export async function isBackgroundScanRunning(): Promise<boolean> {
  if (!isBackgroundScanAvailable) return false;
  
  try {
    return await BackgroundBLEScanner.isServiceRunning();
  } catch (error) {
    console.error('[BG-SCAN] Failed to check service status:', error);
    return false;
  }
}

/**
 * Get all detected devices from background scan (from SharedPreferences)
 * These persist even when app is closed
 */
export async function getBackgroundDevices(): Promise<BackgroundBLEDevice[]> {
  if (!isBackgroundScanAvailable) return [];
  
  try {
    const devices = await BackgroundBLEScanner.getDetectedDevices();
    console.log('[BG-SCAN] Retrieved', devices.length, 'background devices');
    return devices;
  } catch (error) {
    console.error('[BG-SCAN] Failed to get background devices:', error);
    return [];
  }
}

/**
 * Clear all detected devices from storage
 */
export async function clearBackgroundDevices(): Promise<boolean> {
  if (!isBackgroundScanAvailable) return false;
  
  try {
    return await BackgroundBLEScanner.clearDetectedDevices();
  } catch (error) {
    console.error('[BG-SCAN] Failed to clear devices:', error);
    return false;
  }
}

/**
 * Subscribe to real-time device detection events
 * @param callback - Called when a new device is detected
 * @returns Unsubscribe function
 */
export function onBackgroundDeviceFound(
  callback: (device: BackgroundBLEDevice) => void
): () => void {
  if (!backgroundScannerEmitter) {
    console.log('[BG-SCAN] Event emitter not available');
    return () => {};
  }
  
  const subscription = backgroundScannerEmitter.addListener(
    BLE_EVENTS.DEVICE_FOUND,
    callback
  );
  
  return () => subscription.remove();
}

/**
 * Subscribe to device list update events (when stale devices are removed)
 * @param callback - Called when device list is updated
 * @returns Unsubscribe function
 */
export function onBackgroundDevicesUpdated(
  callback: () => void
): () => void {
  if (!backgroundScannerEmitter) {
    return () => {};
  }
  
  const subscription = backgroundScannerEmitter.addListener(
    BLE_EVENTS.DEVICES_UPDATED,
    callback
  );
  
  return () => subscription.remove();
}
