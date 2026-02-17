import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Pressable, Modal, Animated, Alert, RefreshControl, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import TopBar from '../components/TopBar';
import { colors, card, type, radius, getTheme } from '../theme';
import { sendDrop, updateDropStatus, Drop } from '../services/api';
import { useDarkMode, useLinkNotifications, useToast, useSettings, useUserProfile } from '../../App';
import { useTabNavigation } from '../contexts/TabNavigationContext';
import { useAuth } from '../contexts/AuthContext';
import { useBLEScanner, BleDevice } from '../components/BLEScanner';
import { DeviceCard } from '../components/DeviceCard';
import { useTutorial } from '../contexts/TutorialContext';
import TutorialOverlay from '../components/TutorialOverlay';
import NetworkBanner from '../components/NetworkBanner';
import { DROPLINK_SERVICE_UUID, DROPLINK_DEVICE_PREFIX } from '../config/bleConfig';

export default function DropScreen() {
  const [active, setActive] = useState<BleDevice|null>(null);
  const [incomingDrop, setIncomingDrop] = useState<Drop | null>(null);
  const [bounceAnim] = useState(new Animated.Value(0));
  const [refreshing, setRefreshing] = useState(false);
  const { isDarkMode } = useDarkMode();
  const { addLinkNotification } = useLinkNotifications();
  const { showToast } = useToast();
  const { maxDistance } = useSettings();
  const { userId } = useAuth();
  const { profile } = useUserProfile();
  const { navigateToTab } = useTabNavigation();
  const theme = getTheme(isDarkMode);
  const phoneVerified = profile?.phoneVerified || false;
  const { isActive, currentStep, totalSteps, currentScreen, startScreenTutorial, nextStep, prevStep, skipTutorial } = useTutorial();
  
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  // Start Drop screen tutorial when component mounts
  useEffect(() => {
    startScreenTutorial('Drop', 1);
  }, []);

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
      console.log('[DROPS] Sending drop to:', device.userId, device.username || device.name);
      
      // Send drop with current user's profile info
      await sendDrop(device.userId, {
        name: profile?.name || 'User',
        email: profile?.email,
        phone: profile?.phone,
        bio: profile?.bio,
        profilePhoto: profile?.profilePhoto,
        socialMedia: profile?.socialMedia,
      });
      
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
      
      {/* Phone Verification Banner - DISABLED (verification not required) */}
      {false && !phoneVerified ? (
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
            <Text style={[theme.type.muted, { fontSize: 12, marginBottom: 12 }]}>
              {isScanning ? 'Scanning for nearby devices...' : 'Scan completed'}
            </Text>
            <Text style={[theme.type.muted, { fontSize: 11, marginBottom: 12 }]}>
              Showing devices within {maxDistance} ft
            </Text>
            <NetworkBanner isDarkMode={isDarkMode} />
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
          <View style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 400,
            paddingHorizontal: 40,
          }}>
            <Text style={[theme.type.body, {
              textAlign: 'center',
              fontSize: 15,
              color: theme.colors.muted,
            }]}>
              No DropLink users nearby
            </Text>
          </View>
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
