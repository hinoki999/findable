import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDarkMode } from '../../App';
import { getTheme } from '../theme';
import { checkUsernameAvailability, checkEmailAvailability, sendOtpCode, verifyOtpCode } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';

// Verification whitelist - these users bypass email verification during signup
const VERIFICATION_WHITELIST = {
  emails: ['caitie690@gmail.com'],
  phones: ['7344317582', '+17344317582', '17344317582'],
};

interface SignupScreenProps {
  onSignupSuccess: (profileData?: { name: string; phone: string; bio: string }) => void;
  onLoginPress: () => void;
  onBack: () => void;
}

export default function SignupScreen({ onSignupSuccess, onLoginPress, onBack }: SignupScreenProps) {
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);
  const { signup, refreshAuth } = useAuth();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Validation states
  const [nameError, setNameError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [emailError, setEmailError] = useState('');

  // Email verification modal
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationStep, setVerificationStep] = useState<'confirm' | 'enter-code'>('confirm');
  const [verificationCode, setVerificationCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);

  // Terms and Conditions
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState('');
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Birthday
  const [birthday, setBirthday] = useState('');
  const [birthdayError, setBirthdayError] = useState('');

  const checkUsernameAvailabilityLocal = async (username: string) => {
    try {
      const available = await checkUsernameAvailability(username);

      if (!available) {
        setUsernameError('Username is already taken');
      }
    } catch (err) {
      console.error('ERROR: Failed to check username:', err);
      setUsernameError('Could not verify username. Please try again.');
    }
  };

  const checkEmailAvailabilityLocal = async (email: string) => {
    try {
      const available = await checkEmailAvailability(email);

      if (!available) {
        setEmailError('Email is already in use');
      }
    } catch (err) {
      console.error('ERROR: Failed to check email:', err);
      setEmailError('Could not verify email. Please try again.');
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
        checkUsernameAvailabilityLocal(username);
      }, 500); // Wait 500ms after user stops typing

      return () => clearTimeout(timer);
    }
  }, [username]);

  // Debounced email availability check
  useEffect(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email.length > 0 && emailRegex.test(email) && !emailError) {
      const timer = setTimeout(() => {
        checkEmailAvailabilityLocal(email);
      }, 500); // Wait 500ms after user stops typing

      return () => clearTimeout(timer);
    }
  }, [email]);

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
    setEmailError(''); // Clear error on every keystroke

    if (text.length === 0) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(text)) {
      setEmailError('Please enter a valid email address');
      return;
    }
  };

  // Birthday formatting: auto-add slashes as user types MM/DD/YYYY
  const formatBirthday = (text: string) => {
    // Remove all non-digits
    let digits = text.replace(/\D/g, '');

    // Limit to 8 digits (MMDDYYYY)
    digits = digits.slice(0, 8);

    // Format with slashes
    let formatted = '';
    if (digits.length > 0) {
      formatted = digits.slice(0, 2);
    }
    if (digits.length > 2) {
      formatted += '/' + digits.slice(2, 4);
    }
    if (digits.length > 4) {
      formatted += '/' + digits.slice(4, 8);
    }

    setBirthday(formatted);
    setBirthdayError(''); // Clear error on typing

    // Validate age only when full date is entered
    if (digits.length === 8) {
      const month = parseInt(digits.slice(0, 2), 10);
      const day = parseInt(digits.slice(2, 4), 10);
      const year = parseInt(digits.slice(4, 8), 10);

      // Basic date validation
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        setBirthdayError('Please enter a valid date');
        return;
      }

      // Check if user is at least 18 years old
      const birthDate = new Date(year, month - 1, day);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      // Adjust age if birthday hasn't occurred this year yet
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      if (age < 18) {
        setBirthdayError('You must be 18 or older to use DropLink');
      }
    }
  };

  // Check if birthday is valid and user is 18+
  const isBirthdayValid = () => {
    const digits = birthday.replace(/\D/g, '');
    if (digits.length !== 8) return false;

    const month = parseInt(digits.slice(0, 2), 10);
    const day = parseInt(digits.slice(2, 4), 10);
    const year = parseInt(digits.slice(4, 8), 10);

    if (month < 1 || month > 12 || day < 1 || day > 31) return false;

    const birthDate = new Date(year, month - 1, day);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age >= 18;
  };

  const handleSignup = () => {
    // Terms and Conditions check
    if (!termsAccepted) {
      setTermsError('Please agree to the terms and conditions to continue.');
      return;
    }
    setTermsError('');

    // Final validation
    if (!name || name.trim().length < 1) {
      setNameError('Full name is required');
      setError('Please enter your full name');
      return;
    }

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

    // Birthday validation
    if (!birthday || birthday.length !== 10) {
      setBirthdayError('Please enter your date of birth (MM/DD/YYYY)');
      return;
    }

    if (!isBirthdayValid()) {
      setBirthdayError('You must be 18 or older to use DropLink');
      return;
    }

    // All validation passed
    setError('');
    setBirthdayError('');

    // Check if email is whitelisted - skip verification for whitelisted users
    if (VERIFICATION_WHITELIST.emails.includes(email.toLowerCase().trim())) {
      console.log('[EMAIL-VERIFY] Email is whitelisted, skipping verification:', email);
      handleDirectSignup();
    } else {
      // Show email verification modal for non-whitelisted users
      console.log('[EMAIL-VERIFY] Triggering verification modal for email:', email);
      setShowVerificationModal(true);
      setVerificationStep('confirm');
      console.log('[EMAIL-VERIFY] verificationStep set to: confirm');
    }
  };

  const handleDirectSignup = async () => {
    setLoading(true);
    setError('');

    try {
      // Create account directly with Supabase (no email verification)
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password: password,
        options: {
          data: { username: username },
          emailRedirectTo: undefined, // Disable email confirmation requirement
        }
      });

      if (signUpError) {
        throw new Error(signUpError.message || 'Failed to create account');
      }

      if (!data.user) {
        throw new Error('Account creation failed. Please try again.');
      }

      const userId = data.user.id;
      console.log(`SUCCESS: Account created, userId: ${userId}`);

      // Create user_profiles record in Supabase
      console.log('[SIGNUP-DEBUG] Creating profile with name:', name, 'username:', username, 'email:', email);
      const { error: profileError } = await supabase.from('user_profiles').insert({
        user_id: userId,
        email: email.toLowerCase().trim(),
        username: username,   // Login username for identification
        name: name,           // Display name for BLE discovery
        phone: null,
        bio: null,
        profile_photo: null,
        social_media: []
      });

      if (profileError) {
        console.error(`ERROR: Failed to create user_profiles: ${profileError.message}`);
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }
      console.log('SUCCESS: user_profiles record created');
      console.log('[SIGNUP-DEBUG] Profile created successfully, user_id:', userId);

      // Create user_settings record in Supabase
      const { error: settingsError } = await supabase.from('user_settings').insert({
        user_id: userId,
        dark_mode: true,
        max_distance: 33
      });

      if (settingsError) {
        console.error(`ERROR: Failed to create user_settings: ${settingsError.message}`);
        throw new Error(`Failed to create settings: ${settingsError.message}`);
      }
      console.log('SUCCESS: user_settings record created');

      // Check if we got a session from signUp (Supabase may auto-confirm in development)
      let session = data.session;

      // If no session, sign in immediately (email confirmation may be required in production)
      if (!session) {
        console.log('No session from signUp, attempting sign in...');
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.toLowerCase().trim(),
          password: password,
        });

        if (signInError || !signInData.user) {
          throw new Error('Account created but sign-in failed. Please try logging in.');
        }

        session = signInData.session;
      }

      // Update auth context by refreshing auth state (we've already created account and signed in)
      await refreshAuth();

      console.log('SUCCESS: User signed in and auth context updated');

      // Navigate to home screen
      if (typeof onSignupSuccess !== 'function') {
        throw new Error('Navigation handler (onSignupSuccess) is missing or invalid');
      }

      onSignupSuccess(undefined);
    } catch (err: any) {
      console.error(`ERROR: Direct signup error: ${err.message}`);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    console.log('[EMAIL-VERIFY] handleSendCode entered');
    console.log('[EMAIL-VERIFY] email:', email);
    setSendingCode(true);
    setError('');

    try {
      console.log('[EMAIL-VERIFY] Calling sendOtpCode...');
      await sendOtpCode(email, 'signup');
      console.log('[EMAIL-VERIFY] sendOtpCode succeeded');
      // Move to code entry step
      setVerificationStep('enter-code');
      console.log('[EMAIL-VERIFY] verificationStep set to: enter-code');
    } catch (err: any) {
      console.error('[EMAIL-VERIFY] handleSendCode caught error:', err);
      console.error('[EMAIL-VERIFY] Error details:', JSON.stringify(err, null, 2));
      setError(err.message || 'Failed to send verification code. Please try again.');
      // Keep modal open so user can see the error
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyAndSignup = async () => {
    console.log('[EMAIL-VERIFY] handleVerifyAndSignup entered');
    console.log('[EMAIL-VERIFY] email:', email);
    console.log('[EMAIL-VERIFY] verificationCode length:', verificationCode?.length);
    if (!verificationCode || verificationCode.length !== 6) {
      console.log('[EMAIL-VERIFY] Invalid code length, returning early');
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Verify the OTP code (this logs user in)
      // Use 'signup' type for signup OTP verification
      console.log('[EMAIL-VERIFY] Calling verifyOtpCode...');
      await verifyOtpCode(email, verificationCode, 'signup');
      console.log('[EMAIL-VERIFY] verifyOtpCode succeeded');
      console.log('SUCCESS: OTP verified successfully');

      // User already created by OTP - now set password
      console.log('[EMAIL-VERIFY] Calling supabase.auth.updateUser to set password...');
      const { error: passwordError } = await supabase.auth.updateUser({
        password: password,
        data: { username: username }
      });

      if (passwordError) {
        console.error('[EMAIL-VERIFY] updateUser error:', passwordError);
        console.error('[EMAIL-VERIFY] updateUser error details:', JSON.stringify(passwordError, null, 2));
        throw new Error(passwordError.message || 'Failed to set password');
      }
      console.log('[EMAIL-VERIFY] updateUser succeeded');

      // Get user ID from current session
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      console.log('[EMAIL-VERIFY] Got session, userId:', userId);

      if (!userId) {
        throw new Error('Failed to get user session');
      }

      console.log(`SUCCESS: Password set successfully, userId: ${userId}`);

      // Create user_profiles record in Supabase
      console.log('[EMAIL-VERIFY] Calling user_profiles insert...');
      console.log('[SIGNUP-VERIFY-DEBUG] Creating profile after verification, name:', name, 'email:', email);
      const { error: profileError } = await supabase.from('user_profiles').insert({
        user_id: userId,
        email: email.toLowerCase().trim(),
        username: username,   // Login username for identification
        name: name,           // Display name for BLE discovery
        phone: null,
        bio: null,
        profile_photo: null,
        social_media: []
      });

      if (profileError) {
        console.error('[EMAIL-VERIFY] user_profiles insert error:', profileError);
        console.error('[EMAIL-VERIFY] user_profiles insert error details:', JSON.stringify(profileError, null, 2));
        console.error(`ERROR: Failed to create user_profiles: ${profileError.message}`);
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }
      console.log('[EMAIL-VERIFY] user_profiles insert succeeded');
      console.log('SUCCESS: user_profiles record created');
      console.log('[SIGNUP-VERIFY-DEBUG] Profile created successfully after verification');

      // Create user_settings record in Supabase
      const { error: settingsError } = await supabase.from('user_settings').insert({
        user_id: userId,
        dark_mode: true,
        max_distance: 33
      });

      if (settingsError) {
        console.error(`ERROR: Failed to create user_settings: ${settingsError.message}`);
        throw new Error(`Failed to create settings: ${settingsError.message}`);
      }
      console.log('SUCCESS: user_settings record created');

      // Success! Close modal and navigate
      setShowVerificationModal(false);

      // Validate navigation handler before calling
      if (typeof onSignupSuccess !== 'function') {
        console.error('ERROR: onSignupSuccess is not a function!');
        throw new Error('Navigation handler (onSignupSuccess) is missing or invalid');
      }

      console.log('🚀 [SignupScreen] About to call onSignupSuccess');

      // SignupScreen doesn't collect name/phone/bio, so pass undefined
      // Profile will be set up later via profile editing or onboarding
      try {
        onSignupSuccess(undefined);
        console.log('SUCCESS: [SignupScreen] onSignupSuccess returned');
      } catch (navError: any) {
        console.error(`ERROR: onSignupSuccess threw error: ${navError.message}`);
        throw navError;
      }
    } catch (err: any) {
      console.error(`ERROR: [SignupScreen] handleVerifyAndSignup error: ${err.message}`);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = name.length >= 1 && username.length >= 3 && password.length >= 8 && confirmPassword.length >= 8 && password === confirmPassword && email.length > 0 && birthday.length === 10 && !nameError && !usernameError && !passwordError && !confirmPasswordError && !emailError && !birthdayError;

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
          {/* Full Name */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>Full Name</Text>
            <View style={[
              styles.inputContainer,
              {
                backgroundColor: theme.colors.white,
                borderColor: nameError ? '#FF3B30' : theme.colors.border,
              }
            ]}>
              <TextInput
                style={[styles.input, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  setNameError('');
                }}
                placeholder="Your display name"
                placeholderTextColor={theme.colors.muted}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!loading}
              />
            </View>
            {nameError ? (
              <Text style={styles.errorText}>{nameError}</Text>
            ) : null}
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

          {/* Date of Birth */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Date of Birth
            </Text>
            <View style={[
              styles.inputContainer,
              {
                backgroundColor: theme.colors.white,
                borderColor: birthdayError ? '#FF3B30' : theme.colors.border,
              }
            ]}>
              <TextInput
                style={[styles.input, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}
                value={birthday}
                onChangeText={formatBirthday}
                placeholder="MM/DD/YYYY"
                placeholderTextColor={theme.colors.muted}
                keyboardType="number-pad"
                maxLength={10}
                editable={!loading}
              />
            </View>
            {birthdayError ? (
              <Text style={styles.errorText}>{birthdayError}</Text>
            ) : null}
          </View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="alert-circle" size={16} color="#FF3B30" />
              <Text style={styles.errorMessage}>{error}</Text>
            </View>
          ) : null}

          {/* Terms and Conditions Checkbox */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Pressable
              onPress={() => {
                setTermsAccepted(!termsAccepted);
                setTermsError('');
              }}
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: '#007AFF',
                backgroundColor: termsAccepted ? '#007AFF' : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 6,
              }}
            >
              {termsAccepted && (
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>✓</Text>
              )}
            </Pressable>
            <Text style={{ color: theme.colors.text, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
              By checking this box, I agree to the{' '}
            </Text>
            <Pressable onPress={() => setShowTermsModal(true)}>
              <Text style={{ color: '#007AFF', fontSize: 11, fontFamily: 'Inter_400Regular', textDecorationLine: 'underline' }}>
                Terms and Conditions
              </Text>
            </Pressable>
          </View>

          {/* Terms Error */}
          {termsError ? (
            <Text style={{ fontSize: 12, color: '#FF3B30', marginBottom: 12, fontFamily: 'Inter_400Regular' }}>
              {termsError}
            </Text>
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
            {/* Close X Button - Upper Right */}
            <Pressable
              onPress={() => {
                if (!sendingCode && !loading) {
                  setShowVerificationModal(false);
                  setVerificationStep('confirm');
                  setVerificationCode('');
                }
              }}
              disabled={sendingCode || loading}
              style={({ pressed }) => ({
                position: 'absolute',
                top: 12,
                right: 12,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: '#F0F0F0',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                opacity: (pressed || sendingCode || loading) ? 0.6 : 1,
              })}
            >
              <MaterialCommunityIcons name="close" size={18} color="#888" />
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

      {/* Terms and Conditions Modal */}
      <Modal
        visible={showTermsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTermsModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 16,
            paddingHorizontal: 20,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}>
            <Text style={{
              fontSize: 18,
              fontWeight: '600',
              fontFamily: 'Inter_500Medium',
              color: theme.colors.text,
              textAlign: 'center',
              flex: 1,
            }}>
              Terms and Conditions
            </Text>
            <Pressable
              onPress={() => setShowTermsModal(false)}
              style={{ position: 'absolute', right: 16, padding: 4 }}
            >
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </Pressable>
          </View>

          {/* Terms Content */}
          <ScrollView style={{ flex: 1, padding: 20 }} showsVerticalScrollIndicator={true}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              1. Agreement to Terms
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              These Terms and Conditions ("Agreement") constitute a legally binding agreement between you ("User") and DropLink, a product of HiRule Labs ("we," "us," or "our"), governing your access to and use of the DropLink mobile application ("Application"). By creating an account, downloading, or otherwise accessing the Application, you acknowledge that you have read, understood, and agree to be bound by this Agreement in its entirety. If you do not agree to these terms, you must immediately discontinue use of the Application. By using DropLink, you represent and warrant that you are at least 18 years of age. If you are under 18, you are not permitted to create an account or use the Application.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              2. License to Use
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              Subject to your compliance with this Agreement, DropLink grants you a limited, non-exclusive, non-transferable, non-sublicensable, revocable license to download and use the Application solely for your personal, non-commercial use. This license does not constitute a transfer of title or ownership in the Application or any component thereof. DropLink reserves all rights not expressly granted herein.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              3. Account Registration & Security
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              To access certain features of the Application, you must register for an account. You agree to provide accurate, current, and complete information during the registration process and to update such information as necessary to maintain its accuracy. You are solely responsible for safeguarding your account credentials and for all activity that occurs under your account. You agree to notify DropLink immediately of any unauthorized use of your account. DropLink shall not be liable for any loss or damage arising from your failure to maintain the security of your account credentials. One account per individual is permitted.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              4. SMS Communications & Phone Verification
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              By submitting your phone number for verification within the Application, you expressly consent to receive SMS messages from DropLink for the purpose of identity and account verification. You acknowledge that message frequency will not exceed one (1) verification code per verification request, and that standard message and data rates may apply depending on your carrier and service plan. By providing your email address during registration, you expressly consent to receive a one-time verification code via email for the purpose of confirming your identity and activating your account.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              5. Location Data & GPS
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              By using the Application, you expressly consent to DropLink's collection, use, and transmission of location data, including GPS-derived location information, for the purpose of enabling proximity-based features within the Application. DropLink may use your location data to detect nearby users, facilitate drops, and improve Application functionality. Your location data will not be sold to third parties. You may withdraw consent to location access at any time through your device settings, with the understanding that doing so may limit or disable core features of the Application.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              6. Bluetooth & Proximity Technology
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              The Application utilizes Bluetooth Low Energy (BLE) technology to detect the proximity of other users' devices. BLE functionality is used solely for proximity-based interactions between users who have the Application open and active. You are responsible for enabling or disabling Bluetooth permissions on your device at any time.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              7. Prohibited Conduct
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 8, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              You agree that you will not, under any circumstances:
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 4, lineHeight: 22, fontFamily: 'Inter_400Regular', paddingLeft: 12 }}>
              • Create multiple accounts or impersonate any person or entity;
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 4, lineHeight: 22, fontFamily: 'Inter_400Regular', paddingLeft: 12 }}>
              • Transmit unsolicited, harassing, or threatening content to other users through the Application;
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 4, lineHeight: 22, fontFamily: 'Inter_400Regular', paddingLeft: 12 }}>
              • Attempt to gain unauthorized access to any portion of the Application or its related systems;
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 4, lineHeight: 22, fontFamily: 'Inter_400Regular', paddingLeft: 12 }}>
              • Reverse engineer, decompile, or disassemble the Application;
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 12, lineHeight: 22, fontFamily: 'Inter_400Regular', paddingLeft: 12 }}>
              • Use the Application in any manner that could damage, disable, or impair the Application or interfere with any other user's access to or use of the Application.
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              DropLink reserves the right to suspend or permanently terminate any account found to be in violation of this section without prior notice.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              8. User-Generated Content & Contact Information Sharing
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              When initiating a drop, you retain full control over which personal contact information you elect to share. By transmitting a drop, you grant the recipient a limited right to retain and use the contact information you have chosen to share. DropLink is not a party to any interaction between users and assumes no responsibility or liability for the manner in which users utilize shared contact information following the acceptance of a drop. You agree not to include false, misleading, or third-party contact information in any drop without authorization.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              9. Intellectual Property
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              The Application, including its software, design, graphics, user interface, and all associated branding and trademarks, is the exclusive property of DropLink and is protected by applicable intellectual property laws. Nothing in this Agreement shall be construed as granting you any right, title, or interest in any DropLink intellectual property. Unauthorized reproduction, modification, distribution, or commercial exploitation of the Application is strictly prohibited without the prior written consent of DropLink.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              10. Disclaimer of Warranties
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              The Application is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement. DropLink does not warrant that the Application will be uninterrupted, error-free, or free of harmful components, or that any defects will be corrected.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              11. Limitation of Liability
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              To the maximum extent permitted by applicable law, DropLink and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your access to or use of, or inability to access or use, the Application, including but not limited to loss of data, unauthorized access to your account, or interactions with other users, regardless of whether such damages were foreseeable or whether DropLink was advised of the possibility of such damages.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              12. Indemnification
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              You agree to indemnify, defend, and hold harmless DropLink and its officers, directors, employees, and agents from and against any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or related to your use of the Application, your violation of this Agreement, or your violation of any rights of another user.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              13. Termination
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              DropLink reserves the right to suspend or terminate your access to the Application at any time, with or without cause, and with or without notice, without liability to you. Upon termination, all licenses granted under this Agreement shall immediately cease. Provisions of this Agreement that by their nature should survive termination shall survive, including ownership provisions, warranty disclaimers, indemnification, and limitations of liability.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              14. Modifications to This Agreement
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 20, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              DropLink reserves the right to modify or update this Agreement at any time. When changes are made, DropLink will notify you through the Application and the "Last Updated" date at the top of this Agreement will be updated. You will be required to review and accept the revised Agreement before continuing to use the Application. If you do not agree to the revised terms, you must discontinue use of the Application.
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
              15. Contact Information
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text, marginBottom: 24, lineHeight: 22, fontFamily: 'Inter_400Regular' }}>
              For legal inquiries, support requests, or questions regarding this Agreement, please contact DropLink at: link@hirulelabs.com
            </Text>

            <Text style={{ fontSize: 12, color: theme.colors.muted, textAlign: 'center', marginBottom: 40, fontFamily: 'Inter_400Regular' }}>
              Last Updated: March 2026
            </Text>
          </ScrollView>
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


