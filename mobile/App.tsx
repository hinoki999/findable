import 'react-native-gesture-handler';
import React, { useState, useEffect, createContext, useContext } from 'react';
import { View, Pressable, Text, PanResponder } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DropScreen from './src/screens/DropScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import AccountScreen from './src/screens/AccountScreen';
import HomeScreen from './src/screens/HomeScreen';
// import PrivacyZonesScreen from './src/screens/PrivacyZonesScreen'; // Removed feature
import ProfilePhotoScreen from './src/screens/ProfilePhotoScreen';
import SecuritySettingsScreen from './src/screens/SecuritySettingsScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import SignupScreen from './src/screens/SignupScreen';
import LoginScreen from './src/screens/LoginScreen';
import Toast from './src/components/Toast';
import { TutorialProvider } from './src/contexts/TutorialContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { colors, type, getTheme } from './src/theme';
import * as Updates from 'expo-updates';

// Dark Mode Context
const DarkModeContext = createContext<{
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}>({
  isDarkMode: false,
  toggleDarkMode: () => {},
});

export const useDarkMode = () => useContext(DarkModeContext);

// Pinned Profiles Context
const PinnedProfilesContext = createContext<{
  pinnedIds: Set<number>;
  togglePin: (id: number) => void;
}>({
  pinnedIds: new Set(),
  togglePin: () => {},
});

export const usePinnedProfiles = () => useContext(PinnedProfilesContext);

// User Profile Context
interface SocialMediaAccount {
  platform: string;
  handle: string;
}

interface UserProfile {
  name: string;
  phoneNumber: string;
  email: string;
  bio: string;
  socialMedia: SocialMediaAccount[];
}

const UserProfileContext = createContext<{
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
}>({
  profile: {
    name: 'Your Name',
    phoneNumber: '(555) 123-4567',
    email: 'user@example.com',
    bio: 'Add bio',
    socialMedia: [],
  },
  updateProfile: () => {},
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
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

// Settings Context (for distance filter, etc.)
const SettingsContext = createContext<{
  maxDistance: number; // in feet
  setMaxDistance: (distance: number) => void;
}>({
  maxDistance: 33,
  setMaxDistance: () => {},
});

export const useSettings = () => useContext(SettingsContext);

// Link Notifications Context (for returned drops)
interface SocialMediaAccount {
  platform: string;
  handle: string;
}

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
  addLinkNotification: () => {},
  markAsViewed: () => {},
  dismissNotification: () => {},
  hasUnviewedLinks: false,
});

export const useLinkNotifications = () => useContext(LinkNotificationsContext);

import { useFonts,
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold
} from '@expo-google-fonts/inter';

