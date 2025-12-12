import { Platform } from 'react-native';
import { BleManager } from 'react-native-ble-plx';

/**
 * Shared BleManager instance for the entire app
 * Only one instance should exist to prevent conflicting state listeners
 */
export const bleManager = Platform.OS !== 'web' ? new BleManager() : null;

