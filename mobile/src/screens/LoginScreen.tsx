import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDarkMode } from '../../App';
import { getTheme } from '../theme';
import { BASE_URL, secureFetch } from '../services/api';

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

  // Forgot password/username states
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotType, setForgotType] = useState<'password' | 'username' | null>(null);
  const [forgotStep, setForgotStep] = useState<'email' | 'code' | 'newPassword' | 'showUsername'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [recoveredUsername, setRecoveredUsername] = useState('');
  const [forgotError, setForgotError] = useState('');

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await secureFetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Login failed');
      }

      // Success!
      console.log("🔍 LOGIN RESPONSE:", JSON.stringify(data));
      console.log("🔍 TOKEN VALUE:", data.token);
      console.log("🔍 TOKEN TYPE:", typeof data.token);
      onLoginSuccess(data.token, data.user_id, data.username);
    } catch (err: any) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setForgotType('password');
    setForgotStep('email');
    setForgotEmail('');
    setRecoveryCode('');
    setNewPassword('');
    setConfirmNewPassword('');
    setForgotError('');
    setShowForgotModal(true);
  };

  const handleForgotUsername = () => {
    setForgotType('username');
    setForgotStep('email');
    setForgotEmail('');
    setRecoveryCode('');
    setRecoveredUsername('');
    setForgotError('');
    setShowForgotModal(true);
  };

  const handleSendRecoveryCode = async () => {
    if (!forgotEmail) {
      setForgotError('Please enter your email');
      return;
    }

    setSendingCode(true);
    setForgotError('');

    try {
      const response = await secureFetch(`${BASE_URL}/auth/send-recovery-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, type: forgotType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to send code');
      }

      setForgotStep('code');
    } catch (err: any) {
      setForgotError(err.message || 'Failed to send recovery code');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyRecoveryCode = async () => {
    if (!recoveryCode || recoveryCode.length !== 6) {
      setForgotError('Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    setForgotError('');

    try {
      const response = await secureFetch(`${BASE_URL}/auth/verify-recovery-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: forgotEmail, 
          code: recoveryCode,
          type: forgotType
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Invalid code');
      }

      if (forgotType === 'username') {
        setRecoveredUsername(data.username);
        setForgotStep('showUsername');
      } else {
        setForgotStep('newPassword');
      }
    } catch (err: any) {
      setForgotError(err.message || 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      setForgotError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setForgotError('Passwords do not match');
      return;
    }

    setLoading(true);
    setForgotError('');

    try {
      const response = await secureFetch(`${BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail,
          code: recoveryCode,
          new_password: newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to reset password');
      }

      // Success! Close modal and show success message
      setShowForgotModal(false);
      setError('');
      setUsername('');
      setPassword('');
      alert('Password reset successfully! Please log in with your new password.');
    } catch (err: any) {
      setForgotError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setForgotType(null);
    setForgotStep('email');
    setForgotEmail('');
    setRecoveryCode('');
    setNewPassword('');
    setConfirmNewPassword('');
    setRecoveredUsername('');
    setForgotError('');
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
      <View style={{position: "absolute", top: 100, left: "50%%", marginLeft: -150, width: 300, height: 200, backgroundColor: "red", justifyContent: "center", alignItems: "center", zIndex: 9999, borderRadius: 20, borderWidth: 5, borderColor: "yellow"}}><Text style={{color: "white", fontSize: 32, fontWeight: "bold", textAlign: "center"}}>OTA UPDATE WORKING!</Text></View>

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
                style={[styles.input, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  setError('');
                }}
                placeholder=""
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
                style={[styles.input, { color: isDarkMode ? '#FFFFFF' : '#000000', flex: 1 }]}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setError('');
                }}
                placeholder=""
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

          {/* Forgot Password/Username Links */}
          <View style={styles.forgotLinksContainer}>
            <Pressable onPress={handleForgotPassword} disabled={loading}>
              {({ pressed }) => (
                <Text style={[
                  styles.forgotLink,
                  { color: theme.colors.blue, opacity: pressed ? 0.6 : 1 }
                ]}>
                  Forgot Password?
                </Text>
              )}
            </Pressable>
            <Text style={[styles.forgotSeparator, { color: theme.colors.muted }]}>•</Text>
            <Pressable onPress={handleForgotUsername} disabled={loading}>
              {({ pressed }) => (
                <Text style={[
                  styles.forgotLink,
                  { color: theme.colors.blue, opacity: pressed ? 0.6 : 1 }
                ]}>
                  Forgot Username?
                </Text>
              )}
            </Pressable>
          </View>

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
        </View>
      </ScrollView>

      {/* Forgot Password/Username Modal */}
      <Modal
        visible={showForgotModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeForgotModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.white }]}>
            {/* Close Button */}
            <Pressable
              style={styles.modalCloseButton}
              onPress={closeForgotModal}
              disabled={loading || sendingCode}
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

            {/* Email Step */}
            {forgotStep === 'email' && (
              <>
                <MaterialCommunityIcons 
                  name="email-outline" 
                  size={48} 
                  color={theme.colors.blue} 
                  style={{ marginBottom: 16 }} 
                />
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                  {forgotType === 'password' ? 'Reset Password' : 'Recover Username'}
                </Text>
                <Text style={[styles.modalText, { color: theme.colors.muted }]}>
                  Enter your email address and we'll send you a recovery code
                </Text>
                <TextInput
                  style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  placeholder="your@email.com"
                  placeholderTextColor={theme.colors.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!sendingCode}
                />
                {forgotError ? (
                  <Text style={styles.modalErrorText}>{forgotError}</Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    { backgroundColor: theme.colors.blue, opacity: pressed || sendingCode || !forgotEmail ? 0.6 : 1 }
                  ]}
                  onPress={handleSendRecoveryCode}
                  disabled={sendingCode || !forgotEmail}
                >
                  {sendingCode ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalButtonTextPrimary}>Send Code</Text>
                  )}
                </Pressable>
              </>
            )}

            {/* Code Verification Step */}
            {forgotStep === 'code' && (
              <>
                <MaterialCommunityIcons 
                  name="email-check-outline" 
                  size={48} 
                  color={theme.colors.blue} 
                  style={{ marginBottom: 16 }} 
                />
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                  Enter Recovery Code
                </Text>
                <Text style={[styles.modalText, { color: theme.colors.muted }]}>
                  We sent a 6-digit code to {forgotEmail}
                </Text>
                <TextInput
                  style={[styles.codeInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
                  value={recoveryCode}
                  onChangeText={(text) => setRecoveryCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="000000"
                  placeholderTextColor={theme.colors.muted}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  editable={!loading}
                />
                {forgotError ? (
                  <Text style={styles.modalErrorText}>{forgotError}</Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.resendButton,
                    { opacity: pressed || sendingCode ? 0.6 : 1 }
                  ]}
                  onPress={handleSendRecoveryCode}
                  disabled={sendingCode || loading}
                >
                  <Text style={[styles.resendText, { color: theme.colors.blue }]}>
                    {sendingCode ? 'Sending...' : 'Resend code'}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    { backgroundColor: theme.colors.blue, opacity: pressed || loading || recoveryCode.length !== 6 ? 0.6 : 1 }
                  ]}
                  onPress={handleVerifyRecoveryCode}
                  disabled={loading || recoveryCode.length !== 6}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalButtonTextPrimary}>Verify Code</Text>
                  )}
                </Pressable>
              </>
            )}

            {/* New Password Step (Password Recovery Only) */}
            {forgotStep === 'newPassword' && (
              <>
                <MaterialCommunityIcons 
                  name="lock-reset" 
                  size={48} 
                  color={theme.colors.blue} 
                  style={{ marginBottom: 16 }} 
                />
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                  Create New Password
                </Text>
                <Text style={[styles.modalText, { color: theme.colors.muted }]}>
                  Enter your new password
                </Text>
                
                {/* New Password */}
                <View style={[styles.passwordInputContainer, { borderColor: theme.colors.border }]}>
                  <TextInput
                    style={[styles.modalInput, { flex: 1, borderWidth: 0, marginBottom: 0 }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder=""
                    placeholderTextColor={theme.colors.muted}
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                  <Pressable onPress={() => setShowNewPassword(!showNewPassword)}>
                    {({ pressed }) => (
                      <MaterialCommunityIcons
                        name={showNewPassword ? 'eye-off' : 'eye'}
                        size={20}
                        color={theme.colors.muted}
                        style={{ opacity: pressed ? 0.6 : 1, marginRight: 12 }}
                      />
                    )}
                  </Pressable>
                </View>

                {/* Confirm Password */}
                <View style={[styles.passwordInputContainer, { borderColor: theme.colors.border }]}>
                  <TextInput
                    style={[styles.modalInput, { flex: 1, borderWidth: 0, marginBottom: 0 }]}
                    value={confirmNewPassword}
                    onChangeText={setConfirmNewPassword}
                    placeholder=""
                    placeholderTextColor={theme.colors.muted}
                    secureTextEntry={!showConfirmNewPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                  <Pressable onPress={() => setShowConfirmNewPassword(!showConfirmNewPassword)}>
                    {({ pressed }) => (
                      <MaterialCommunityIcons
                        name={showConfirmNewPassword ? 'eye-off' : 'eye'}
                        size={20}
                        color={theme.colors.muted}
                        style={{ opacity: pressed ? 0.6 : 1, marginRight: 12 }}
                      />
                    )}
                  </Pressable>
                </View>

                {forgotError ? (
                  <Text style={styles.modalErrorText}>{forgotError}</Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    { backgroundColor: theme.colors.blue, opacity: pressed || loading || !newPassword || !confirmNewPassword ? 0.6 : 1 }
                  ]}
                  onPress={handleResetPassword}
                  disabled={loading || !newPassword || !confirmNewPassword}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalButtonTextPrimary}>Reset Password</Text>
                  )}
                </Pressable>
              </>
            )}

            {/* Show Username Step (Username Recovery Only) */}
            {forgotStep === 'showUsername' && (
              <>
                <MaterialCommunityIcons 
                  name="account-check" 
                  size={48} 
                  color={theme.colors.blue} 
                  style={{ marginBottom: 16 }} 
                />
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                  Your Username
                </Text>
                <View style={[styles.usernameDisplay, { backgroundColor: theme.colors.bg, borderColor: theme.colors.border }]}>
                  <Text style={[styles.usernameText, { color: theme.colors.text }]}>
                    {recoveredUsername}
                  </Text>
                </View>
                <Text style={[styles.modalText, { color: theme.colors.muted, marginTop: 16 }]}>
                  You can now use this username to log in
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    { backgroundColor: theme.colors.blue, opacity: pressed ? 0.8 : 1 }
                  ]}
                  onPress={closeForgotModal}
                >
                  <Text style={styles.modalButtonTextPrimary}>Return to Login</Text>
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
  forgotLinksContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  forgotLink: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  forgotSeparator: {
    fontSize: 14,
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
    fontFamily: 'Inter_600SemiBold',
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
  modalInput: {
    width: '100%',
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 16,
  },
  modalButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modalButtonPrimary: {
    minHeight: 48,
  },
  modalButtonTextPrimary: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  codeInput: {
    width: '100%',
    fontSize: 24,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderRadius: 12,
    marginBottom: 16,
    letterSpacing: 8,
  },
  resendButton: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  resendText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 16,
  },
  usernameDisplay: {
    width: '100%',
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  usernameText: {
    fontSize: 24,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  modalErrorText: {
    fontSize: 13,
    color: '#FF3B30',
    fontFamily: 'Inter_400Regular',
    marginBottom: 12,
    textAlign: 'center',
  },
});

