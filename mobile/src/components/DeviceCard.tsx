import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  
  // Calculate proximity percentage based on distance (75-0 ft)
  // 0 ft = 100% (closest), 75 ft = 0% (farthest)
  const maxDistance = 75;
  const proximityPercent = Math.max(0.1, Math.min(100, ((maxDistance - distanceFeet) / maxDistance) * 100));
  
  // Calculate gradient width so it always spans the full track conceptually
  // If bar is 10% wide, gradient needs to be 1000% of that to span the full track
  const gradientWidthPercent = (100 / proximityPercent) * 100;
  
  // Calculate pin color based on position in gradient
  const getPinColor = (percent: number) => {
    const p = percent / 100;
    if (p <= 0.4) {
      // Orange range
      return theme.colors.green; // #FF6B4A
    } else {
      // Blue range
      return theme.colors.blue; // #007AFF
    }
  };
  
  const pinColor = getPinColor(proximityPercent);

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.white }]}>
      <Text style={[styles.name, { color: theme.colors.text }]}>
        {name || 'Unknown Device'}
      </Text>
      <Text style={[styles.meta, { color: theme.colors.muted }]}>
        {distanceFeet.toFixed(1)} ft away
      </Text>
      <View style={[styles.signalTrack, { backgroundColor: theme.colors.border }]}>
        <View style={[styles.gradientWrapper, { width: `${proximityPercent}%` }]}>
          <View style={styles.signalFillContainer}>
            <LinearGradient
              colors={[theme.colors.green, '#FF8C42', theme.colors.blue]} // Orange → Vibrant Orange → Blue
              locations={[0, 0.25, 1.0]} // Blue hits gradually after 25%
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.signalGradient, { width: `${gradientWidthPercent}%` }]}
            />
          </View>
          {/* Pin icon at the end of the bar */}
          <View style={styles.pinContainer}>
            <MaterialCommunityIcons 
              name="map-marker" 
              size={18} 
              color={pinColor}
            />
          </View>
        </View>
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
    overflow: 'visible',
    position: 'relative',
  },
  gradientWrapper: {
    height: 6,
    position: 'relative',
    overflow: 'visible',
  },
  signalFillContainer: {
    height: 6,
    overflow: 'hidden',
  },
  signalGradient: {
    height: 6,
  },
  pinContainer: {
    position: 'absolute',
    right: -9,
    top: -6,
    zIndex: 10,
  },
});
