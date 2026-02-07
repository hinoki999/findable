import { NativeModules, Platform } from 'react-native';

interface BLEAdvertiserModule {
  startAdvertising(serviceUUID: string, username: string): Promise<void>;
  stopAdvertising(): Promise<void>;
  isAdvertising(): Promise<boolean>;
}

const { BLEAdvertiserModule } = NativeModules;

// Type-safe wrapper for the native module
export const BLEAdvertiser: BLEAdvertiserModule = {
  startAdvertising: (serviceUUID: string, username: string): Promise<void> => {
    if (Platform.OS !== 'android') {
      return Promise.reject(new Error('BLE advertising is only supported on Android'));
    }

    if (!BLEAdvertiserModule) {
      return Promise.reject(new Error('BLEAdvertiserModule is not available'));
    }

    return BLEAdvertiserModule.startAdvertising(serviceUUID, username);
  },

  stopAdvertising: (): Promise<void> => {
    if (Platform.OS !== 'android') {
      return Promise.reject(new Error('BLE advertising is only supported on Android'));
    }

    if (!BLEAdvertiserModule) {
      return Promise.reject(new Error('BLEAdvertiserModule is not available'));
    }

    return BLEAdvertiserModule.stopAdvertising();
  },

  isAdvertising: (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return Promise.resolve(false);
    }

    if (!BLEAdvertiserModule) {
      return Promise.resolve(false);
    }

    return BLEAdvertiserModule.isAdvertising();
  },
};

