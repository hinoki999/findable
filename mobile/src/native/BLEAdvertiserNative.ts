import { NativeModules } from 'react-native';

interface BLEAdvertiserNativeInterface {
  /**
   * Start BLE advertising with the specified service UUID and device identifier
   * @param serviceUUID - The UUID to advertise (must be valid UUID format)
   * @param deviceId - 1-4 character device identifier (will be broadcast as "DropLink-XXXX")
   * @returns Promise that resolves with {success: boolean, serviceUUID: string}
   */
  startAdvertising(serviceUUID: string, deviceId: string): Promise<{
    success: boolean;
    serviceUUID: string;
  }>;

  /**
   * Stop BLE advertising
   * @returns Promise that resolves when advertising stops
   */
  stopAdvertising(): Promise<void>;

  /**
   * Check if currently advertising
   * @returns Promise that resolves with boolean advertising state
   */
  isAdvertising(): Promise<boolean>;
}

const { BLEAdvertiserNative } = NativeModules;

// Check if native module is available
const isNativeModuleAvailable = !!BLEAdvertiserNative;

// Create stub implementation that fails gracefully when native module is missing
const BLEAdvertiserStub: BLEAdvertiserNativeInterface = {
  async startAdvertising(serviceUUID: string, deviceId: string) {
    console.log('[BLEAdvertiserNative] Native module not available, advertising disabled');
    return { success: false, serviceUUID };
  },
  async stopAdvertising() {
    // No-op
  },
  async isAdvertising() {
    return false;
  },
};

// Export availability flag so other code can check
export const isBLEAdvertiserAvailable = isNativeModuleAvailable;

// Export either real module or stub
export default isNativeModuleAvailable 
  ? (BLEAdvertiserNative as BLEAdvertiserNativeInterface)
  : BLEAdvertiserStub;
