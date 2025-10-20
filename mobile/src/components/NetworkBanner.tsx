import React from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetworkStatus } from '../utils/network';

interface NetworkBannerProps {
  isDarkMode?: boolean;
}

export default function NetworkBanner({ isDarkMode = false }: NetworkBannerProps) {
  const { isConnected } = useNetworkStatus();
  const [fadeAnim] = React.useState(new Animated.Value(0));

  React.useEffect(() => {
    if (!isConnected) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isConnected]);

  if (isConnected) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          opacity: fadeAnim,
          backgroundColor: '#FF6B6B',
        },
      ]}
    >
      <MaterialCommunityIcons name="wifi-off" size={16} color="#FFFFFF" />
      <Text style={styles.text}>
        No internet connection
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
});

