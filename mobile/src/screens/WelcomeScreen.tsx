import React from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDarkMode } from '../../App';
import { getTheme } from '../theme';

const { width, height } = Dimensions.get('window');

interface WelcomeScreenProps {
  onGetStarted: () => void;
  onLogin: () => void;
}

export default function WelcomeScreen({ onGetStarted, onLogin }: WelcomeScreenProps) {
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      {/* Logo/Icon */}
      <View style={styles.logoContainer}>
        <View style={[styles.iconCircle, { backgroundColor: theme.colors.blue }]}>
          <MaterialCommunityIcons name="account-multiple" size={60} color="#FFFFFF" />
        </View>
        <Text style={[styles.appName, { color: theme.colors.blue }]}>Droplin</Text>
      </View>

      {/* Tagline */}
      <View style={styles.taglineContainer}>
        <Text style={[styles.tagline, { color: theme.colors.text }]}>
          Share contacts with
        </Text>
        <Text style={[styles.tagline, { color: theme.colors.text }]}>
          people nearby 📡
        </Text>
      </View>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        {/* Get Started Button */}
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: theme.colors.blue, opacity: pressed ? 0.8 : 1 }
          ]}
          onPress={onGetStarted}
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
        </Pressable>

        {/* Login Link */}
        <View style={styles.loginContainer}>
          <Text style={[styles.loginPrompt, { color: theme.colors.muted }]}>
            Already have an account?
          </Text>
          <Pressable onPress={onLogin}>
            {({ pressed }) => (
              <Text style={[
                styles.loginLink,
                { color: theme.colors.blue, opacity: pressed ? 0.6 : 1 }
              ]}>
                Log In
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  appName: {
    fontSize: 36,
    fontWeight: '600',
    fontFamily: 'Inter_500Medium',
  },
  taglineContainer: {
    alignItems: 'center',
    marginBottom: 80,
  },
  tagline: {
    fontSize: 20,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 28,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 400,
  },
  primaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: 'Inter_500Medium',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  loginPrompt: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  loginLink: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Inter_500Medium',
  },
});

