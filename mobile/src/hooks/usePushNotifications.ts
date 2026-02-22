import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { savePushToken } from '../services/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function usePushNotifications(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    const registerForPushNotifications = async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          return;
        }
        const token = await Notifications.getExpoPushTokenAsync();
        await savePushToken(token.data);
      } catch (error) {
        console.error('[Push] Failed to register for push notifications:', error);
      }
    };
    registerForPushNotifications();
  }, [userId]);
}
