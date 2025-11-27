import React, { createContext, useContext, useState, useEffect } from 'react';
import { logAuth, logStateChange } from '../services/activityMonitor';
import { supabase } from '../services/supabase';

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  username: string | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, username: string) => Promise<{ success: boolean; userId?: string; error?: string }>;
  logout: () => Promise<void>;
  setLoading: (loading: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
      // Check for Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setState({
          isAuthenticated: true,
          userId: session.user.id,
          username: session.user.email || null,
          token: session.access_token,
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

  const login = async (email: string, password: string) => {
    try {
      console.log('🔐 Login attempt:', { email, passwordLength: password.length });
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });
      
      if (error) {
        console.error('🔐 Login error details:', {
          message: error.message,
          status: error.status,
          name: error.name,
          // Full error object for debugging
          fullError: JSON.stringify(error, null, 2)
        });
        throw error;
      }
      
      // Supabase user ID is UUID string
      const userId = data.user.id;
      
      console.log('✅ Login successful:', { userId, email: data.user.email });
      
      setState({
        isAuthenticated: true,
        userId: userId,
        username: data.user.email || null,
        token: data.session?.access_token || null,
        loading: false,
      });
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Login failed' 
      };
    }
  };

  const signup = async (email: string, password: string, username: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
          data: { username }
        }
      });
      
      if (error) throw error;
      
      // Auto-login after signup
      if (data.user) {
        setState({
          isAuthenticated: true,
          userId: data.user.id,
          username: data.user.email || null,
          token: data.session?.access_token || null,
          loading: false,
        });
      }
      
      return { success: true, userId: data.user?.id };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Signup failed' 
      };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
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
      console.error('Error logging out:', error);
    }
  };

  const setLoading = (loading: boolean) => {
    setState(prev => ({ ...prev, loading }));
  };

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout, setLoading }}>
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

