import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getDevices, Device } from '../services/api';
import { colors, type, card, getTheme, shadow } from '../theme';
import { useDarkMode, usePinnedProfiles } from '../../App';

export default function HistoryScreen() {
  const [data, setData] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Device | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Device | null>(null);
  const { isDarkMode } = useDarkMode();
  const { pinnedIds, togglePin } = usePinnedProfiles();
  const theme = getTheme(isDarkMode);

  useEffect(() => {
    (async () => {
      try {
        const items = await getDevices();
        // Filter out declined drops
        const filteredItems = (items ?? []).filter(item => item.action !== 'declined');
        setData(filteredItems);
      } catch (e:any) {
        setErr(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleContactPress = (item: Device) => {
    // Don't show contact card for declined drops
    if (item.action === 'declined') {
      return;
    }
    
    setSelectedContact(item);
    setShowContactModal(true);
  };

  const closeContactModal = () => {
    setShowContactModal(false);
    setSelectedContact(null);
  };

  const handleDeleteClick = (item: Device) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      setData(prevData => prevData.filter(item => item.id !== itemToDelete.id));
    }
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const handleTogglePin = (item: Device) => {
    if (!item.id) return;
    togglePin(item.id);
  };

  // Sort data: pinned items first, then by timestamp
  const sortedData = [...data].sort((a, b) => {
    const aPin = a.id && pinnedIds.has(a.id) ? 1 : 0;
    const bPin = b.id && pinnedIds.has(b.id) ? 1 : 0;
    
    if (aPin !== bPin) return bPin - aPin; // Pinned first
    
    // Then sort by timestamp (newest first)
    const aTime = a.timestamp?.getTime() || 0;
    const bTime = b.timestamp?.getTime() || 0;
    return bTime - aTime;
  });

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (err) return <Text style={{ margin: 16, color: 'crimson' }}>{err}</Text>;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ alignItems: 'center', paddingVertical: 8, paddingTop: 16 }}>
        <MaterialCommunityIcons
          name="link-variant"
          size={28}
          color="#34C759"
        />
      </View>
      <FlatList
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        data={sortedData}
        keyExtractor={(item, i) => String(item.id ?? i)}
          renderItem={({ item }) => {
            const formatTimestamp = (timestamp?: Date) => {
              if (!timestamp) return 'Unknown time';
              const now = new Date();
              const diffMs = now.getTime() - timestamp.getTime();
              const diffMins = Math.floor(diffMs / (1000 * 60));
              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              
              if (diffMins < 1) return 'Just now';
              if (diffMins < 60) return `${diffMins}m ago`;
              if (diffHours < 24) return `${diffHours}h ago`;
              if (diffDays < 7) return `${diffDays}d ago`;
              
              return timestamp.toLocaleDateString();
            };

                const getActionColor = (action?: string) => {
                  return '#34C759'; // Apple System Green for all actions
                };

                        const getActionText = (action?: string) => {
                          switch (action) {
                            case 'accepted': return 'Accepted';
                            case 'returned': return 'Link';
                            case 'dropped': return 'Dropped';
                            case 'declined': return 'Declined';
                            default: return 'Unknown';
                          }
                        };

                        const getActionIcon = (action?: string) => {
                          if (action === 'returned') {
                            return <MaterialCommunityIcons name="link-variant" size={16} color="#34C759" />;
                          }
                          return null;
                        };

            return (
              <Pressable 
                onPress={() => handleContactPress(item)}
                style={({ pressed }) => ({
                  ...theme.card,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[theme.type.h2, { color: '#34C759' }]}>{item.name}</Text>
                    <Text style={theme.type.muted}>RSSI: {item.rssi} • Distance: {item.distanceFeet} ft</Text>
                  <Pressable 
                    onPress={() => handleTogglePin(item)} 
                    style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}
                  >
                    <MaterialCommunityIcons 
                      name={item.id && pinnedIds.has(item.id) ? "pin" : "pin-outline"} 
                      size={11} 
                      color="#D0F0D0" 
                    />
                    <Text style={[theme.type.muted, { fontSize: 11, color: '#D0F0D0', marginLeft: 4 }]}>
                      {item.id && pinnedIds.has(item.id) ? 'Pinned' : 'Pin'}
                    </Text>
                  </Pressable>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {getActionIcon(item.action)}
                      <Text style={[theme.type.body, { color: getActionColor(item.action), fontWeight: '500' }]}>
                        {getActionText(item.action)}
                      </Text>
                    </View>
                    <Text style={[theme.type.muted, { fontSize: 12, marginTop: 2 }]}>
                      {formatTimestamp(item.timestamp)}
                    </Text>
                    <Pressable onPress={() => handleDeleteClick(item)} style={{ marginTop: 4 }}>
                      <Text style={[theme.type.muted, { fontSize: 11, color: '#D0F0D0' }]}>
                        Delete
                      </Text>
                    </Pressable>
                  </View>
          </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={theme.type.muted}>No activity yet. All drop activity will be displayed here.</Text>}
        />

      {/* Contact Card Modal */}
      <Modal
        visible={showContactModal}
        transparent={true}
        animationType="slide"
        onRequestClose={closeContactModal}
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
            ...shadow.lite,
          }}>
            {/* ID Header */}
            <View style={{
              backgroundColor: '#34C759',
              paddingVertical: 12,
              paddingHorizontal: 20,
              alignItems: 'center',
            }}>
              <Text style={[theme.type.h2, { color: theme.colors.white, fontSize: 16 }]}>
                CONTACT CARD
              </Text>
            </View>

            {/* ID Content */}
            <View style={{ padding: 20 }}>
              {/* Profile Picture and Name Row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <View style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: '#D1F2DB',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 16,
                  }}>
                    <MaterialCommunityIcons name="account" size={30} color="#34C759" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[theme.type.h2, { color: theme.colors.text, marginBottom: 4 }]}>
                    {selectedContact?.name}
                  </Text>
                  <Text style={[theme.type.muted, { fontSize: 12 }]}>
                    Digital Contact
                  </Text>
                </View>
              </View>

              {/* Contact Information */}
              <View style={{ marginBottom: 16 }}>
                {/* Phone */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <MaterialCommunityIcons name="phone" size={16} color={theme.colors.muted} />
                  <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                    +1 (555) 123-4567
                  </Text>
                </View>

                {/* Email */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <MaterialCommunityIcons name="email" size={16} color={theme.colors.muted} />
                  <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                    user@example.com
                  </Text>
                </View>

                {/* Social Media - Dynamic */}
                {[
                  { platform: 'Instagram', handle: '@yourhandle' },
                  { platform: 'Twitter', handle: '@yourhandle' },
                  { platform: 'LinkedIn', handle: 'yourname' },
                ].map((social, index) => (
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
                  "Passionate about connecting people through technology and meaningful conversations."
                </Text>
              </View>

              {/* Close Button */}
              <Pressable
                onPress={closeContactModal}
                style={{
                  backgroundColor: '#34C759',
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
          padding: 20
        }}>
          <View style={[theme.card, { width: '100%', maxWidth: 350, padding: 24 }]}>
            <Text style={[theme.type.h2, { textAlign: 'center', marginBottom: 16 }]}>
              Delete Contact
            </Text>
            <Text style={[theme.type.body, { textAlign: 'center', marginBottom: 24, color: theme.colors.muted }]}>
              Are you sure you want to delete this profile?
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={cancelDelete}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.bg,
                }}
              >
                <Text style={[theme.type.body, { textAlign: 'center', color: theme.colors.muted }]}>
                  Cancel
                </Text>
              </Pressable>

            <Pressable
              onPress={confirmDelete}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 8,
                backgroundColor: '#34C759',
              }}
            >
              <Text style={[theme.type.button, { textAlign: 'center', fontSize: 16 }]}>
                Yes, Delete
              </Text>
            </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
