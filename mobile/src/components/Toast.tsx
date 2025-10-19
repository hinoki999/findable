import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onDismiss: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

export default function Toast({ 
  message, 
  type = 'success', 
  duration = 3000, 
  onDismiss,
  actionLabel,
  onAction 
}: ToastProps) {
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Slide up and fade in
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss after duration
    const timer = setTimeout(() => {
      dismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  const getColors = () => {
    switch (type) {
      case 'success':
        return { bg: '#007AFF', icon: 'check-circle' };
      case 'error':
        return { bg: '#FF3B30', icon: 'alert-circle' };
      case 'info':
        return { bg: '#FF6B4A', icon: 'information' };
      default:
        return { bg: '#007AFF', icon: 'check-circle' };
    }
  };

  const colors = getColors();

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 95, // Above bottom nav
        left: '50%',
        transform: [{ translateY }, { translateX: -100 }], // Center horizontally
        opacity,
        zIndex: 9999,
        width: 200,
      }}
    >
      <View
        style={{
          backgroundColor: colors.bg,
          borderRadius: 6,
          paddingVertical: 6,
          paddingHorizontal: 10,
          flexDirection: 'row',
          alignItems: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 3,
          elevation: 4,
        }}
      >
        <MaterialCommunityIcons 
          name={colors.icon as any} 
          size={14} 
          color="#FFFFFF" 
          style={{ marginRight: 6 }}
        />
        <Text
          style={{
            flex: 1,
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: '500',
          }}
        >
          {message}
        </Text>
        {actionLabel && onAction && (
          <Pressable
            onPress={() => {
              console.log('🔘 Toast action button pressed!');
              onAction();
              dismiss();
            }}
            style={{
              marginLeft: 6,
              paddingVertical: 2,
              paddingHorizontal: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              borderRadius: 4,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>
              {actionLabel}
            </Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

