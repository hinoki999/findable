import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
  
  return (
    <View style={{ 
      backgroundColor: theme.colors.bg, 
      borderBottomColor: theme.colors.border, 
      borderBottomWidth: 1, 
      paddingVertical: 10,
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <View style={{ alignItems: 'center', flexDirection: 'column', gap: 2 }}>
        {logoMode ? (
          <>
            {/* DropLink Logo with Gradient Effect */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {/* D - Full orange */}
                <Text style={{ 
                  fontSize: 22, 
                  fontFamily: 'Inter_600SemiBold', 
                  color: '#FF6B4A',
                  letterSpacing: -0.5,
                }}>D</Text>
                {/* r - Orange to red-orange */}
                <Text style={{ 
                  fontSize: 22, 
                  fontFamily: 'Inter_600SemiBold', 
                  color: '#FF6855',
                  letterSpacing: -0.5,
                }}>r</Text>
                {/* o - Orange-purple transition */}
                <Text style={{ 
                  fontSize: 22, 
                  fontFamily: 'Inter_600SemiBold', 
                  color: '#E8649E',
                  letterSpacing: -0.5,
                }}>o</Text>
                {/* p - Purple transition */}
                <Text style={{ 
                  fontSize: 22, 
                  fontFamily: 'Inter_600SemiBold', 
                  color: '#B975D5',
                  letterSpacing: -0.5,
                }}>p</Text>
                {/* L - Blue-purple */}
                <Text style={{ 
                  fontSize: 22, 
                  fontFamily: 'Inter_600SemiBold', 
                  color: '#8082E8',
                  letterSpacing: -0.5,
                }}>L</Text>
                {/* i - Light blue */}
                <Text style={{ 
                  fontSize: 22, 
                  fontFamily: 'Inter_600SemiBold', 
                  color: '#6589EE',
                  letterSpacing: -0.5,
                }}>i</Text>
                {/* n - Blue */}
                <Text style={{ 
                  fontSize: 22, 
                  fontFamily: 'Inter_600SemiBold', 
                  color: '#578CF4',
                  letterSpacing: -0.5,
                }}>n</Text>
                {/* k - Full blue */}
                <Text style={{ 
                  fontSize: 22, 
                  fontFamily: 'Inter_600SemiBold', 
                  color: '#4A90FF',
                  letterSpacing: -0.5,
                }}>k</Text>
              </View>
              {/* Logo Icon */}
              {logoIcon && (
                <MaterialCommunityIcons 
                  name={logoIcon as any} 
                  size={24} 
                  color={theme.colors.blue} 
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
            <Text style={{ ...theme.type.title, textAlign:'center' }}>{title}</Text>
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
      
      {rightIcon && onRightIconPress && (
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
      )}
    </View>
  );
}
