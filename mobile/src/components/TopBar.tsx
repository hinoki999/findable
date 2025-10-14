import React from 'react';
import { View, Text } from 'react-native';
import { colors, type, getTheme } from '../theme';
import { useDarkMode } from '../../App';

export default function TopBar({ title }: { title: string }) {
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);
  
  return (
    <View style={{ backgroundColor: theme.colors.bg, borderBottomColor: theme.colors.border, borderBottomWidth: 1, paddingVertical: 10 }}>
      <Text style={{ ...theme.type.title, textAlign:'center' }}>{title}</Text>
    </View>
  );
}
