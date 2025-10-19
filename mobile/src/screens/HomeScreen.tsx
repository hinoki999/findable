import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Animated, Pressable, Modal, ScrollView, PanResponder, RefreshControl, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useDarkMode, usePinnedProfiles, useUserProfile, useToast, useLinkNotifications, useSettings } from '../../App';
import { saveDevice, getDevices, deleteDevice, restoreDevice, Device } from '../services/api';
import LinkIcon from '../components/LinkIcon';
import { useTutorial } from '../contexts/TutorialContext';
import TutorialOverlay from '../components/TutorialOverlay';
import { useBLEScanner, BleDevice } from '../components/BLEScanner';

// Device Blip Component - extracted to avoid hooks in loops
const DeviceBlip: React.FC<{
  device: BleDevice;
  position: { x: number; y: number };
  onPress: () => void;
}> = ({ device, position, onPress }) => {
  // Create random delay based on device ID for staggered animation
  const randomDelay = useState(() => Math.random() * 2000)[0];
  const [pulseAnim] = useState(new Animated.Value(0));
  
  // Calculate pulse speed based on distance - closer = faster
  // Min duration: 800ms (closest), Max duration: 2000ms (farthest at 33ft)
  const pulseDuration = 800 + (device.distanceFeet / 33) * 1200;
  
  useEffect(() => {
    // Start with random delay
    setTimeout(() => {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: pulseDuration,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: pulseDuration,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
    }, randomDelay);
    
    return () => pulseAnim.stopAnimation();
  }, [pulseDuration]);
  
  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });
  
  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 0.95],
  });
  
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: [
          { translateX: position.x - 4 },
          { translateY: position.y - 34 },
        ],
        zIndex: 100,
      }}
    >
      <Animated.View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: '#00FF00',
          transform: [{ scale }],
          opacity,
          shadowColor: '#00FF00',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 4,
        }}
      />
    </Pressable>
  );
};

