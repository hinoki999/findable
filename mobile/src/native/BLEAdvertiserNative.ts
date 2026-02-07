import { NativeModules } from 'react-native';

const { BLEAdvertiserModule } = NativeModules;

interface BLEAdvertiserNative {
  startAdvertising(serviceUUID: string): Promise<void>;
  stopAdvertising(): void;
}

// Type-safe wrapper for the native module
export const BLEAdvertiserNative: BLEAdvertiserNative = {
  startAdvertising: (serviceUUID: string): Promise<void> => {
    if (!BLEAdvertiserModule) {
      return Promise.reject(new Error('BLEAdvertiserModule is not available'));
    }
    return BLEAdvertiserModule.startAdvertising(serviceUUID);
  },

  stopAdvertising: (): void => {
    if (!BLEAdvertiserModule) {
      console.warn('[BLEAdvertiserNative] BLEAdvertiserModule is not available');
      return;
    }
    BLEAdvertiserModule.stopAdvertising();
  },
};

export default BLEAdvertiserNative;

