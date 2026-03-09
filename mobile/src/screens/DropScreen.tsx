import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Pressable, Modal, Animated, Alert, RefreshControl, Dimensions, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import TopBar from '../components/TopBar';
import { colors, card, type, radius, getTheme, shadow } from '../theme';
import { sendDrop, updateDropStatus, getAcceptedDrops, deleteDrop, Drop } from '../services/api';
import { useDarkMode, useLinkNotifications, useToast, useSettings, useUserProfile, usePinnedProfiles } from '../../App';
import { useTabNavigation } from '../contexts/TabNavigationContext';
import { useAuth } from '../contexts/AuthContext';
import { useBLEScanner, BleDevice } from '../components/BLEScanner';
import { DeviceCard } from '../components/DeviceCard';
import { useTutorial } from '../contexts/TutorialContext';
import TutorialOverlay from '../components/TutorialOverlay';
import NetworkBanner from '../components/NetworkBanner';
import { DROPLINK_SERVICE_UUID, DROPLINK_DEVICE_PREFIX } from '../config/bleConfig';

// Verification whitelist - these users bypass all verification gates
const VERIFICATION_WHITELIST = {
  emails: ['caitie690@gmail.com'],
  phones: ['7344317582', '+17344317582', '17344317582'],
};

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
  const colorList = [
    '#FF6B4A', '#4A90FF', '#FF4A7F', '#4AFF8C',
    '#FF4AE8', '#FFA84A', '#4AFFEF', '#A84AFF',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colorList[Math.abs(hash) % colorList.length];
};

