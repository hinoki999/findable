import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface DeviceCardProps {
  name: string;
  distanceFeet: number;
  rssi: number;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({ name, distanceFeet, rssi }) => {
  // convert RSSI (-100..-50 typical) into a 0–100 strength %
  const strength = Math.max(0, Math.min(100, 2 * (rssi + 100)));

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{name || 'Unknown Device'}</Text>
      <Text style={styles.meta}>
        {distanceFeet.toFixed(1)} ft • RSSI {rssi} dBm
      </Text>
      <View style={styles.signalTrack}>
        <View style={[styles.signalFill, { width: `${strength}%` }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  name: { fontSize: 18, fontWeight: '600' },
  meta: { marginTop: 6, fontSize: 13, color: '#555' },
  signalTrack: {
    height: 6,
    backgroundColor: '#eee',
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  signalFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
});
