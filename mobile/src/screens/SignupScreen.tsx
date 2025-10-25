import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDarkMode } from '../../App';
import { getTheme } from '../theme';

interface SignupScreenProps {
  onSignupSuccess: (token: string, userId: number, username: string, email?: string) => void;
  onLoginPress: () => void;
  onBack: () => void;
}

export default function SignupScreen({ onSignupSuccess, onLoginPress, onBack }: SignupScreenProps) {
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Validation states
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validateUsername = (text: string) => {
    setUsername(text);
    setUsernameError('');

    if (text.length === 0) return;

    if (text.length < 3) {
      setUsernameError('At least 3 characters');
      return;
    }
    if (text.length > 20) {
      setUsernameError('Maximum 20 characters');
      return;
    }
    if (!text.replace('_', '').match(/^[a-zA-Z0-9_]*$/)) {
      setUsernameError('Letters, numbers, and underscores only');
      return;
    }
  };

  const validatePassword = (text: string) => {
    setPassword(text);
    setPasswordError('');

    if (text.length === 0) return;

    if (text.length < 8) {
      setPasswordError('At least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(text)) {
      setPasswordError('Need at least one uppercase letter');
      return;
    }
    if (!/[a-z]/.test(text)) {
      setPasswordError('Need at least one lowercase letter');
      return;
    }
    if (!/[0-9]/.test(text)) {
      setPasswordError('Need at least one number');
      return;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(text)) {
      setPasswordError('Need at least one special character');
      return;
    }
  };

  const handleSignup = async () => {
    // Final validation
    if (!username || username.length < 3 || username.length > 20) {
      setError('Please enter a valid username (3-20 characters)');
      return;
    }

    if (!password || password.length < 8) {
      setError('Please enter a valid password (8+ characters)');
      return;
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      setError('Password must contain uppercase, lowercase, number, and special character');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('https://findable-production.up.railway.app/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          email: email || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Registration failed');
      }

      // Success!
      onSignupSuccess(data.token, data.user_id, data.username, email || undefined);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = username.length >= 3 && password.length >= 8 && !usernameError && !passwordError;

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
          <Text style={[styles.title, { color: theme.colors.blue }]}>Sign Up</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Username */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>Username</Text>
            <View style={[
              styles.inputContainer,
              {
                backgroundColor: theme.colors.white,
                borderColor: usernameError ? '#FF3B30' : theme.colors.border,
              }
            ]}>
              <TextInput
                style={[styles.input, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}
                value={username}
                onChangeText={validateUsername}
                placeholder="johndoe"
                placeholderTextColor={theme.colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>
            {usernameError ? (
              <Text style={styles.errorText}>{usernameError}</Text>
            ) : null}
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>Password</Text>
            <View style={[
              styles.inputContainer,
              {
                backgroundColor: theme.colors.white,
                borderColor: passwordError ? '#FF3B30' : theme.colors.border,
              }
            ]}>
              <TextInput
                style={[styles.input, { color: isDarkMode ? '#FFFFFF' : '#000000', flex: 1 }]}
                value={password}
                onChangeText={validatePassword}
                placeholder="••••••••"
                placeholderTextColor={theme.colors.muted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
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
            {passwordError ? (
              <Text style={styles.errorText}>{passwordError}</Text>
            ) : null}
            <Text style={[styles.hint, { color: theme.colors.muted }]}>
              8+ chars, uppercase, lowercase, number
            </Text>
          </View>

          {/* Email (Optional) */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Email <Text style={{ color: theme.colors.muted }}>(optional)</Text>
            </Text>
            <View style={[
              styles.inputContainer,
              { backgroundColor: theme.colors.white, borderColor: theme.colors.border }
            ]}>
              <TextInput
                style={[styles.input, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}
                value={email}
                onChangeText={setEmail}
                placeholder="john@example.com"
                placeholderTextColor={theme.colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>
          </View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="alert-circle" size={16} color="#FF3B30" />
              <Text style={styles.errorMessage}>{error}</Text>
            </View>
          ) : null}

          {/* Create Account Button */}
          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              {
                backgroundColor: canSubmit && !loading ? theme.colors.blue : theme.colors.muted,
                opacity: pressed && canSubmit ? 0.8 : 1,
              }
            ]}
            onPress={handleSignup}
            disabled={!canSubmit || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Create Account</Text>
            )}
          </Pressable>

          {/* Login Link */}
          <View style={styles.loginContainer}>
            <Text style={[styles.loginPrompt, { color: theme.colors.muted }]}>
              Already have an account?
            </Text>
            <Pressable onPress={onLoginPress} disabled={loading}>
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
  hint: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
  },
  errorText: {
    fontSize: 13,
    color: '#FF3B30',
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
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

