import React, { useState, useEffect } from 'react';
import { View, FlatList, Button, StyleSheet, Text, Alert, PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

interface BleDevice {
  id: string;
  name: string;
  rssi: number;
}

const bleManager = new BleManager();

export const BleScanner: React.FC = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<BleDevice[]>([]);

  useEffect(() => {
    requestPermissions();
    return () => {
      bleManager.destroy();
    };
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        console.log('Permissions granted:', granted);
      } catch (err) {
        console.warn(err);
      }
    }
  };

  const startScan = () => {
    setDevices([]);
    setIsScanning(true);

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error(error);
        setIsScanning(false);
        Alert.alert('Scan Error', error.message);
        return;
      }

      if (device && device.name) {
        setDevices(prevDevices => {
          const exists = prevDevices.find(d => d.id === device.id);
          if (!exists) {
            return [...prevDevices, {
              id: device.id,
              name: device.name || 'Unknown',
              rssi: device.rssi || 0,
            }];
          }
          return prevDevices;
        });
      }
    });

    setTimeout(() => {
      stopScan();
    }, 10000);
  };

  const stopScan = () => {
    bleManager.stopDeviceScan();
    setIsScanning(false);
  };

  const calculateDistance = (rssi: number) => {
    const measuredPower = -59;
    return Math.pow(10, (measuredPower - rssi) / (10 * 2));
  };

  return (
    <View style={styles.container}>
      <Button
        title={isScanning ? 'Stop Scan' : 'Start Scan'}
        onPress={isScanning ? stopScan : startScan}
        color='#4CAF50'
      />
      <FlatList
        data={devices}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.deviceName}>{item.name}</Text>
            <Text style={styles.deviceInfo}>RSSI: {item.rssi} dBm</Text>
            <Text style={styles.deviceInfo}>
              Distance: {calculateDistance(item.rssi).toFixed(1)}m
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {isScanning ? 'Scanning for devices...' : 'Press Start Scan to find BLE devices'}
          </Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  deviceInfo: {
    fontSize: 14,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
    color: '#999',
  },
});
