const API_URL = 'http://172.20.10.2:8000';

export const saveDeviceScan = async (device: {
  name: string;
  rssi: number;
  distance: number;
  user_id: number;
}) => {
  try {
    const response = await fetch(API_URL + '/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(device),
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to save device:', error);
    throw error;
  }
};

export const getDeviceHistory = async () => {
  try {
    const response = await fetch(API_URL + '/devices');
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch devices:', error);
    throw error;
  }
};
