import React, { useState, useEffect, createContext, useContext } from 'react';
import { View, Pressable, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DropScreen from './src/screens/DropScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import AccountScreen from './src/screens/AccountScreen';
import HomeScreen from './src/screens/HomeScreen';
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

  const [tab, setTab] = useState<'Home'|'Drop'|'History'|'Account'>('Drop');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(true);
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set([1001, 1002, 1003, 1004, 1005]));
  
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
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      <PinnedProfilesContext.Provider value={{ pinnedIds, togglePin }}>
        <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ flex: 1 }}>
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
               backgroundColor: tab === 'Home' ? '#D1F2DB' : theme.colors.white
             }}
           >
             <MaterialCommunityIcons 
               name="home-outline" 
               size={24} 
               color="#34C759" 
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
            backgroundColor: tab === 'History' ? '#D1F2DB' : theme.colors.white
          }}
        >
          <MaterialCommunityIcons
            name="link-variant"
            size={24}
            color="#34C759"
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
      </View>
      </PinnedProfilesContext.Provider>
    </DarkModeContext.Provider>
  );
}
