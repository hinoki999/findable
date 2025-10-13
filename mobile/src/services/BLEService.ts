import { BleManager, Device, State } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';

class BLEService {
  manager: BleManager;
  
  constructor() {
    this.manager = new BleManager();
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      
      return Object.values(granted).every(
        status => status === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    return true;
  }

  async checkBluetoothState(): Promise<boolean> {
    const state = await this.manager.state();
    return state === State.PoweredOn;
  }

  calculateDistance(rssi: number, txPower: number = -59): number {
    if (rssi === 0) return -1;
    
    const ratio = rssi / txPower;
    if (ratio < 1.0) {
      return Math.pow(ratio, 10);
    } else {
      return (0.89976) * Math.pow(ratio, 7.7095) + 0.111;
    }
  }

  startScanning(
    onDeviceFound: (device: Device) => void,
    onError: (error: any) => void
  ): void {
    this.manager.startDeviceScan(
      null,
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          onError(error);
          return;
        }
        
        if (device && device.rssi) {
          onDeviceFound(device);
        }
      }
    );
  }

  stopScanning(): void {
    this.manager.stopDeviceScan();
  }

  destroy(): void {
    this.manager.destroy();
  }
}

export default new BLEService();
