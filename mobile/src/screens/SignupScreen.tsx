import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDarkMode } from '../../App';
import { getTheme } from '../theme';
import { BASE_URL, secureFetch } from '../services/api';

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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Validation states
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [emailError, setEmailError] = useState('');

  // Email verification modal
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationStep, setVerificationStep] = useState<'confirm' | 'enter-code'>('confirm');
  const [verificationCode, setVerificationCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);

  const checkUsernameAvailability = async (username: string) => {
    try {
      const response = await secureFetch(`${BASE_URL}/auth/check-username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      
      const data = await response.json();
      
      if (!data.available) {
        setUsernameError(data.message);
      }
    } catch (err) {
      console.error('Failed to check username:', err);
    }
  };

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
    if (!text.match(/^[a-zA-Z0-9_.]*$/)) {
      setUsernameError('Letters, numbers, underscores, and periods only');
      return;
    }
  };

  // Debounced username availability check
  useEffect(() => {
    if (username.length >= 3 && username.length <= 20 && !usernameError) {
      const timer = setTimeout(() => {
        checkUsernameAvailability(username);
      }, 500); // Wait 500ms after user stops typing

      return () => clearTimeout(timer);
    }
  }, [username]);

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

    // Check if confirm password matches
    if (confirmPassword && text !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
    } else if (confirmPassword) {
      setConfirmPasswordError('');
    }
  };

  const validateConfirmPassword = (text: string) => {
    setConfirmPassword(text);
    setConfirmPasswordError('');

    if (text.length === 0) return;

    if (text !== password) {
      setConfirmPasswordError('Passwords do not match');
      return;
    }
  };

  const validateEmail = (text: string) => {
    setEmail(text);
    setEmailError('');

    if (text.length === 0) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(text)) {
      setEmailError('Please enter a valid email address');
      return;
    }
  };

  // Phone number formatting: (555) 123-4567
  const formatPhoneNumber = (text: string) => {
    // Remove all non-digit characters
    const cleaned = text.replace(/\D/g, '');
    
    // Limit to 10 digits
    const limited = cleaned.slice(0, 10);
    
    // Apply formatting
    if (limited.length === 0) {
      return '';
    } else if (limited.length <= 3) {
      return `(${limited}`;
    } else if (limited.length <= 6) {
      return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    } else {
      return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
    }
  };

  const handlePhoneChange = (text: string) => {
    const formatted = formatPhoneNumber(text);
    setPhone(formatted);
  };

  const handleSignup = () => {
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

    if (!confirmPassword || password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Email validation
    if (!email || email.trim().length === 0) {
      setError('Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    // All validation passed, show verification modal
    setError('');
    setVerificationStep('confirm');
    setShowVerificationModal(true);
  };

  const handleSendCode = async () => {
    setSendingCode(true);
    setError('');

    try {
      const response = await secureFetch(`${BASE_URL}/auth/send-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to send verification code');
      }

      // Move to code entry step
      setVerificationStep('enter-code');
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code. Please try again.');
      setShowVerificationModal(false);
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyAndSignup = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // First verify the code
      const verifyResponse = await secureFetch(`${BASE_URL}/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code: verificationCode,
        }),
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        throw new Error(verifyData.detail || 'Invalid verification code');
      }

      // Code verified, now create the account
      const response = await secureFetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          email,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Registration failed');
      }

      // Save profile information
      if (name || phone || bio) {
        // Strip phone formatting before sending to backend
        const phoneDigitsOnly = phone.replace(/\D/g, '');
        
        const profileResponse = await secureFetch(`${BASE_URL}/user/profile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.token}`
          },
          body: JSON.stringify({
            name: name || '',
            phone: phoneDigitsOnly || '',
            email: email,
            bio: bio || ''
          }),
        });

        const profileData = await profileResponse.json();
        
        if (!profileResponse.ok) {
          throw new Error(profileData.detail || 'Failed to save profile information');
        }
        
        console.log('✅ Profile saved successfully');
      }

      // Success!
      setShowVerificationModal(false);
      onSignupSuccess(data.token, data.user_id, data.username, email);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = username.length >= 3 && password.length >= 8 && confirmPassword.length >= 8 && password === confirmPassword && email.length > 0 && name.length > 0 && phone.length >= 14 && !usernameError && !passwordError && !confirmPasswordError && !emailError;

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
          {/* Name */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Name
            </Text>
            <View style={[
              styles.inputContainer,
              { backgroundColor: theme.colors.white, borderColor: theme.colors.border }
            ]}>
              <TextInput
                style={[styles.input, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}
                value={name}
                onChangeText={setName}
                placeholder=""
                placeholderTextColor={theme.colors.muted}
                autoCapitalize="words"
                editable={!loading}
              />
            </View>
          </View>

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
                placeholder=""
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
                placeholder=""
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
              8+ chars, uppercase, lowercase, number, special character
            </Text>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>Confirm Password</Text>
            <View style={[
              styles.inputContainer,
              {
                backgroundColor: theme.colors.white,
                borderColor: confirmPasswordError ? '#FF3B30' : theme.colors.border,
              }
            ]}>
              <TextInput
                style={[styles.input, { color: isDarkMode ? '#FFFFFF' : '#000000', flex: 1 }]}
                value={confirmPassword}
                onChangeText={validateConfirmPassword}
                placeholder=""
                placeholderTextColor={theme.colors.muted}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
              <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                {({ pressed }) => (
                  <MaterialCommunityIcons
                    name={showConfirmPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={theme.colors.muted}
                    style={{ opacity: pressed ? 0.6 : 1 }}
                  />
                )}
              </Pressable>
            </View>
            {confirmPasswordError ? (
              <Text style={styles.errorText}>{confirmPasswordError}</Text>
            ) : null}
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Email
            </Text>
            <View style={[
              styles.inputContainer,
              {
                backgroundColor: theme.colors.white,
                borderColor: emailError ? '#FF3B30' : theme.colors.border,
              }
            ]}>
              <TextInput
                style={[styles.input, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}
                value={email}
                onChangeText={validateEmail}
                placeholder=""
                placeholderTextColor={theme.colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>
            {emailError ? (
              <Text style={styles.errorText}>{emailError}</Text>
            ) : null}
          </View>

          {/* Phone */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Phone
            </Text>
            <View style={[
              styles.inputContainer,
              { backgroundColor: theme.colors.white, borderColor: theme.colors.border }
            ]}>
              <TextInput
                style={[styles.input, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}
                value={phone}
                onChangeText={handlePhoneChange}
                placeholder=""
                placeholderTextColor={theme.colors.muted}
                keyboardType="phone-pad"
                maxLength={14}
                editable={!loading}
              />
            </View>
          </View>

          {/* Bio (Optional) */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Bio <Text style={{ color: theme.colors.muted }}>(optional)</Text>
            </Text>
            <View style={[
              styles.inputContainer,
              { backgroundColor: theme.colors.white, borderColor: theme.colors.border, minHeight: 80 }
            ]}>
              <TextInput
                style={[styles.input, { color: isDarkMode ? '#FFFFFF' : '#000000', height: 70, textAlignVertical: 'top' }]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell us about yourself..."
                placeholderTextColor={theme.colors.muted}
                multiline={true}
                numberOfLines={3}
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

      {/* Email Verification Modal */}
      <Modal
        visible={showVerificationModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (!sendingCode && !loading) {
            setShowVerificationModal(false);
            setVerificationStep('confirm');
            setVerificationCode('');
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.white }]}>
            {/* Close Button */}
            <Pressable
              style={styles.modalCloseButton}
              onPress={() => {
                if (!sendingCode && !loading) {
                  setShowVerificationModal(false);
                  setVerificationStep('confirm');
                  setVerificationCode('');
                }
              }}
              disabled={sendingCode || loading}
            >
              {({ pressed }) => (
                <MaterialCommunityIcons
                  name="close"
                  size={24}
                  color={theme.colors.muted}
                  style={{ opacity: pressed ? 0.6 : 1 }}
                />
              )}
            </Pressable>
            
            {verificationStep === 'confirm' ? (
              <>
                <MaterialCommunityIcons name="email-outline" size={48} color={theme.colors.blue} style={{ marginBottom: 16 }} />
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                  Email verification needed to continue
                </Text>
                <Text style={[styles.modalText, { color: theme.colors.muted }]}>
                  We'll send a confirmation code to {email}
                </Text>
                <View style={styles.modalButtons}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalButton,
                      styles.modalButtonSecondary,
                      { opacity: pressed ? 0.6 : 1 }
                    ]}
                    onPress={() => {
                      setShowVerificationModal(false);
                      setVerificationStep('confirm');
                    }}
                    disabled={sendingCode}
                  >
                    <Text style={[styles.modalButtonTextSecondary, { color: theme.colors.blue }]}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalButton,
                      styles.modalButtonPrimary,
                      { backgroundColor: theme.colors.blue, opacity: pressed || sendingCode ? 0.6 : 1 }
                    ]}
                    onPress={handleSendCode}
                    disabled={sendingCode}
                  >
                    {sendingCode ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.modalButtonTextPrimary}>
                        Send Code
                      </Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <MaterialCommunityIcons name="email-check-outline" size={48} color={theme.colors.blue} style={{ marginBottom: 16 }} />
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                  Enter Verification Code
                </Text>
                <Text style={[styles.modalText, { color: theme.colors.muted }]}>
                  We sent a 6-digit code to {email}
                </Text>
                <TextInput
                  style={[styles.codeInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
                  value={verificationCode}
                  onChangeText={(text) => setVerificationCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="000000"
                  placeholderTextColor={theme.colors.muted}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  editable={!loading}
                />
                {error && verificationStep === 'enter-code' ? (
                  <Text style={styles.modalErrorText}>{error}</Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.resendButton,
                    { opacity: pressed || sendingCode ? 0.6 : 1 }
                  ]}
                  onPress={handleSendCode}
                  disabled={sendingCode || loading}
                >
                  <Text style={[styles.resendButtonText, { color: theme.colors.blue }]}>
                    {sendingCode ? 'Sending...' : 'Resend code'}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    styles.modalButtonFull,
                    {
                      backgroundColor: verificationCode.length === 6 && !loading ? theme.colors.blue : theme.colors.muted,
                      opacity: pressed && verificationCode.length === 6 ? 0.6 : 1
                    }
                  ]}
                  onPress={handleVerifyAndSignup}
                  disabled={verificationCode.length !== 6 || loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalButtonTextPrimary}>
                      Verify & Create Account
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
    zIndex: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Inter_500Medium',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonPrimary: {
    minHeight: 48,
  },
  modalButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  modalButtonFull: {
    width: '100%',
    marginTop: 16,
  },
  modalButtonTextPrimary: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter_500Medium',
  },
  modalButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter_500Medium',
  },
  codeInput: {
    width: '100%',
    fontSize: 24,
    fontWeight: '600',
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderRadius: 12,
    marginBottom: 8,
    letterSpacing: 8,
  },
  modalErrorText: {
    fontSize: 13,
    color: '#FF3B30',
    fontFamily: 'Inter_400Regular',
    marginBottom: 8,
    textAlign: 'center',
  },
  resendButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  resendButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
});

