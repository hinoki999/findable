import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, type, getTheme } from '../theme';
import { useDarkMode } from '../../App';

interface TopBarProps {
  title: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
}

export default function TopBar({ title, rightIcon, onRightIconPress }: TopBarProps) {
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
      <Text style={{ ...theme.type.title, textAlign:'center' }}>{title}</Text>
      
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
