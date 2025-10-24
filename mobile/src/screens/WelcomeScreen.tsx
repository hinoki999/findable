import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, ActivityIndicator, Alert, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useDarkMode } from '../../App';
import { getTheme } from '../theme';
// import { useGoogleAuth, authenticateWithGoogle } from '../services/googleAuth';

const { width, height } = Dimensions.get('window');

interface WelcomeScreenProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onGoogleLoginSuccess?: (token: string, userId: number, username: string) => void;
  showToast?: (config: { message: string; type?: 'success' | 'error' | 'info' }) => void;
}

export default function WelcomeScreen({ onGetStarted, onLogin, onGoogleLoginSuccess, showToast }: WelcomeScreenProps) {
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);
  // const { request, response, promptAsync } = useGoogleAuth();
  const [googleLoading, setGoogleLoading] = React.useState(false);

  // useEffect(() => {
  //   if (response?.type === 'success') {
  //     const { id_token } = response.params;
  //     handleGoogleAuth(id_token);
  //   }
  // }, [response]);

  // const handleGoogleAuth = async (idToken: string) => {
  //   try {
  //     setGoogleLoading(true);
  //     const result = await authenticateWithGoogle(idToken);
  //     
  //     if (onGoogleLoginSuccess) {
  //       onGoogleLoginSuccess(result.token, result.user_id, result.username);
  //     }
  //   } catch (error: any) {
  //     console.error('Google auth error:', error);
  //     Alert.alert('Authentication Failed', error.message || 'Failed to sign in with Google');
  //   } finally {
  //     setGoogleLoading(false);
  //   }
  // };

  const handleGoogleSignIn = () => {
    // promptAsync();
    if (showToast) {
      showToast({
        message: 'Google Sign-In coming soon! Please use "Get Started" or "Log In" for now.',
        type: 'info',
        duration: 4000,
      });
    }
    console.log('Google Sign-In clicked - feature coming soon');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      {/* Logo/Icon */}
      <View style={styles.logoContainer}>
        {/* Gradient Text with Drop as dot over 'i' */}
        <View style={styles.textWithDropContainer}>
          {Platform.OS === 'web' ? (
            <Text
              style={[
                styles.appName,
                {
                  display: 'inline-block',
                  background: 'linear-gradient(90deg, #FF6B35 0%, #FF8C5A 33%, #5BA3FF 66%, #007AFF 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  color: 'transparent',
                } as any
              ]}
            >
              DropL<Text style={{ opacity: 0 }}>i</Text>nk
            </Text>
          ) : (
            <LinearGradient
              colors={['#FF6B35', '#FF8C5A', '#5BA3FF', '#007AFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradientContainer}
            >
              <Text style={styles.appName}>DropL<Text style={{ opacity: 0 }}>i</Text>nk</Text>
            </LinearGradient>
          )}
          {/* Water Drop Icon positioned over 'i' */}
          <View style={styles.dropOverI}>
            <MaterialCommunityIcons name="water" size={20} color="#007AFF" />
          </View>
        </View>
      </View>

      {/* Tagline */}
      <View style={styles.taglineContainer}>
        <View style={styles.taglineRow}>
          <Text style={[styles.tagline, { color: theme.colors.text }]}>
            Connect with people nearby{' '}
          </Text>
          <MaterialCommunityIcons name="link-variant" size={18} color="#FF6B35" style={{ marginTop: 2 }} />
        </View>
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
    marginBottom: 24,
  },
  textWithDropContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropOverI: {
    position: 'absolute',
    top: -8,
    left: '50%',
    marginLeft: 6,
    zIndex: 10,
  },
  appName: {
    fontSize: 32,
    fontWeight: '500',
    fontFamily: 'Inter_400Regular',
    letterSpacing: -1,
  },
  gradientContainer: {
    paddingVertical: 4,
    borderRadius: 8,
  },
  taglineContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: {
    fontSize: 17,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 24,
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
    marginBottom: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: 'Inter_500Medium',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginHorizontal: 16,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  googleButtonText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '500',
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

