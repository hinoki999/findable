import React, { useState } from 'react';
import { View, Text, Switch, Pressable, TextInput, Modal, Alert, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import TopBar from '../components/TopBar';
import { getTheme } from '../theme';
import { useDarkMode } from '../../App';

export default function AccountScreen() {
  const [isPublic, setIsPublic] = useState(true);
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const [phoneNumber, setPhoneNumber] = useState('+1 (555) 123-4567');
  const [email, setEmail] = useState('user@example.com');
  const [name, setName] = useState('Your Name');
  const [bio, setBio] = useState('Optional bio line goes here.');
  const [socialMedia, setSocialMedia] = useState<{ platform: string; handle: string }[]>([]);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingField, setEditingField] = useState<'phone' | 'email' | 'name' | 'bio' | 'social-platform' | 'social-handle' | null>(null);
  const [tempValue, setTempValue] = useState('');
  const [tempSocialIndex, setTempSocialIndex] = useState<number | null>(null);

  const theme = getTheme(isDarkMode);

  const handleEdit = (field: 'phone' | 'email' | 'name' | 'bio' | 'social-platform' | 'social-handle', socialIndex?: number) => {
    setEditingField(field);
    if (field === 'phone') {
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
    if (editingField === 'phone') {
      setPhoneNumber(tempValue);
    } else if (editingField === 'email') {
      setEmail(tempValue);
    } else if (editingField === 'name') {
      setName(tempValue);
    } else if (editingField === 'bio') {
      setBio(tempValue);
    } else if ((editingField === 'social-platform' || editingField === 'social-handle') && tempSocialIndex !== null) {
      const updatedSocial = [...socialMedia];
      if (editingField === 'social-platform') {
        updatedSocial[tempSocialIndex].platform = tempValue;
      } else {
        updatedSocial[tempSocialIndex].handle = tempValue;
      }
      setSocialMedia(updatedSocial);
    }
    setEditModalVisible(false);
    setEditingField(null);
    setTempValue('');
    setTempSocialIndex(null);
  };

  const handleCancel = () => {
    setEditModalVisible(false);
    setEditingField(null);
    setTempValue('');
    setTempSocialIndex(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <TopBar title="Account" />
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
                  setSocialMedia(newSocial);
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
                    setSocialMedia(updatedSocial);
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
                borderColor: theme.colors.border,
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
              onChangeText={setTempValue}
              placeholder={editingField === 'phone' ? 'Enter phone number' :
                          editingField === 'email' ? 'Enter email' :
                          editingField === 'name' ? 'Enter your name' :
                          editingField === 'bio' ? 'Enter your bio' :
                          editingField === 'social-platform' ? 'Enter platform (e.g., Instagram, Twitter)' :
                          editingField === 'social-handle' ? 'Enter handle (e.g., @username)' : ''}
              placeholderTextColor={theme.colors.muted}
              keyboardType={editingField === 'phone' ? 'phone-pad' : 'default'}
              multiline={editingField === 'bio'}
              autoFocus={true}
            />

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