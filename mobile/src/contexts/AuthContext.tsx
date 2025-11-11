import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { logAuth, logStateChange } from '../services/activityMonitor';

interface AuthState {
  isAuthenticated: boolean;
  userId: number | null;
  username: string | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (token: string, userId: number, username: string) => Promise<void>;
  logout: () => Promise<void>;
  setLoading: (loading: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Storage helpers that work on both web and native
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    userId: null,
    username: null,
    token: null,
    loading: true,
  });

  // Check for saved token on app start
  useEffect(() => {
    checkStoredAuth();
  }, []);

  const checkStoredAuth = async () => {
    try {
      const token = await storage.getItem('authToken');
      const userId = await storage.getItem('userId');
      const username = await storage.getItem('username');

      if (token && userId && username) {
        setState({
          isAuthenticated: true,
          userId: parseInt(userId),
          username,
          token,
          loading: false,
        });
      } else {
        setState(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('Error checking stored auth:', error);
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  const login = async (token: string, userId: number, username: string) => {
    try {
      await storage.setItem('authToken', token);
      await storage.setItem('userId', userId.toString());
      await storage.setItem('username', username);

      logAuth('Login', { userId, username });
      logStateChange('auth.isAuthenticated', false, true);

      setState({
        isAuthenticated: true,
        userId,
        username,
        token,
        loading: false,
      });
    } catch (error) {
      console.error('Error saving auth data:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await storage.deleteItem('authToken');
      await storage.deleteItem('userId');
      await storage.deleteItem('username');

      logAuth('Logout');
      logStateChange('auth.isAuthenticated', true, false);

      setState({
        isAuthenticated: false,
        userId: null,
        username: null,
        token: null,
        loading: false,
      });
    } catch (error) {
      console.error('Error clearing auth data:', error);
    }
  };

  const setLoading = (loading: boolean) => {
    setState(prev => ({ ...prev, loading }));
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, setLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

