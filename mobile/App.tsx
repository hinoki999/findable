import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { View, Pressable, Text, PanResponder } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DropScreen from './src/screens/DropScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import AccountScreen from './src/screens/AccountScreen';
import { TabNavigationProvider } from './src/contexts/TabNavigationContext';
import HomeScreen from './src/screens/HomeScreen';
import ProfilePhotoScreen from './src/screens/ProfilePhotoScreen';
import SecuritySettingsScreen from './src/screens/SecuritySettingsScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import SignupScreen from './src/screens/SignupScreen';
import LoginScreen from './src/screens/LoginScreen';
import Toast from './src/components/Toast';
import { TutorialProvider, useTutorial } from './src/contexts/TutorialContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { colors, type, getTheme } from './src/theme';
import * as Updates from 'expo-updates';
import { initMonitor, logAction } from './src/services/activityMonitor';
import { supabase } from './src/services/supabase';
import { startBackgroundScan, stopBackgroundScan } from './src/native/BLEScannerModule';
import * as Notifications from 'expo-notifications';
import { savePushToken } from './src/services/api';

// Set notification handler once at top level
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Dark Mode Context
const DarkModeContext = createContext<{
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}>({
  isDarkMode: false,
  toggleDarkMode: () => { },
});

export const useDarkMode = () => useContext(DarkModeContext);

// Pinned Profiles Context - supports both number (legacy devices) and string (drops UUIDs)
const PinnedProfilesContext = createContext<{
  pinnedIds: Set<string | number>;
  togglePin: (id: string | number) => void;
}>({
  pinnedIds: new Set(),
  togglePin: () => { },
});

export const usePinnedProfiles = () => useContext(PinnedProfilesContext);

// User Profile Context
interface SocialMediaAccount {
  platform: string;
  handle: string;
}

interface UserProfile {
  name: string;
  phone: string;
  email: string;
  bio: string;
  socialMedia: SocialMediaAccount[];
  profilePhoto?: string;
  phoneVerified?: boolean;
}

const UserProfileContext = createContext<{
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}>({
  profile: {
    name: 'Your Name',
    phone: '(555) 123-4567',
    email: 'user@example.com',
    bio: 'Add bio',
    socialMedia: [],
    phoneVerified: false,
  },
  updateProfile: async () => { console.log('[PROFILE-UPDATE] WARNING: Using default empty updateProfile!'); },
});

export const useUserProfile = () => useContext(UserProfileContext);

