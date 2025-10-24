import React, { useState } from 'react';
import { View, Text, Switch, Pressable, TextInput, Modal, Alert, ScrollView, Image, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import TopBar from '../components/TopBar';
import { getTheme } from '../theme';
import { useDarkMode, useUserProfile, useToast } from '../../App';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/api';

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
  const { name, phoneNumber, email, bio, socialMedia } = profile;
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
    setValidationError(''); // Clear any previous errors
    if (field === 'phone') {
      // Remove formatting for editing, keep only the formatted value
      setTempValue(phoneNumber);
    } else if (field === 'email') {
      setTempValue(email);
    } else if (field === 'name') {
      setTempValue(name);
    } else if (field === 'bio') {
      setTempValue(bio);
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
      updateProfile({ phoneNumber: tempValue });
    } else if (editingField === 'email') {
      error = validateEmail(tempValue);
      if (error) {
        setValidationError(error);
        return;
      }
      updateProfile({ email: tempValue });
    } else if (editingField === 'name') {
      error = validateName(tempValue);
      if (error) {
        setValidationError(error);
        return;
      }
      updateProfile({ name: tempValue });
    } else if (editingField === 'bio') {
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
      if (!/^[a-zA-Z0-9_]+$/.test(tempValue)) {
        setValidationError('Username can only contain letters, numbers, and underscores');
        return;
      }
      
      // Call API to change username
      try {
        const result = await api.changeUsername(tempValue.trim());
        // Update token in storage
        await login(result.token, userId, result.username);
        
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
        title="Account" 
        subtitle={`@${username || 'user'}`}
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

        {/* Dark Mode Card */}
        <View style={theme.card}>
          <Text style={[theme.type.h2, { color: theme.colors.blue }]}>Dark mode</Text>
          <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:10 }}>
            <Text style={theme.type.muted}>Enable dark mode</Text>
            <Switch 
              value={isDarkMode} 
              onValueChange={toggleDarkMode}
              trackColor={{ false: theme.colors.border, true: theme.colors.blueLight }}
              thumbColor={isDarkMode ? theme.colors.blue : theme.colors.muted}
            />
          </View>
        </View>

        {/* Contact Information Card */}
        <View style={theme.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={[theme.type.h2, { color: theme.colors.blue }]}>Edit contact information</Text>
            <Pressable
              onPress={() => setShowPreviewModal(true)}
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
              <Pressable style={{ padding: 4 }} onPress={() => navigation.navigate('ProfilePhoto')}>
                <MaterialCommunityIcons name="pencil" size={16} color={theme.colors.muted} />
              </Pressable>
            </View>
          </View>

          {/* Phone Number Row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
            <Text style={[theme.type.muted, { flex: 1 }]}>Phone number</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
              <Text style={[theme.type.body, { color: theme.colors.blue, marginRight: 8 }]}>{phoneNumber}</Text>
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
            <Text style={[theme.type.h2, { color: theme.colors.blue, flex: 1 }]}>Social Media</Text>
            <Pressable 
              onPress={() => {
                const newSocial = [...socialMedia, { platform: '', handle: '' }];
                if (newSocial.length <= 3) {
                  updateProfile({ socialMedia: newSocial });
                }
              }}
              style={{ padding: 4 }}
            >
              <MaterialCommunityIcons name="plus" size={16} color={theme.colors.muted} />
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

        {/* Security Settings Card */}
        <View style={theme.card}>
          <Text style={[theme.type.h2, { color: theme.colors.blue, marginBottom: 16 }]}>Security Settings</Text>
          
          {/* Username Row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
            <Text style={[theme.type.muted, { flex: 1 }]}>Username</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
              <Text style={[theme.type.body, { color: theme.colors.blue, marginRight: 8 }]}>@{username}</Text>
              <Pressable style={{ padding: 4 }} onPress={() => handleEdit('username')}>
                <MaterialCommunityIcons name="pencil" size={16} color={theme.colors.muted} />
              </Pressable>
            </View>
          </View>

          {/* Password Row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
            <Text style={[theme.type.muted, { flex: 1 }]}>Password</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
              <Text style={[theme.type.body, { color: theme.colors.blue, marginRight: 8 }]}>••••••••</Text>
              <Pressable style={{ padding: 4 }} onPress={() => handleEdit('password')}>
                <MaterialCommunityIcons name="pencil" size={16} color={theme.colors.muted} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Logout button - at the very bottom */}
        <View style={{ marginTop: 32, alignItems: 'center' }}>
          {/* Gray line above logout */}
          <View style={{ 
            width: '100%', 
            height: 2, 
            backgroundColor: isDarkMode ? '#444444' : '#CCCCCC',
            marginBottom: 16,
          }} />
          
          <Pressable
            onPress={() => setShowLogoutConfirm(true)}
            style={({ pressed }) => ({
              alignItems: 'center',
              paddingVertical: 12,
              opacity: pressed ? 0.5 : 0.4,
            })}
          >
            <Text style={{ 
              color: theme.colors.muted, 
              fontSize: 13, 
              fontFamily: 'Inter_400Regular',
            }}>
              Logout
            </Text>
          </Pressable>
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
                    placeholder="Enter current password"
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
                    placeholder="Enter new password"
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
                    placeholder="Confirm new password"
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
                  placeholder="e.g., Instagram, Twitter, LinkedIn"
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
                  placeholder="e.g., @username"
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
                    setTempValue(formatPhoneNumber(text));
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
                placeholder={editingField === 'phone' ? '(555) 555-5555' :
                            editingField === 'email' ? 'Enter email' :
                            editingField === 'name' ? 'Enter your name' :
                            editingField === 'bio' ? 'Enter your bio' : ''}
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
                {phoneNumber && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <MaterialCommunityIcons name="phone" size={16} color={theme.colors.muted} />
                    <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                      {phoneNumber}
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

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLogoutConfirm(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}>
          <View style={{
            backgroundColor: theme.colors.white,
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 400,
          }}>
            <Text style={{
              fontSize: 20,
              fontWeight: '600',
              fontFamily: 'Inter_500Medium',
              color: theme.colors.text,
              marginBottom: 12,
            }}>
              Logout
            </Text>
            <Text style={{
              fontSize: 15,
              fontFamily: 'Inter_400Regular',
              color: theme.colors.muted,
              marginBottom: 24,
            }}>
              Are you sure you want to logout?
            </Text>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              {/* Cancel Button */}
              <Pressable
                onPress={() => setShowLogoutConfirm(false)}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  backgroundColor: theme.colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  fontFamily: 'Inter_500Medium',
                  color: theme.colors.text,
                }}>
                  Cancel
                </Text>
              </Pressable>

              {/* Logout Button */}
              <Pressable
                onPress={async () => {
                  setShowLogoutConfirm(false);
                  await logout();
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  backgroundColor: '#FF3B30',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  fontFamily: 'Inter_500Medium',
                  color: '#FFFFFF',
                }}>
                  Logout
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}