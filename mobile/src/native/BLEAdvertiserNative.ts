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

if (!BLEAdvertiserNative) {
  throw new Error(
    'BLEAdvertiserNative module not found. Make sure the native module is properly linked.'
  );
}

export default BLEAdvertiserNative as BLEAdvertiserNativeInterface;
