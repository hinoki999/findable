import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDarkMode } from '../../App';
import { getTheme } from '../theme';

interface LoginScreenProps {
  onLoginSuccess: (token: string, userId: number, username: string) => void;
  onSignupPress: () => void;
  onBack: () => void;
}

export default function LoginScreen({ onLoginSuccess, onSignupPress, onBack }: LoginScreenProps) {
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('https://findable-production.up.railway.app/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Login failed');
      }

      // Success!
      onLoginSuccess(data.token, data.user_id, data.username);
    } catch (err: any) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.bg }]}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backButton}>
            {({ pressed }) => (
              <MaterialCommunityIcons
                name="arrow-left"
                size={24}
                color={theme.colors.blue}
                style={{ opacity: pressed ? 0.6 : 1 }}
              />
            )}
          </Pressable>
          <Text style={[styles.title, { color: theme.colors.blue }]}>Log In</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Username */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>Username</Text>
            <View style={[
              styles.inputContainer,
              { backgroundColor: theme.colors.white, borderColor: theme.colors.border }
            ]}>
              <TextInput
                style={[styles.input, { color: theme.colors.text }]}
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  setError('');
                }}
                placeholder="johndoe"
                placeholderTextColor={theme.colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>Password</Text>
            <View style={[
              styles.inputContainer,
              { backgroundColor: theme.colors.white, borderColor: theme.colors.border }
            ]}>
              <TextInput
                style={[styles.input, { color: theme.colors.text, flex: 1 }]}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setError('');
                }}
                placeholder="••••••••"
                placeholderTextColor={theme.colors.muted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                onSubmitEditing={handleLogin}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                {({ pressed }) => (
                  <MaterialCommunityIcons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={theme.colors.muted}
                    style={{ opacity: pressed ? 0.6 : 1 }}
                  />
                )}
              </Pressable>
            </View>
          </View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="alert-circle" size={16} color="#FF3B30" />
              <Text style={styles.errorMessage}>{error}</Text>
            </View>
          ) : null}

          {/* Login Button */}
          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              {
                backgroundColor: username && password && !loading ? theme.colors.blue : theme.colors.muted,
                opacity: pressed && username && password ? 0.8 : 1,
              }
            ]}
            onPress={handleLogin}
            disabled={!username || !password || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Log In</Text>
            )}
          </Pressable>

          {/* Signup Link */}
          <View style={styles.signupContainer}>
            <Text style={[styles.signupPrompt, { color: theme.colors.muted }]}>
              Don't have an account?
            </Text>
            <Pressable onPress={onSignupPress} disabled={loading}>
              {({ pressed }) => (
                <Text style={[
                  styles.signupLink,
                  { color: theme.colors.blue, opacity: pressed ? 0.6 : 1 }
                ]}>
                  Sign Up
                </Text>
              )}
            </Pressable>
          </View>

          {/* Future: Forgot Password */}
          {/* <Pressable style={styles.forgotPassword}>
            <Text style={[styles.forgotPasswordText, { color: theme.colors.blue }]}>
              Forgot Password?
            </Text>
          </Pressable> */}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    fontFamily: 'Inter_500Medium',
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    fontFamily: 'Inter_500Medium',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  input: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFE5E5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
  },
  errorMessage: {
    fontSize: 14,
    color: '#FF3B30',
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: 'Inter_500Medium',
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  signupPrompt: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  signupLink: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Inter_500Medium',
  },
});

