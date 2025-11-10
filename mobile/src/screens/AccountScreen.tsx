import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, Modal, Alert, ScrollView, Image, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import TopBar from '../components/TopBar';
import { getTheme } from '../theme';
import { useDarkMode, useUserProfile, useToast } from '../../App';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/api';
import { BASE_URL, secureFetch } from '../services/api';
import { logAction, logStateChange } from '../services/activityMonitor';

// Helper function to get initials from name
const getInitials = (name: string): string => {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

// Helper function to generate consistent color from name
const getAvatarColor = (name: string): string => {
  const colors = [
    '#FF6B4A', '#4A90FF', '#FF4A7F', '#4AFF8C',
    '#FF4AE8', '#FFA84A', '#4AFFEF', '#A84AFF',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

interface AccountScreenProps {
  navigation: any;
  profilePhotoUri?: string | null;
}

export default function AccountScreen({ navigation, profilePhotoUri }: AccountScreenProps) {
  const [isPublic, setIsPublic] = useState(true);
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const { profile, updateProfile } = useUserProfile();
  const { showToast } = useToast();
  const { logout, username, userId, login } = useAuth();
  const { name, phone, email, bio, socialMedia } = profile;
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingField, setEditingField] = useState<'phone' | 'email' | 'name' | 'bio' | 'social-media' | 'username' | 'password' | null>(null);
  const [tempValue, setTempValue] = useState('');
  const [tempSocialPlatform, setTempSocialPlatform] = useState('');
  const [tempSocialHandle, setTempSocialHandle] = useState('');
  const [tempSocialIndex, setTempSocialIndex] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string>('');
  
  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Password visibility states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // Privacy Zones feature removed
  // const [privacyZonesEnabled, setPrivacyZonesEnabled] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const theme = getTheme(isDarkMode);

  // Load profile from backend on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = await AsyncStorage.getItem('@droplink_token');

        const response = await secureFetch(`${BASE_URL}/user/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = await response.json();

        // Update context with fresh backend data
        updateProfile({
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          bio: data.bio || '',
          socialMedia: data.socialMedia || []
        });

      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    };

    loadProfile();
  }, []);

  // Format phone number as (###) ###-####
  const formatPhoneNumber = (text: string) => {
    // Remove all non-numeric characters
    const cleaned = text.replace(/\D/g, '');
    // Limit to 10 digits
    const limited = cleaned.slice(0, 10);
    
    // Format based on length
    if (limited.length <= 3) {
      return limited ? `(${limited}` : '';
    } else if (limited.length <= 6) {
      return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    } else {
      return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
    }
  };

  // Validation functions
  const validateEmail = (email: string): string => {
    if (!email.trim()) {
      return 'Email is required';
    }
    if (!email.includes('@')) {
      return 'Must have an @ symbol';
    }
    // Check for basic domain structure (at least one dot after @)
    const atIndex = email.indexOf('@');
    const afterAt = email.substring(atIndex + 1);
    if (!afterAt.includes('.') || afterAt.length < 3) {
      return 'Must have a valid domain (e.g., .com, .org)';
    }
    return '';
  };

  const validatePhone = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 0) {
      return 'Phone number is required';
    }
    if (cleaned.length !== 10) {
      return 'Phone number must be exactly 10 digits';
    }
    return '';
  };

  const validateName = (name: string): string => {
    if (!name.trim()) {
      return 'Name is required';
    }
    return '';
  };

  const handleEdit = (field: 'phone' | 'email' | 'name' | 'bio' | 'social-media' | 'username' | 'password', socialIndex?: number) => {
    setEditingField(field);
    logAction(`Edit ${field} clicked`, { field, currentValue: field === 'phone' ? phone : field === 'email' ? email : field === 'name' ? name : field === 'bio' ? bio : undefined });
    setValidationError(''); // Clear any previous errors
    if (field === 'phone') {
      // Remove formatting for editing, keep only the formatted value
      setTempValue(phone);
    } else if (field === 'email') {
      setTempValue(email);
    } else if (field === 'name') {
      setTempValue(name);
    } else if (field === 'bio') {
      // If bio is the placeholder text, start with empty string
      setTempValue(bio === 'Add bio' ? '' : bio);
    } else if (field === 'social-media' && socialIndex !== undefined) {
      setTempSocialIndex(socialIndex);
      setTempSocialPlatform(socialMedia[socialIndex].platform);
      setTempSocialHandle(socialMedia[socialIndex].handle);
    } else if (field === 'username') {
      setTempValue(username || '');
    } else if (field === 'password') {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    }
    setEditModalVisible(true);
  };

  const handleSave = async () => {
    // Validate based on field type
    let error = '';
    if (editingField === 'phone') {
      error = validatePhone(tempValue);
      if (error) {
        setValidationError(error);
        return;
      }
      logStateChange('profile.phone', phone, tempValue);
      logAction('Profile phone updated', { oldPhone: phone, newPhone: tempValue });
      updateProfile({ phone: tempValue });
    } else if (editingField === 'email') {
      error = validateEmail(tempValue);
      if (error) {
        setValidationError(error);
        return;
      }
      logStateChange('profile.email', email, tempValue);
      logAction('Profile email updated', { oldEmail: email, newEmail: tempValue });
      updateProfile({ email: tempValue });
    } else if (editingField === 'name') {
      error = validateName(tempValue);
      if (error) {
        setValidationError(error);
        return;
      }
      logStateChange('profile.name', name, tempValue);
      logAction('Profile name updated', { oldName: name, newName: tempValue });
      updateProfile({ name: tempValue });
    } else if (editingField === 'bio') {
      logStateChange('profile.bio', bio, tempValue);
      logAction('Profile bio updated', { oldBio: bio, newBio: tempValue });
      updateProfile({ bio: tempValue });
    } else if (editingField === 'social-media' && tempSocialIndex !== null) {
      // Validate social media
      if (!tempSocialPlatform.trim()) {
        setValidationError('Platform name is required');
        return;
      }
      if (!tempSocialHandle.trim()) {
        setValidationError('Handle is required');
        return;
      }
      const updatedSocial = [...socialMedia];
      updatedSocial[tempSocialIndex] = {
        platform: tempSocialPlatform.trim(),
        handle: tempSocialHandle.trim(),
      };
      updateProfile({ socialMedia: updatedSocial });
    } else if (editingField === 'username') {
      // Validate username
      if (!tempValue.trim() || tempValue.length < 3 || tempValue.length > 20) {
        setValidationError('Username must be 3-20 characters');
        return;
      }
      if (!/^[a-zA-Z0-9_.]+$/.test(tempValue)) {
        setValidationError('Username can only contain letters, numbers, underscores, and periods');
        return;
      }
      
      // Call API to change username
      try {
        const result = await api.changeUsername(tempValue.trim());
        logAction('Username changed', { oldUsername: username, newUsername: tempValue.trim() });
        // Update token in storage
        await login(result.token, userId || 0, result.username);
        
        showToast({
          message: 'Username changed successfully!',
          type: 'success',
          duration: 2000,
        });
        setEditModalVisible(false);
        return;
      } catch (error: any) {
        setValidationError(error.message || 'Failed to change username');
        return;
      }
    } else if (editingField === 'password') {
      // Validate password change
      if (!currentPassword) {
        setValidationError('Current password is required');
        return;
      }
      if (newPassword.length < 8) {
        setValidationError('New password must be at least 8 characters');
        return;
      }
      if (!/[A-Z]/.test(newPassword)) {
        setValidationError('New password must contain at least one uppercase letter');
        return;
      }
      if (!/[a-z]/.test(newPassword)) {
        setValidationError('New password must contain at least one lowercase letter');
        return;
      }
      if (!/[0-9]/.test(newPassword)) {
        setValidationError('New password must contain at least one number');
        return;
      }
      if (newPassword !== confirmPassword) {
        setValidationError('Passwords do not match');
        return;
      }
      
      // Call API to change password
      try {
        await api.changePassword(currentPassword, newPassword);
        logAction('Password changed successfully', { userId });

        showToast({
          message: 'Password changed successfully!',
          type: 'success',
          duration: 2000,
        });
        setEditModalVisible(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        return;
      } catch (error: any) {
        setValidationError(error.message || 'Failed to change password');
        return;
      }
    }
    setEditModalVisible(false);
    setEditingField(null);
    setTempValue('');
    setTempSocialPlatform('');
    setTempSocialHandle('');
    setTempSocialIndex(null);
    setValidationError('');
    
    // Show success toast
    showToast({
      message: 'Changes saved successfully!',
      type: 'success',
      duration: 2000,
    });
  };

  const handleCancel = () => {
    setEditModalVisible(false);
    setEditingField(null);
    setTempValue('');
    setTempSocialPlatform('');
    setTempSocialHandle('');
    setTempSocialIndex(null);
    setValidationError('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  // Flag/Report button removed
  // const handleReportIssue = () => {
  //   showToast({
  //     message: 'Report feature coming soon',
  //     type: 'success',
  //     duration: 2000,
  //   });
  // };

  // Privacy Zones feature removed
  // const handlePrivacyZonesToggle = () => {
  //   if (!privacyZonesEnabled) {
  //     navigation.navigate('PrivacyZones');
  //   } else {
  //     setPrivacyZonesEnabled(false);
  //   }
  // };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <TopBar 
        logoMode={true}
        logoIcon="account-outline"
        subtitle={`@${username || 'user'}`}
        rightIcon="cog"
        onRightIconPress={() => navigation.navigate('SecuritySettings')}
      />
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Name and Bio Card */}
        <View style={theme.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={theme.type.h1}>{name}</Text>
            <Pressable onPress={() => handleEdit('name')} style={{ padding: 4 }}>
              <MaterialCommunityIcons name="pencil" size={16} color={theme.colors.muted} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ ...theme.type.muted, flex: 1 }}>{bio}</Text>
            <Pressable onPress={() => handleEdit('bio')} style={{ padding: 4 }}>
              <MaterialCommunityIcons name="pencil" size={16} color={theme.colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* Contact Information Card */}
        <View style={theme.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={[theme.type.h2, { color: theme.colors.blue }]}>Edit contact information</Text>
            <Pressable
              onPress={() => {
                logAction('Preview My Card button clicked', { username });
                setShowPreviewModal(true);
              }}
              style={{
                borderRadius: 4,
                borderWidth: 1,
                borderColor: theme.colors.blue,
                backgroundColor: 'transparent',
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: theme.colors.blue, fontSize: 11, fontWeight: '600' }}>
                Preview My Card
              </Text>
            </Pressable>
          </View>
          
          {/* Profile Picture Row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingVertical: 8 }}>
            <Text style={[theme.type.muted, { flex: 1 }]}>Profile picture</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
              <View style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: theme.colors.blueLight,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8,
                overflow: 'hidden',
              }}>
                {profilePhotoUri ? (
                  <Image source={{ uri: profilePhotoUri }} style={{ width: 50, height: 50 }} />
                ) : (
                  <MaterialCommunityIcons name="account" size={24} color={theme.colors.blue} />
                )}
              </View>
              <Pressable style={{ padding: 4 }} onPress={() => {
                logAction('Edit profile photo clicked', { hasCurrentPhoto: !!profilePhotoUri });
                navigation.navigate('ProfilePhoto');
              }}>
                <MaterialCommunityIcons name="pencil" size={16} color={theme.colors.muted} />
              </Pressable>
            </View>
          </View>

          {/* Phone Number Row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
            <Text style={[theme.type.muted, { flex: 1 }]}>Phone number</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
              <Text style={[theme.type.body, { color: theme.colors.blue, marginRight: 8 }]}>{phone}</Text>
              <Pressable style={{ padding: 4 }} onPress={() => handleEdit('phone')}>
                <MaterialCommunityIcons name="pencil" size={16} color={theme.colors.muted} />
              </Pressable>
            </View>
          </View>

          {/* Email Row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
            <Text style={[theme.type.muted, { flex: 1 }]}>Email</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
              <Text style={[theme.type.body, { color: theme.colors.blue, marginRight: 8 }]}>{email}</Text>
              <Pressable style={{ padding: 4 }} onPress={() => handleEdit('email')}>
                <MaterialCommunityIcons name="pencil" size={16} color={theme.colors.muted} />
              </Pressable>
            </View>
          </View>

          {/* Social Media Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, marginTop: 8 }}>
            <Text style={[theme.type.muted, { flex: 1 }]}>Social Media</Text>
            <Pressable 
              onPress={() => {
                const newSocial = [...socialMedia, { platform: '', handle: '' }];
                if (newSocial.length <= 3) {
                  updateProfile({ socialMedia: newSocial });
                }
              }}
              style={{ padding: 4 }}
            >
              <MaterialCommunityIcons name="plus" size={16} color={theme.colors.blue} />
            </Pressable>
          </View>

          {/* Social Media Accounts */}
          {socialMedia.length === 0 && (
            <Text style={[theme.type.muted, { textAlign: 'center', paddingVertical: 8, fontStyle: 'italic' }]}>
              No social media accounts added yet. Tap the + to add one.
            </Text>
          )}
          {socialMedia.map((social, index) => (
            <View key={index} style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              paddingVertical: 8,
              paddingLeft: 16,
              borderLeftWidth: 2,
              borderLeftColor: theme.colors.border,
              marginBottom: 8
            }}>
              <View style={{ flex: 1 }}>
                <Text style={[theme.type.muted, { color: theme.colors.muted, fontSize: 12 }]}>
                  {social.platform || `Account ${index + 1}`}
                </Text>
                <Text style={[theme.type.body, { color: theme.colors.blue, marginTop: 2 }]}>
                  {social.handle || 'Enter handle'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Pressable style={{ padding: 4 }} onPress={() => handleEdit('social-media', index)}>
                  <MaterialCommunityIcons name="pencil" size={16} color={theme.colors.muted} />
                </Pressable>
                <Pressable 
                  style={{ padding: 4, marginLeft: 4 }} 
                  onPress={() => {
                    const updatedSocial = socialMedia.filter((_, i) => i !== index);
                    updateProfile({ socialMedia: updatedSocial });
                  }}
                >
                  <MaterialCommunityIcons name="close" size={16} color={theme.colors.muted} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancel}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: 20 
        }}>
          <View style={[theme.card, { width: '100%', maxWidth: 400 }]}>
            <Text style={theme.type.h2}>
              {editingField === 'phone' ? 'Edit Phone Number' :
               editingField === 'email' ? 'Edit Email' :
               editingField === 'name' ? 'Edit Name' :
               editingField === 'bio' ? 'Edit Bio' :
               editingField === 'username' ? 'Change Username' :
               editingField === 'password' ? 'Change Password' :
               editingField === 'social-media' ? 'Edit Social Media Account' : ''}
            </Text>
            
            {editingField === 'password' ? (
              <>
                {/* Current Password */}
                <Text style={[theme.type.muted, { marginTop: 16, marginBottom: 8, fontSize: 14 }]}>
                  Current Password
                </Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: validationError ? '#FF6B6B' : theme.colors.border,
                      borderRadius: 8,
                      padding: 12,
                      paddingRight: 48,
                      fontSize: 16,
                      fontFamily: 'Inter_400Regular',
                      color: theme.colors.text,
                      backgroundColor: theme.colors.bg,
                      minHeight: 48,
                    }}
                    value={currentPassword}
                    onChangeText={(text) => {
                      setCurrentPassword(text);
                      if (validationError) setValidationError('');
                    }}
                  placeholder=""
                  placeholderTextColor={theme.colors.muted}
                    secureTextEntry={!showCurrentPassword}
                    autoFocus={true}
                  />
                  <Pressable
                    onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: 12,
                      padding: 4,
                    }}
                  >
                    <MaterialCommunityIcons
                      name={showCurrentPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={theme.colors.muted}
                    />
                  </Pressable>
                </View>
                
                {/* New Password */}
                <Text style={[theme.type.muted, { marginTop: 12, marginBottom: 8, fontSize: 14 }]}>
                  New Password
                </Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: validationError ? '#FF6B6B' : theme.colors.border,
                      borderRadius: 8,
                      padding: 12,
                      paddingRight: 48,
                      fontSize: 16,
                      fontFamily: 'Inter_400Regular',
                      color: theme.colors.text,
                      backgroundColor: theme.colors.bg,
                      minHeight: 48,
                    }}
                    value={newPassword}
                    onChangeText={(text) => {
                      setNewPassword(text);
                      if (validationError) setValidationError('');
                    }}
                  placeholder=""
                  placeholderTextColor={theme.colors.muted}
                    secureTextEntry={!showNewPassword}
                  />
                  <Pressable
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: 12,
                      padding: 4,
                    }}
                  >
                    <MaterialCommunityIcons
                      name={showNewPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={theme.colors.muted}
                    />
                  </Pressable>
                </View>
                
                {/* Confirm Password */}
                <Text style={[theme.type.muted, { marginTop: 12, marginBottom: 8, fontSize: 14 }]}>
                  Confirm New Password
                </Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: validationError ? '#FF6B6B' : theme.colors.border,
                      borderRadius: 8,
                      padding: 12,
                      paddingRight: 48,
                      fontSize: 16,
                      fontFamily: 'Inter_400Regular',
                      color: theme.colors.text,
                      backgroundColor: theme.colors.bg,
                      minHeight: 48,
                    }}
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      if (validationError) setValidationError('');
                    }}
                  placeholder=""
                  placeholderTextColor={theme.colors.muted}
                    secureTextEntry={!showConfirmPassword}
                  />
                  <Pressable
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: 12,
                      padding: 4,
                    }}
                  >
                    <MaterialCommunityIcons
                      name={showConfirmPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={theme.colors.muted}
                    />
                  </Pressable>
                </View>
                
                <Text style={[theme.type.muted, { marginTop: 12, fontSize: 12, fontStyle: 'italic' }]}>
                  Password must be at least 8 characters with uppercase, lowercase, and a number
                </Text>
              </>
            ) : editingField === 'social-media' ? (
              <>
                {/* Platform Input */}
                <Text style={[theme.type.muted, { marginTop: 16, marginBottom: 8, fontSize: 14 }]}>
                  Platform
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: validationError && !tempSocialPlatform.trim() ? '#FF6B6B' : theme.colors.border,
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 16,
                    fontFamily: 'Inter_400Regular',
                    color: theme.colors.text,
                    backgroundColor: theme.colors.bg,
                    minHeight: 48,
                  }}
                  value={tempSocialPlatform}
                  onChangeText={(text) => {
                    setTempSocialPlatform(text);
                    if (validationError) {
                      setValidationError('');
                    }
                  }}
                  placeholder=""
                  placeholderTextColor={theme.colors.muted}
                  autoFocus={true}
                />
                
                {/* Handle Input */}
                <Text style={[theme.type.muted, { marginTop: 12, marginBottom: 8, fontSize: 14 }]}>
                  Username/Handle
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: validationError && !tempSocialHandle.trim() ? '#FF6B6B' : theme.colors.border,
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 16,
                    fontFamily: 'Inter_400Regular',
                    color: theme.colors.text,
                    backgroundColor: theme.colors.bg,
                    minHeight: 48,
                  }}
                  value={tempSocialHandle}
                  onChangeText={(text) => {
                    setTempSocialHandle(text);
                    if (validationError) {
                      setValidationError('');
                    }
                  }}
                  placeholder=""
                  placeholderTextColor={theme.colors.muted}
                />
              </>
            ) : (
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: validationError ? '#FF6B6B' : theme.colors.border,
                  borderRadius: 8,
                  padding: 12,
                  marginTop: 16,
                  fontSize: 16,
                  fontFamily: 'Inter_400Regular',
                  color: theme.colors.text,
                  backgroundColor: theme.colors.bg,
                  minHeight: editingField === 'bio' ? 80 : 48,
                  textAlignVertical: editingField === 'bio' ? 'top' : 'center',
                }}
                value={tempValue}
                onChangeText={(text) => {
                  if (editingField === 'phone') {
                    // Only allow numeric input
                    const numericOnly = text.replace(/\D/g, '');
                    setTempValue(formatPhoneNumber(numericOnly));
                  } else if (editingField === 'bio') {
                    if (text.length <= 50) {
                      setTempValue(text);
                    }
                  } else {
                    setTempValue(text);
                  }
                  // Clear validation error when user starts typing
                  if (validationError) {
                    setValidationError('');
                  }
                }}
                placeholder=""
                placeholderTextColor={theme.colors.muted}
                keyboardType={editingField === 'phone' ? 'phone-pad' : 'default'}
                multiline={editingField === 'bio'}
                maxLength={editingField === 'bio' ? 50 : undefined}
                autoFocus={true}
              />
            )}
            
            {validationError && (
              <Text style={{ color: '#FF6B6B', fontSize: 12, marginTop: 4 }}>
                {validationError}
              </Text>
            )}
            
            {editingField === 'bio' && (
              <Text style={[theme.type.muted, { fontSize: 12, marginTop: 4, textAlign: 'right' }]}>
                {tempValue.length}/50
              </Text>
            )}

            <View style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              marginTop: 20,
              gap: 12
            }}>
              <Pressable
                onPress={handleCancel}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: theme.colors.border
                }}
              >
                <Text style={[theme.type.body, { color: theme.colors.muted }]}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleSave}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: theme.colors.blue
                }}
              >
                <Text style={[theme.type.button, { color: theme.colors.white }]}>Save</Text>
              </Pressable>
          </View>
        </View>
      </View>
      </Modal>

      {/* Preview My Contact Card Modal */}
      <Modal
        visible={showPreviewModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPreviewModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20
        }}>
          <View style={{
            backgroundColor: theme.colors.white,
            borderRadius: 16,
            width: '100%',
            maxWidth: 350,
            overflow: 'hidden',
          }}>
            {/* ID Header */}
            <View style={{
              backgroundColor: theme.colors.blue,
              paddingVertical: 12,
              paddingHorizontal: 20,
              alignItems: 'center',
            }}>
              <Text style={[theme.type.h2, { color: theme.colors.white, fontSize: 16 }]}>
                {name}
              </Text>
            </View>

            {/* ID Content */}
            <View style={{ padding: 20 }}>
              {/* Profile Picture */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <View style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: profilePhotoUri ? theme.colors.blueLight : theme.colors.blue,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {profilePhotoUri ? (
                    <Image source={{ uri: profilePhotoUri }} style={{ width: 80, height: 80 }} />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontSize: 32, fontWeight: '600' }}>
                      {getInitials(name)}
                    </Text>
                  )}
                </View>
              </View>

              {/* Contact Information */}
              <View style={{ marginBottom: 16 }}>
                {/* Phone */}
                {phone && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <MaterialCommunityIcons name="phone" size={16} color={theme.colors.muted} />
                    <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                      {phone}
                    </Text>
                  </View>
                )}

                {/* Email */}
                {email && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <MaterialCommunityIcons name="email" size={16} color={theme.colors.muted} />
                    <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                      {email}
                    </Text>
                  </View>
                )}

                {/* Social Media - Dynamic */}
                {socialMedia && socialMedia.length > 0 && socialMedia.map((social, index) => (
                  social.platform && social.handle ? (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <MaterialCommunityIcons
                        name={social.platform.toLowerCase() as any}
                        size={16}
                        color={theme.colors.muted}
                      />
                      <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                        {social.handle}
                      </Text>
                    </View>
                  ) : null
                ))}
              </View>

              {/* Bio Section */}
              {bio && (
                <View style={{
                  backgroundColor: theme.colors.bg,
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 16,
                }}>
                  <Text style={[theme.type.muted, { fontSize: 12, marginBottom: 4 }]}>
                    BIO
                  </Text>
                  <Text style={[theme.type.body, { fontSize: 13, color: theme.colors.text }]}>
                    "{bio}"
                  </Text>
                </View>
              )}

              {/* Close Button */}
              <Pressable
                onPress={() => setShowPreviewModal(false)}
                style={{
                  backgroundColor: theme.colors.blue,
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderRadius: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={[theme.type.button, { fontSize: 14 }]}>
                  Close
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}