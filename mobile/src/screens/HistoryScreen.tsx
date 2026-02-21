import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, Modal, TextInput, RefreshControl, Dimensions, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getDevices, deleteDevice, restoreDevice, Device, getLinkedDrops, deleteDrop, Drop } from '../services/api';
import { colors, type, card, getTheme, shadow } from '../theme';
import { useDarkMode, usePinnedProfiles, useToast } from '../../App';
import { useAuth } from '../contexts/AuthContext';
import { useTutorial } from '../contexts/TutorialContext';
import TutorialOverlay from '../components/TutorialOverlay';
import NetworkBanner from '../components/NetworkBanner';
import TopBar from '../components/TopBar';

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
    '#FF6B4A', // Orange
    '#4A90FF', // Blue
    '#FF4A7F', // Pink
    '#4AFF8C', // Green
    '#FF4AE8', // Purple
    '#FFA84A', // Yellow
    '#4AFFEF', // Cyan
    '#A84AFF', // Violet
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export default function HistoryScreen() {
  const [data, setData] = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Drop | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Drop | null>(null);
  const lastDeletedItemRef = useRef<Drop | null>(null); // Using ref to avoid closure issues
  const { isDarkMode } = useDarkMode();
  const { pinnedIds, togglePin } = usePinnedProfiles();
  const { showToast } = useToast();
  const { userId } = useAuth();
  const theme = getTheme(isDarkMode);
  const { isActive, currentStep, totalSteps, currentScreen, startScreenTutorial, nextStep, prevStep, skipTutorial } = useTutorial();
  
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  // Start History screen tutorial when component mounts
  useEffect(() => {
    startScreenTutorial('History', 1);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Fetch linked drops from drops table (accepted/returned status)
        const drops = await getLinkedDrops();
        console.log('[DROPS] HISTORY: Fetched linked drops:', drops?.length);
        setData(drops);
        setErr(null);
      } catch (e:any) {
        console.error('[DROPS] ERROR: HISTORY: Failed to load drops:', e);
        // Don't show error toast - just log it
        console.log('[DROPS] WARNING: HISTORY: Error loading links (this is OK if user has no links yet)');
        setData([]);
        setErr(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleContactPress = (item: Drop) => {
    console.log('[DROPS] Opening contact card for:', item.senderName);
    console.log('[DROPS] Profile photo URL:', item.senderProfilePhoto || 'NULL');
    setSelectedContact(item);
    setShowContactModal(true);
  };

  const closeContactModal = () => {
    setShowContactModal(false);
    setSelectedContact(null);
  };

  const handleDeleteClick = (item: Drop) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (itemToDelete && itemToDelete.id) {
      // Store for undo using ref (synchronous)
      lastDeletedItemRef.current = itemToDelete;
      
      // Delete from drops table
      await deleteDrop(itemToDelete.id);
      // Remove from local state
      setData(prevData => prevData.filter(item => item.id !== itemToDelete.id));
      console.log('[DROPS] Drop deleted from history');
      
      // Show toast with undo (note: undo not fully implemented for drops yet)
      showToast({
        message: `${itemToDelete.senderName || 'Contact'} deleted`,
        type: 'success',
        duration: 4000,
      });
    }
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const handleUndoDelete = async () => {
    // Note: Undo for drops would require re-inserting the drop
    // For now, just log that undo is not supported
    console.log('[DROPS] Undo delete not yet implemented for drops table');
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const handleTogglePin = (item: Drop) => {
    if (!item.id) return;
    const isPinned = pinnedIds.has(item.id);
    togglePin(item.id);
    showToast({
      message: isPinned ? `Unpinned ${item.senderName || 'contact'}` : `Pinned ${item.senderName || 'contact'}`,
      type: 'success',
      duration: 2000,
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const drops = await getLinkedDrops();
      setData(drops);
      setErr(null);
      console.log('[DROPS] HISTORY: Refreshed, loaded', drops.length, 'linked drops');
    } catch (e: any) {
      console.error('[DROPS] ERROR: HISTORY: Failed to refresh drops:', e);
      console.log('[DROPS] WARNING: HISTORY: Refresh failed, keeping existing data');
      setErr(null);
    } finally {
      setRefreshing(false);
    }
  };

  // Filter data based on search query (using Drop fields)
  const filteredData = data.filter(item => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    const name = item.senderName?.toLowerCase() || '';
    const username = item.senderUsername?.toLowerCase() || '';
    const email = item.senderEmail?.toLowerCase() || '';
    const phone = item.senderPhone?.toLowerCase() || '';
    const bio = item.senderBio?.toLowerCase() || '';
    
    return name.includes(query) || 
           username.includes(query) ||
           email.includes(query) || 
           phone.includes(query) || 
           bio.includes(query);
  });

  // Sort filtered data: pinned items first, then by timestamp (newest first)
  const sortedData = [...filteredData].sort((a, b) => {
    // First sort by pinned status
    const aPinned = a.id ? pinnedIds.has(a.id) : false;
    const bPinned = b.id ? pinnedIds.has(b.id) : false;
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    
    // Then sort by respondedAt (when link was formed), then by createdAt
    const aTime = a.respondedAt?.getTime() || a.createdAt?.getTime() || 0;
    const bTime = b.respondedAt?.getTime() || b.createdAt?.getTime() || 0;
    return bTime - aTime;
  });

  // History screen tutorial steps
  const tutorialSteps = [
    {
      message: 'When you link with someone (have a mutual drop), you can view their contact here!',
      position: { 
        top: screenHeight * 0.35, 
        left: 30, 
        right: 30 
      },
    },
  ];

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <TopBar logoMode={true} logoIcon="link-variant" />
        <NetworkBanner isDarkMode={isDarkMode} />
        <View style={{ 
          flex: 1, 
          justifyContent: 'center', 
          alignItems: 'center',
          paddingHorizontal: 40,
        }}>
          {/* Smooth Loading Spinner */}
          <View style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: theme.colors.blueLight,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 24,
            shadowColor: theme.colors.blue,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 12,
            elevation: 8,
          }}>
            <ActivityIndicator size="large" color={theme.colors.blue} />
          </View>
          
          {/* Loading Text */}
          <Text style={[theme.type.h2, { 
            textAlign: 'center',
            marginBottom: 8,
            fontSize: 18,
            color: theme.colors.text,
          }]}>
            Loading your links
          </Text>
          <Text style={[theme.type.muted, { 
            textAlign: 'center',
            fontSize: 14,
            opacity: 0.7,
          }]}>
            Just a moment...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <TopBar logoMode={true} logoIcon="link-variant" />
      <NetworkBanner isDarkMode={isDarkMode} />
      <FlatList
        contentContainerStyle={{ paddingBottom: 16 }}
        data={sortedData}
        keyExtractor={(item, i) => String(item.id ?? i)}
        ListHeaderComponent={
          <>
            {/* Search Bar */}
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.colors.white,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}>
                <MaterialCommunityIcons 
                  name="magnify" 
                  size={20} 
                  color={theme.colors.muted} 
                />
                <TextInput
                  style={[
                    {
                      flex: 1,
                      marginLeft: 8,
                      fontSize: 14,
                      color: theme.colors.text,
                      fontFamily: 'Inter_400Regular',
                    },
                    // @ts-ignore - web-specific style
                    { outline: 'none' }
                  ]}
                  placeholder="Search links..."
                  placeholderTextColor={theme.colors.muted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  underlineColorAndroid="transparent"
                  selectionColor={theme.colors.blue}
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')}>
                    <MaterialCommunityIcons 
                      name="close-circle" 
                      size={18} 
                      color={theme.colors.muted} 
                    />
                  </Pressable>
                )}
              </View>
            </View>
            <View style={{ height: 8 }} />
          </>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.blue}
            colors={[theme.colors.blue]}
          />
        }
        renderItem={({ item }) => {
            const formatTimestamp = (timestamp?: Date | string) => {
              if (!timestamp) return 'Unknown time';
              const now = new Date();
              const timestampDate = timestamp instanceof Date ? timestamp : new Date(timestamp);
              const diffMs = now.getTime() - timestampDate.getTime();
              const diffMins = Math.floor(diffMs / (1000 * 60));
              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              
              if (diffMins < 1) return 'Just now';
              if (diffMins < 60) return `${diffMins}m ago`;
              if (diffHours < 24) return `${diffHours}h ago`;
              if (diffDays < 7) return `${diffDays}d ago`;
              
              return timestampDate.toLocaleDateString();
            };

                const getActionColor = (action?: string) => {
                  return '#FF6B4A'; // Strawberry Apricot Orange for all actions
                };

                        const getActionText = (action?: string) => {
                          switch (action) {
                            case 'sent': return 'Sent';
                            case 'pending': return 'Pending';
                            case 'accepted': return 'Accepted';
                            case 'returned': return 'Link';
                            case 'linked': return 'Linked';
                            case 'dropped': return 'Dropped';
                            case 'declined': return 'Declined';
                            default: return 'Unknown';
                          }
                        };

                        const getActionIcon = (action?: string) => {
                          if (action === 'returned' || action === 'linked') {
                            return <MaterialCommunityIcons name="link-variant" size={16} color="#FF6B4A" />;
                          }
                          if (action === 'sent') {
                            return <MaterialCommunityIcons name="send" size={16} color={theme.colors.muted} />;
                          }
                          return null;
                        };

            return (
              <Pressable 
                onPress={() => handleContactPress(item)}
                style={({ pressed }) => ({
                  ...theme.card,
                  marginHorizontal: 16,
                  marginBottom: 12,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {/* Avatar */}
                  <View style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: getAvatarColor(item.senderName || 'User'),
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                    overflow: 'hidden',
                  }}>
                    {item.senderProfilePhoto ? (
                      <Image source={{ uri: item.senderProfilePhoto }} style={{ width: 44, height: 44 }} />
                    ) : (
                      <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                        {getInitials(item.senderName || 'U')}
                      </Text>
                    )}
                  </View>
                  
                  {/* Name & Status */}
                  <View style={{ flex: 1 }}>
                    <Text style={[theme.type.h2, { color: '#FF6B4A' }]}>{item.senderName || 'User'}</Text>
                    {item.senderUsername && (
                      <Text style={[theme.type.muted, { fontSize: 12, marginTop: 1 }]}>@{item.senderUsername}</Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                      {getActionIcon(item.status)}
                      <Text style={[theme.type.muted, { fontSize: 11, marginLeft: 4 }]}>
                        {getActionText(item.status)} • {formatTimestamp(item.respondedAt || item.createdAt)}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Action Icons */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {/* Pin Icon */}
                    <Pressable 
                      onPress={(e) => {
                        e.stopPropagation();
                        handleTogglePin(item);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 6 }}
                    >
                      <MaterialCommunityIcons 
                        name={item.id && pinnedIds.has(item.id) ? "pin" : "pin-outline"}
                        size={18} 
                        color={item.id && pinnedIds.has(item.id) ? '#FF6B4A' : theme.colors.muted} 
                      />
                    </Pressable>
                    
                    {/* Delete Icon */}
                    <Pressable 
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(item);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 6 }}
                    >
                      <MaterialCommunityIcons 
                        name="trash-can-outline"
                        size={18} 
                        color={theme.colors.muted} 
                      />
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingHorizontal: 40, paddingVertical: 60 }}>
              {searchQuery.trim() ? (
                <>
                  <MaterialCommunityIcons name="magnify" size={48} color={theme.colors.muted} style={{ marginBottom: 12, opacity: 0.6 }} />
                  <Text style={[theme.type.h2, { marginBottom: 8, fontSize: 18, textAlign: 'center' }]}>No results found</Text>
                  <Text style={[theme.type.muted, { textAlign: 'center', fontSize: 14, lineHeight: 20 }]}>
                    Try searching with a different name, email, or phone number
                  </Text>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons 
                    name="link-variant-off" 
                    size={64} 
                    color={theme.colors.muted} 
                    style={{ marginBottom: 20, opacity: 0.6 }} 
                  />
                  <Text style={[theme.type.h1, { 
                    textAlign: 'center', 
                    marginBottom: 12, 
                    fontSize: 20,
                    color: theme.colors.text,
                  }]}>
                    No links made yet!
                  </Text>
                  <Text style={[theme.type.muted, { 
                    textAlign: 'center', 
                    fontSize: 15, 
                    lineHeight: 22,
                    opacity: 0.8,
                  }]}>
                    Keep making connections and your links will show up here
                  </Text>
                </>
              )}
            </View>
          }
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
              backgroundColor: '#FF6B4A',
              paddingVertical: 12,
              paddingHorizontal: 20,
              alignItems: 'center',
            }}>
              <Text style={[theme.type.h2, { color: theme.colors.white, fontSize: 16 }]}>
                {selectedContact?.senderName || selectedContact?.senderUsername || 'Contact'}
              </Text>
            </View>

            {/* ID Content */}
            <View style={{ padding: 20 }}>
              {/* Profile Picture */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <View style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: '#FFE5DC',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {selectedContact?.senderProfilePhoto ? (
                    <Image source={{ uri: selectedContact.senderProfilePhoto }} style={{ width: 60, height: 60 }} />
                  ) : (
                    <MaterialCommunityIcons name="account" size={30} color="#FF6B4A" />
                  )}
                </View>
              </View>

              {/* Contact Information */}
              <View style={{ marginBottom: 16 }}>
                {/* Phone */}
                {selectedContact?.senderPhone && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <MaterialCommunityIcons name="phone" size={16} color={theme.colors.muted} />
                    <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                      {selectedContact.senderPhone}
                    </Text>
                  </View>
                )}

                {/* Email */}
                {selectedContact?.senderEmail && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <MaterialCommunityIcons name="email" size={16} color={theme.colors.muted} />
                    <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                      {selectedContact.senderEmail}
                    </Text>
                  </View>
                )}

                {/* Social Media - Dynamic */}
                {selectedContact?.senderSocialMedia && selectedContact.senderSocialMedia.map((social, index) => (
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
              {selectedContact?.senderBio && (
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
                    "{selectedContact.senderBio}"
                  </Text>
                </View>
              )}

              {/* Close Button */}
              <Pressable
                onPress={closeContactModal}
                style={{
                  backgroundColor: '#FF6B4A',
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
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20
        }}>
          <View style={[theme.card, { width: '100%', maxWidth: 220, padding: 14 }]}>
            <Text style={[theme.type.h2, { fontSize: 15, textAlign: 'center', marginBottom: 6 }]}>
              Delete Contact
            </Text>
            <Text style={[theme.type.body, { fontSize: 12, textAlign: 'center', marginBottom: 14, color: theme.colors.muted }]}>
              Are you sure you want to delete this profile?
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={cancelDelete}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.bg,
                }}
              >
                <Text style={[theme.type.body, { fontSize: 12, textAlign: 'center', color: theme.colors.muted }]}>
                  Cancel
                </Text>
              </Pressable>

            <Pressable
              onPress={confirmDelete}
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 6,
                backgroundColor: '#FF6B4A',
              }}
            >
              <Text style={[theme.type.button, { fontSize: 12, textAlign: 'center' }]}>
                Yes, Delete
              </Text>
            </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Tutorial Overlay */}
      {isActive && currentScreen === 'History' && currentStep > 0 && (
        <TutorialOverlay
          step={tutorialSteps[currentStep - 1]}
          currentStepNumber={currentStep}
          totalSteps={totalSteps}
          onNext={nextStep}
          onBack={prevStep}
          onSkip={skipTutorial}
        />
      )}
    </View>
  );
}
