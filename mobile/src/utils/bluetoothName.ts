/**
 * Bluetooth Name Utility
 * 
 * Attempts to read the system Bluetooth device name.
 * On Android, this uses the BluetoothAdapter API.
 * On iOS, this is not directly accessible.
 * 
 * Note: Setting the Bluetooth name programmatically requires system-level
 * permissions that apps typically don't have. Users must set it manually
 * in their phone's Bluetooth settings.
 */

import { Platform, NativeModules } from 'react-native';

// Native module for reading Bluetooth name (Android only)
let BluetoothNameModule: { getBluetoothName: () => Promise<string | null> } | null = null;

try {
  if (Platform.OS === 'android') {
    BluetoothNameModule = NativeModules.BluetoothNameModule;
  }
} catch (error) {
  console.warn('[BluetoothName] Native module not available:', error);
}

/**
 * Get the current system Bluetooth device name
 * @returns The Bluetooth name, or null if unavailable
 */
export async function getBluetoothName(): Promise<string | null> {
  if (Platform.OS === 'android' && BluetoothNameModule) {
    try {
      const name = await BluetoothNameModule.getBluetoothName();
      return name;
    } catch (error) {
      console.warn('[BluetoothName] Error reading Bluetooth name:', error);
      return null;
    }
  }
  
  // iOS doesn't allow reading the Bluetooth name directly
  // Android fallback if native module unavailable
  return null;
}

/**
 * Get instructions for manually setting Bluetooth name
 * @param desiredName The name the user should set (e.g., "DropLink-username")
 * @returns Instructions string
 */
export function getBluetoothNameInstructions(desiredName: string): string {
  if (Platform.OS === 'android') {
    return `To set your Bluetooth name to "${desiredName}":
1. Open Android Settings
2. Go to "Connected devices" or "Bluetooth"
3. Tap "Device name" or "Bluetooth device name"
4. Change it to: ${desiredName}
5. Save and return to DropLink`;
  } else if (Platform.OS === 'ios') {
    return `To set your Bluetooth name to "${desiredName}":
1. Open iOS Settings
2. Go to "General" > "About" > "Name"
3. Change your device name to: ${desiredName}
4. Return to DropLink`;
  }
  
  return `Please set your Bluetooth device name to: ${desiredName}`;
}

/**
 * Check if the current Bluetooth name matches the desired DropLink format
 * @param currentName Current Bluetooth name (or null if unknown)
 * @param desiredName Desired name (e.g., "DropLink-username")
 * @returns true if names match, false otherwise
 */
export function isBluetoothNameCorrect(
  currentName: string | null,
  desiredName: string
): boolean {
  if (!currentName) return false;
  return currentName.trim() === desiredName.trim();
}

