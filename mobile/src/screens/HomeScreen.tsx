import React, { useState, useEffect } from 'react';
import { View, Text, Animated, Pressable, Modal, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useDarkMode, usePinnedProfiles } from '../../App';
import { saveDevice, getDevices, Device } from '../services/api';
import LinkIcon from '../components/LinkIcon';

export default function HomeScreen() {
  const [fadeAnim] = useState(new Animated.Value(1));
  const [rippleAnim] = useState(new Animated.Value(0));
  const [showDrops, setShowDrops] = useState(false);
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
  const { isDarkMode } = useDarkMode();
  const { pinnedIds } = usePinnedProfiles();
  const theme = getTheme(isDarkMode);

  // Load pinned profiles
  useEffect(() => {
    (async () => {
      const devices = await getDevices();
      const pinned = devices.filter(d => d.id && pinnedIds.has(d.id));
      setPinnedProfiles(pinned);
    })();
  }, [pinnedIds]);

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


  return (
    <Animated.View style={{ flex:1, backgroundColor: theme.colors.bg, opacity: fadeAnim }}>
      {/* Grid Paper Background - contained around raindrop with subtle fade */}
      <View style={{ 
        position: 'absolute', 
        top: '50%', 
        left: '50%', 
        transform: [{ translateX: -120 }, { translateY: -120 }],
        width: 240, 
        height: 240,
      }}>
        {/* Vertical lines - grid paper style with circular fade */}
        {Array.from({ length: 12 }, (_, i) => {
          const centerX = 6; // Center column
          const centerY = 6; // Center row
          const distanceFromCenter = Math.sqrt(Math.pow(i - centerX, 2) + Math.pow(centerY - centerY, 2));
          const maxDistance = Math.sqrt(Math.pow(6, 2) + Math.pow(6, 2)); // Distance to corner
          const fadeOpacity = Math.max(0, 0.6 * (1 - (distanceFromCenter / maxDistance))); // Circular fade
          return (
            <View
              key={`v-${i}`}
              style={{
                position: 'absolute',
                left: i * 20,
                top: 0,
                bottom: 0,
                width: 0.5,
                backgroundColor: theme.colors.border,
                opacity: fadeOpacity,
              }}
            />
          );
        })}
        {/* Horizontal lines - grid paper style with circular fade */}
        {Array.from({ length: 12 }, (_, i) => {
          const centerX = 6; // Center column
          const centerY = 6; // Center row
          const distanceFromCenter = Math.sqrt(Math.pow(centerX - centerX, 2) + Math.pow(i - centerY, 2));
          const maxDistance = Math.sqrt(Math.pow(6, 2) + Math.pow(6, 2)); // Distance to corner
          const fadeOpacity = Math.max(0, 0.6 * (1 - (distanceFromCenter / maxDistance))); // Circular fade
          return (
            <View
              key={`h-${i}`}
              style={{
                position: 'absolute',
                top: i * 20,
                left: 0,
                right: 0,
                height: 0.5,
                backgroundColor: theme.colors.border,
                opacity: fadeOpacity,
              }}
            />
          );
        })}
      </View>

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        {/* Pinned Profiles Stack - positioned on the left */}
        {pinnedProfiles.length > 0 && (() => {
          // Calculate total height of the stack
          const cardHeight = 330; // Approximate full card height
          const stackSpacing = 42; // Spacing between cards
          const totalStackHeight = cardHeight + ((pinnedProfiles.length - 1) * stackSpacing);
          
          return (
          <View style={{
            position: 'absolute',
            left: '10%',
            top: '50%',
            transform: [{ translateY: -Math.min(totalStackHeight / 2, 300) }],
            width: 250,
            maxHeight: 600,
            zIndex: 10,
          }}>
            <ScrollView 
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ minHeight: totalStackHeight }}
            >
              {pinnedProfiles.map((profile, index) => {
                const isExpanded = expandedCardId === profile.id;
                const isBottomCard = index === 0;
                // Reverse order: bottom card should be rendered last (highest in stack visually at bottom)
                const stackPosition = pinnedProfiles.length - 1 - index;
                
                return (
                <View
                  key={profile.id}
                  style={{
                    position: 'absolute',
                    top: stackPosition * 42,
                    left: 0,
                    right: 0,
                    zIndex: isExpanded ? 1000 : (pinnedProfiles.length - index),
                  }}
                >
                  <Pressable
                    onPress={() => {
                      if (!isBottomCard) {
                        setExpandedCardId(isExpanded ? null : profile.id);
                      }
                    }}
                    style={{
                      backgroundColor: theme.colors.white,
                      borderRadius: 16,
                      width: 250,
                      overflow: 'hidden',
                      ...theme.card,
                    }}
                  >
                    {/* ID Header - Always visible */}
                    <View style={{
                      backgroundColor: '#34C759',
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      alignItems: 'center',
                    }}>
                      <Text style={[theme.type.h2, { color: theme.colors.white, fontSize: 12 }]}>
                        {profile.name}
                      </Text>
                    </View>

                    {/* ID Content - Show for bottom card or when expanded */}
                    {(isBottomCard || isExpanded) && (
                    <View style={{ padding: 16 }}>
                      {/* Profile Picture and Name Row */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                        <View style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: '#D1F2DB',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 10,
                        }}>
                          <MaterialCommunityIcons name="account" size={22} color="#34C759" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[theme.type.muted, { fontSize: 9 }]}>
                            Digital Contact
                          </Text>
                        </View>
                      </View>

                      {/* Contact Information */}
                      <View style={{ marginBottom: 14 }}>
                        {/* Phone */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <MaterialCommunityIcons name="phone" size={12} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 6, color: theme.colors.text, fontSize: 10 }]}>
                            +1 (555) 123-4567
                          </Text>
                        </View>

                        {/* Email */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <MaterialCommunityIcons name="email" size={12} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 6, color: theme.colors.text, fontSize: 10 }]}>
                            user@example.com
                          </Text>
                        </View>

                        {/* Social Media */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <MaterialCommunityIcons name="instagram" size={12} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 6, color: theme.colors.text, fontSize: 10 }]}>
                            @yourhandle
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <MaterialCommunityIcons name="twitter" size={12} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 6, color: theme.colors.text, fontSize: 10 }]}>
                            @yourhandle
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <MaterialCommunityIcons name="linkedin" size={12} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 6, color: theme.colors.text, fontSize: 10 }]}>
                            yourname
                          </Text>
                        </View>
                      </View>

                      {/* Bio Section */}
                      <View style={{
                        backgroundColor: theme.colors.bg,
                        padding: 10,
                        borderRadius: 6,
                      }}>
                        <Text style={[theme.type.muted, { fontSize: 8, marginBottom: 3 }]}>
                          BIO
                        </Text>
                        <Text style={[theme.type.body, { fontSize: 9, color: theme.colors.text }]}>
                          "Optional bio line goes here."
                        </Text>
                      </View>
                      </View>
                    )}
                  </Pressable>
                </View>
                );
              })}
            </ScrollView>
          </View>
          );
        })()}

        {/* User's Contact Card - positioned on the right */}
        <View style={{
          position: 'absolute',
          right: '20%',
          top: '50%',
          transform: [{ translateX: 125 }, { translateY: -165 }],
          backgroundColor: theme.colors.white,
          borderRadius: 16,
          width: 250,
          overflow: 'hidden',
          ...theme.card,
          zIndex: 10,
        }}>
          {/* ID Header */}
          <View style={{
            backgroundColor: '#34C759',
            paddingVertical: 10,
            paddingHorizontal: 12,
            alignItems: 'center',
          }}>
            <Text style={[theme.type.h2, { color: theme.colors.white, fontSize: 12 }]}>
              CONTACT CARD
            </Text>
          </View>

          {/* ID Content */}
          <View style={{ padding: 16 }}>
            {/* Profile Picture and Name Row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <View style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: '#D1F2DB',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}>
                <MaterialCommunityIcons name="account" size={22} color="#34C759" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[theme.type.h2, { color: theme.colors.text, fontSize: 13, marginBottom: 2 }]}>
                  Your Name
                </Text>
                <Text style={[theme.type.muted, { fontSize: 9 }]}>
                  Digital Contact
                </Text>
              </View>
            </View>

            {/* Contact Information */}
            <View style={{ marginBottom: 14 }}>
              {/* Phone */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <MaterialCommunityIcons name="phone" size={12} color={theme.colors.muted} />
                <Text style={[theme.type.body, { marginLeft: 6, color: theme.colors.text, fontSize: 10 }]}>
                  +1 (555) 123-4567
                </Text>
              </View>

              {/* Email */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <MaterialCommunityIcons name="email" size={12} color={theme.colors.muted} />
                <Text style={[theme.type.body, { marginLeft: 6, color: theme.colors.text, fontSize: 10 }]}>
                  user@example.com
                </Text>
              </View>

              {/* Social Media */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <MaterialCommunityIcons name="instagram" size={12} color={theme.colors.muted} />
                <Text style={[theme.type.body, { marginLeft: 6, color: theme.colors.text, fontSize: 10 }]}>
                  @yourhandle
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <MaterialCommunityIcons name="twitter" size={12} color={theme.colors.muted} />
                <Text style={[theme.type.body, { marginLeft: 6, color: theme.colors.text, fontSize: 10 }]}>
                  @yourhandle
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <MaterialCommunityIcons name="linkedin" size={12} color={theme.colors.muted} />
                <Text style={[theme.type.body, { marginLeft: 6, color: theme.colors.text, fontSize: 10 }]}>
                  yourname
                </Text>
              </View>
            </View>

            {/* Bio Section */}
            <View style={{
              backgroundColor: theme.colors.bg,
              padding: 10,
              borderRadius: 6,
            }}>
              <Text style={[theme.type.muted, { fontSize: 8, marginBottom: 3 }]}>
                BIO
              </Text>
              <Text style={[theme.type.body, { fontSize: 9, color: theme.colors.text }]}>
                "Optional bio line goes here."
              </Text>
            </View>
          </View>
        </View>

        {/* Central Raindrop Logo with Ripple - centered */}
        <View style={{ alignItems: 'center', zIndex: 10 }}>
          <Pressable onPress={handleRaindropPress} style={{ alignItems: 'center' }}>
            {/* Ripple Effect */}
            <Animated.View
              style={{
                position: 'absolute',
                width: 80,
                height: 80,
                borderRadius: 40,
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
            
            <MaterialCommunityIcons name="water" size={40} color="#007AFF" />
          </Pressable>
          <Text style={[theme.type.body, { fontSize: 12, marginTop: 4, color: '#007AFF', fontWeight: '500' }]}>Your Drops</Text>
          
          {/* Discoverability Toggle */}
          <View style={{ marginTop: 28, alignItems: 'center' }}>
            <View style={{ position: 'relative' }}>
              <Pressable onPress={() => setIsDiscoverable(!isDiscoverable)}>
                <View style={{
                  width: 50,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: isDiscoverable ? '#D1F2DB' : '#F0F0F0',
                  padding: 2,
                  justifyContent: 'center',
                }}>
                  <View style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: isDiscoverable ? '#34C759' : '#FFFFFF',
                    transform: [{ translateX: isDiscoverable ? 22 : 0 }],
                  }} />
                </View>
              </Pressable>
              <View style={{ 
                position: 'absolute', 
                top: 32, 
                left: isDiscoverable ? 22 : 0,
                alignItems: 'center',
                width: 24,
              }}>
                {isDiscoverable ? (
                  <MaterialCommunityIcons name="flash-outline" size={18} color="#34C759" />
                ) : (
                  <MaterialCommunityIcons name="ghost-outline" size={18} color="#8E8E93" />
                )}
              </View>
            </View>
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
            borderColor: theme.colors.blue,
          }}>
            <LinkIcon size={32} />
            <Text style={[theme.type.h2, { marginTop: 8, color: theme.colors.blue }]}>
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
            
            {incomingDrops.length === 0 ? (
              <Text style={[theme.type.muted, { textAlign: 'center', marginVertical: 20 }]}>
                No incoming drops yet
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
    </Animated.View>
  );
}
