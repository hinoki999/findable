// Optional: Display current environment in app
// Useful during development to confirm which backend you're using
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ENV, isDevelopment } from '../config/environment';

interface EnvironmentBadgeProps {
  show?: boolean; // Set to false to hide in production builds
}

export default function EnvironmentBadge({ show = true }: EnvironmentBadgeProps) {
  // Only show in development, or if explicitly enabled
  if (!show && !isDevelopment()) {
    return null;
  }

  return (
    <View style={[
      styles.container,
      { backgroundColor: isDevelopment() ? '#FF9500' : '#34C759' }
    ]}>
      <Text style={styles.text}>
        {ENV.NAME} • {ENV.BASE_URL.replace('https://', '').replace('http://', '')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 4,
    alignItems: 'center',
    opacity: 0.8,
    zIndex: 9999,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
  },
});

