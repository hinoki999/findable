import React, { createContext, useContext, useState, useEffect } from 'react';
import { logAuth, logStateChange } from '../services/activityMonitor';
import { supabase } from '../services/supabase';
import { storage } from '../services/storage';

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

// AUTH BYPASS: Set to true to skip all authentication for BLE testing
const AUTH_BYPASS_ENABLED = true;

// Storage key for device-unique identifier
const DEVICE_UNIQUE_ID_KEY = 'droplink_device_unique_id';

/**
 * Get or generate a unique device identifier for auth bypass
 * Generates a random 4-digit number and stores it persistently
 * Format: "Test" + 4-digit number (e.g., "Test1234")
 */
const getOrCreateDeviceUniqueId = async (): Promise<string> => {
  try {
    // Try to get existing ID from storage
    const existingId = await storage.getItem(DEVICE_UNIQUE_ID_KEY);
    if (existingId) {
      console.log('[AuthBypass] Using existing device ID:', existingId);
      return existingId;
    }
    
    // Generate new random 4-digit number (1000-9999)
    const randomId = Math.floor(1000 + Math.random() * 9000).toString();
    const deviceId = `Test${randomId}`;
    
    // Store it for future use
    await storage.setItem(DEVICE_UNIQUE_ID_KEY, deviceId);
    console.log('[AuthBypass] Generated new device ID:', deviceId);
    
    return deviceId;
  } catch (error) {
    console.error('[AuthBypass] Error getting/creating device ID:', error);
    // Fallback to timestamp-based ID if storage fails
    const fallbackId = `Test${Date.now().toString().slice(-4)}`;
    console.log('[AuthBypass] Using fallback device ID:', fallbackId);
    return fallbackId;
  }
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
    console.log('[AUTH-CONTEXT-TRACE] ========== AUTH INITIALIZATION ==========');
    console.log('[AUTH-CONTEXT-TRACE] AUTH_BYPASS_ENABLED:', AUTH_BYPASS_ENABLED);
    
    if (AUTH_BYPASS_ENABLED) {
      // Create real Supabase user with profile for testing
      console.log('[AUTH-CONTEXT-TRACE] Using auth bypass mode');
      getOrCreateDeviceUniqueId().then(async (deviceId) => {
        try {
          console.log('[AUTH-CONTEXT-TRACE] Creating real Supabase user for deviceId:', deviceId);
          
          // Generate email from deviceId
          const email = `test-${deviceId}@droplink.test`;
          const password = `Test${deviceId}123!`; // Simple password for test users
          
          // Create auth user in Supabase
          console.log('[AUTH-CONTEXT-TRACE] Signing up user with email:', email);
          const { data: authData, error: signUpError } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
              data: {
                username: deviceId, // Store username in user_metadata
              }
            }
          });
          
          if (signUpError) {
            // User might already exist, try to sign in instead
            console.log('[AUTH-CONTEXT-TRACE] Sign up failed, trying sign in:', signUpError.message);
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: email,
              password: password,
            });
            
            if (signInError) {
              console.error('[AUTH-CONTEXT-TRACE] Sign in also failed:', signInError);
              throw signInError;
            }
            
            // Use sign in data
            const userId = signInData.user.id;
            const session = signInData.session;
            
            console.log('[AUTH-CONTEXT-TRACE] ✅ Signed in existing user, userId:', userId);
            
            // Ensure profile exists
            const { error: profileCheckError } = await supabase
              .from('profiles')
              .select('id')
              .eq('id', userId)
              .single();
            
            if (profileCheckError && profileCheckError.code === 'PGRST116') {
              // Profile doesn't exist, create it
              console.log('[AUTH-CONTEXT-TRACE] Profile not found, creating...');
              const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                  id: userId,
                  username: deviceId,
                  device_id: userId.substring(0, 8), // First 8 chars of userId for BLE
                });
              
              if (profileError) {
                console.error('[AUTH-CONTEXT-TRACE] Failed to create profile:', profileError);
              } else {
                console.log('[AUTH-CONTEXT-TRACE] ✅ Profile created');
              }
            }
            
            setState({
              isAuthenticated: true,
              userId: userId,
              username: deviceId,
              token: session?.access_token || null,
              loading: false,
            });
            console.log('[AuthBypass] Real auth user set with userId:', userId);
            return;
          }
          
          // New user created
          const userId = authData.user?.id;
          if (!userId) {
            throw new Error('User created but no userId returned');
          }
          
          console.log('[AUTH-CONTEXT-TRACE] ✅ New user created, userId:', userId);
          
          // Create profile in Supabase
          console.log('[AUTH-CONTEXT-TRACE] Creating profile for userId:', userId);
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              id: userId,
              username: deviceId,
              device_id: userId.substring(0, 8), // First 8 chars of userId for BLE
            });
          
          if (profileError) {
            console.error('[AUTH-CONTEXT-TRACE] Failed to create profile:', profileError);
            // Continue anyway - profile might already exist
          } else {
            console.log('[AUTH-CONTEXT-TRACE] ✅ Profile created');
          }
          
          // Get session
          const { data: { session } } = await supabase.auth.getSession();
          
          setState({
            isAuthenticated: true,
            userId: userId,
            username: deviceId,
            token: session?.access_token || null,
            loading: false,
          });
          console.log('[AuthBypass] Real auth user set with userId:', userId);
          console.log('[AUTH-CONTEXT-TRACE] State updated with real userId:', userId);
        } catch (error) {
          console.error('[AUTH-CONTEXT-TRACE] ❌ Error creating real user:', error);
          // Fallback to mock auth if Supabase fails
          const fallbackUserId = `bypass-${deviceId}`;
          setState({
            isAuthenticated: true,
            userId: fallbackUserId,
            username: deviceId,
            token: 'bypass-token',
            loading: false,
          });
          console.log('[AuthBypass] Fallback to mock auth due to error');
        }
      });
      return;
    }
    console.log('[AUTH-CONTEXT-TRACE] Using real auth, checking stored session');
    checkStoredAuth();
    console.log('[AUTH-CONTEXT-TRACE] =========================================');
  }, []);

  const checkStoredAuth = async () => {
    if (AUTH_BYPASS_ENABLED) {
      return; // Skip auth check
    }
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
    if (AUTH_BYPASS_ENABLED) {
      // For bypass mode, use the same logic as initialization
      // This ensures we get/create the same user
      const deviceId = await getOrCreateDeviceUniqueId();
      const testEmail = `test-${deviceId}@droplink.test`;
      const testPassword = `Test${deviceId}123!`;
      
      try {
        // Try to sign in
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: testEmail,
          password: testPassword,
        });
        
        if (signInError) {
          throw signInError;
        }
        
        const userId = signInData.user.id;
        const session = signInData.session;
        
        setState({
          isAuthenticated: true,
          userId: userId,
          username: deviceId,
          token: session?.access_token || null,
          loading: false,
        });
        return { success: true };
      } catch (error) {
        // Fallback to mock if Supabase fails
        setState({
          isAuthenticated: true,
          userId: `bypass-${deviceId}`,
          username: deviceId,
          token: 'bypass-token',
          loading: false,
        });
        return { success: true };
      }
    }
    
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
    if (AUTH_BYPASS_ENABLED) {
      // Get unique device ID and set mock authentication (ignore provided username)
      const deviceId = await getOrCreateDeviceUniqueId();
      setState({
        isAuthenticated: true,
        userId: `bypass-${deviceId}`,
        username: deviceId,
        token: 'bypass-token',
        loading: false,
      });
      return { success: true, userId: `bypass-${deviceId}` };
    }
    
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
    if (AUTH_BYPASS_ENABLED) {
      // Skip logout for testing
      return;
    }
    
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
    if (AUTH_BYPASS_ENABLED) {
      // For bypass mode, re-run the initialization logic
      const deviceId = await getOrCreateDeviceUniqueId();
      const testEmail = `test-${deviceId}@droplink.test`;
      const testPassword = `Test${deviceId}123!`;
      
      try {
        // Try to sign in
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: testEmail,
          password: testPassword,
        });
        
        if (!signInError && signInData) {
          const userId = signInData.user.id;
          const session = signInData.session;
          
          setState({
            isAuthenticated: true,
            userId: userId,
            username: deviceId,
            token: session?.access_token || null,
            loading: false,
          });
          return;
        }
      } catch (error) {
        console.error('[AUTH-CONTEXT-TRACE] Refresh auth error:', error);
      }
      
      // Fallback to mock
      const fallbackUserId = `bypass-${deviceId}`;
      setState({
        isAuthenticated: true,
        userId: fallbackUserId,
        username: deviceId,
        token: 'bypass-token',
        loading: false,
      });
      return;
    }
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

