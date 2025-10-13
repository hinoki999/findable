import React from 'react';
import { View, Text, Alert, Button } from 'react-native';
import { saveDevice } from '../services/api';

export default function ScannerScreen() {
  const handleSave = async () => {
    console.log('SAVE_PRESS'); // visible in browser DevTools console
    try {
      const testDevice = { name: 'Test Device', rssi: -60, distanceFeet: 12 };
      const result = await saveDevice(testDevice);
      console.log('SAVE_OK', result);
      Alert.alert('Success', 'Saved!');
    } catch (e) {
      console.log('SAVE_ERR', e);
      Alert.alert('Error', 'Network request failed');
    }
  };

  return (
    <View style={{ flex: 1, padding: 16, justifyContent: 'center', gap: 12 }}>
      <Text style={{ fontSize: 18 }}>Scanner</Text>
      <Button title="Save" onPress={handleSave} />
      <Text style={{ color: '#666' }}>Tap Save, then open the History tab.</Text>
    </View>
  );
}
