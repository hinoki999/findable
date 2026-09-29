import React from 'react';
import { Text, Pressable, Linking, Platform } from 'react-native';
import { useDarkMode } from '../../App';
import { getTheme } from '../theme';
import { BluetoothPermissionStatus } from './BLEScanner';

interface BluetoothNoticeProps {
  isBluetoothOff: boolean;
  permissionStatus: BluetoothPermissionStatus;
  // Re-runs the scan, which shows the permission prompt again
  onRequestPermission: () => void;
}

// Android: show the system "turn on Bluetooth?" prompt, falling back to the
// Bluetooth settings page, then to the app's settings page
async function openBluetoothEnable() {
  if (Platform.OS !== 'android') {
    await Linking.openSettings();
    return;
  }
  try {
    await Linking.sendIntent('android.bluetooth.adapter.action.REQUEST_ENABLE');
    return;
  } catch {
    // needs BLUETOOTH_CONNECT on Android 12+; fall through
  }
  try {
    await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
    return;
  } catch {
    // fall through
  }
  await Linking.openSettings();
}

// Why nearby users can't be found, when the cause is Bluetooth itself. Shown
// under the empty radar (Home) and the empty nearby list (Drop). Tapping fixes it:
// Bluetooth off -> enable prompt; permission denied -> prompt again;
// permission blocked ("Don't ask again") -> the app's settings page.
export default function BluetoothNotice({ isBluetoothOff, permissionStatus, onRequestPermission }: BluetoothNoticeProps) {
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);

  const permissionMissing = permissionStatus === 'denied' || permissionStatus === 'blocked';
  if (!isBluetoothOff && !permissionMissing) {
    return null;
  }

  const handlePress = () => {
    if (isBluetoothOff) {
      openBluetoothEnable();
    } else if (permissionStatus === 'blocked') {
      Linking.openSettings();
    } else {
      onRequestPermission();
    }
  };

  return (
    <Pressable onPress={handlePress} hitSlop={12}>
      <Text style={[theme.type.muted, {
        textAlign: 'center',
        fontSize: 13,
        marginTop: 8,
        color: '#FF6B4A',
      }]}>
        {isBluetoothOff
          ? 'Turn on Bluetooth to detect nearby users'
          : 'Enable Bluetooth permissions to detect nearby users'}
      </Text>
    </Pressable>
  );
}
