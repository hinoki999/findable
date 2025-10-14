import React, { useState, useEffect } from 'react';
import { View, Text, Animated, Pressable, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useDarkMode } from '../../App';
import { saveDevice } from '../services/api';
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
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);

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
        {/* Central Raindrop Logo with Ripple - positioned on top of grid */}
        <View style={{ alignItems: 'center', marginBottom: 20, zIndex: 10 }}>
          <Pressable onPress={handleRaindropPress} style={{ alignItems: 'center' }}>
            {/* Ripple Effect */}
            <Animated.View
              style={{
                position: 'absolute',
                width: 80,
                height: 80,
                borderRadius: 40,
                borderWidth: 2,
                borderColor: theme.colors.blue,
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
            
            <MaterialCommunityIcons name="water" size={40} color={theme.colors.blue} />
          </Pressable>
          <Text style={[theme.type.muted, { fontSize: 12, marginTop: 4, color: theme.colors.blue }]}>Your Drops</Text>
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
