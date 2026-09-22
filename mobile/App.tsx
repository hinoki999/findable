import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://799c50b2e124c9fad116346946179c7b@o4512008784052224.ingest.us.sentry.io/4512008860205056',
  tracesSampleRate: 1.0,
  debug: false,
});
import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { View, Pressable, Text, PanResponder, PermissionsAndroid, NativeModules, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getMessaging, getToken } from '@react-native-firebase/messaging';
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
import {
  startBackgroundScan,
  stopBackgroundScan,
  onBackgroundDeviceFound,
  getBackgroundDevices,
  BackgroundBLEDevice
} from './src/native/BLEScannerModule';
import { savePushToken } from './src/services/api';
import { useBLEAdvertiser } from './src/components/BLEAdvertiser';

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

// Native BLE Devices Context - devices detected by native background scanner
export interface NativeBLEDeviceWithProfile extends BackgroundBLEDevice {
  userId?: string;        // Full user UUID from Supabase lookup
  username?: string;      // Display name from Supabase lookup
  serviceUUIDs?: string[];
}

const NativeBLEDevicesContext = createContext<{
  nativeDevices: NativeBLEDeviceWithProfile[];
}>({
  nativeDevices: [],
});

export const useNativeBLEDevices = () => useContext(NativeBLEDevicesContext);

// BLE Advertising Context - manages ghost mode / discoverable state at app level
// This ensures advertising persists across tab navigation (HomeScreen unmounts on tab change)
const BLEAdvertisingContext = createContext<{
  isDiscoverable: boolean;
  setIsDiscoverable: (value: boolean) => void;
  isAdvertising: boolean;
  isAvailable: boolean;
}>({
  isDiscoverable: true,
  setIsDiscoverable: () => { },
  isAdvertising: false,
  isAvailable: false,
});