// Main App Component (wrapped by AuthProvider)
function MainApp() {
  const { isAuthenticated, loading: authLoading, login, userId } = useAuth();
  
  const [fontsReady] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Auth flow state
  const [authScreen, setAuthScreen] = useState<'welcome' | 'signup' | 'login'>('welcome');

  const [tab, setTab] = useState<'Home'|'Drop'|'History'|'Account'>('Home');
  const [subScreen, setSubScreen] = useState<string | null>(null); // For sub-screens like Privacy Zones
  const [isDarkMode, setIsDarkMode] = useState(true);
  const insets = useSafeAreaInsets();
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set([1001, 1002, 1003, 1004, 1005]));
  // const [privacyZones, setPrivacyZones] = useState<any[]>([]); // Removed Privacy Zones feature
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'Your Name',
    phoneNumber: '(555) 123-4567',
    email: 'user@example.com',
    bio: 'Add bio',
    socialMedia: [],
  });
  const [toastConfig, setToastConfig] = useState<ToastConfig | null>(null);
  const [linkNotifications, setLinkNotifications] = useState<LinkNotification[]>([]);
  const [nextLinkId, setNextLinkId] = useState(1);
  const [maxDistance, setMaxDistance] = useState(33); // Default 33 feet (10m)
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false); // Track if user just signed up
  const [showProfilePhotoPrompt, setShowProfilePhotoPrompt] = useState(false); // Show profile photo setup after signup

  // Function to load all user data from backend
  const loadUserData = async () => {
    if (!isAuthenticated || !userId) return;
    
    try {
      console.log('📥 Loading user data from backend...');
      
      // Load user profile
      try {
        console.log('🔍 Attempting to load profile data...');
        const profileData = await import('./src/services/api').then(m => m.getUserProfile());
        console.log('📦 Profile response:', profileData);
        
        if (profileData) {
          console.log('✅ Setting profile state with:', {
            name: profileData.name,
            phone: profileData.phone,
            email: profileData.email,
            bio: profileData.bio,
            profile_photo: profileData.profile_photo
          });
          
          // Always set profile data, even if fields are empty
          // This allows the backend to be the single source of truth
          setUserProfile({
            name: profileData.name || 'Your Name',
            phoneNumber: profileData.phone || '(555) 123-4567',
            email: profileData.email || 'user@example.com',
            bio: profileData.bio || 'Add bio',
            socialMedia: profileData.socialMedia || [],
          });
          
          // Load profile photo if exists (moved outside conditional)
          if (profileData.profile_photo) {
            console.log('✅ Loaded profile photo:', profileData.profile_photo);
            setProfilePhotoUri(profileData.profile_photo);
          } else {
            console.log('ℹ️ No profile photo found');
            setProfilePhotoUri(null);
          }
        } else {
          console.log('⚠️ Profile response was null/undefined');
        }
      } catch (error) {
        console.error('❌ Failed to load profile:', error);
      }
      
      // Load settings
      const settingsData = await import('./src/services/api').then(m => m.getUserSettings());
      if (settingsData) {
        console.log('✅ Loaded settings:', settingsData);
        setIsDarkMode(settingsData.darkMode);
        setMaxDistance(settingsData.maxDistance);
      }

      // Load linked devices/contacts
      const devicesData = await import('./src/services/api').then(m => m.getDevices());
      if (devicesData && devicesData.length > 0) {
        console.log('✅ Loaded devices:', devicesData.length, 'contacts');
        
        // Convert devices to link notifications for accepted/returned contacts
        const notifications: LinkNotification[] = devicesData
          .filter(device => device.action === 'accepted' || device.action === 'returned')
          .map((device, index) => ({
            id: device.id || index,
            name: device.name,
            phoneNumber: device.phoneNumber || '',
            email: device.email || '',
            bio: device.bio || '',
            socialMedia: device.socialMedia || [],
            timestamp: device.timestamp ? new Date(device.timestamp).getTime() : Date.now(),
            viewed: true, // Mark as viewed since they're from backend
            dismissed: false,
            deviceId: device.id,
          }));
        
        setLinkNotifications(notifications);
        console.log('✅ Loaded link notifications:', notifications.length);
      }

      // Load pinned contacts
      const pinnedData = await import('./src/services/api').then(m => m.getPinnedContacts());
      if (pinnedData && pinnedData.length > 0) {
        console.log('✅ Loaded pinned contacts:', pinnedData);
        setPinnedIds(new Set(pinnedData));
      }
      
      // Privacy Zones feature removed
      // const zonesData = await import('./src/services/api').then(m => m.getPrivacyZones());
      // if (zonesData) {
      //   console.log('✅ Loaded privacy zones:', zonesData);
      //   setPrivacyZones(zonesData);
      // }
      
      console.log('✅ All user data loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load user data:', error);
    }
  };

  // Load user data when authenticated
  useEffect(() => {
    if (isAuthenticated && userId) {
      loadUserData();
    }
  }, [isAuthenticated, userId]);

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
  const handleSignupSuccess = async (token: string, userId: number, username: string, email?: string) => {
    console.log('✅ Signup successful:', username);
    // Profile info is already saved in SignupScreen
    // Now log them in and show profile photo prompt
    setIsFirstTimeUser(true);
    await login(token, userId, username);
    // Show profile photo prompt instead of going directly to main app
    setShowProfilePhotoPrompt(true);
  };

  const handleLoginSuccess = async (token: string, userId: number, username: string) => {
    console.log('✅ Login successful:', username);
    await login(token, userId, username);
    
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

  const handleProfilePhotoPromptComplete = async () => {
    console.log('✅ Profile photo prompt completed');
    setShowProfilePhotoPrompt(false);
    // Load user data to get the new profile photo if uploaded
    await loadUserData();
    
    // For first-time users, navigate to Home tab
    // Tutorials will automatically show since AsyncStorage has no completion data yet
    if (isFirstTimeUser) {
      setTab('Home');
      setSubScreen(null);
      console.log('✅ Navigation reset to Home tab for first-time user');
    }
    
    showToast({
      message: 'Welcome to DropLink!',
      type: 'success',
      duration: 3000,
    });
  };

  const toggleDarkMode = async () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);
    
    // Save to backend
    try {
      const api = await import('./src/services/api');
      await api.saveUserSettings({
        darkMode: newValue,
        maxDistance,
        privacyZonesEnabled: false, // TODO: Get from actual state
      });
      console.log('✅ Dark mode saved to backend:', newValue);
    } catch (error) {
      console.error('❌ Failed to save dark mode:', error);
    }
  };

  const togglePin = async (id: number) => {
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
    
    // Save to backend
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
      console.error('❌ Failed to save pin status:', error);
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    const newProfile = { ...userProfile, ...updates };
    setUserProfile(newProfile);
    
    // Save to backend
    try {
      const api = await import('./src/services/api');
      await api.saveUserProfile({
        name: newProfile.name,
        email: newProfile.email,
        phone: newProfile.phoneNumber,
        bio: newProfile.bio,
        socialMedia: newProfile.socialMedia,
      });
      console.log('✅ Profile saved to backend:', newProfile);
      showToast({ message: 'Profile updated', type: 'success', duration: 2000 });
    } catch (error) {
      console.error('❌ Failed to save profile:', error);
      showToast({ message: 'Failed to save profile', type: 'error', duration: 3000 });
    }
  };

  const showToast = (config: ToastConfig) => {
    setToastConfig(config);
  };

  const updateMaxDistance = async (distance: number) => {
    setMaxDistance(distance);
    
    // Save to backend
    try {
      const api = await import('./src/services/api');
      await api.saveUserSettings({
        darkMode: isDarkMode,
        maxDistance: distance,
        privacyZonesEnabled: false, // TODO: Get from actual state
      });
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
        <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor: theme.colors.bg }}>
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
            onSignupSuccess={(token, userId, username, email) => {
              handleSignupSuccess(token, userId, username, email);
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
            onGoogleLoginSuccess={handleLoginSuccess}
            showToast={showToast}
          />
        )}
      </DarkModeContext.Provider>
    );
  }

  // Show profile photo prompt after signup (authenticated but before main app)
  if (isAuthenticated && showProfilePhotoPrompt) {
    const promptNavigation = {
      navigate: () => {},
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
            <Pressable onPress={handleProfilePhotoPromptComplete}>
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
              setProfilePhotoUri(uri);
              handleProfilePhotoPromptComplete();
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
    // Privacy Zones feature removed
    // if (subScreen === 'PrivacyZones') {
    //   return <PrivacyZonesScreen navigation={navigation} zones={privacyZones} setZones={setPrivacyZones} />;
    // }
    
    if (subScreen === 'ProfilePhoto') {
      return <ProfilePhotoScreen navigation={navigation} onPhotoSaved={setProfilePhotoUri} />;
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

  return (
    <TutorialProvider>
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
             onPress={() => setTab('Home')}
             style={{
               flex: 1, paddingVertical: 14, alignItems:'center',
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
            onPress={() => setTab('Drop')}
            style={{
              flex: 1, paddingVertical: 14, alignItems:'center',
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
          onPress={() => setTab('History')}
          style={{
            flex: 1, paddingVertical: 14, alignItems:'center',
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
            onPress={() => setTab('Account')}
            style={{
              flex: 1, paddingVertical: 14, alignItems:'center',
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
