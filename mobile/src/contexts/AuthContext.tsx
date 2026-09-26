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
  refreshAuth: () => Promise<void>; // Added to allow manual auth state refresh
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
    console.log('[AUTH-CONTEXT-TRACE] ========== AUTH INITIALIZATION ==========');
    
    console.log('[AUTH-CONTEXT-TRACE] Checking stored session');
    checkStoredAuth();
    console.log('[AUTH-CONTEXT-TRACE] =========================================');
  }, []);

  const checkStoredAuth = async () => {
    try {
      console.log('[AUTH-CONTEXT-TRACE] Checking for stored auth session...');
      // Check for Supabase session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('[AUTH-CONTEXT-TRACE] Session exists?', !!session);
      console.log('[AUTH-CONTEXT-TRACE] Session error?', sessionError);
      
      if (session?.user) {
        const sessionUserId = session.user.id;
        console.log('[AUTH-CONTEXT-TRACE] ✅ Session found');
        console.log('[AUTH-CONTEXT-TRACE] session.user.id:', sessionUserId);
        console.log('[AUTH-CONTEXT-TRACE] session.user.id type:', typeof sessionUserId);
        console.log('[AUTH-CONTEXT-TRACE] session.user.id length:', sessionUserId?.length);
        
        setState({
          isAuthenticated: true,
          userId: sessionUserId,
          username: session.user.user_metadata?.username || null,
          token: session.access_token,
          loading: false,
        });
        console.log('[AUTH-CONTEXT-TRACE] State updated with userId:', sessionUserId);
      } else {
        console.log('[AUTH-CONTEXT-TRACE] ⚠️ No session found');
        setState(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('[AUTH-CONTEXT-TRACE] ❌ Error checking stored auth:', error);
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
      
      console.log('SUCCESS: Login successful:', { userId, email: data.user.email });
      
      setState({
        isAuthenticated: true,
        userId: userId,
        username: data.user.user_metadata?.username || null,
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
          username: data.user.user_metadata?.username || null,
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

  // Allow manual refresh of auth state (e.g., after signup creates a session)
  const refreshAuth = async () => {
    console.log('🔄 [AuthContext] Manually refreshing auth state...');
    await checkStoredAuth();
  };

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout, setLoading, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  
  // Log userId whenever it's accessed
  console.log('[AUTH-CONTEXT-TRACE] useAuth() called - userId:', context.userId);
  console.log('[AUTH-CONTEXT-TRACE] userId type:', typeof context.userId);
  console.log('[AUTH-CONTEXT-TRACE] isAuthenticated:', context.isAuthenticated);
  console.log('[AUTH-CONTEXT-TRACE] loading:', context.loading);
  
  return context;
};

