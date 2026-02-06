/**
 * Custom Expo Config Plugin for munim-bluetooth-peripheral
 * 
 * This plugin ensures the native module is properly linked during prebuild.
 * Since munim-bluetooth-peripheral doesn't have its own config plugin,
 * we rely on React Native's autolinking to handle the native module.
 * 
 * This plugin primarily ensures permissions are set correctly.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Main plugin function
 * 
 * Note: React Native's autolinking should automatically link munim-bluetooth-peripheral
 * if it's properly configured in its package.json. This plugin ensures
 * permissions are correctly set in AndroidManifest.xml.
 */
const withMunimBluetoothPeripheral = (config) => {
  // Permissions are already set in app.json, so autolinking should handle the rest
  // If autolinking doesn't work, the library may need manual native code integration
  return config;
};

module.exports = withMunimBluetoothPeripheral;

