import React from 'react';
import { Text } from 'react-native';

interface LinkIconProps {
  size?: number;
}

export default function LinkIcon({ size = 24 }: LinkIconProps) {
  return (
    <Text style={{ fontSize: size }}>
      🔗
    </Text>
  );
}
