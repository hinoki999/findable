import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
}

// Simple network detection hook
export function useNetworkStatus(): NetworkState {
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
  });

  useEffect(() => {
    // For web platform, use browser's online/offline events
    if (Platform.OS === 'web') {
      const handleOnline = () => {
        setNetworkState({
          isConnected: true,
          isInternetReachable: true,
        });
      };

      const handleOffline = () => {
        setNetworkState({
          isConnected: false,
          isInternetReachable: false,
        });
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Check initial state
      setNetworkState({
        isConnected: navigator.onLine,
        isInternetReachable: navigator.onLine,
      });

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    // For native, would use @react-native-community/netinfo
    // For now, assume connected on native
    return () => {};
  }, []);

  return networkState;
}

// Retry helper with exponential backoff
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry if it's the last attempt
      if (i === maxRetries - 1) {
        break;
      }
      
      // Wait with exponential backoff
      const delay = initialDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}


