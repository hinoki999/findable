import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getTheme } from '../theme';

export interface DeviceCardProps {
  id?: string;
  name: string;
  distanceFeet: number;
  rssi: number;
  isDarkMode?: boolean;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({ 
  name, 
  distanceFeet, 
  rssi, 
  isDarkMode = false 
}) => {
  const theme = getTheme(isDarkMode);
  
  // Convert RSSI (-100..-50 typical) into a 0–100 strength %
  const strength = Math.max(0, Math.min(100, 2 * (rssi + 100)));

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.white }]}>
      <Text style={[styles.name, { color: theme.colors.text }]}>
        {name || 'Unknown Device'}
      </Text>
      <Text style={[styles.meta, { color: theme.colors.muted }]}>
        {distanceFeet.toFixed(1)} ft • RSSI {rssi} dBm
      </Text>
      <View style={[styles.signalTrack, { backgroundColor: theme.colors.border }]}>
        <View style={[styles.signalFill, { width: `${strength}%` }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  name: { 
    fontSize: 18, 
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  meta: { 
    marginTop: 6, 
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  signalTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  signalFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50', // Keep green for signal strength
  },
});