export const useBLEAdvertising = () => useContext(BLEAdvertisingContext);

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

  // Native BLE devices detected by background scanner
  const [nativeDevices, setNativeDevices] = useState<NativeBLEDeviceWithProfile[]>([]);

  // RSSI history for native scanner smoothing (same as BLEScanner.tsx)
  const nativeRssiHistoryRef = useRef<Map<string, number[]>>(new Map());

  // BLE Advertising state - managed at App level so it persists across tab navigation
  const [isDiscoverable, setIsDiscoverable] = useState(true);
  const [discoverableLoaded, setDiscoverableLoaded] = useState(false);
  const { isAdvertising, startAdvertising, stopAdvertising, isAvailable: advertisingAvailable } = useBLEAdvertiser();

  // Refs to stabilize advertising callbacks (prevents useEffect re-runs)
  const startAdvertisingRef = useRef(startAdvertising);
  const stopAdvertisingRef = useRef(stopAdvertising);
  useEffect(() => {
    startAdvertisingRef.current = startAdvertising;
  }, [startAdvertising]);
  useEffect(() => {
    stopAdvertisingRef.current = stopAdvertising;
  }, [stopAdvertising]);

  // Load persisted ghost mode preference from native SharedPreferences on mount
  useEffect(() => {
    const loadDiscoverableState = async () => {
      try {
        if (Platform.OS === 'android' && NativeModules.BLEAdvertiserNative) {
          console.log('[BLE-ADV-APP] Loading persisted isDiscoverable from native...');
          const savedIsDiscoverable = await NativeModules.BLEAdvertiserNative.getIsDiscoverable();
          console.log('[BLE-ADV-APP] Loaded isDiscoverable:', savedIsDiscoverable);
          setIsDiscoverable(savedIsDiscoverable);
        } else {
          console.log('[BLE-ADV-APP] Native module not available, using default isDiscoverable=true');
        }
      } catch (error) {
        console.error('[BLE-ADV-APP] Failed to load isDiscoverable:', error);
        // Keep default true on error
      } finally {
        setDiscoverableLoaded(true);
      }
    };

    loadDiscoverableState();
  }, []);

  // Synchronous ref to prevent multiple startAdvertising calls during rapid re-renders
  const hasRequestedAdvertisingRef = useRef(false);

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
  // AND listen for device found events
  useEffect(() => {
    let unsubscribeDeviceFound: (() => void) | null = null;

    const checkAndStart = async () => {
      console.log('[BG-SCAN-DEBUG] useEffect fired - authLoading:', authLoading, 'isAuthenticated:', isAuthenticated, 'userId:', userId ? userId.substring(0, 8) : 'null');
      if (authLoading) {
        console.log('[BG-SCAN-DEBUG] Early return - authLoading is true');
        return;
      }
      if (isAuthenticated && userId) {
        console.log('[BG-SCAN-DEBUG] START branch - authenticated with userId');
        const bleGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
        );
        if (bleGranted) {
          console.log('[BG-SCAN-DEBUG] BLE permissions confirmed - starting scan');
          scanStartedRef.current = true;
          startBackgroundScan()
            .then(async (started) => {
              if (started) {
                // Seed nativeDevices with previously detected devices from SharedPreferences
                // This fills the radar immediately on app open without waiting for new detections
                console.log('[BG-SCAN-DEBUG] Scan started, seeding from SharedPreferences...');
                try {
                  const storedDevices = await getBackgroundDevices();
                  console.log('[BG-SCAN-DEBUG] Retrieved', storedDevices.length, 'stored devices');

                  if (storedDevices.length > 0) {
                    // Process each stored device with profile lookup
                    for (const device of storedDevices) {
                      const { id, deviceId, name, rssi, distanceFeet } = device;

                      if (!deviceId) continue;

                      // Profile lookup
                      let foundUserId: string | null = null;
                      let displayName: string | null = null;

                      try {
                        const normalizedDeviceId = deviceId.toLowerCase().replace(/-/g, '');
                        const { data: userProfileData, error: userProfileError } = await supabase
                          .rpc('get_profile_by_user_id_prefix', { prefix: normalizedDeviceId });

                        if (!userProfileError && userProfileData) {
                          foundUserId = userProfileData.user_id;
                          displayName = userProfileData.name || userProfileData.username || deviceId;
                        }
                      } catch (err) {
                        console.error('[BG-SCAN-SEED] Profile lookup error:', err);
                      }

                      // Initialize RSSI history
                      nativeRssiHistoryRef.current.set(id, [rssi]);

                      // Add to state
                      setNativeDevices(prev => {
                        const exists = prev.find(d => d.id === id);
                        if (exists) return prev;

                        return [...prev, {
                          id,
                          deviceId,
                          name,
                          rssi,
                          distanceFeet,
                          userId: foundUserId || undefined,
                          username: displayName || undefined,
                          serviceUUIDs: ['af7d9e8c-3b2a-4f1e-9c8d-5e6f7a8b9c0d'],
                        }];
                      });
                    }
                    console.log('[BG-SCAN-DEBUG] Seeded nativeDevices with stored devices');
                  }
                } catch (err) {
                  console.error('[BG-SCAN-DEBUG] Failed to seed from SharedPreferences:', err);
                }
              }
            })
            .catch(err => console.error('[BG-SCAN] Failed to start:', err));

          // Subscribe to native device found events
          unsubscribeDeviceFound = onBackgroundDeviceFound(async (device) => {
            console.log('[BG-SCAN-NATIVE] Device found:', device);

            const { id, deviceId, name, rssi, distanceFeet } = device;

            if (!deviceId) {
              console.log('[BG-SCAN-NATIVE] No deviceId, skipping');
              return;
            }

            // Profile lookup using correct RPC function
            let foundUserId: string | null = null;
            let displayName: string | null = null;

            try {
              const normalizedDeviceId = deviceId.toLowerCase().replace(/-/g, '');
              console.log('[BG-SCAN-NATIVE] Looking up profile for deviceId:', normalizedDeviceId);

              const { data: userProfileData, error: userProfileError } = await supabase
                .rpc('get_profile_by_user_id_prefix', { prefix: normalizedDeviceId });

              if (!userProfileError && userProfileData) {
                foundUserId = userProfileData.user_id;
                displayName = userProfileData.name || userProfileData.username || deviceId;
                console.log('[BG-SCAN-NATIVE] Profile found - userId:', foundUserId, 'displayName:', displayName);
              }
            } catch (err) {
              console.error('[BG-SCAN-NATIVE] Profile lookup error:', err);
            }

            // Update RSSI history for smoothing
            const rssiHistory = nativeRssiHistoryRef.current.get(id) || [];
            rssiHistory.push(rssi);
            if (rssiHistory.length > 5) {
              rssiHistory.shift();
            }
            nativeRssiHistoryRef.current.set(id, rssiHistory);

            const averagedRssi = rssiHistory.reduce((sum, val) => sum + val, 0) / rssiHistory.length;
            // Recalculate distance with averaged RSSI
            const measuredPower = -59;
            const distanceMeters = Math.pow(10, (measuredPower - averagedRssi) / (10 * 2));
            const smoothedDistanceFeet = distanceMeters * 3.28084;

            // Update native devices state
            setNativeDevices(prev => {
              const exists = prev.find(d => d.id === id);
              const updatedDevice: NativeBLEDeviceWithProfile = {
                id,
                deviceId,
                name,
                rssi,
                distanceFeet: smoothedDistanceFeet,
                userId: foundUserId || undefined,
                username: displayName || undefined,
                serviceUUIDs: ['af7d9e8c-3b2a-4f1e-9c8d-5e6f7a8b9c0d'],
              };

              if (!exists) {
                console.log('[BG-SCAN-NATIVE] Adding new device:', id);
                return [...prev, updatedDevice];
              } else {
                console.log('[BG-SCAN-NATIVE] Updating existing device:', id);
                return prev.map(d => d.id === id ? { ...d, ...updatedDevice } : d);
              }
            });
          });

        } else {
          console.log('[BG-SCAN-DEBUG] BLE permissions not yet granted - scan deferred');
        }
      } else if (scanStartedRef.current) {
        console.log('[BG-SCAN-DEBUG] STOP branch - scanStartedRef was true, stopping');
        scanStartedRef.current = false;
        stopBackgroundScan().catch(err => console.error('[BG-SCAN] Failed to stop:', err));
        // Clear native devices when stopping
        setNativeDevices([]);
        nativeRssiHistoryRef.current.clear();
      } else {
        console.log('[BG-SCAN-DEBUG] NO-OP branch - not authenticated and scan was never started');
      }
    };

    checkAndStart();

    // Cleanup: unsubscribe from events (but don't stop scan)
    return () => {
      if (unsubscribeDeviceFound) {
        console.log('[BG-SCAN-NATIVE] Removing device found listener');
        unsubscribeDeviceFound();
      }
    };
  }, [isAuthenticated, userId, authLoading]);

  // Save pending push token after auth resolves
  useEffect(() => {
    console.log('[PUSH-DEBUG] Push registration useEffect fired - isAuthenticated:', isAuthenticated, 'userId:', userId ? userId.substring(0, 8) : 'null');
    if (!isAuthenticated || !userId) return;
    const registerPushToken = async () => {
      try {
        const messaging = getMessaging();
        const fcmToken = await getToken(messaging);
        if (fcmToken) {
          console.log('[PUSH-DEBUG] FCM token received, saving to Supabase...');
          await savePushToken(fcmToken);
          console.log('[PUSH-DEBUG] FCM token saved to Supabase');
        } else {
          console.error('[PUSH-DEBUG] No FCM token returned');
        }
      } catch (error: any) {
        console.error('[PUSH-DEBUG] Push registration error:', error.message);
      }
    };
    registerPushToken();
  }, [isAuthenticated, userId]);

  // BLE Advertising control - start/stop based on isDiscoverable toggle
  // Runs at App level so advertising persists when navigating between tabs
  useEffect(() => {
    console.log('[BLE-ADV-APP] useEffect fired - isDiscoverable:', isDiscoverable, 'discoverableLoaded:', discoverableLoaded, 'advertisingAvailable:', advertisingAvailable, 'authLoading:', authLoading, 'userId:', userId ? 'present' : 'null', 'isAdvertising:', isAdvertising);

    // Wait for persisted ghost mode preference to be loaded from native
    if (!discoverableLoaded) {
      console.log('[BLE-ADV-APP] Early return - discoverableLoaded is false, waiting for persisted preference');
      return;
    }

    // Wait for BLE availability, auth loading to complete, and userId to be available
    if (!advertisingAvailable || authLoading || !userId) {
      console.log('[BLE-ADV-APP] Early return - prerequisites not met');
      return;
    }

    // Start advertising when isDiscoverable is true (ACTIVE mode)
    if (isDiscoverable) {
      // Use synchronous ref guard instead of isAdvertising state
      // This prevents multiple calls when useEffect fires rapidly due to multiple dependency changes
      if (!hasRequestedAdvertisingRef.current && !isAdvertising) {
        console.log('[BLE-ADV-APP] 🔒 Setting hasRequestedAdvertisingRef = true, calling startAdvertising');
        hasRequestedAdvertisingRef.current = true;
        startAdvertisingRef.current();
      } else {
        console.log('[BLE-ADV-APP] Skipping start - hasRequestedAdvertisingRef:', hasRequestedAdvertisingRef.current, 'isAdvertising:', isAdvertising);
      }
    } else {
      // Stop advertising when isDiscoverable is false (GHOST mode)
      console.log('[BLE-ADV-APP] 🔓 isDiscoverable=false, resetting hasRequestedAdvertisingRef and stopping');
      hasRequestedAdvertisingRef.current = false;
      stopAdvertisingRef.current();
    }
  }, [isDiscoverable, discoverableLoaded, advertisingAvailable, authLoading, userId, isAdvertising]);

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
    console.log('[SIGNUP-DEBUG] handleSignupSuccess called with profileData:', profileData ? 'YES' : 'NO');
    console.log('SUCCESS: [App] Signup successful');

    // Refresh auth state to detect the new Supabase session created during signup
    console.log('[SIGNUP-DEBUG] About to call refreshAuth()...');
    console.log('[App] Refreshing auth state after signup...');
    await refreshAuth();
    console.log('[SIGNUP-DEBUG] refreshAuth() completed');
    console.log('SUCCESS: [App] Auth state refreshed');

    // Set flag to prevent automatic data reload (prevents race condition)
    console.log('[SIGNUP-DEBUG] Calling setIsSignupInProgress(true)');
    setIsSignupInProgress(true);

    // Set profile data directly from signup form instead of reloading from backend
    // This prevents race condition where GET /profile happens before POST /profile completes
    if (profileData) {
      console.log('[SIGNUP-DEBUG] profileData exists, setting user profile from form data');
      const phoneDigitsOnly = profileData.phone.replace(/\D/g, '');

      console.log('🔢 [DEBUG] setUserProfile CALL #4: Signup flow');
      setUserProfile({
        name: profileData.name || 'Your Name',
        phone: phoneDigitsOnly ? formatPhoneNumber(phoneDigitsOnly) : '(555) 123-4567',
        email: 'user@example.com',  // Will be set from auth context
        bio: profileData.bio || 'Add bio',
        socialMedia: [],
      });
      console.log('[SIGNUP-DEBUG] setUserProfile completed');
    }

    console.log('[SIGNUP-DEBUG] Calling setIsFirstTimeUser(true)');
    setIsFirstTimeUser(true);

    // Reset flag - normal data loads can proceed from here
    console.log('[SIGNUP-DEBUG] Calling setIsSignupInProgress(false)');
    setIsSignupInProgress(false);
    console.log('✅ [App] Signup flow complete, flag reset');

    console.log('[SIGNUP-DEBUG] Calling setShowProfilePhotoPrompt(true)');
    console.log('✅ [App] Setting showProfilePhotoPrompt = true');
    setShowProfilePhotoPrompt(true);
    console.log('[SIGNUP-DEBUG] handleSignupSuccess completed');
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
                    <NativeBLEDevicesContext.Provider value={{ nativeDevices }}>
                      <BLEAdvertisingContext.Provider value={{ isDiscoverable, setIsDiscoverable, isAdvertising, isAvailable: advertisingAvailable }}>
                        <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
                          <View style={{ flex: 1 }} {...panResponder.panHandlers}>
                            {Screen()}
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
                      </BLEAdvertisingContext.Provider>
                    </NativeBLEDevicesContext.Provider>
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