// Toast Context
interface ToastConfig {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

const ToastContext = createContext<{
  showToast: (config: ToastConfig) => void;
}>({
  showToast: () => { },
});

export const useToast = () => useContext(ToastContext);

// Settings Context (for distance filter, etc.)
const SettingsContext = createContext<{
  maxDistance: number; // in feet
  setMaxDistance: (distance: number) => void;
}>({
  maxDistance: 33,
  setMaxDistance: () => { },
});

export const useSettings = () => useContext(SettingsContext);

// Link Notifications Context (for returned drops)
interface LinkNotification {
  id: number;
  deviceId?: number; // References the device in the store for pinning
  name: string;
  phoneNumber?: string;
  email?: string;
  bio?: string;
  socialMedia?: SocialMediaAccount[];
  timestamp: number;
  viewed: boolean;
  dismissed: boolean;
}

const LinkNotificationsContext = createContext<{
  linkNotifications: LinkNotification[];
  addLinkNotification: (notification: Omit<LinkNotification, 'id' | 'timestamp' | 'viewed' | 'dismissed'>) => void;
  markAsViewed: (id: number) => void;
  dismissNotification: (id: number) => void;
  hasUnviewedLinks: boolean;
}>({
  linkNotifications: [],
  addLinkNotification: () => { },
  markAsViewed: () => { },
  dismissNotification: () => { },
  hasUnviewedLinks: false,
});

export const useLinkNotifications = () => useContext(LinkNotificationsContext);

import {
  useFonts,
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold
} from '@expo-google-fonts/inter';

// Helper function for phone formatting (defined outside component for stability)
// Used when loading profile data to ensure consistent (XXX) XXX-XXXX format
const formatPhoneNumber = (text: string): string => {
  const cleaned = text.replace(/\D/g, '');
  if (cleaned.length === 0) return '';
  if (cleaned.length <= 3) return `(${cleaned}`;
  if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
  return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
};

// AUTH BYPASS: Set to true to skip all backend calls for BLE testing
// NOTE: Set to false for production - profile updates need Supabase
const AUTH_BYPASS_ENABLED = false;

// Main App Component (wrapped by AuthProvider)
function MainApp() {
  const { isAuthenticated, loading: authLoading, login, userId, refreshAuth } = useAuth();

  const [fontsReady] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Auth flow state
  const [authScreen, setAuthScreen] = useState<'welcome' | 'signup' | 'login'>('welcome');

  const [tab, setTab] = useState<'Home' | 'Drop' | 'History' | 'Account'>('Home');
  const [subScreen, setSubScreen] = useState<string | null>(null); // For sub-screens like ProfilePhoto, SecuritySettings
  const [isDarkMode, setIsDarkMode] = useState(true);
  const insets = useSafeAreaInsets();
  const [pinnedIds, setPinnedIds] = useState<Set<string | number>>(new Set());

  // ✅ FIXED: Initialize with socialMedia array to prevent crashes
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'Your Name',
    phone: '(555) 123-4567',
    email: 'user@example.com',
    bio: 'Add bio',
    socialMedia: [], // ← CRITICAL: Always an array, never undefined
    phoneVerified: false,
  });

  const [isSignupInProgress, setIsSignupInProgress] = useState(false);
  const [toastConfig, setToastConfig] = useState<ToastConfig | null>(null);
  const [linkNotifications, setLinkNotifications] = useState<LinkNotification[]>([]);
  const [nextLinkId, setNextLinkId] = useState(1);
  const [maxDistance, setMaxDistance] = useState(33); // Default 33 feet (10m)
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false); // Track if user just signed up
  const [showProfilePhotoPrompt, setShowProfilePhotoPrompt] = useState(false); // Show profile photo setup after signup

  // ✅ Track whether AsyncStorage has cached profile (for fresh install detection)
  const hasCachedProfileRef = useRef(false);
  
  // Track whether background scan was started (to avoid stopping when never started)
  const scanStartedRef = useRef(false);

  // 🔍 DIAGNOSTIC: Log whenever userProfile state changes
  useEffect(() => {
    console.log('📊 [DIAGNOSTIC] userProfile state changed:', {
      name: userProfile.name,
      email: userProfile.email,
      phone: userProfile.phone,
      bio: userProfile.bio
    });
  }, [userProfile]);

  // ✅ NEW: Load profile AND photo from AsyncStorage when app starts
  useEffect(() => {
    const loadProfileFromCache = async () => {
      try {
        console.log('📱 Loading profile from AsyncStorage...');
        const cachedProfile = await AsyncStorage.getItem('userProfile');

        if (cachedProfile) {
          hasCachedProfileRef.current = true; // ← Track cache existence
          const parsedProfile = JSON.parse(cachedProfile);
          console.log('📱 Profile loaded from cache:', parsedProfile);

          // Ensure socialMedia is always an array (defensive)
          if (!parsedProfile.socialMedia) {
            parsedProfile.socialMedia = [];
          }

          console.log('🔢 [DEBUG] setUserProfile CALL #1: Loading from AsyncStorage cache');
          setUserProfile(parsedProfile);
        } else {
          hasCachedProfileRef.current = false; // ← No cache found (fresh install)
          console.log('📱 No cached profile found - fresh install detected');
        }
      } catch (error) {
        console.error('📱 Failed to load profile from AsyncStorage:', error);
      }
    };

    loadProfileFromCache();
  }, []); // Run once on mount

  // ✅ NEW: Auto-save profile to AsyncStorage whenever it changes
  useEffect(() => {
    const saveProfileToCache = async () => {
      try {
        // Only save if profile has actual data (not just initial empty state)
        if (userProfile.name !== 'Your Name' || userProfile.phone !== '(555) 123-4567' || userProfile.bio !== 'Add bio' || userProfile.email !== 'user@example.com') {
          console.log('💾 Saving profile to AsyncStorage:', userProfile);
          await AsyncStorage.setItem('userProfile', JSON.stringify(userProfile));
          console.log('💾 Profile saved successfully');
        }
      } catch (error) {
        console.error('💾 Failed to save profile to AsyncStorage:', error);
      }
    };

    saveProfileToCache();
  }, [userProfile]); // Run every time userProfile changes

  // Check for OTA updates on app launch
  useEffect(() => {
    async function checkForUpdates() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (error) {
        console.log('Error checking for updates:', error);
      }
    }

    checkForUpdates();
  }, []);

  // Initialize activity monitor on app launch
  useEffect(() => {
    initMonitor();
  }, []);

  // Function to load all user data from backend
  // Wrapped in useCallback to provide stable reference for useEffect dependencies
  const loadUserData = useCallback(async (auth: boolean, uid: string | null, options?: { onlyPhoto?: boolean }) => {
    if (AUTH_BYPASS_ENABLED) {
      return; // Skip backend calls for testing
    }
    if (!auth || !uid) return;
    
    try {
      // Load profile from Supabase
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', uid)
        .single();
      
      // Handle onlyPhoto option
      if (options?.onlyPhoto && profile) {
        setProfilePhotoUri(profile.profile_photo);
        return;
      }
      
      // Load settings from Supabase
      const { data: settings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', uid)
        .single();
      
      // Load devices/contacts from Supabase
      const { data: devices } = await supabase
        .from('devices')
        .select('*')
        .eq('user_id', uid)
        .order('last_seen', { ascending: false });
      
      if (profile) {
        setUserProfile({
          name: profile.name || 'Your Name',
          phone: profile.phone || '(555) 123-4567',
          email: profile.email || 'user@example.com',
          bio: profile.bio || 'Add bio',
          profilePhoto: profile.profile_photo,
          socialMedia: profile.social_media || [],
          phoneVerified: profile.phone_verified || false,
        });
        setProfilePhotoUri(profile.profile_photo);
      }
      
      if (settings) {
        setIsDarkMode(settings.dark_mode);
        setMaxDistance(settings.max_distance);
      }
      
      if (devices) {
        setLinkNotifications(devices.map(d => ({
          id: d.id,
          name: d.device_name,
          phoneNumber: '',
          email: '',
          bio: '',
          socialMedia: [],
          timestamp: new Date(d.last_seen).getTime(),
          viewed: false,
          dismissed: false,
          deviceId: d.id
        })));
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }, []);

  // Load user data when authenticated
  // Skip during signup to prevent race condition with profile save
  useEffect(() => {
    if (isAuthenticated && userId && !isSignupInProgress) {
      loadUserData(isAuthenticated, userId);
    }
  }, [isAuthenticated, userId, isSignupInProgress, loadUserData]);

  // Start/stop background BLE scanning based on auth state
  useEffect(() => {
    if (authLoading) return;
    
    if (isAuthenticated && userId) {
      scanStartedRef.current = true;
      startBackgroundScan()
        .then(() => console.log('[BG-SCAN] Background scan started'))
        .catch(err => console.error('[BG-SCAN] Failed to start:', err));
    } else if (scanStartedRef.current) {
      scanStartedRef.current = false;
      stopBackgroundScan().catch(err => console.error('[BG-SCAN] Failed to stop:', err));
    }
  }, [isAuthenticated, userId, authLoading]);

  // Check for OTA updates on app launch
  useEffect(() => {
    async function checkForUpdates() {
      try {
        console.log('🔍 Checking for updates...');
        const update = await Updates.checkForUpdateAsync();

        if (update.isAvailable) {
          console.log('📥 Update available! Downloading...');
          await Updates.fetchUpdateAsync();
          console.log('✅ Update downloaded! Reloading...');
          await Updates.reloadAsync();
        } else {
          console.log('✅ App is up to date');
        }
      } catch (error) {
        console.error('❌ Update check failed:', error);
      }
    }

    checkForUpdates();
  }, []);

  // Auth handlers
  const handleSignupSuccess = async (
    profileData?: { name: string; phone: string; bio: string }
  ) => {
    console.log('SUCCESS: [App] Signup successful');
    
    // Refresh auth state to detect the new Supabase session created during signup
    console.log('[App] Refreshing auth state after signup...');
    await refreshAuth();
    console.log('SUCCESS: [App] Auth state refreshed');

    // Set flag to prevent automatic data reload (prevents race condition)
    setIsSignupInProgress(true);

    // Set profile data directly from signup form instead of reloading from backend
    // This prevents race condition where GET /profile happens before POST /profile completes
    if (profileData) {
      const phoneDigitsOnly = profileData.phone.replace(/\D/g, '');

      console.log('🔢 [DEBUG] setUserProfile CALL #4: Signup flow');
      setUserProfile({
        name: profileData.name || 'Your Name',
        phone: phoneDigitsOnly ? formatPhoneNumber(phoneDigitsOnly) : '(555) 123-4567',
        email: 'user@example.com',  // Will be set from auth context
        bio: profileData.bio || 'Add bio',
        socialMedia: [],
      });
    }

    setIsFirstTimeUser(true);

    // Reset flag - normal data loads can proceed from here
    setIsSignupInProgress(false);
    console.log('✅ [App] Signup flow complete, flag reset');

    console.log('✅ [App] Setting showProfilePhotoPrompt = true');
    setShowProfilePhotoPrompt(true);
  };

  const handleLoginSuccess = () => {
    console.log('✅ Login successful');
    // Auth state is already set by AuthContext.login() called in LoginScreen
    // loadUserData will be triggered by useEffect that watches isAuthenticated
    
    // Navigate to Home tab
    setTab('Home');
    setSubScreen(null);
    
    // Show success message
    showToast({
      message: 'Successfully logged in!',
      type: 'success',
      duration: 3000,
    });
  };

  const handleProfilePhotoPromptComplete = async (uploadedPhotoUri?: string) => {
    console.log('✅ [App] Profile photo prompt completed');
    
    // Register for push notifications
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        const token = await Notifications.getExpoPushTokenAsync();
        await savePushToken(token.data);
      }
    } catch (error) {
      console.error('[Push] Failed to register push notifications:', error);
    }
    
    console.log('✅ [App] Setting showProfilePhotoPrompt = false');
    setShowProfilePhotoPrompt(false);

    // Use uploaded URI if provided (prevents race condition)
    // Otherwise load from backend (for skip button case)
    if (uploadedPhotoUri) {
      console.log('✅ [App] Using uploaded photo URI directly:', uploadedPhotoUri);
      setProfilePhotoUri(uploadedPhotoUri);
    } else {
      console.log('✅ [App] Loading profile photo from backend...');
      await loadUserData(isAuthenticated, userId, { onlyPhoto: true });
      console.log('✅ [App] Profile photo loaded');
    }

    // Always navigate to Home tab after profile photo prompt
    console.log('✅ [App] Navigating to Home tab');
    setTab('Home');
    setSubScreen(null);
    console.log('✅ [App] Navigation complete - HomeScreen should mount now');

    showToast({
      message: 'Welcome to DropLink!',
      type: 'success',
      duration: 3000,
    });
  };

  const toggleDarkMode = async () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);

    if (AUTH_BYPASS_ENABLED) {
      return; // Skip backend calls for testing
    }

    // Save to backend
    try {
      const api = await import('./src/services/api');
      await api.saveUserSettings({
        darkMode: newValue,
        maxDistance,
        privacyZonesEnabled: false, // TODO: Get from actual state
      }, userId!);
      console.log('✅ Dark mode saved to backend:', newValue);
    } catch (error) {
      console.error('❌ Failed to save dark mode:', error);
    }
  };

  const togglePin = async (id: string | number) => {
    let wasPinned = false;
    setPinnedIds(prev => {
      const newSet = new Set(prev);
      wasPinned = newSet.has(id);
      if (wasPinned) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });

    if (AUTH_BYPASS_ENABLED) {
      return; // Skip backend calls for testing
    }

    // Save to backend (only for numeric IDs from legacy devices)
    if (typeof id === 'number') {
      try {
        const api = await import('./src/services/api');
        if (wasPinned) {
          await api.unpinContact(id);
          console.log('✅ Unpinned contact saved to backend:', id);
        } else {
          await api.pinContact(id);
          console.log('✅ Pinned contact saved to backend:', id);
        }
      } catch (error) {
        console.error('❌ Failed to save pin state:', error);
      }
    } else {
      // For string IDs (drop UUIDs), pinning is handled locally
      console.log(`📌 Pin toggled for drop: ${id}, pinned: ${!wasPinned}`);
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    console.log('[PROFILE-UPDATE] ===== updateProfile CALLED =====');
    console.log('[PROFILE-UPDATE] Received updates:', JSON.stringify(updates, null, 2));
    console.log('[PROFILE-UPDATE] AUTH_BYPASS_ENABLED:', AUTH_BYPASS_ENABLED);
    
    const newProfile = { ...userProfile, ...updates };
    
    if (AUTH_BYPASS_ENABLED) {
      // Update local state only for testing
      setUserProfile(newProfile);
      showToast({ message: 'Profile updated', type: 'success', duration: 2000 });
      return;
    }
    
    try {
      if (!userId) {
        console.log('[PROFILE-UPDATE] No userId, skipping update');
        return;
      }
      
      // Build the update object with all profile fields
      const updateData = {
        name: newProfile.name,
        email: newProfile.email,
        phone: newProfile.phone,
        bio: newProfile.bio,
        social_media: newProfile.socialMedia,
        phone_verified: newProfile.phoneVerified || false,
        profile_photo: newProfile.profilePhoto || null,
      };
      
      console.log('[PROFILE-UPDATE] Before UPDATE - userId:', userId);
      console.log('[PROFILE-UPDATE] Before UPDATE - fields being sent:', JSON.stringify(updateData, null, 2));
      
      // Update user_profiles in Supabase
      const { data, error } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('user_id', userId)
        .select();
      
      if (error) {
        console.error('[PROFILE-UPDATE] Supabase UPDATE error:', error);
        console.error('[PROFILE-UPDATE] Error details:', JSON.stringify(error, null, 2));
        throw new Error(error.message || 'Failed to update profile in database');
      }
      
      console.log('[PROFILE-UPDATE] After UPDATE - success, returned data:', JSON.stringify(data, null, 2));
      
      // Update local state
      setUserProfile(newProfile);
      
      console.log('[PROFILE-UPDATE] ✅ Profile updated successfully');
      showToast({ message: 'Profile updated', type: 'success', duration: 2000 });
    } catch (error: any) {
      console.error('[PROFILE-UPDATE] Error updating profile:', error);
      console.error('[PROFILE-UPDATE] Error message:', error.message);
      showToast({
        message: error.message || 'Failed to update profile',
        type: 'error',
        duration: 3000
      });
      throw error;
    }
  };

  const showToast = (config: ToastConfig) => {
    setToastConfig(config);
  };

  const updateMaxDistance = async (distance: number) => {
    setMaxDistance(distance);

    if (AUTH_BYPASS_ENABLED) {
      return; // Skip backend calls for testing
    }

    // Save to backend
    try {
      const api = await import('./src/services/api');
      await api.saveUserSettings({
        darkMode: isDarkMode,
        maxDistance: distance,
        privacyZonesEnabled: false, // TODO: Get from actual state
      }, userId!);
      console.log('✅ Max distance saved to backend:', distance);
    } catch (error) {
      console.error('❌ Failed to save max distance:', error);
    }
  };

  const addLinkNotification = (notification: Omit<LinkNotification, 'id' | 'timestamp' | 'viewed' | 'dismissed'>) => {
    const newNotification: LinkNotification = {
      ...notification,
      id: nextLinkId,
      timestamp: Date.now(),
      viewed: false,
      dismissed: false,
    };
    setLinkNotifications(prev => [newNotification, ...prev]);
    setNextLinkId(prev => prev + 1);
  };

  const markAsViewed = (id: number) => {
    setLinkNotifications(prev =>
      prev.map(notif => notif.id === id ? { ...notif, viewed: true } : notif)
    );
  };

  const dismissNotification = (id: number) => {
    setLinkNotifications(prev =>
      prev.map(notif => notif.id === id ? { ...notif, dismissed: true } : notif)
    );
  };

  const hasUnviewedLinks = linkNotifications.some(notif => !notif.viewed && !notif.dismissed);

  // Define tab order for swiping
  const tabOrder: Array<'Home' | 'Drop' | 'History' | 'Account'> = ['Home', 'Drop', 'History', 'Account'];

  // Swipe gesture handler
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      // Activate when horizontal swipe is detected (dx > 10)
      return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
    },
    onPanResponderRelease: (evt, gestureState) => {
      const swipeThreshold = 50; // Minimum swipe distance
      const currentIndex = tabOrder.indexOf(tab);

      if (gestureState.dx > swipeThreshold && currentIndex > 0) {
        // Swipe right - go to previous tab
        setTab(tabOrder[currentIndex - 1]);
      } else if (gestureState.dx < -swipeThreshold && currentIndex < tabOrder.length - 1) {
        // Swipe left - go to next tab
        setTab(tabOrder[currentIndex + 1]);
      }
    },
  });

  const theme = getTheme(isDarkMode);

  // Loading state
  if (!fontsReady || authLoading) {
    return (
      <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }}>
          <Text style={{ color: theme.colors.text }}>Loading…</Text>
        </View>
      </DarkModeContext.Provider>
    );
  }

  // Auth screens (not authenticated) - Wrap with DarkModeContext
  if (!isAuthenticated) {
    return (
      <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
        {authScreen === 'signup' && (
          <SignupScreen
            onSignupSuccess={(profileData) => {
              handleSignupSuccess(profileData);
            }}
            onLoginPress={() => setAuthScreen('login')}
            onBack={() => setAuthScreen('welcome')}
          />
        )}

        {authScreen === 'login' && (
          <LoginScreen
            onLoginSuccess={handleLoginSuccess}
            onSignupPress={() => setAuthScreen('signup')}
            onBack={() => setAuthScreen('welcome')}
          />
        )}

        {authScreen === 'welcome' && (
          <WelcomeScreen
            onGetStarted={() => setAuthScreen('signup')}
            onLogin={() => setAuthScreen('login')}
            showToast={showToast}
          />
        )}
      </DarkModeContext.Provider>
    );
  }

  // Show profile photo prompt after signup (authenticated but before main app)
  if (isAuthenticated && showProfilePhotoPrompt) {
    const promptNavigation = {
      navigate: () => { },
      goBack: handleProfilePhotoPromptComplete,
    };

    return (
      <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
        <View style={{ flex: 1, backgroundColor: getTheme(isDarkMode).colors.bg }}>
          {/* Header with Skip button */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingTop: 60,
            paddingBottom: 20,
          }}>
            <Text style={{
              fontSize: 20,
              fontWeight: '600',
              color: getTheme(isDarkMode).colors.text,
              fontFamily: 'Inter_600SemiBold',
            }}>
              Profile Photo
            </Text>
            <Pressable onPress={() => handleProfilePhotoPromptComplete()}>
              <Text style={{
                color: getTheme(isDarkMode).colors.muted,
                fontSize: 16,
                fontFamily: 'Inter_400Regular',
              }}>
                Skip
              </Text>
            </Pressable>
          </View>
          <ProfilePhotoScreen
            navigation={promptNavigation}
            onPhotoSaved={(uri) => {
              // Pass URI to handler to avoid race condition
              handleProfilePhotoPromptComplete(uri);
            }}
          />
        </View>
      </DarkModeContext.Provider>
    );
  }

  // Simple navigation object
  const navigation = {
    navigate: (screen: string) => setSubScreen(screen),
    goBack: () => setSubScreen(null),
  };

  const Screen = () => {
    // Show sub-screen if one is active
    if (subScreen === 'ProfilePhoto') {
      return <ProfilePhotoScreen
        navigation={navigation}
        onPhotoSaved={async (uri) => {
          // Optimistic update for immediate feedback
          setProfilePhotoUri(uri);

          // Verify database actually has it (defensive merge won't overwrite on failure)
          await loadUserData(isAuthenticated, userId, { onlyPhoto: true });
        }}
      />;
    }

    if (subScreen === 'SecuritySettings') {
      return <SecuritySettingsScreen navigation={navigation} />;
    }

    // Show main tabs
    if (tab === 'Home') return <HomeScreen />;
    if (tab === 'History') return <HistoryScreen />;
    if (tab === 'Account') return <AccountScreen navigation={navigation} profilePhotoUri={profilePhotoUri} />;
    return <DropScreen />;
  };

  // Tutorial initializer component (must be inside TutorialProvider)
  const TutorialInitializer = () => {
    const { initializeTutorials } = useTutorial();
    
    useEffect(() => {
      if (isAuthenticated && userId) {
        console.log('[TUTORIAL] Auth state changed - initializing tutorials');
        initializeTutorials();
      }
    }, [isAuthenticated, userId, initializeTutorials]);
    
    return null; // This component doesn't render anything
  };

  return (
    <TabNavigationProvider navigateToTab={setTab}>
      <TutorialProvider>
        <TutorialInitializer />
        <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
          <PinnedProfilesContext.Provider value={{ pinnedIds, togglePin }}>
            <UserProfileContext.Provider value={{ profile: userProfile, updateProfile }}>
              <ToastContext.Provider value={{ showToast }}>
                <SettingsContext.Provider value={{ maxDistance, setMaxDistance: updateMaxDistance }}>
                  <LinkNotificationsContext.Provider value={{
                    linkNotifications,
                    addLinkNotification,
                    markAsViewed,
                    dismissNotification,
                    hasUnviewedLinks
                  }}>
                    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
                      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
                        <Screen />
                      </View>

                    {/* Bottom nav - Hide when sub-screen is active */}
                    {!subScreen && (
                      <View style={{
                        flexDirection: 'row',
                        borderTopWidth: 1,
                        borderTopColor: theme.colors.border,
                        backgroundColor: theme.colors.white,
                        paddingBottom: insets.bottom
                      }}>
                        {/* Home */}
                        <Pressable
                          onPress={() => {
                            logAction('Navigation', 'Home Tab');
                            setTab('Home');
                          }}
                          style={{
                            flex: 1, paddingVertical: 14, alignItems: 'center',
                            backgroundColor: tab === 'Home' ? '#FFE5DC' : theme.colors.white
                          }}
                        >
                          <MaterialCommunityIcons
                            name="home-outline"
                            size={24}
                            color="#FF6B4A"
                            style={{ fontWeight: '100' }}
                          />
                        </Pressable>

                        {/* Drop */}
                        <Pressable
                          onPress={() => {
                            logAction('Navigation', 'Drop Tab');
                            setTab('Drop');
                          }}
                          style={{
                            flex: 1, paddingVertical: 14, alignItems: 'center',
                            backgroundColor: tab === 'Drop' ? theme.colors.blueLight : theme.colors.white
                          }}
                        >
                          <MaterialCommunityIcons
                            name="water-outline"
                            size={24}
                            color={theme.colors.blue}
                          />
                        </Pressable>

                        {/* History */}
                        <Pressable
                          onPress={() => {
                            logAction('Navigation', 'History Tab');
                            setTab('History');
                          }}
                          style={{
                            flex: 1, paddingVertical: 14, alignItems: 'center',
                            backgroundColor: tab === 'History' ? '#FFE5DC' : theme.colors.white
                          }}
                        >
                          <MaterialCommunityIcons
                            name="link-variant"
                            size={24}
                            color="#FF6B4A"
                          />
                        </Pressable>

                        {/* Account */}
                        <Pressable
                          onPress={() => {
                            logAction('Navigation', 'Account Tab');
                            setTab('Account');
                          }}
                          style={{
                            flex: 1, paddingVertical: 14, alignItems: 'center',
                            backgroundColor: tab === 'Account' ? theme.colors.blueLight : theme.colors.white
                          }}
                        >
                          <MaterialCommunityIcons
                            name="account-outline"
                            size={24}
                            color={theme.colors.blue}
                          />
                        </Pressable>
                      </View>
                    )}

                    {/* Toast Notification */}
                    {toastConfig && (
                      <Toast
                        message={toastConfig.message}
                        type={toastConfig.type}
                        duration={toastConfig.duration}
                        actionLabel={toastConfig.actionLabel}
                        onAction={toastConfig.onAction}
                        onDismiss={() => setToastConfig(null)}
                      />
                    )}
                  </View>
                </LinkNotificationsContext.Provider>
              </SettingsContext.Provider>
            </ToastContext.Provider>
          </UserProfileContext.Provider>
            </PinnedProfilesContext.Provider>
          </DarkModeContext.Provider>
        </TutorialProvider>
      </TabNavigationProvider>
    );
  }

// Export App wrapped with AuthProvider
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <MainApp />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}