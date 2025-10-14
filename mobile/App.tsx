import React, { useState, useEffect, createContext, useContext } from 'react';
import { View, Pressable, Text } from 'react-native';
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
          {(['Home','Drop','History','Account'] as const).map(name => (
            <Pressable
              key={name}
              onPress={() => setTab(name)}
              style={{
                flex: 1, paddingVertical: 14, alignItems:'center',
                backgroundColor: tab === name ? theme.colors.blueLight : theme.colors.white
              }}
            >
              <Text style={{ ...theme.type.tab, fontWeight: tab === name ? '700' : '500', color: theme.colors.blue }}>
                {name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </DarkModeContext.Provider>
  );
}