export default function HomeScreen() {
  const [fadeAnim] = useState(new Animated.Value(1));
  const [rippleAnim] = useState(new Animated.Value(0));
  const [flashAnim] = useState(new Animated.Value(0));
  const [showDrops, setShowDrops] = useState(false);
  const [selectedContactCard, setSelectedContactCard] = useState<any>(null);
  const [incomingDrops, setIncomingDrops] = useState<{ name: string; text: string }[]>([
    { name: 'Sarah Chen', text: 'just sent you a drop' },
    { name: 'Alex Rivera', text: 'just sent you a drop' },
  ]);
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [linkPopupAnim] = useState(new Animated.Value(0));
  const [popupKey, setPopupKey] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDiscoverable, setIsDiscoverable] = useState(true);
  const [pinnedProfiles, setPinnedProfiles] = useState<Device[]>([]);
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBlipDevice, setSelectedBlipDevice] = useState<BleDevice | null>(null);
  const [showBlipModal, setShowBlipModal] = useState(false);
  const { isDarkMode } = useDarkMode();
  const { pinnedIds, togglePin } = usePinnedProfiles();
  const { profile } = useUserProfile();
  const { showToast } = useToast();
  const { linkNotifications, dismissNotification, markAsViewed, addLinkNotification } = useLinkNotifications();
  const { currentStep, totalSteps, isActive, nextStep, prevStep, skipTutorial, startScreenTutorial, currentScreen } = useTutorial();
  const { maxDistance } = useSettings();
  const theme = getTheme(isDarkMode);
  
  // Use BLE scanner for nearby devices
  const { devices, isScanning, startScan, stopScan } = useBLEScanner();

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  // Start Home screen tutorial when component mounts
  useEffect(() => {
    startScreenTutorial('Home', 6);
  }, []);

  // Start BLE scanning when component mounts
  useEffect(() => {
    startScan();
    return () => stopScan(); // Cleanup on unmount
  }, []);
  
  // Get unviewed and not dismissed link notifications for badge
  const unviewedLinks = linkNotifications.filter(notif => !notif.viewed && !notif.dismissed);
  const hasUnviewedLinks = unviewedLinks.length > 0;

  // Tutorial steps for Home screen
  const tutorialSteps = [
    {
      message: 'Welcome to DropLink! This is your home screen.',
      position: {
        top: 80,
        left: 20,
        right: 20,
      },
      arrow: undefined,
    },
    {
      message: 'Toggle your visibility here. Active = discoverable, Ghost = invisible.',
      position: {
        top: 60,
        left: 20,
      },
      arrow: 'up' as const,
    },
    {
      message: 'Tap this to see incoming requests and link notifications.',
      position: {
        top: screenHeight * 0.54,
        left: screenWidth * 0.15,
        right: screenWidth * 0.15,
      },
      arrow: 'up' as const,
    },
    {
      message: 'Your pinned contacts appear here. Double-tap a card to manage.',
      position: {
        top: screenHeight * 0.2,
        left: screenWidth * 0.4,
      },
      arrow: 'left' as const,
    },
    {
      message: 'This is your contact card. Set up your info in the Account page!',
      position: {
        top: screenHeight * 0.35,
        right: screenWidth * 0.08,
      },
      arrow: 'down' as const,
    },
    {
      message: 'Swipe left to find nearby people and start dropping!',
      position: {
        bottom: 120,
        left: 20,
        right: 20,
      },
      arrow: 'right' as const,
    },
  ];

  // Filter devices within max distance
  const filteredDevices = devices.filter(device => device.distanceFeet <= maxDistance);

  // Map device to grid position
  const getGridPosition = (device: BleDevice) => {
    // Grid spans the screen, representing 33 feet radius
    // User is at center
    const gridSize = Math.min(screenWidth, screenHeight) * 0.9; // 90% of smaller dimension
    const maxFeet = 33;
    
    // Calculate distance ratio (0 to 1)
    const distanceRatio = Math.min(device.distanceFeet / maxFeet, 1);
    const pixelDistance = (distanceRatio * gridSize) / 2; // Half because radius
    
    // Generate consistent angle based on device name (pseudo-random but stable)
    const hash = device.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const angle = (hash % 360) * (Math.PI / 180);
    
    // Calculate x, y from center
    const x = Math.cos(angle) * pixelDistance;
    const y = Math.sin(angle) * pixelDistance;
    
    // Snap to nearest grid intersection (assume grid lines every 20 pixels)
    const gridSpacing = 20;
    const snappedX = Math.round(x / gridSpacing) * gridSpacing;
    const snappedY = Math.round(y / gridSpacing) * gridSpacing;
    
    return { x: snappedX, y: snappedY };
  };

  // Stack drag animation
  const dragOffset = useRef(new Animated.Value(0)).current;
  const [isDragging, setIsDragging] = useState(false);
  
  // Tap animations for each card (stored by profile ID)
  const tapScales = useRef<{ [key: number]: Animated.Value }>({}).current;

  // Quick action states
  const [activeQuickActionCardId, setActiveQuickActionCardId] = useState<number | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'unpin' | 'delete' | null>(null);
  const [confirmCardId, setConfirmCardId] = useState<number | null>(null);
  const [confirmCardName, setConfirmCardName] = useState<string>('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const lastTapTime = useRef<number>(0);
  const lastTapCardId = useRef<number | null>(null);
  
  // Toggle confirmation states
  const [showToggleConfirmModal, setShowToggleConfirmModal] = useState(false);
  const [pendingDiscoverableState, setPendingDiscoverableState] = useState<boolean | null>(null);
  
  // Undo state - using ref to avoid closure issues
  const lastActionRef = useRef<{ type: 'unpin' | 'delete', cardId: number, card: Device | null } | null>(null);

  // Load pinned profiles
  useEffect(() => {
    console.log('📌 useEffect triggered - pinnedIds changed, size:', pinnedIds.size);
    (async () => {
      const devices = await getDevices();
      console.log('📋 Got devices from API:', devices.length);
      const pinned = devices.filter(d => d.id && pinnedIds.has(d.id));
      console.log('📌 Filtered to pinned devices:', pinned.length, 'IDs:', Array.from(pinnedIds));
      setPinnedProfiles(pinned);
    })();
  }, [pinnedIds]);

  // Flashing animation for link badge
  useEffect(() => {
    if (hasUnviewedLinks) {
      // Start flashing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(flashAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(flashAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      flashAnim.setValue(0);
    }
  }, [hasUnviewedLinks]);

  // PanResponder for dragging the stack
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only activate for significant downward drags
        return Math.abs(gestureState.dy) > 10 && gestureState.dy > 0;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        // Capture movement if it's a clear downward drag
        return Math.abs(gestureState.dy) > 10 && gestureState.dy > 0;
      },
      onPanResponderGrant: () => {
        setIsDragging(true);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging down, limit to 200px max
        const newValue = Math.max(0, Math.min(gestureState.dy, 200));
        dragOffset.setValue(newValue);
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
        // Bounce back with spring animation
        Animated.spring(dragOffset, {
          toValue: 0,
          tension: 40,
          friction: 7,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const showLinkPopupAnimation = () => {
    console.log('Showing link popup animation');
    setPopupKey(prev => prev + 1);
    setShowLinkPopup(true);
    setIsAnimating(true);
    
    // Reset animation value
    linkPopupAnim.setValue(0);
    
    Animated.sequence([
      Animated.timing(linkPopupAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.delay(2500),
      Animated.timing(linkPopupAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowLinkPopup(false);
      setIsAnimating(false);
    });
  };

  const handleRaindropPress = () => {
    // Trigger ripple animation
    Animated.sequence([
      Animated.timing(rippleAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(rippleAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Show drops modal
    setShowDrops(true);
  };

  const handleDropAction = async (action: 'accepted' | 'returned' | 'declined', drop: { name: string; text: string }) => {
    console.log('Drop action:', action, 'for:', drop.name);
    
    // Show link popup for returned drops IMMEDIATELY
    if (action === 'returned') {
      showLinkPopupAnimation();
    }
    
    await saveDevice({ 
      name: drop.name, 
      rssi: -55, 
      distanceFeet: 18, 
      action 
    });
    
    // Remove the drop from the list
    setIncomingDrops(prev => prev.filter(d => d.name !== drop.name));
    
    // Close modal if no more drops
    if (incomingDrops.length <= 1) {
      setShowDrops(false);
    }
  };

  // Handle quick action button press (unpin or delete)
  const handleQuickActionPress = (action: 'unpin' | 'delete', cardId: number, cardName: string) => {
    console.log('Quick action pressed:', action, cardName);
    setConfirmAction(action);
    setConfirmCardId(cardId);
    setConfirmCardName(cardName);
    setShowConfirmModal(true);
    setActiveQuickActionCardId(null); // Hide action buttons
    console.log('Confirmation modal should now be visible');
  };

  // Handle confirmation
  const handleConfirmAction = async () => {
    console.log('=== handleConfirmAction called ===');
    
    if (!confirmCardId || !confirmAction || !confirmCardName) {
      console.log('EARLY RETURN - missing data');
      return;
    }

    const actionName = confirmCardName;
    const actionType = confirmAction;

    console.log('Performing action:', actionType, 'for', actionName);

    // Store the card for undo BEFORE performing the action
    const cardToStore = pinnedProfiles.find(p => p.id === confirmCardId) || null;
    console.log('💾 Storing card for undo:', cardToStore?.name, 'ID:', cardToStore?.id);
    
    const actionData = { type: actionType, cardId: confirmCardId, card: cardToStore };
    lastActionRef.current = actionData; // Store in ref synchronously
    console.log('💾 Ref updated with:', actionData);
    
    // Perform the action
    if (actionType === 'unpin') {
      togglePin(confirmCardId);
    } else if (actionType === 'delete') {
      // Delete from API/store (removes from Link page)
      await deleteDevice(confirmCardId);
      // Remove from pinned profiles (removes from Home page)
      setPinnedProfiles(prev => prev.filter(p => p.id !== confirmCardId));
      // Unpin
      togglePin(confirmCardId);
      console.log('🗑️ Device deleted from all locations');
    }

    // Close confirmation modal
    setShowConfirmModal(false);
    
    // Reset confirmation states
    setConfirmAction(null);
    setConfirmCardId(null);
    setConfirmCardName('');
    
    // Show toast with undo option
    showToast({
      message: `${actionName} ${actionType === 'unpin' ? 'unpinned' : 'deleted'}`,
      type: 'success',
      duration: 4000,
      actionLabel: 'UNDO',
      onAction: handleUndo,
    });
    console.log('✅ TOAST WITH UNDO SHOWN');
  };

  // Handle undo
  const handleUndo = async () => {
    const lastAction = lastActionRef.current; // Get current value from ref
    console.log('🔘 handleUndo CALLED! lastAction:', lastAction);
    
    if (!lastAction) {
      console.log('⚠️ No lastAction stored, cannot undo');
      return;
    }

    console.log('🔄 UNDOING action:', lastAction.type, 'for card ID:', lastAction.cardId);

    if (lastAction.type === 'unpin') {
      // Re-pin the contact
      togglePin(lastAction.cardId);
      console.log('✅ Contact re-pinned');
    } else if (lastAction.type === 'delete' && lastAction.card) {
      console.log('Starting restore process for:', lastAction.card.name);
      
      // Step 1: Restore to API/store first and wait for it
      await restoreDevice(lastAction.card);
      console.log('✅ Device restored to API/store');
      
      // Step 2: Re-add to pinnedProfiles immediately for instant UI feedback
      setPinnedProfiles(prev => {
        // Make sure it's not already there
        if (prev.some(p => p.id === lastAction.cardId)) {
          console.log('⚠️ Card already in pinnedProfiles');
          return prev;
        }
        console.log('✅ Adding card back to pinnedProfiles UI');
        return [...prev, lastAction.card!];
      });
      
      // Step 3: Re-pin to persist it (this will be saved in the context)
      togglePin(lastAction.cardId);
      console.log('✅ Pin toggled back on, ID added to pinnedIds');
    }

    lastActionRef.current = null; // Clear the ref
  };

  // Handle toggle button press
  const handleTogglePress = () => {
    const newState = !isDiscoverable;
    setPendingDiscoverableState(newState);
    setShowToggleConfirmModal(true);
  };

  // Confirm toggle change
  const confirmToggleChange = () => {
    if (pendingDiscoverableState !== null) {
      setIsDiscoverable(pendingDiscoverableState);
    }
    setShowToggleConfirmModal(false);
    setPendingDiscoverableState(null);
  };

  // Cancel toggle change
  const cancelToggleChange = () => {
    setShowToggleConfirmModal(false);
    setPendingDiscoverableState(null);
  };

  // Refresh handler
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const devices = await getDevices();
      const pinned = devices.filter(d => d.id && pinnedIds.has(d.id));
      setPinnedProfiles(pinned);
    } catch (error) {
      console.error('Failed to refresh pinned profiles:', error);
    } finally {
      setRefreshing(false);
    }
  };


  return (
    <Animated.View style={{ flex:1, backgroundColor: theme.colors.bg, opacity: fadeAnim }}>
      {/* Grid Paper Background - full screen */}
      <View style={{ 
        position: 'absolute', 
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
      }}>
        {/* Vertical lines */}
        {Array.from({ length: Math.ceil(typeof window !== 'undefined' ? window.innerWidth / 10 : 40) }, (_, i) => (
          <View
            key={`v-${i}`}
            style={{
              position: 'absolute',
              left: i * 10,
              top: 0,
              bottom: 0,
              width: 0.5,
              backgroundColor: '#00FF00',
              opacity: 0.3,
            }}
          />
        ))}
        {/* Horizontal lines */}
        {Array.from({ length: Math.ceil(typeof window !== 'undefined' ? window.innerHeight / 10 : 80) }, (_, i) => (
          <View
            key={`h-${i}`}
            style={{
              position: 'absolute',
              top: i * 10,
              left: 0,
              right: 0,
              height: 0.5,
              backgroundColor: '#00FF00',
              opacity: 0.3,
            }}
          />
        ))}

        {/* Pulsating Blips for Nearby Devices */}
        {filteredDevices.map((device) => {
          const position = getGridPosition(device);
          
          return (
            <DeviceBlip
              key={device.id || device.name}
              device={device}
              position={position}
              onPress={() => {
                setSelectedBlipDevice(device);
                setShowBlipModal(true);
              }}
            />
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.blue}
            colors={[theme.colors.blue]}
          />
        }
        scrollEnabled={false}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: typeof window !== 'undefined' ? window.innerHeight : 800 }}>
          {/* Background overlay to close expanded cards and quick actions when clicking outside */}
          {(expandedCardId !== null || activeQuickActionCardId !== null) && (
            <Pressable
              onPress={() => {
                setExpandedCardId(null);
                setActiveQuickActionCardId(null);
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 5,
              }}
            />
          )}

        {/* Pinned Profiles Stack - REMOVED */}
        {false && pinnedProfiles.length > 0 && (() => {
          // Calculate total height of the stack
          const cardHeight = 280; // Approximate full card height
          // Dynamic spacing: increase when dragging
          const baseSpacing = 45;
          const spacingMultiplier = isDragging ? 1.8 : 1;
          const stackSpacing = baseSpacing * spacingMultiplier;
          const totalStackHeight = cardHeight + ((pinnedProfiles.length - 1) * stackSpacing);
          
          return (
          <Animated.View 
            style={{
            position: 'absolute',
              left: '3%',
            top: '50%',
              transform: [
                { translateY: -240 },
                { translateY: dragOffset }
              ],
              width: 150,
            maxHeight: 600,
            zIndex: 10,
            }}
            {...panResponder.panHandlers}
          >
            <ScrollView 
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ minHeight: totalStackHeight }}
              scrollEnabled={!isDragging}
            >
              {pinnedProfiles.map((profile, index) => {
                const isExpanded = expandedCardId === profile.id;
                const isBottomCard = index === 0;
                // Reverse order: bottom card should be rendered last (highest in stack visually at bottom)
                const stackPosition = pinnedProfiles.length - 1 - index;
                
                // Parallax effect: cards deeper in stack move MORE to spread out
                const parallaxMultiplier = stackPosition * 0.5; // 50% more per position
                const parallaxOffset = dragOffset.interpolate({
                  inputRange: [0, 200],
                  outputRange: [0, 200 * parallaxMultiplier], // Positive to spread cards apart
                });

                // Get or create tap animation value for this card
                if (profile.id && !tapScales[profile.id]) {
                  tapScales[profile.id] = new Animated.Value(1);
                }
                const tapScale = profile.id ? tapScales[profile.id] : new Animated.Value(1);

                const handleTap = () => {
                  if (!profile.id) return;

                  const now = Date.now();
                  const timeSinceLastTap = now - lastTapTime.current;
                  const isDoubleTap = timeSinceLastTap < 800 && lastTapCardId.current === profile.id;

                  lastTapTime.current = now;
                  lastTapCardId.current = profile.id;

                  if (isDoubleTap) {
                    // Double tap - toggle quick actions
                    console.log('Double tap detected on:', profile.name);
                    setActiveQuickActionCardId(activeQuickActionCardId === profile.id ? null : profile.id);
                  } else {
                    // Single tap - pulse animation and expand (not collapse)
                    Animated.sequence([
                      Animated.timing(tapScale, {
                        toValue: 1.05,
                        duration: 100,
                        useNativeDriver: true,
                      }),
                      Animated.timing(tapScale, {
                        toValue: 1,
                        duration: 100,
                        useNativeDriver: true,
                      }),
                    ]).start();

                    // Hide quick actions when switching cards
                    if (activeQuickActionCardId !== null && activeQuickActionCardId !== profile.id) {
                      setActiveQuickActionCardId(null);
                    }

                    // Expand card - clicking on already expanded card keeps it expanded
                    // Clicking on different card switches the expanded card
                    if (!isBottomCard) {
                      setExpandedCardId(profile.id);
                    }
                  }
                };
                
                return (
                <Animated.View
                  key={profile.id}
                  style={{
                    position: 'absolute',
                    top: stackPosition * stackSpacing,
                    left: 0,
                    right: 0,
                    zIndex: activeQuickActionCardId === profile.id ? 1001 : (isExpanded ? 1000 : (pinnedProfiles.length - index)),
                    transform: [
                      { translateY: parallaxOffset },
                      { scale: tapScale }
                    ],
                  }}
                >
                  <Pressable
                    onPress={handleTap}
                    style={{
                      ...theme.card,
                      width: 150,
                      overflow: isExpanded || activeQuickActionCardId === profile.id || isDragging ? 'visible' : 'hidden',
                      zIndex: activeQuickActionCardId === profile.id ? 999 : 1,
                    }}
                  >
                    {/* ID Header - Always visible */}
                    <View style={{
                      backgroundColor: '#FF6B4A',
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      alignItems: 'center',
                    }}>
                      <Text style={[theme.type.h2, { color: theme.colors.white, fontSize: 12 }]}>
                        {profile.name}
                      </Text>
                    </View>

                    {/* ID Content - Show for bottom card, when expanded, or when dragging */}
                    {(isBottomCard || isExpanded || isDragging) && (
                    <View style={{ paddingTop: 10, paddingHorizontal: 10, paddingBottom: 4 }}>
                      {/* Profile Picture */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                        <View style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: '#FFE5DC',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <MaterialCommunityIcons name="account" size={18} color="#FF6B4A" />
                        </View>
                      </View>

                      {/* Contact Information */}
                      <View style={{ marginBottom: 6 }}>
                        {/* Phone */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                          <MaterialCommunityIcons name="phone" size={10} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 4, color: theme.colors.text, fontSize: 8 }]}>
                            +1 (555) 123-4567
                          </Text>
                        </View>

                        {/* Email */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                          <MaterialCommunityIcons name="email" size={10} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 4, color: theme.colors.text, fontSize: 8 }]}>
                            user@example.com
                          </Text>
                        </View>

                        {/* Social Media */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                          <MaterialCommunityIcons name="instagram" size={10} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 4, color: theme.colors.text, fontSize: 8 }]}>
                            @yourhandle
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                          <MaterialCommunityIcons name="twitter" size={10} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 4, color: theme.colors.text, fontSize: 8 }]}>
                            @yourhandle
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                          <MaterialCommunityIcons name="linkedin" size={10} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 4, color: theme.colors.text, fontSize: 8 }]}>
                            yourname
                          </Text>
                        </View>
                      </View>

                      {/* Bio Section */}
                      <View style={{
                        backgroundColor: theme.colors.bg,
                        padding: 6,
                        borderRadius: 6,
                      }}>
                        <Text style={[theme.type.muted, { fontSize: 6, marginBottom: 1 }]}>
                          BIO
                        </Text>
                        <Text style={[theme.type.body, { fontSize: 7, color: theme.colors.text }]}>
                          "Optional bio line goes here."
                        </Text>
                      </View>
                      </View>
                    )}
                  </Pressable>

                  {/* Quick Action Buttons (shown on double-tap) - Always accessible */}
                  {activeQuickActionCardId === profile.id && (
                    <View style={{
                      flexDirection: 'row',
                      gap: 8,
                      paddingHorizontal: 10,
                      paddingTop: 4,
                      paddingBottom: 10,
                      backgroundColor: theme.colors.white,
                      borderBottomLeftRadius: 12,
                      borderBottomRightRadius: 12,
                      width: 150,
                    }}>
                      <Pressable
                        onPress={() => profile.id && handleQuickActionPress('unpin', profile.id, profile.name)}
                        style={{
                          flex: 1,
                          backgroundColor: '#FFB89D',
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MaterialCommunityIcons name="pin-off" size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 10, marginLeft: 4, fontWeight: '600' }}>
                          Unpin
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => profile.id && handleQuickActionPress('delete', profile.id, profile.name)}
                        style={{
                          flex: 1,
                          backgroundColor: '#FF6B4A',
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MaterialCommunityIcons name="delete" size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 10, marginLeft: 4, fontWeight: '600' }}>
                          Delete
                        </Text>
                  </Pressable>
                </View>
                  )}
                </Animated.View>
                );
              })}
            </ScrollView>
          </Animated.View>
          );
        })()}

        {/* Central Raindrop Logo with Ripple - exactly centered above nav bar */}
        <View style={{ 
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: [{ translateX: -15 }, { translateY: -50 }],
          zIndex: 10,
        }}>
          <Pressable onPress={handleRaindropPress} style={{ alignItems: 'center', position: 'relative' }}>
            {/* Ripple Effect */}
            <Animated.View
              style={{
                position: 'absolute',
                width: 60,
                height: 60,
                borderRadius: 30,
                borderWidth: 2,
                borderColor: '#007AFF',
                opacity: rippleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.3],
                }),
                transform: [{
                  scale: rippleAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 1.2],
                  }),
                }],
              }}
            />
            
            <View style={{ position: 'relative' }}>
              <MaterialCommunityIcons name="water" size={30} color="#007AFF" />
              
              {/* Link notification badge */}
              {hasUnviewedLinks && (
                <Animated.View
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -6,
                    opacity: flashAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 1],
                    }),
                  }}
                >
                  <MaterialCommunityIcons 
                    name="link-variant" 
                    size={14} 
                    color="#FF6B4A" 
                  />
                </Animated.View>
              )}
            </View>
          </Pressable>
        </View>
        </View>
      </ScrollView>

      {/* Discoverability Toggle - Top Left Corner */}
      <View style={{ 
        position: 'absolute',
        top: 20,
        left: 20,
        zIndex: 200,
      }}>
        <View style={{ position: 'relative' }}>
          <Pressable onPress={handleTogglePress}>
            <View style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              backgroundColor: isDiscoverable ? '#FFE5DC' : '#F0F0F0',
              padding: 2,
              justifyContent: 'center',
            }}>
              <View style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: isDiscoverable ? '#FF6B4A' : '#FFFFFF',
                transform: [{ translateX: isDiscoverable ? 18 : 0 }],
              }} />
            </View>
          </Pressable>
          <View style={{ 
            position: 'absolute', 
            top: 24, 
            left: isDiscoverable ? 18 : 0,
            alignItems: 'center',
            width: 18,
          }}>
            {isDiscoverable ? (
              <MaterialCommunityIcons name="flash-outline" size={14} color="#FF6B4A" />
            ) : (
              <MaterialCommunityIcons name="ghost-outline" size={14} color="#8E8E93" />
            )}
          </View>
        </View>
      </View>

      {/* Link Popup Animation */}
      {showLinkPopup && (
        <Animated.View
          key={popupKey}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
        >
          <Animated.View
            style={{
              transform: [
                {
                  scale: linkPopupAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 1.2],
                  }),
                },
              ],
              opacity: linkPopupAnim,
            }}
          >
          <View style={{
            backgroundColor: theme.colors.white,
            borderRadius: 20,
            padding: 16,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
            borderWidth: 2,
            borderColor: '#FF6B4A',
          }}>
            <LinkIcon size={32} />
            <Text style={[theme.type.h2, { marginTop: 8, color: '#FF6B4A' }]}>
              Link Created!
            </Text>
          </View>
          </Animated.View>
        </Animated.View>
      )}

      {/* Drops Modal */}
      <Modal
        visible={showDrops}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDrops(false)}
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
            padding: 20,
            width: '100%',
            maxWidth: 400,
            maxHeight: '80%',
          }}>
            <Text style={[theme.type.h1, { marginBottom: 16, textAlign: 'center' }]}>
              Your Drops
            </Text>
            
            <ScrollView style={{ maxHeight: 500 }}>
              {/* Link Notifications Section */}
              {unviewedLinks.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <LinkIcon size={16} />
                    <Text style={[theme.type.h2, { marginLeft: 6, fontSize: 14, color: '#FF6B4A' }]}>
                      Links
                    </Text>
                  </View>
                  {unviewedLinks.map((linkNotif) => (
                    <View
                      key={linkNotif.id}
                      style={{
                        backgroundColor: theme.colors.blueLight,
                        borderRadius: 12,
                        padding: 14,
                        marginBottom: 10,
                        borderLeftWidth: 4,
                        borderLeftColor: theme.colors.blue,
                      }}
                    >
                      {/* Close button */}
                      <Pressable
                        onPress={() => dismissNotification(linkNotif.id)}
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          padding: 4,
                        }}
                      >
                        <MaterialCommunityIcons name="close" size={16} color="#666" />
                      </Pressable>

                      {/* Content */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                        <MaterialCommunityIcons 
                          name="link-variant" 
                          size={20} 
                          color={theme.colors.blue} 
                          style={{ marginRight: 10 }}
                        />
                        <View style={{ flex: 1, paddingRight: 20 }}>
                          <Text style={[theme.type.h2, { fontSize: 14, color: '#FF6B4A' }]}>
                            You linked with {linkNotif.name}!
                          </Text>
                        </View>
                      </View>

                      {/* View Contact Card button */}
                      <Pressable
                        onPress={() => {
                          setSelectedContactCard(linkNotif);
                        }}
                        style={({ pressed }) => ({
                          backgroundColor: '#FF6B4A',
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 20,
                          alignItems: 'center',
                          opacity: pressed ? 0.9 : 1,
                        })}
                      >
                        <Text style={[theme.type.button, { fontSize: 12, color: '#000000' }]}>
                          View Contact Card
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {/* Incoming Drops Section */}
              {incomingDrops.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={[theme.type.h2, { marginBottom: 12, fontSize: 14, color: '#007AFF' }]}>
                    💧 Incoming Drops
                  </Text>
                </View>
              )}
            
              {incomingDrops.length === 0 && unviewedLinks.length === 0 ? (
                <Text style={[theme.type.muted, { textAlign: 'center', marginVertical: 20 }]}>
                  No drops or links yet
                </Text>
              ) : (
                incomingDrops.map((drop, index) => (
                <View key={index} style={{
                  backgroundColor: theme.colors.bg,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}>
                  <Text style={[theme.type.h2, { marginBottom: 4 }]}>
                    {drop.name} just sent you a drop
                  </Text>
                  
                  <View style={{ 
                    flexDirection: 'row', 
                    gap: 8, 
                    marginTop: 12 
                  }}>
                    <Pressable
                      onPress={() => handleDropAction('accepted', drop)}
                      style={{
                        flex: 1,
                        backgroundColor: theme.colors.blue,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={[theme.type.button, { fontSize: 12, textAlign: 'center' }]}>
                        Accept
                      </Text>
              </Pressable>
                    <Pressable
                      onPress={() => handleDropAction('returned', drop)}
                      style={{
                        flex: 1,
                        backgroundColor: theme.colors.blue,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={[theme.type.button, { fontSize: 12, textAlign: 'center' }]}>
                        Return
                      </Text>
              </Pressable>
                    <Pressable
                      onPress={() => handleDropAction('declined', drop)}
                      style={{
                        flex: 1,
                        backgroundColor: theme.colors.bg,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
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
              ))
            )}
            </ScrollView>
            
            <Pressable
              onPress={() => setShowDrops(false)}
              style={{
                backgroundColor: theme.colors.bg,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 8,
                marginTop: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={[theme.type.body, { textAlign: 'center', color: theme.colors.muted }]}>
                Close
              </Text>
            </Pressable>
      </View>
    </View>
      </Modal>

      {/* Contact Card Modal */}
      <Modal 
        visible={!!selectedContactCard} 
        transparent 
        animationType="fade" 
        onRequestClose={() => {
          if (selectedContactCard?.id) {
            markAsViewed(selectedContactCard.id);
          }
          setSelectedContactCard(null);
          setShowDrops(false);
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ 
            backgroundColor: theme.colors.white,
            borderRadius: 16,
            padding: 20,
            width: '100%',
            maxWidth: 340,
            borderWidth: 2,
            borderColor: '#FF6B4A',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 8,
          }}>
            {/* Header */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: '#FFE5DC',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}>
                <MaterialCommunityIcons 
                  name="account" 
                  size={32} 
                  color="#FF6B4A" 
                />
              </View>
              <Text style={[theme.type.h1, { fontSize: 20, marginBottom: 2, color: '#FF6B4A' }]}>
                {selectedContactCard?.name}
              </Text>
            </View>

            {/* Contact Information */}
            <View style={{ marginBottom: 16 }}>
              {selectedContactCard?.phoneNumber && (
                <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="phone" size={16} color="#FF6B4A" style={{ marginRight: 8 }} />
                  <Text style={[theme.type.body, { fontSize: 14 }]}>
                    {selectedContactCard.phoneNumber}
                  </Text>
                </View>
              )}
              
              {selectedContactCard?.email && (
                <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="email" size={16} color="#FF6B4A" style={{ marginRight: 8 }} />
                  <Text style={[theme.type.body, { fontSize: 14 }]}>
                    {selectedContactCard.email}
                  </Text>
                </View>
              )}

              {/* Social Media */}
              {selectedContactCard?.socialMedia && selectedContactCard.socialMedia.length > 0 && (
                <View style={{ marginTop: 4, marginBottom: 8 }}>
                  {selectedContactCard.socialMedia.map((social: any, index: number) => (
                    <View key={index} style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialCommunityIcons 
                        name={
                          social.platform.toLowerCase().includes('instagram') ? 'instagram' :
                          social.platform.toLowerCase().includes('twitter') || social.platform.toLowerCase().includes('x') ? 'twitter' :
                          social.platform.toLowerCase().includes('linkedin') ? 'linkedin' :
                          social.platform.toLowerCase().includes('facebook') ? 'facebook' :
                          'web'
                        } 
                        size={16} 
                        color="#FF6B4A" 
                        style={{ marginRight: 8 }}
                      />
                      <Text style={[theme.type.body, { fontSize: 14 }]}>
                        {social.handle}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              
              {selectedContactCard?.bio && (
                <View style={{ 
                  marginTop: 8,
                  padding: 10,
                  backgroundColor: '#FFF5F2',
                  borderRadius: 8,
                }}>
                  <Text style={[theme.type.body, { fontSize: 13, color: theme.colors.text, fontStyle: 'italic' }]}>
                    "{selectedContactCard.bio}"
                  </Text>
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View style={{ gap: 8 }}>
              {/* Pin Button */}
              <Pressable
                onPress={async () => {
                  const deviceId = selectedContactCard?.deviceId || selectedContactCard?.id;
                  if (deviceId) {
                    // Device should already be in store from link notification creation
                    // Just toggle the pin
                    togglePin(deviceId);
                    markAsViewed(selectedContactCard.id);
                    console.log(`✅ Contact ${selectedContactCard.name} ${pinnedIds.has(deviceId) ? 'unpinned' : 'pinned'}`);
                  }
                }}
                style={({ pressed }) => ({
                  backgroundColor: pinnedIds.has(selectedContactCard?.deviceId || selectedContactCard?.id) ? '#FFE5DC' : '#FF6B4A',
                  paddingVertical: 10,
                  borderRadius: 20,
                  alignItems: 'center',
                  opacity: pressed ? 0.9 : 1,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 6,
                })}
              >
                <MaterialCommunityIcons 
                  name={pinnedIds.has(selectedContactCard?.deviceId || selectedContactCard?.id) ? "pin-off" : "pin"} 
                  size={16} 
                  color={pinnedIds.has(selectedContactCard?.deviceId || selectedContactCard?.id) ? '#FF6B4A' : '#FFFFFF'}
                />
                <Text style={{ 
                  fontSize: 14,
                  fontWeight: '600',
                  color: pinnedIds.has(selectedContactCard?.deviceId || selectedContactCard?.id) ? '#FF6B4A' : '#FFFFFF'
                }}>
                  {pinnedIds.has(selectedContactCard?.deviceId || selectedContactCard?.id) ? 'Unpin' : 'Pin Contact'}
                </Text>
              </Pressable>

              {/* Close Button */}
              <Pressable
                onPress={() => {
                  if (selectedContactCard?.id) {
                    markAsViewed(selectedContactCard.id);
                  }
                  setSelectedContactCard(null);
                  setShowDrops(false);
                }}
                style={({ pressed }) => ({
                  paddingVertical: 10,
                  borderRadius: 20,
                  alignItems: 'center',
                  backgroundColor: theme.colors.bg,
                  borderWidth: 1,
                  borderColor: '#FF6B4A',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#FF6B4A' }}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Blip Device Modal - Execute Drop */}
      <Modal
        visible={showBlipModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBlipModal(false)}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.6)', 
          justifyContent: 'center', 
          alignItems: 'center', 
          padding: 20 
        }}>
          <View style={{
            backgroundColor: theme.colors.white,
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 300,
            borderWidth: 2,
            borderColor: '#00FF00',
            shadowColor: '#00FF00',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 10,
          }}>
            {/* Header */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: '#E5FFE5',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}>
                <MaterialCommunityIcons 
                  name="account-circle" 
                  size={32} 
                  color="#00FF00" 
                />
              </View>
              <Text style={[theme.type.h1, { fontSize: 18, marginBottom: 4, color: theme.colors.text }]}>
                {selectedBlipDevice?.name}
              </Text>
              <Text style={[theme.type.muted, { fontSize: 12 }]}>
                {selectedBlipDevice?.distanceFeet.toFixed(1)} ft away
              </Text>
            </View>

            {/* Message */}
            <Text style={[theme.type.body, { textAlign: 'center', marginBottom: 24, color: theme.colors.text }]}>
              Send your contact card to {selectedBlipDevice?.name}?
            </Text>

            {/* Action Buttons */}
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={async () => {
                  if (selectedBlipDevice) {
                    await saveDevice({ 
                      name: selectedBlipDevice.name, 
                      rssi: selectedBlipDevice.rssi, 
                      distanceFeet: selectedBlipDevice.distanceFeet, 
                      action: 'dropped' 
                    });
                    setShowBlipModal(false);
                    showToast({
                      message: `Drop sent to ${selectedBlipDevice.name}!`,
                      type: 'success',
                      duration: 3000,
                    });
                    
                    // Simulate link back after 3 seconds
                    setTimeout(async () => {
                      const uniqueId = Date.now();
                      const linkData = {
                        name: selectedBlipDevice.name,
                        phoneNumber: '(555) 123-4567',
                        email: `${selectedBlipDevice.name.toLowerCase().replace(' ', '.')}@example.com`,
                        bio: 'This is a test bio for the linked contact.',
                        socialMedia: [
                          { platform: 'Instagram', handle: `@${selectedBlipDevice.name.toLowerCase().replace(' ', '')}` },
                        ],
                      };
                      
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
                      
                      addLinkNotification({
                        deviceId: uniqueId,
                        name: linkData.name,
                        phoneNumber: linkData.phoneNumber,
                        email: linkData.email,
                        bio: linkData.bio,
                        socialMedia: linkData.socialMedia,
                      });
                    }, 3000);
                  }
                }}
                style={({ pressed }) => ({
                  backgroundColor: '#FFEB99',
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>
                  Send Drop
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setShowBlipModal(false)}
                style={({ pressed }) => ({
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: theme.colors.muted }}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.6)', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: 20,
          zIndex: 9999,
        }}>
          <View style={{
            backgroundColor: isDarkMode ? '#2C2C2E' : '#FFFFFF',
            borderRadius: 10,
            padding: 14,
            width: '100%',
            maxWidth: 220,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 12,
          }}>
            <MaterialCommunityIcons 
              name={confirmAction === 'unpin' ? 'pin-off' : 'delete'} 
              size={28} 
              color="#FF6B4A" 
              style={{ marginBottom: 8 }}
            />
            <Text style={[theme.type.h2, { fontSize: 15, marginBottom: 5, textAlign: 'center', color: theme.colors.text }]}>
              {confirmAction === 'unpin' ? 'Unpin Contact?' : 'Delete Contact?'}
            </Text>
            <Text style={[theme.type.body, { fontSize: 12, textAlign: 'center', marginBottom: 14, color: theme.colors.text }]}>
              Are you sure you want to {confirmAction} "{confirmCardName}"?
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
              <Pressable
                onPress={() => {
                  console.log('Cancel pressed');
                  setShowConfirmModal(false);
                }}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.bg,
                  paddingVertical: 8,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={[theme.type.body, { fontSize: 12, textAlign: 'center', color: theme.colors.text, fontWeight: '600' }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  console.log('Confirm pressed');
                  handleConfirmAction();
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#FF6B4A',
                  paddingVertical: 8,
                  borderRadius: 6,
                }}
              >
                <Text style={[theme.type.button, { fontSize: 12, textAlign: 'center', color: '#FFFFFF', fontWeight: '600' }]}>
                  Confirm
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* SUCCESS MODAL - Separate from confirmation */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.6)', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            backgroundColor: isDarkMode ? '#2C2C2E' : '#FFFFFF',
            borderRadius: 10,
            padding: 16,
            width: '100%',
            maxWidth: 220,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 12,
          }}>
            <MaterialCommunityIcons 
              name="check-circle" 
              size={36} 
              color="#4CAF50" 
              style={{ marginBottom: 8 }}
            />
            <Text style={[theme.type.h2, { fontSize: 15, marginBottom: 5, textAlign: 'center', color: theme.colors.text }]}>
              Success!
            </Text>
            <Text style={[theme.type.body, { textAlign: 'center', color: theme.colors.text, fontSize: 12 }]}>
              {successMessage}
            </Text>
          </View>
        </View>
      </Modal>

      {/* Toggle Confirmation Modal */}
      <Modal
        visible={showToggleConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelToggleChange}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.6)', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            backgroundColor: isDarkMode ? '#2C2C2E' : '#FFFFFF',
            borderRadius: 10,
            padding: 14,
            width: '100%',
            maxWidth: 240,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 12,
          }}>
            <MaterialCommunityIcons 
              name={pendingDiscoverableState ? 'flash' : 'ghost'} 
              size={28} 
              color={pendingDiscoverableState ? '#FF6B4A' : '#8E8E93'} 
              style={{ marginBottom: 8 }}
            />
            <Text style={[theme.type.h2, { fontSize: 15, marginBottom: 5, textAlign: 'center', color: theme.colors.text }]}>
              {pendingDiscoverableState ? 'Go Active?' : 'Go Ghost Mode?'}
            </Text>
            <Text style={[theme.type.body, { fontSize: 11, textAlign: 'center', marginBottom: 14, color: theme.colors.text }]}>
              {pendingDiscoverableState 
                ? 'Other users will be able to discover and drop their contact with you.' 
                : 'You will not appear to other users. You will not be able to receive drops.'}
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
              <Pressable
                onPress={cancelToggleChange}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.bg,
                  paddingVertical: 8,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={[theme.type.body, { fontSize: 12, textAlign: 'center', color: theme.colors.text, fontWeight: '600' }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={confirmToggleChange}
                style={{
                  flex: 1,
                  backgroundColor: pendingDiscoverableState ? '#FF6B4A' : '#8E8E93',
                  paddingVertical: 8,
                  borderRadius: 6,
                }}
              >
                <Text style={[theme.type.button, { fontSize: 11, textAlign: 'center', color: '#FFFFFF', fontWeight: '600' }]}>
                  {pendingDiscoverableState ? 'Go Active' : 'Go Ghost'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Tutorial Overlay */}
      {isActive && currentScreen === 'Home' && currentStep > 0 && (
        <TutorialOverlay
          step={tutorialSteps[currentStep - 1]}
          currentStepNumber={currentStep}
          totalSteps={totalSteps}
          onNext={nextStep}
          onBack={prevStep}
          onSkip={skipTutorial}
        />
      )}
    </Animated.View>
  );
}
