import React from 'react';
import { View } from 'react-native';
import { DeviceCard, DeviceCardProps } from './DeviceCard';

interface DeviceListProps {
  devices: DeviceCardProps[];
  isDarkMode?: boolean;
}

export const DeviceList: React.FC<DeviceListProps> = ({ devices, isDarkMode = false }) => {
  return (
    <View>
      {devices.map((device, idx) => (
        <DeviceCard 
          key={device.id || `${device.name}-${device.rssi}-${idx}`} 
          name={device.name} 
          distanceFeet={device.distanceFeet} 
          rssi={device.rssi}
          isDarkMode={isDarkMode}
        />
      ))}
    </View>
  );
};
