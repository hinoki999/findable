import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, ScrollView, Alert, StyleSheet, Switch } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import TopBar from '../components/TopBar';
import { getTheme } from '../theme';
import { useDarkMode, useToast } from '../../App';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/api';
import * as Updates from 'expo-updates';

interface SecuritySettingsScreenProps {
  navigation: any;
}

export default function SecuritySettingsScreen({ navigation }: SecuritySettingsScreenProps) {
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const { showToast } = useToast();
  const { logout, username, login } = useAuth();
  const theme = getTheme(isDarkMode);
  const [userEmail, setUserEmail] = useState('');

  // Modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingField, setEditingField] = useState<'username' | 'password' | null>(null);
  const [tempValue, setTempValue] = useState('');
  
  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Password visibility states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Confirmation modals
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteVerificationCode, setDeleteVerificationCode] = useState('');
  const [sendingDeleteCode, setSendingDeleteCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  // Load user email on mount
  React.useEffect(() => {
    const loadUserEmail = async () => {
      try {
        const profile = await api.getUserProfile();
        setUserEmail(profile.email || '');
      } catch (error) {
        console.error('Failed to load user email:', error);
      }
    };
    loadUserEmail();
  }, []);

  const handleEdit = (field: 'username' | 'password') => {
    setEditingField(field);
    if (field === 'username') {
      setTempValue(username || '');
    } else if (field === 'password') {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    setEditModalVisible(true);
  };

  const validatePassword = (password: string): string => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return 'Password must contain at least one special character';
    }
    return '';
  };

  const handleSave = async () => {
    try {
      if (editingField === 'username') {
        if (!tempValue || tempValue.length < 3) {
          showToast({
            message: 'Username must be at least 3 characters',
            type: 'error',
            duration: 3000,
          });
          return;
        }

        const result = await api.changeUsername(tempValue);
        await login(result.token, 0, result.username);
        
        showToast({
          message: 'Username updated successfully',
          type: 'success',
          duration: 3000,
        });
        
        setEditModalVisible(false);
      } else if (editingField === 'password') {
        if (!currentPassword || !newPassword || !confirmPassword) {
          showToast({
            message: 'Please fill in all password fields',
            type: 'error',
            duration: 3000,
          });
          return;
        }

        const passwordError = validatePassword(newPassword);
        if (passwordError) {
          showToast({
            message: passwordError,
            type: 'error',
            duration: 4000,
          });
          return;
        }

        if (newPassword !== confirmPassword) {
          showToast({
            message: 'New passwords do not match',
            type: 'error',
            duration: 3000,
          });
          return;
        }

        await api.changePassword(currentPassword, newPassword);
        
        showToast({
          message: 'Password updated successfully',
          type: 'success',
          duration: 3000,
        });
        
        setEditModalVisible(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error: any) {
      showToast({
        message: error.message || 'Failed to update',
        type: 'error',
        duration: 3000,
      });
    }
  };

  const handleForceUpdate = async () => {
    try {
      showToast({
        message: 'Checking for updates...',
        type: 'info',
        duration: 2000,
      });

      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        showToast({
          message: 'Downloading update...',
          type: 'info',
          duration: 2000,
        });
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } else {
        showToast({
          message: 'Already on latest version',
          type: 'success',
          duration: 2000,
        });
      }
    } catch (error) {
      showToast({
        message: 'Update failed: ' + error,
        type: 'error',
        duration: 3000,
      });
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    logout();
    showToast({
      message: 'Logged out successfully',
      type: 'success',
      duration: 2000,
    });
  };

  const handleSendDeleteCode = async () => {
    if (!userEmail) {
      showToast({
        message: 'No email found. Please add an email to your account.',
        type: 'error',
        duration: 3000,
      });
      return;
    }

    setSendingDeleteCode(true);
    try {
      const response = await fetch('https://findable-production.up.railway.app/auth/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });

      if (!response.ok) {
        throw new Error('Failed to send code');
      }

      // Don't show toast - keep modal open
      // Code sent successfully, user can now enter it
      setCodeSent(true);
    } catch (error) {
      showToast({
        message: 'Failed to send verification code',
        type: 'error',
        duration: 3000,
      });
    } finally {
      setSendingDeleteCode(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteVerificationCode || deleteVerificationCode.length !== 6) {
      showToast({
        message: 'Please enter the 6-digit verification code',
        type: 'error',
        duration: 3000,
      });
      return;
    }

    try {
      // Verify the code
      const verifyResponse = await fetch('https://findable-production.up.railway.app/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          code: deleteVerificationCode,
        }),
      });

      if (!verifyResponse.ok) {
        throw new Error('Invalid verification code');
      }

      // TODO: Add delete account endpoint to backend
      // await fetch('https://findable-production.up.railway.app/user/delete', {
      //   method: 'DELETE',
      //   headers: { 'Content-Type': 'application/json' },
      // });

      // Show success toast first
      showToast({
        message: 'Account successfully deleted',
        type: 'success',
        duration: 3000,
      });
      
      // Close modal and logout after a brief delay
      setTimeout(() => {
        setShowDeleteConfirm(false);
        setDeleteVerificationCode('');
        logout();
      }, 500);
    } catch (error: any) {
      showToast({
        message: error.message || 'Failed to delete account',
        type: 'error',
        duration: 3000,
      });
      // Don't close the modal on error - let user try again
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={15}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.type.h1, { fontSize: 20 }]}>Security Settings</Text>
        <View style={{ width: 28 }} />
      </View>
      
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Username */}
        <View style={[styles.card, { backgroundColor: theme.colors.white }]}>
          <View style={styles.cardHeader}>
            <Text style={[theme.type.h2, { fontSize: 16 }]}>Username</Text>
          </View>
          <Pressable
            onPress={() => handleEdit('username')}
            style={({ pressed }) => [
              styles.row,
              { opacity: pressed ? 0.7 : 1 }
            ]}
          >
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name="account" size={20} color={theme.colors.muted} style={styles.rowIcon} />
              <Text style={[theme.type.body, { color: theme.colors.text }]}>{username || 'Not set'}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
          </Pressable>
        </View>

        {/* Password */}
        <View style={[styles.card, { backgroundColor: theme.colors.white }]}>
          <View style={styles.cardHeader}>
            <Text style={[theme.type.h2, { fontSize: 16 }]}>Password</Text>
          </View>
          <Pressable
            onPress={() => handleEdit('password')}
            style={({ pressed }) => [
              styles.row,
              { opacity: pressed ? 0.7 : 1 }
            ]}
          >
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name="lock" size={20} color={theme.colors.muted} style={styles.rowIcon} />
              <Text style={[theme.type.body, { color: theme.colors.text }]}>••••••••</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
          </Pressable>
        </View>

        {/* Dark Mode */}
        <View style={[styles.card, { backgroundColor: theme.colors.white }]}>
          <View style={styles.cardHeader}>
            <Text style={[theme.type.h2, { fontSize: 16 }]}>Appearance</Text>
          </View>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name="theme-light-dark" size={20} color={theme.colors.muted} style={styles.rowIcon} />
              <Text style={[theme.type.body, { color: theme.colors.text }]}>Dark Mode</Text>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={toggleDarkMode}
              trackColor={{ false: theme.colors.border, true: theme.colors.blueLight }}
              thumbColor={isDarkMode ? theme.colors.blue : theme.colors.muted}
            />
          </View>
        </View>

        {/* Force Update */}
        <View style={[styles.card, { backgroundColor: theme.colors.white }]}>
          <View style={styles.cardHeader}>
            <Text style={[theme.type.h2, { fontSize: 16 }]}>Updates</Text>
          </View>
          <Pressable
            onPress={handleForceUpdate}
            style={({ pressed }) => [
              styles.row,
              { opacity: pressed ? 0.7 : 1 }
            ]}
          >
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name="download" size={20} color={theme.colors.blue} style={styles.rowIcon} />
              <Text style={[theme.type.body, { color: theme.colors.blue, fontWeight: '600' }]}>Force Update Now</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.blue} />
          </Pressable>
        </View>

        {/* Logout */}
        <View style={[styles.card, { backgroundColor: theme.colors.white, marginTop: 32 }]}>
          <Pressable
            onPress={() => setShowLogoutConfirm(true)}
            style={({ pressed }) => [
              styles.row,
              { opacity: pressed ? 0.7 : 1 }
            ]}
          >
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name="logout" size={20} color={theme.colors.muted} style={styles.rowIcon} />
              <Text style={[theme.type.body, { color: theme.colors.text }]}>Log Out</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
          </Pressable>
        </View>

        {/* Delete Account */}
        <View style={[styles.card, { backgroundColor: theme.colors.white, marginTop: 8 }]}>
          <Pressable
            onPress={() => {
              setShowDeleteConfirm(true);
              setCodeSent(false);
            }}
            style={({ pressed }) => [
              styles.row,
              { opacity: pressed ? 0.7 : 1 }
            ]}
          >
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name="delete-forever" size={20} color="#FF3B30" style={styles.rowIcon} />
              <Text style={[theme.type.body, { color: '#FF3B30', fontWeight: '600' }]}>Delete Account</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#FF3B30" />
          </Pressable>
        </View>

        <Text style={[theme.type.body, { color: theme.colors.muted, fontSize: 13, textAlign: 'center', marginTop: 24, paddingHorizontal: 32 }]}>
          Deleting your account will permanently remove all your data. This action cannot be undone.
        </Text>
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.white }]}>
            <Text style={[theme.type.h1, { fontSize: 20, marginBottom: 20 }]}>
              {editingField === 'username' ? 'Change Username' : 'Change Password'}
            </Text>

            {editingField === 'username' ? (
              <TextInput
                value={tempValue}
                onChangeText={setTempValue}
                placeholder="Enter new username"
                placeholderTextColor={theme.colors.muted}
                style={[styles.input, { backgroundColor: theme.colors.bg, color: theme.colors.text }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : (
              <>
                {/* Current Password */}
                <View style={styles.inputWrapper}>
                  <TextInput
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Current password"
                    placeholderTextColor={theme.colors.muted}
                    secureTextEntry={!showCurrentPassword}
                    style={[styles.input, { backgroundColor: theme.colors.bg, color: theme.colors.text, paddingRight: 50 }]}
                  />
                  <Pressable
                    onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                    style={styles.eyeIcon}
                  >
                    <MaterialCommunityIcons
                      name={showCurrentPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={theme.colors.muted}
                    />
                  </Pressable>
                </View>

                {/* New Password */}
                <View style={styles.inputWrapper}>
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="New password"
                    placeholderTextColor={theme.colors.muted}
                    secureTextEntry={!showNewPassword}
                    style={[styles.input, { backgroundColor: theme.colors.bg, color: theme.colors.text, paddingRight: 50 }]}
                  />
                  <Pressable
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    style={styles.eyeIcon}
                  >
                    <MaterialCommunityIcons
                      name={showNewPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={theme.colors.muted}
                    />
                  </Pressable>
                </View>

                {/* Confirm Password */}
                <View style={styles.inputWrapper}>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm new password"
                    placeholderTextColor={theme.colors.muted}
                    secureTextEntry={!showConfirmPassword}
                    style={[styles.input, { backgroundColor: theme.colors.bg, color: theme.colors.text, paddingRight: 50 }]}
                  />
                  <Pressable
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeIcon}
                  >
                    <MaterialCommunityIcons
                      name={showConfirmPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={theme.colors.muted}
                    />
                  </Pressable>
                </View>
              </>
            )}

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setEditModalVisible(false)}
                style={[styles.modalButton, { borderWidth: 1, borderColor: theme.colors.border }]}
              >
                <Text style={[theme.type.button, { color: theme.colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                style={[styles.modalButton, { backgroundColor: theme.colors.blue }]}
              >
                <Text style={[theme.type.button, { color: '#FFFFFF' }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal visible={showLogoutConfirm} transparent animationType="fade" onRequestClose={() => setShowLogoutConfirm(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.white }]}>
            <MaterialCommunityIcons name="logout" size={48} color={theme.colors.blue} style={{ marginBottom: 16 }} />
            <Text style={[theme.type.h1, { fontSize: 20, marginBottom: 12, textAlign: 'center' }]}>Log Out?</Text>
            <Text style={[theme.type.body, { color: theme.colors.muted, textAlign: 'center', marginBottom: 24 }]}>
              Are you sure you want to log out?
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setShowLogoutConfirm(false)}
                style={[styles.modalButton, { borderWidth: 1, borderColor: theme.colors.border }]}
              >
                <Text style={[theme.type.button, { color: theme.colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleLogout}
                style={[styles.modalButton, { backgroundColor: theme.colors.blue }]}
              >
                <Text style={[theme.type.button, { color: '#FFFFFF' }]}>Log Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal 
        visible={showDeleteConfirm} 
        transparent 
        animationType="fade" 
        onRequestClose={() => {
          // Prevent accidental closure - user must click Cancel
        }}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => {
            // Don't close modal when clicking outside
          }}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.colors.white }]}>
            <MaterialCommunityIcons name="alert-circle" size={48} color="#FF3B30" style={{ marginBottom: 16 }} />
            <Text style={[theme.type.h1, { fontSize: 20, marginBottom: 12, textAlign: 'center' }]}>Delete Account?</Text>
            <Text style={[theme.type.body, { color: theme.colors.muted, textAlign: 'center', marginBottom: 24 }]}>
              This will permanently delete your account and all associated data. This action cannot be undone.
            </Text>

            {/* Email info */}
            <Text style={[theme.type.body, { color: theme.colors.muted, textAlign: 'center', marginBottom: 16, fontSize: 14 }]}>
              We'll send a confirmation code to {userEmail}
            </Text>

            {/* Send Code Button */}
            <Pressable
              onPress={handleSendDeleteCode}
              disabled={sendingDeleteCode || codeSent}
              style={[styles.sendCodeButton, { 
                backgroundColor: codeSent ? '#4CAF50' : theme.colors.blue,
                opacity: (sendingDeleteCode || codeSent) ? 0.7 : 1,
                marginBottom: 24
              }]}
            >
              <Text style={[theme.type.button, { color: '#FFFFFF' }]}>
                {sendingDeleteCode ? 'Sending...' : codeSent ? 'Code Sent ✓' : 'Send Verification Code'}
              </Text>
            </Pressable>

            {/* Verification Code Input */}
            <Text style={[theme.type.body, { marginBottom: 8 }]}>Enter 6-digit code:</Text>
            <TextInput
              value={deleteVerificationCode}
              onChangeText={setDeleteVerificationCode}
              placeholder="000000"
              placeholderTextColor={theme.colors.muted}
              keyboardType="number-pad"
              maxLength={6}
              style={[styles.input, { 
                backgroundColor: theme.colors.bg, 
                color: theme.colors.text, 
                marginBottom: 24,
                textAlign: 'center',
                fontSize: 20,
                letterSpacing: 4
              }]}
            />

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setDeleteVerificationCode('');
                  setCodeSent(false);
                }}
                style={[styles.modalButton, { borderWidth: 1, borderColor: theme.colors.border }]}
              >
                <Text style={[theme.type.button, { color: theme.colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleDeleteAccount}
                disabled={deleteVerificationCode.length !== 6}
                style={[styles.modalButton, { 
                  backgroundColor: '#FF3B30',
                  opacity: deleteVerificationCode.length !== 6 ? 0.5 : 1
                }]}
              >
                <Text style={[theme.type.button, { color: '#FFFFFF' }]}>Delete My Account</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  cardHeader: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowIcon: {
    marginRight: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
  },
  input: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  inputWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendCodeButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

