import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, type, getTheme } from '../theme';
import { useDarkMode } from '../../App';

interface TopBarProps {
  title: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
  subtitle?: string;
}

export default function TopBar({ title, rightIcon, onRightIconPress, subtitle }: TopBarProps) {
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
      <View style={{ alignItems: 'center' }}>
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
