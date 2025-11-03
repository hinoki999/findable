import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Pressable, Modal, Animated, Alert, RefreshControl, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import TopBar from '../components/TopBar';
import { colors, card, type, radius, getTheme } from '../theme';
import { saveDevice } from '../services/api';
import { useDarkMode, useLinkNotifications, useToast, useSettings } from '../../App';
import { useBLEScanner, BleDevice } from '../components/BLEScanner';
import { DeviceCard } from '../components/DeviceCard';
import { useTutorial } from '../contexts/TutorialContext';
import TutorialOverlay from '../components/TutorialOverlay';
import NetworkBanner from '../components/NetworkBanner';

export default function DropScreen() {
  const [active, setActive] = useState<BleDevice|null>(null);
  const [incomingDrop, setIncomingDrop] = useState<{ name: string; text: string } | null>(null);
  const [bounceAnim] = useState(new Animated.Value(0));
  const [refreshing, setRefreshing] = useState(false);
  const { isDarkMode } = useDarkMode();
  const { addLinkNotification } = useLinkNotifications();
  const { showToast } = useToast();
  const { maxDistance } = useSettings();
  const theme = getTheme(isDarkMode);
  const { currentStep, totalSteps, isActive, nextStep, prevStep, skipTutorial, startScreenTutorial, currentScreen } = useTutorial();
  
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  // Start Drop screen tutorial when component mounts
  useEffect(() => {
    startScreenTutorial('Drop', 2);
  }, []);
  
  // Use BLE scanner hook
  const { devices, isScanning, startScan, stopScan, error } = useBLEScanner();
  
  // Filter devices based on max distance setting and sort by distance (closest first)
  const filteredDevices = devices
    .filter(device => device.distanceFeet <= maxDistance)
    .sort((a, b) => a.distanceFeet - b.distanceFeet);

  // Show error toast when BLE scanning fails
  useEffect(() => {
    if (error) {
      showToast({
        message: 'Oops! Something went wrong. Ensure your Bluetooth is on.',
        type: 'error',
        duration: 4000,
      });
    }
  }, [error]);

  // Auto-start scanning when Drop page loads
  useEffect(() => {
    startScan();
    return () => stopScan(); // Clean up when leaving page
  }, []);

  const handleDrop = async (device: BleDevice) => {
    try {
      await saveDevice({ 
        name: device.name, 
        rssi: device.rssi, 
        distanceFeet: device.distanceFeet, 
        action: 'dropped' 
      });
      setActive(null);
      showToast({
        message: `Drop sent to ${device.name}!`,
        type: 'success',
        duration: 3000,
      });
      
      // For testing: Simulate them linking back after 3 seconds
      setTimeout(async () => {
        // Generate a unique ID for both device and notification
        const uniqueId = Date.now();
        
        const linkData = {
          name: device.name,
          phoneNumber: '(555) 123-4567',
          email: `${device.name.toLowerCase().replace(' ', '.')}@example.com`,
          bio: 'This is a test bio for the linked contact.',
          socialMedia: [
            { platform: 'Instagram', handle: `@${device.name.toLowerCase().replace(' ', '')}` },
            { platform: 'Twitter', handle: `@${device.name.toLowerCase().replace(' ', '_')}` },
            { platform: 'LinkedIn', handle: device.name },
          ],
        };
        
        // Save to devices store with specific id
        await saveDevice({
          id: uniqueId,
          name: linkData.name,
          rssi: -55,
          distanceFeet: 18,
          action: 'returned',
          phoneNumber: linkData.phoneNumber,
          email: linkData.email,
          bio: linkData.bio,
          socialMedia: linkData.socialMedia,
        });
        
        // Add link notification with reference to the device id
        addLinkNotification({
          ...linkData,
          deviceId: uniqueId, // Link to the device in the store
        });
      }, 3000);
    } catch (error) {
      console.error('Failed to save device:', error);
      showToast({
        message: error instanceof Error ? error.message : 'Failed to save device',
        type: 'error',
        duration: 3000,
      });
    }
  };

  // Simulate receiving a drop (you can trigger this manually for testing)
  const simulateIncomingDrop = () => {
    const mockDrops = [
      { name: 'Sarah Chen', text: 'Wants to share their contact card.' },
      { name: 'Alex Rivera', text: 'Interested in networking.' },
      { name: 'Jordan Kim', text: 'Looking to connect professionally.' },
    ];
    const randomDrop = mockDrops[Math.floor(Math.random() * mockDrops.length)];
    setIncomingDrop(randomDrop);
    
    // Trigger bounce animation
    Animated.sequence([
      Animated.timing(bounceAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(bounceAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleIncomingAction = async (action: 'accepted' | 'returned' | 'declined') => {
    if (incomingDrop) {
      await saveDevice({ 
        name: incomingDrop.name, 
        rssi: -55, 
        distanceFeet: 18, 
        action 
      });
      setIncomingDrop(null);
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
      message: 'When people are nearby, they will appear here!',
      position: { top: screenHeight * 0.28, left: screenWidth * 0.3, right: screenWidth * 0.05 },
      arrow: 'down' as const,
    },
    {
      message: 'When you see someone, click their name to send a drop and share your contact card!',
      position: { top: screenHeight * 0.38 - 40, left: screenWidth * 0.05, right: screenWidth * 0.3 },
      arrow: 'down' as const,
    },
  ];

  return (
    <View style={{ flex:1, backgroundColor: theme.colors.bg }}>
      <TopBar logoMode={true} logoIcon="water-outline" />
      
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
              {incomingDrop.name} just sent you a drop
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
            alignItems: 'center', 
            justifyContent: 'center',
            paddingVertical: 80,
            paddingHorizontal: 40,
          }}>
            <Text style={[theme.type.h1, { 
              textAlign: 'center', 
              fontSize: 20,
              color: theme.colors.text,
            }]}>
              No DropLink users nearby
            </Text>
          </View>
        }
      />

      {/* Confirmation modal */}
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

      {/* Tutorial Overlay - Show for Drop screen */}
      {isActive && currentScreen === 'Drop' && currentStep > 0 && (
        <TutorialOverlay
          step={tutorialSteps[currentStep - 1]} // Map to Drop screen step index
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
