/**
 * Cross-platform secure storage abstraction
 *
 * Uses:
 * - Web: localStorage (browser storage)
 * - iOS/Android: SecureStore (encrypted keychain/keystore)
 *
 * This provides a unified API for storing sensitive data like auth tokens
 * across all platforms.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const storage = {
  /**
   * Retrieve a value from storage
   * @param key The key to retrieve
   * @returns The stored value or null if not found
   */
  async getItem(key: string): Promise<string | null> {
    try {
      let value: string | null = null;
      
      if (Platform.OS === 'web') {
        value = localStorage.getItem(key);
      } else {
        value = await SecureStore.getItemAsync(key);
      }
      
      // Validate token format if this is an auth token
      if (key === 'authToken' && value) {
        // Check if it's the literal string "null" or "undefined"
        if (value === 'null' || value === 'undefined') {
          console.warn('🚨 Found invalid token string, clearing it');
          await this.removeItem(key);
          return null;
        }
        
        // Check if it's a valid JWT format (should have 3 segments)
        const segments = value.split('.').length;
        if (segments !== 3) {
          console.warn(`🚨 Invalid JWT format (${segments} segments), clearing it`);
          await this.removeItem(key);
          return null;
        }
      }
      
      return value;
    } catch (error) {
      console.error(`Error getting item ${key} from storage:`, error);
      return null;
    }
  },

  /**
   * Store a value in storage
   * @param key The key to store the value under
   * @param value The value to store
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      // Don't store null/undefined as strings
      if (!value || value === 'null' || value === 'undefined') {
        console.warn(`🚨 Attempted to store invalid value for ${key}, removing instead`);
        await this.removeItem(key);
        return;
      }
      
      if (Platform.OS === 'web') {
        localStorage.setItem(key, value);
      } else {
        await SecureStore.setItemAsync(key, value);
      }
    } catch (error) {
      console.error(`Error setting item ${key} in storage:`, error);
      throw error;
    }
  },

  /**
   * Remove a value from storage
   * @param key The key to remove
   */
  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(key);
      } else {
        await SecureStore.deleteItemAsync(key);
      }
    } catch (error) {
      console.error(`Error removing item ${key} from storage:`, error);
      throw error;
    }
  },
};