export default function DropScreen() {
  const [active, setActive] = useState<BleDevice|null>(null);
  const [incomingDrop, setIncomingDrop] = useState<Drop | null>(null);
  const [acceptedDrops, setAcceptedDrops] = useState<Drop[]>([]);
  const [bounceAnim] = useState(new Animated.Value(0));
  const [refreshing, setRefreshing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [dropToDelete, setDropToDelete] = useState<Drop | null>(null);
  const [selectedContact, setSelectedContact] = useState<Drop | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const { isDarkMode } = useDarkMode();
  const { addLinkNotification } = useLinkNotifications();
  const { showToast } = useToast();
  const { maxDistance } = useSettings();
  const { userId } = useAuth();
  const { profile } = useUserProfile();
  const { navigateToTab } = useTabNavigation();
  const { pinnedIds, togglePin } = usePinnedProfiles();
  const theme = getTheme(isDarkMode);
  const phoneVerified = profile?.phoneVerified || false;
  const phone = profile?.phone || '';
  const email = profile?.email || '';
  const { isActive, currentStep, totalSteps, currentScreen, startScreenTutorial, nextStep, prevStep, skipTutorial } = useTutorial();
  
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  // Start Drop screen tutorial when component mounts
  useEffect(() => {
    startScreenTutorial('Drop', 1);
  }, []);

  // Fetch accepted drops on mount
  useEffect(() => {
    fetchAcceptedDrops();
  }, []);

  const fetchAcceptedDrops = async () => {
    try {
      const drops = await getAcceptedDrops();
      setAcceptedDrops(drops);
    } catch (error) {
      console.error('[DROPS] Failed to fetch accepted drops:', error);
    }
  };

  const handleDeleteDrop = (drop: Drop) => {
    setDropToDelete(drop);
    setShowDeleteModal(true);
  };

  const handleContactPress = (drop: Drop) => {
    console.log('[DROPS] Opening contact card for:', drop.senderName);
    console.log('[DROPS] Profile photo URL:', drop.senderProfilePhoto || 'NULL');
    setSelectedContact(drop);
    setShowContactModal(true);
  };

  const closeContactModal = () => {
    setShowContactModal(false);
    setSelectedContact(null);
  };

  const formatTimeAgo = (timestamp?: Date): string => {
    if (!timestamp) return 'Recently';
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return timestamp.toLocaleDateString();
  };

  const handleTogglePin = (drop: Drop) => {
    if (!drop.id) return;
    const isPinned = pinnedIds.has(drop.id);
    togglePin(drop.id);
    showToast({
      message: isPinned ? `Unpinned ${drop.senderName || 'contact'}` : `Pinned ${drop.senderName || 'contact'}`,
      type: 'success',
      duration: 2000,
    });
  };

  // Sort accepted drops: pinned first, then by date
  const sortedAcceptedDrops = [...acceptedDrops].sort((a, b) => {
    const aPinned = a.id ? pinnedIds.has(a.id) : false;
    const bPinned = b.id ? pinnedIds.has(b.id) : false;
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    
    const aTime = a.createdAt?.getTime() || 0;
    const bTime = b.createdAt?.getTime() || 0;
    return bTime - aTime;
  });

  const confirmDeleteDrop = async () => {
    if (dropToDelete) {
      try {
        await deleteDrop(dropToDelete.id);
        setAcceptedDrops(prev => prev.filter(d => d.id !== dropToDelete.id));
        showToast({
          message: `Removed ${dropToDelete.senderName || 'drop'}`,
          type: 'success',
          duration: 2000,
        });
      } catch (error) {
        console.error('[DROPS] Failed to delete drop:', error);
        showToast({
          message: 'Failed to delete drop',
          type: 'error',
          duration: 3000,
        });
      }
    }
    setShowDeleteModal(false);
    setDropToDelete(null);
  };

  // Use BLE scanner hook
  const { devices, isScanning, startScan, stopScan, error } = useBLEScanner();
  
  // Filter to only show DropLink users (same filtering as HomeScreen)
  // Normalize UUID for comparison
  const normalizeUUID = (uuid: string): string => uuid.toLowerCase().replace(/-/g, '');
  const normalizedDropLinkUUID = normalizeUUID(DROPLINK_SERVICE_UUID);
  
  // First filter to only DropLink devices (by name prefix or Service UUID)
  const dropLinkDevices = devices.filter(device => {
    // Check if name starts with "DL-"
    if (device.name && device.name.startsWith(DROPLINK_DEVICE_PREFIX)) {
      return true;
    }
    // Check if has DropLink Service UUID
    if (device.serviceUUIDs && device.serviceUUIDs.length > 0) {
      const hasDropLinkService = device.serviceUUIDs.some(
        uuid => normalizeUUID(uuid) === normalizedDropLinkUUID
      );
      if (hasDropLinkService) {
        return true;
      }
    }
    return false;
  });
  
  // Then filter by max distance setting and sort by distance (closest first)
  const filteredDevices = dropLinkDevices
    .filter(device => device.distanceFeet <= maxDistance)
    .sort((a, b) => a.distanceFeet - b.distanceFeet);

  // Auto-start scanning when Drop page loads
  useEffect(() => {
    startScan();
    return () => stopScan(); // Clean up when leaving page
  }, []);

  const handleDrop = async (device: BleDevice) => {
    // Phone verification check disabled - users can drop without phone verification
    
    // Validate device has userId for sending drop
    if (!device.userId) {
      console.error('[DROPS] Cannot send drop - device has no userId');
      showToast({
        message: 'Cannot send drop - user not found',
        type: 'error',
        duration: 3000,
      });
      setActive(null);
      return;
    }
    
    try {
      console.log('[DROPS] Sending drop to:', device.userId, device.username || device.name, 'distance:', device.distanceFeet);
      
      // Send drop with current user's profile info and distance
      await sendDrop(device.userId, {
        name: profile?.name || 'User',
        email: profile?.email,
        phone: profile?.phone,
        bio: profile?.bio,
        profilePhoto: profile?.profilePhoto,
        socialMedia: profile?.socialMedia,
      }, device.distanceFeet);
      
      setActive(null);
      showToast({
        message: `Drop sent to ${device.username || device.name}!`,
        type: 'success',
        duration: 3000,
      });
      
      // Note: No more simulated return - real returns come from receiver's device
    } catch (error) {
      console.error('[DROPS] Failed to send drop:', error);
      showToast({
        message: error instanceof Error ? error.message : 'Failed to send drop',
        type: 'error',
        duration: 3000,
      });
    }
  };

  // Note: simulateIncomingDrop removed - use real drops from drops table now

  const handleIncomingAction = async (action: 'accepted' | 'returned' | 'declined') => {
    if (incomingDrop) {
      try {
        // Get current user's profile to share if returning
        const responseProfile = action === 'returned' ? {
          name: profile?.name,
          email: profile?.email,
          phone: profile?.phone,
          bio: profile?.bio,
          profilePhoto: profile?.profilePhoto,
          socialMedia: profile?.socialMedia,
        } : undefined;
        
        await updateDropStatus(incomingDrop.id, action, responseProfile);
      setIncomingDrop(null);
        
        if (action === 'returned') {
          showToast({
            message: `Linked with ${incomingDrop.senderName || 'User'}!`,
            type: 'success',
            duration: 3000,
          });
        }
      } catch (error) {
        console.error('[DROPS] Failed to respond to drop:', error);
        showToast({
          message: 'Failed to respond to drop. Please try again.',
          type: 'error',
          duration: 3000,
        });
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Refresh accepted drops
    await fetchAcceptedDrops();
    // Stop current scan and start a new one
    stopScan();
    await new Promise(resolve => setTimeout(resolve, 300)); // Brief pause
    startScan();
    setRefreshing(false);
  };

  // Drop screen tutorial steps
  const tutorialSteps = [
    {
      message: 'This page shows all nearby users within your 33 ft radius—tap their card to send a drop!',
      position: { 
        top: screenHeight * 0.35, 
        left: 30, 
        right: 30 
      },
    },
  ];

  return (
    <View style={{ flex:1, backgroundColor: theme.colors.bg }}>
      <TopBar logoMode={true} logoIcon="water-outline" />
      
      {/* Phone Verification Banner with whitelist bypass */}
      {!phoneVerified && !VERIFICATION_WHITELIST.phones.some(p => phone?.includes(p)) && !VERIFICATION_WHITELIST.emails.includes(email) ? (
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 40,
          paddingVertical: 60,
        }}>
          <MaterialCommunityIcons name="phone-outline" size={64} color={theme.colors.blue} style={{ marginBottom: 20 }} />
          <Text style={{
            fontSize: 18,
            fontFamily: 'Inter_600SemiBold',
            color: theme.colors.blue,
            textAlign: 'center',
            marginBottom: 12,
          }}>
            Verify your phone number to start sending and receiving drops!
          </Text>
          <Pressable
            onPress={() => {
              navigateToTab('Account');
            }}
            style={{
              marginTop: 20,
              paddingVertical: 12,
              paddingHorizontal: 24,
              backgroundColor: theme.colors.blue,
              borderRadius: 8,
            }}
          >
            <Text style={{
              fontSize: 15,
              fontFamily: 'Inter_600SemiBold',
              color: '#FFFFFF',
            }}>
              Verify Now
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
      {/* Floating Contact Card Notification */}
      {incomingDrop && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 60,
            right: 16,
            zIndex: 1000,
            transform: [{
              scale: bounceAnim.interpolate({
                inputRange: [0, 1],
               outputRange: [1, 1.1],
              }),
            }],
          }}
        >
          <View style={{
            backgroundColor: theme.colors.white,
            borderRadius: 12,
            padding: 12,
            minWidth: 200,
            maxWidth: 250,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <View style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.blue,
                marginRight: 8,
              }} />
              <Text style={[theme.type.h2, { fontSize: 14 }]}>New Drop</Text>
            </View>
            <Text style={[theme.type.body, { fontSize: 14, marginBottom: 8 }]}>
              {incomingDrop.senderName || incomingDrop.senderUsername || 'Someone'} just sent you a drop
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable
                onPress={() => handleIncomingAction('accepted')}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.blue,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                }}
              >
                <Text style={[theme.type.button, { fontSize: 12, textAlign: 'center' }]}>
                  Accept
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleIncomingAction('returned')}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.blue,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                }}
              >
                <Text style={[theme.type.button, { fontSize: 12, textAlign: 'center' }]}>
                  Return
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleIncomingAction('declined')}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.bg,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={[theme.type.body, { fontSize: 12, textAlign: 'center', color: theme.colors.muted }]}>
                  Decline
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}


      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom:80 }}
        ListHeaderComponent={
          <>
            <NetworkBanner isDarkMode={isDarkMode} />
            
            {/* Accepted Drops Section */}
            {sortedAcceptedDrops.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={[theme.type.h2, { fontSize: 16, marginBottom: 12, color: '#FF6B4A' }]}>
                  Your Accepted Drops
                </Text>
                {sortedAcceptedDrops.map((drop) => (
                  <Pressable 
                    key={drop.id}
                    onPress={() => handleContactPress(drop)}
                    style={({ pressed }) => ({
                      ...theme.card,
                      marginBottom: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    {/* Avatar */}
                    <View style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: getAvatarColor(drop.senderName || 'User'),
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                      overflow: 'hidden',
                    }}>
                      {drop.senderProfilePhoto ? (
                        <Image source={{ uri: drop.senderProfilePhoto }} style={{ width: 44, height: 44 }} />
                      ) : (
                        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                          {getInitials(drop.senderName || 'U')}
                        </Text>
                      )}
                    </View>
                    
                    {/* Info */}
                    <View style={{ flex: 1 }}>
                      <Text style={[theme.type.h2, { fontSize: 15 }]}>
                        {drop.senderName || drop.senderUsername || 'User'}
                      </Text>
                      {drop.senderUsername && (
                        <Text style={[theme.type.muted, { fontSize: 12 }]}>
                          @{drop.senderUsername}
                        </Text>
                      )}
                      <Text style={[theme.type.muted, { fontSize: 11, marginTop: 2 }]}>
                        Accepted {formatTimeAgo(drop.respondedAt || drop.createdAt)}
                      </Text>
                    </View>
                    
                    {/* Action Icons */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {/* Pin Icon */}
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          handleTogglePin(drop);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ padding: 6 }}
                      >
                        <MaterialCommunityIcons 
                          name={drop.id && pinnedIds.has(drop.id) ? "pin" : "pin-outline"}
                          size={18} 
                          color={drop.id && pinnedIds.has(drop.id) ? '#FF6B4A' : theme.colors.muted} 
                        />
                      </Pressable>
                      
                      {/* Delete Icon */}
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDeleteDrop(drop);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ padding: 6 }}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.colors.muted} />
                      </Pressable>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            
            {/* Nearby Users Section Header */}
            <Text style={[theme.type.h2, { fontSize: 16, marginBottom: 8, color: theme.colors.blue }]}>
              Nearby Users
            </Text>
            <Text style={[theme.type.muted, { fontSize: 12, marginBottom: 12 }]}>
              {isScanning ? 'Scanning for nearby devices...' : 'Scan completed'} • Within {maxDistance} ft
            </Text>
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
        data={filteredDevices}
        keyExtractor={(device) => device.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setActive(item)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <DeviceCard
              id={item.id}
              name={item.name}
              distanceFeet={item.distanceFeet}
              rssi={item.rssi}
              isDarkMode={isDarkMode}
            />
          </Pressable>
        )}
        ListEmptyComponent={
          acceptedDrops.length === 0 ? (
            <View style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 300,
              paddingHorizontal: 40,
            }}>
              <MaterialCommunityIcons name="account-search" size={48} color={theme.colors.muted} style={{ marginBottom: 12 }} />
              <Text style={[theme.type.body, {
                textAlign: 'center',
                fontSize: 15,
                color: theme.colors.muted,
              }]}>
                No DropLink users nearby
              </Text>
            </View>
          ) : null
        }
      />

      {/* Confirmation modal */}
        </>
      )}
      <Modal visible={!!active} transparent animationType="fade" onRequestClose={()=>setActive(null)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding:20 }}>
          <View style={{ ...theme.card, padding:24 }}>
            {/* Icon */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: theme.colors.blueLight,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}>
                <MaterialCommunityIcons 
                  name="account-arrow-right" 
                  size={28} 
                  color={theme.colors.blue} 
                />
              </View>
            </View>

            {/* Confirmation text */}
            <Text style={{ ...theme.type.h1, textAlign:'center', marginBottom:12, fontSize: 22 }}>
              Send drop to {active?.name}?
            </Text>
            <Text style={{ ...theme.type.body, textAlign:'center', marginBottom:8, color: theme.colors.muted }}>
              This will share your contact card with them
            </Text>
            <Text style={{ ...theme.type.muted, textAlign:'center', fontSize: 12 }}>
              {active?.distanceFeet.toFixed(1)} ft away
            </Text>

            {/* Action buttons */}
            <View style={{ marginTop:24, gap: 10 }}>
              <Pressable
                onPress={() => active && handleDrop(active)}
                style={({ pressed }) => ({
                  backgroundColor: theme.colors.blue,
                  paddingVertical:14,
                  borderRadius: radius.pill,
                  alignItems:'center',
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={theme.type.button}>Send Drop</Text>
              </Pressable>

              <Pressable 
                onPress={()=>setActive(null)} 
                style={({ pressed }) => ({
                  paddingVertical:14,
                  borderRadius: radius.pill,
                  alignItems:'center',
                  backgroundColor: theme.colors.bg,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ ...theme.type.body, color: theme.colors.muted }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
                  backgroundColor: selectedContact?.senderProfilePhoto ? 'transparent' : '#FFE5DC',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {selectedContact?.senderProfilePhoto ? (
                    <Image source={{ uri: selectedContact.senderProfilePhoto }} style={{ width: 60, height: 60 }} />
                  ) : (
                    <Text style={{ color: '#FF6B4A', fontSize: 22, fontWeight: '600' }}>
                      {getInitials(selectedContact?.senderName || 'U')}
                    </Text>
                  )}
                </View>
              </View>

              {/* Username */}
              {selectedContact?.senderUsername && (
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <Text style={[theme.type.muted, { fontSize: 14 }]}>
                    @{selectedContact.senderUsername}
                  </Text>
                </View>
              )}

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
        onRequestClose={() => setShowDeleteModal(false)}
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
              Delete Drop
            </Text>
            <Text style={[theme.type.body, { fontSize: 12, textAlign: 'center', marginBottom: 14, color: theme.colors.muted }]}>
              Remove this accepted drop?
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setShowDeleteModal(false)}
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
                onPress={confirmDeleteDrop}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 6,
                  backgroundColor: '#FF6B4A',
                }}
              >
                <Text style={[theme.type.button, { fontSize: 12, textAlign: 'center' }]}>
                  Delete
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Tutorial Overlay */}
      {isActive && currentScreen === 'Drop' && currentStep > 0 && (
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
