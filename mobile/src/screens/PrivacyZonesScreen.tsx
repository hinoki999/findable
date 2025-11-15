import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, Alert, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useDarkMode, useToast } from '../../App';

interface PrivacyZone {
  id: string;
  address: string;
  radius: number; // in miles
}

// Address suggestions - empty, no mock data
const mockAddressSuggestions: string[] = [];

interface PrivacyZonesScreenProps {
  navigation: any;
  zones: PrivacyZone[];
  setZones: (zones: PrivacyZone[]) => void;
}

export default function PrivacyZonesScreen({ navigation, zones, setZones }: PrivacyZonesScreenProps) {
  const { isDarkMode } = useDarkMode();
  const { showToast } = useToast();
  const theme = getTheme(isDarkMode);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [selectedAddress, setSelectedAddress] = useState('');
  const [radius, setRadius] = useState(3);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredSuggestions = mockAddressSuggestions.filter(addr =>
    addr.toLowerCase().includes(addressInput.toLowerCase())
  );

  console.log('PrivacyZonesScreen render - zones.length:', zones.length, 'isAdding:', isAdding, 'isEditing:', isEditing);

  const handleAddNew = () => {
    setIsAdding(true);
    setIsEditing(false);
    setAddressInput('');
    setSelectedAddress('');
    setRadius(3);
    setHasUnsavedChanges(true);
  };

  const handleEdit = (zone: PrivacyZone) => {
    setIsEditing(true);
    setIsAdding(false);
    setEditingId(zone.id);
    setAddressInput(zone.address);
    setSelectedAddress(zone.address);
    setRadius(zone.radius);
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!selectedAddress) {
      showToast({
        message: 'Please select an address from the suggestions',
        type: 'error',
        duration: 3000,
      });
      return;
    }

    try {
      if (isEditing && editingId) {
        // Update existing zone (delete old, create new)
        const api = await import('../services/api');
        await api.deletePrivacyZone(Number(editingId));
        const savedZone = await api.savePrivacyZone({ address: selectedAddress, radius });
        
        const updatedZones = zones.map(zone =>
          zone.id === editingId
            ? { id: savedZone.id.toString(), address: savedZone.address, radius: savedZone.radius }
            : zone
        );
        setZones(updatedZones);
        console.log('✅ Updated zone in backend:', savedZone);
        showToast({
          message: 'Privacy zone updated',
          type: 'success',
          duration: 2000,
        });
      } else {
        // Add new zone
        const api = await import('../services/api');
        const savedZone = await api.savePrivacyZone({ address: selectedAddress, radius });
        
        const newZone: PrivacyZone = {
          id: savedZone.id.toString(),
          address: savedZone.address,
          radius: savedZone.radius,
        };
        const updatedZones = [...zones, newZone];
        setZones(updatedZones);
        console.log('✅ Added new zone to backend:', savedZone);
        showToast({
          message: 'Privacy zone added',
          type: 'success',
          duration: 2000,
        });
      }

      // Reset form
      setIsAdding(false);
      setIsEditing(false);
      setEditingId(null);
      setAddressInput('');
      setSelectedAddress('');
      setRadius(3);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('❌ Failed to save privacy zone:', error);
      showToast({
        message: 'Failed to save privacy zone',
        type: 'error',
        duration: 3000,
      });
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setIsEditing(false);
    setEditingId(null);
    setAddressInput('');
    setSelectedAddress('');
    setRadius(3);
    setHasUnsavedChanges(false);
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (deletingId) {
      try {
        const api = await import('../services/api');
        await api.deletePrivacyZone(Number(deletingId));
        
        setZones(zones.filter(zone => zone.id !== deletingId));
        console.log('✅ Deleted zone from backend:', deletingId);
        showToast({
          message: 'Privacy zone deleted',
          type: 'success',
          duration: 2000,
        });
      } catch (error) {
        console.error('❌ Failed to delete privacy zone:', error);
        showToast({
          message: 'Failed to delete privacy zone',
          type: 'error',
          duration: 3000,
        });
      }
    }
    setShowDeleteModal(false);
    setDeletingId(null);
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setDeletingId(null);
  };

  const handleBackPress = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedModal(true);
    } else {
      navigation.goBack();
    }
  };

  const handleSelectSuggestion = (address: string) => {
    setSelectedAddress(address);
    setAddressInput(address);
    setShowSuggestions(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.colors.white,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}>
        <Pressable onPress={handleBackPress} style={{ padding: 4, marginRight: 12 }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.text} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <MaterialCommunityIcons name="map-marker-off" size={24} color="#007AFF" style={{ marginRight: 8 }} />
          <Text style={[theme.type.h1, { fontSize: 20 }]}>Privacy Zones</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {/* Info Card */}
        <View style={[theme.card, { backgroundColor: '#1E3A5F', marginBottom: 16 }]}>
          <Text style={[theme.type.body, { fontSize: 13, color: isDarkMode ? '#FFFFFF' : '#FFFFFF' }]}>
            When you're within the radius of a saved location, you won't appear on other users' maps.
          </Text>
        </View>

        {/* Empty State */}
        {zones.length === 0 && !isAdding && (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <MaterialCommunityIcons name="map-marker-off-outline" size={64} color={theme.colors.muted} style={{ marginBottom: 16, opacity: 0.5 }} />
            <Text style={[theme.type.h2, { marginBottom: 8, fontSize: 18, textAlign: 'center' }]}>
              Auto-Disable not currently active
            </Text>
            <Text style={[theme.type.muted, { textAlign: 'center', fontSize: 14, marginBottom: 24 }]}>
              Tap the plus sign to add a location.
            </Text>
          </View>
        )}

        {/* Saved Zones List */}
        {zones.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[theme.type.h2, { fontSize: 15, marginBottom: 12, color: '#007AFF' }]}>
              Active Privacy Zones ({zones.length})
            </Text>
            {zones.map((zone) => (
              <View key={zone.id} style={[theme.card, { marginBottom: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                  <MaterialCommunityIcons name="map-marker" size={20} color="#007AFF" style={{ marginRight: 8, marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[theme.type.body, { fontSize: 15, marginBottom: 4 }]}>
                      {zone.address}
                    </Text>
                    <Text style={[theme.type.muted, { fontSize: 13 }]}>
                      Within {zone.radius} mile{zone.radius !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Pressable
                    onPress={() => handleEdit(zone)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: '#007AFF',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={[theme.type.body, { color: '#007AFF', fontSize: 13 }]}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(zone.id)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: '#FF6B6B',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={[theme.type.body, { color: '#FF6B6B', fontSize: 13 }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Add/Edit Form */}
        {(isAdding || isEditing) && (
          <View style={[theme.card, { marginBottom: 16 }]}>
            <Text style={[theme.type.h2, { marginBottom: 12, fontSize: 16, color: '#007AFF' }]}>
              {isEditing ? 'Edit Privacy Zone' : 'Add Privacy Zone'}
            </Text>

            {/* Address Input */}
            <Text style={[theme.type.muted, { fontSize: 13, marginBottom: 8 }]}>Address</Text>
            <View style={{ position: 'relative', marginBottom: 16 }}>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 14,
                  color: theme.colors.text,
                  fontFamily: 'Inter_400Regular',
                  backgroundColor: theme.colors.white,
                }}
                placeholder="Start typing an address..."
                placeholderTextColor={theme.colors.muted}
                value={addressInput}
                onChangeText={(text) => {
                  setAddressInput(text);
                  setShowSuggestions(text.length > 0);
                }}
                onFocus={() => setShowSuggestions(addressInput.length > 0)}
              />

              {/* Address Suggestions Dropdown */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <View style={{
                  position: 'absolute',
                  top: 48,
                  left: 0,
                  right: 0,
                  backgroundColor: theme.colors.white,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 8,
                  maxHeight: 200,
                  zIndex: 1000,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                  elevation: 3,
                }}>
                  <ScrollView nestedScrollEnabled>
                    {filteredSuggestions.map((suggestion, index) => (
                      <Pressable
                        key={index}
                        onPress={() => handleSelectSuggestion(suggestion)}
                        style={{
                          padding: 12,
                          borderBottomWidth: index < filteredSuggestions.length - 1 ? 1 : 0,
                          borderBottomColor: theme.colors.border,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <MaterialCommunityIcons name="map-marker-outline" size={16} color={theme.colors.muted} style={{ marginRight: 8 }} />
                          <Text style={[theme.type.body, { fontSize: 13, color: theme.colors.text }]}>
                            {suggestion}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Step 2: Radius Selection + Action Buttons (only after address is selected) */}
            {selectedAddress && (
              <>
                <View style={{
                  backgroundColor: '#E5F2FF',
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 16,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="map-marker" size={16} color="#007AFF" style={{ marginRight: 6 }} />
                    <Text style={[theme.type.body, { fontSize: 13, color: '#007AFF', flex: 1 }]}>
                      {selectedAddress}
                    </Text>
                  </View>
                </View>

                <Text style={[theme.type.muted, { fontSize: 13, marginBottom: 12 }]}>
                  Disable within how many miles?
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {[1, 2, 3, 4, 5].map((miles) => (
                    <Pressable
                      key={miles}
                      onPress={() => setRadius(miles)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: radius === miles ? '#007AFF' : theme.colors.border,
                        backgroundColor: radius === miles ? '#E5F2FF' : theme.colors.bg,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={[
                        theme.type.body,
                        {
                          fontSize: 14,
                          fontWeight: radius === miles ? '600' : '400',
                          color: radius === miles ? '#007AFF' : theme.colors.text,
                        }
                      ]}>
                        {miles}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Action Buttons */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={handleCancel}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={[theme.type.body, { fontSize: 14 }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSave}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 8,
                      backgroundColor: '#007AFF',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={[theme.type.button, { fontSize: 14 }]}>Save</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        )}

        {/* Add Location Button */}
        {!isAdding && !isEditing && (
          <Pressable
            onPress={handleAddNew}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 14,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: '#007AFF',
              borderStyle: 'dashed',
              marginTop: zones.length > 0 ? 0 : 0,
            }}
          >
            <MaterialCommunityIcons name="plus" size={20} color="#007AFF" style={{ marginRight: 8 }} />
            <Text style={[theme.type.body, { color: '#007AFF', fontSize: 15 }]}>
              Add Location
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Unsaved Changes Modal */}
      <Modal
        visible={showUnsavedModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUnsavedModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={[theme.card, { width: '100%', maxWidth: 320, padding: 20 }]}>
            <Text style={[theme.type.h2, { marginBottom: 12, fontSize: 18, textAlign: 'center' }]}>
              Unsaved Changes
            </Text>
            <Text style={[theme.type.body, { marginBottom: 20, textAlign: 'center', fontSize: 14, color: theme.colors.muted }]}>
              You have unsaved changes. Do you want to save them before leaving?
            </Text>

            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => {
                  setShowUnsavedModal(false);
                  handleSave();
                  setTimeout(() => navigation.goBack(), 100);
                }}
                style={{
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: '#007AFF',
                  alignItems: 'center',
                }}
              >
                <Text style={[theme.type.button, { fontSize: 14 }]}>Save Changes</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setShowUnsavedModal(false);
                  handleCancel();
                  navigation.goBack();
                }}
                style={{
                  paddingVertical: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                }}
              >
                <Text style={[theme.type.body, { fontSize: 14, color: theme.colors.muted }]}>
                  Discard Changes
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setShowUnsavedModal(false)}
                style={{
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={[theme.type.body, { fontSize: 14, color: '#007AFF' }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={[theme.card, { width: '100%', maxWidth: 320, padding: 20 }]}>
            <Text style={[theme.type.h2, { marginBottom: 12, fontSize: 18, textAlign: 'center' }]}>
              Delete Privacy Zone
            </Text>
            <Text style={[theme.type.body, { marginBottom: 20, textAlign: 'center', fontSize: 14, color: theme.colors.muted }]}>
              Are you sure you want to remove this privacy zone?
            </Text>

            <View style={{ gap: 10 }}>
              <Pressable
                onPress={confirmDelete}
                style={{
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: '#FF6B6B',
                  alignItems: 'center',
                }}
              >
                <Text style={[theme.type.button, { fontSize: 14 }]}>Delete</Text>
              </Pressable>

              <Pressable
                onPress={cancelDelete}
                style={{
                  paddingVertical: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                }}
              >
                <Text style={[theme.type.body, { fontSize: 14 }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

