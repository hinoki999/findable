import React, { useState } from 'react';
import { View, Text, Switch, Pressable, TextInput, Modal, Alert, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import TopBar from '../components/TopBar';
import { getTheme } from '../theme';
import { useDarkMode, useUserProfile, useToast } from '../../App';

export default function AccountScreen({ navigation }: any) {
  const [isPublic, setIsPublic] = useState(true);
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const { profile, updateProfile } = useUserProfile();
  const { showToast } = useToast();
  const { name, phoneNumber, email, bio, socialMedia } = profile;
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingField, setEditingField] = useState<'phone' | 'email' | 'name' | 'bio' | 'social-platform' | 'social-handle' | null>(null);
  const [tempValue, setTempValue] = useState('');
  const [tempSocialIndex, setTempSocialIndex] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string>('');
  const [privacyZonesEnabled, setPrivacyZonesEnabled] = useState(false);

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

  const handleEdit = (field: 'phone' | 'email' | 'name' | 'bio' | 'social-platform' | 'social-handle', socialIndex?: number) => {
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
    } else if ((field === 'social-platform' || field === 'social-handle') && socialIndex !== undefined) {
      setTempSocialIndex(socialIndex);
      setTempValue(field === 'social-platform' ? socialMedia[socialIndex].platform : socialMedia[socialIndex].handle);
    }
    setEditModalVisible(true);
  };

  const handleSave = () => {
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
    } else if ((editingField === 'social-platform' || editingField === 'social-handle') && tempSocialIndex !== null) {
      const updatedSocial = [...socialMedia];
      if (editingField === 'social-platform') {
        updatedSocial[tempSocialIndex].platform = tempValue;
      } else {
        updatedSocial[tempSocialIndex].handle = tempValue;
      }
      updateProfile({ socialMedia: updatedSocial });
    }
    setEditModalVisible(false);
    setEditingField(null);
    setTempValue('');
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
    setTempSocialIndex(null);
    setValidationError('');
  };

  const handleReportIssue = () => {
    // TODO: Open report form/modal
    showToast({
      message: 'Report feature coming soon',
      type: 'success',
      duration: 2000,
    });
  };

  const handlePrivacyZonesToggle = () => {
    if (!privacyZonesEnabled) {
      // If turning on, navigate to privacy zones to set it up
      navigation.navigate('PrivacyZones');
    } else {
      // If turning off, just toggle it
      setPrivacyZonesEnabled(false);
      showToast({
        message: 'Privacy zones disabled',
        type: 'success',
        duration: 2000,
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <TopBar 
        title="Account" 
        rightIcon="flag" 
        onRightIconPress={handleReportIssue}
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

        {/* Privacy Zones Card */}
        <View style={theme.card}>
          <Text style={[theme.type.h2, { color: theme.colors.blue }]}>Privacy zones</Text>
          <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:10 }}>
            <Text style={theme.type.muted}>Auto-disable at saved locations</Text>
            <Switch 
              value={privacyZonesEnabled} 
              onValueChange={handlePrivacyZonesToggle}
              trackColor={{ false: theme.colors.border, true: theme.colors.blueLight }}
              thumbColor={privacyZonesEnabled ? theme.colors.blue : theme.colors.muted}
            />
          </View>
        </View>

        {/* Contact Information Card */}
        <View style={theme.card}>
          <Text style={[theme.type.h2, { color: theme.colors.blue }]}>Edit contact information</Text>
          
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
                <MaterialCommunityIcons name="account" size={24} color={theme.colors.blue} />
              </View>
              <MaterialCommunityIcons name="pencil" size={16} color={theme.colors.muted} />
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
              paddingVertical: 4,
              paddingLeft: 16,
              borderLeftWidth: 2,
              borderLeftColor: theme.colors.border,
              marginBottom: 8
            }}>
              <Pressable 
                style={{ flex: 1 }}
                onPress={() => handleEdit('social-platform', index)}
              >
                <Text style={[theme.type.muted, { color: theme.colors.muted }]}>
                  {social.platform || `Account ${index + 1}`}
                </Text>
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                <Text style={[theme.type.body, { color: theme.colors.blue, marginRight: 8 }]}>
                  {social.handle || 'Enter handle'}
                </Text>
                <Pressable style={{ padding: 4 }} onPress={() => handleEdit('social-handle', index)}>
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
              Edit {editingField === 'phone' ? 'Phone Number' :
                    editingField === 'email' ? 'Email' :
                    editingField === 'name' ? 'Name' :
                    editingField === 'bio' ? 'Bio' :
                    editingField === 'social-platform' ? `Platform ${(tempSocialIndex || 0) + 1}` :
                    editingField === 'social-handle' ? `Handle ${(tempSocialIndex || 0) + 1}` : ''}
            </Text>
            
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
                          editingField === 'bio' ? 'Enter your bio' :
                          editingField === 'social-platform' ? 'Enter platform (e.g., Instagram, Twitter)' :
                          editingField === 'social-handle' ? 'Enter handle (e.g., @username)' : ''}
              placeholderTextColor={theme.colors.muted}
              keyboardType={editingField === 'phone' ? 'phone-pad' : 'default'}
              multiline={editingField === 'bio'}
              maxLength={editingField === 'bio' ? 50 : undefined}
              autoFocus={true}
            />
            
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
    </View>
  );
}