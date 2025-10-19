import React, { useState, useEffect, createContext, useContext } from 'react';
import { View, Pressable, Text, PanResponder } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DropScreen from './src/screens/DropScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import AccountScreen from './src/screens/AccountScreen';
import HomeScreen from './src/screens/HomeScreen';
import Toast from './src/components/Toast';
import { TutorialProvider } from './src/contexts/TutorialContext';
import { colors, type, getTheme } from './src/theme';

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
    bio: 'Optional bio line goes here.',
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
  maxDistance: 75,
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

export default function App() {
  const [fontsReady] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [tab, setTab] = useState<'Home'|'Drop'|'History'|'Account'>('Home');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isFirstLaunch, setIsFirstLaunch] = useState(true);
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set([1001, 1002, 1003, 1004, 1005]));
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'Your Name',
    phoneNumber: '(555) 123-4567',
    email: 'user@example.com',
    bio: 'Optional bio line goes here.',
    socialMedia: [],
  });
  const [toastConfig, setToastConfig] = useState<ToastConfig | null>(null);
  const [linkNotifications, setLinkNotifications] = useState<LinkNotification[]>([]);
  const [nextLinkId, setNextLinkId] = useState(1);
  const [maxDistance, setMaxDistance] = useState(75); // Default 75 feet
  
  useEffect(() => { 
    console.log('APP_BOOT_MARKER', Date.now());
    // Show welcome screen for 2 seconds on first launch only
    const timer = setTimeout(() => {
      setIsFirstLaunch(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  const togglePin = (id: number) => {
    setPinnedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const updateProfile = (updates: Partial<UserProfile>) => {
    setUserProfile(prev => ({ ...prev, ...updates }));
  };

  const showToast = (config: ToastConfig) => {
    setToastConfig(config);
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

  if (!fontsReady) {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (isFirstLaunch) {
    return (
      <View style={{ flex:1, backgroundColor: theme.colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={theme.type.h1}>Welcome to DropLink!</Text>
      </View>
    );
  }

  const Screen = () => {
    if (tab === 'Home') return <HomeScreen />;
    if (tab === 'History') return <HistoryScreen />;
    if (tab === 'Account') return <AccountScreen />;
    return <DropScreen />;
  };

  return (
    <TutorialProvider>
      <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
        <PinnedProfilesContext.Provider value={{ pinnedIds, togglePin }}>
          <UserProfileContext.Provider value={{ profile: userProfile, updateProfile }}>
            <ToastContext.Provider value={{ showToast }}>
              <SettingsContext.Provider value={{ maxDistance, setMaxDistance }}>
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

        {/* Bottom nav */}
        <View style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.white
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
