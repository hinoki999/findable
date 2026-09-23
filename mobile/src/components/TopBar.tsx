import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type, getTheme } from '../theme';
import { useDarkMode } from '../../App';

interface TopBarProps {
  title?: string;
  rightIcon?: any;
  onRightIconPress?: () => void;
  subtitle?: string;
  logoMode?: boolean; // If true, displays "Drop" in orange + "Link" in blue
  logoIcon?: any; // Icon to display next to logo (e.g., "water-outline", "link-variant", "account-outline")
}

export default function TopBar({ title, rightIcon, onRightIconPress, subtitle, logoMode, logoIcon }: TopBarProps) {
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);
  const insets = useSafeAreaInsets();

  return (
    <View style={{
      backgroundColor: theme.colors.bg,
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      paddingTop: insets.top + 10,
      paddingBottom: 10,
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <View style={{ alignItems: 'center', flexDirection: 'column', gap: 2 }}>
        {logoMode ? (
          <>
            {/* DropShake Logo with Gradient Effect */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <LinearGradient
                colors={['#FF6B4A', '#FFA892', '#92AAE8', '#4A90FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={{
                  fontSize: 22,
                  fontFamily: 'Inter_600SemiBold',
                  letterSpacing: -0.5,
                }}>DropShake</Text>
              </LinearGradient>
              {/* Logo Icon */}
              {logoIcon && (
                <MaterialCommunityIcons
                  name={logoIcon as any}
                  size={24}
                  color={logoIcon === 'link-variant' ? '#FF6B4A' : theme.colors.blue}
                />
              )}
            </View>
            {/* Subtitle below logo */}
            {subtitle && (
              <Text style={{
                fontSize: 11,
                color: theme.colors.muted,
                fontFamily: 'Inter_400Regular',
              }}>
                {subtitle}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={{ ...theme.type.title, textAlign: 'center' }}>{title}</Text>
            {subtitle && (
              <Text style={{
                fontSize: 11,
                color: theme.colors.muted,
                fontFamily: 'Inter_400Regular',
                marginTop: 2,
              }}>
                {subtitle}
              </Text>
            )}
          </>
        )}
      </View>

      {
        rightIcon && onRightIconPress && (
          <Pressable
            onPress={onRightIconPress}
            style={{
              position: 'absolute',
              right: 16,
              padding: 8,
            }}
          >
            <MaterialCommunityIcons name={rightIcon} size={24} color={theme.colors.blue} />
          </Pressable>
        )
      }
    </View >
  );
}
