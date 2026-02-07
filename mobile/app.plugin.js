/**
 * Custom Expo Config Plugin
 * 
 * This plugin ensures permissions are set correctly for BLE functionality.
 * react-native-ble-peripheral uses React Native's autolinking, so no
 * additional native module configuration is needed here.
 */

const withBluetoothPermissions = (config) => {
  // Permissions are already set in app.json
  // react-native-ble-peripheral uses autolinking
  return config;
};

module.exports = withBluetoothPermissions;

