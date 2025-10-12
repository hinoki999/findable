import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { DeviceList } from '../components/DeviceList';

const MOCK = [
  { name: 'Keys Beacon',  distanceFeet: 12.3, rssi: -62 },
  { name: 'Wallet Tag',   distanceFeet: 32.8, rssi: -78 },
  { name: 'Dog Collar',   distanceFeet:  8.9, rssi: -55 },
];

export default function ScannerScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Nearby Devices</Text>
        <Text style={styles.subtitle}>Scanning (mock)</Text>
      </View>
      <View style={styles.body}>
        <DeviceList devices={MOCK} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F7F8' },
  header: { padding: 16, paddingTop: 24 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { marginTop: 4, color: '#666' },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
});
