import React from 'react';
import { View } from 'react-native';
import { DeviceCard, DeviceCardProps } from './DeviceCard';

interface DeviceListProps {
  devices: DeviceCardProps[];
}

export const DeviceList: React.FC<DeviceListProps> = ({ devices }) => {
  return (
    <View>
      {devices.map((d, idx) => (
        <DeviceCard key={idx} name={d.name} distanceFeet={d.distanceFeet} rssi={d.rssi} />
      ))}
    </View>
  );
};
