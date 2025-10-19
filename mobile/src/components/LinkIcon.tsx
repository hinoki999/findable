import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface LinkIconProps {
  size?: number;
}

export default function LinkIcon({ size = 24 }: LinkIconProps) {
  return (
    <MaterialCommunityIcons 
      name="link-variant" 
      size={size} 
      color="#FF6B4A" 
    />
  );
}
