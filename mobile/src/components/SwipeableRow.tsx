import React, { useRef, useState } from 'react';
import { View, Text, Animated, PanResponder, Dimensions, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface SwipeableRowProps {
  children: React.ReactNode;
  onSwipeRight?: () => void; // Pin action
  onSwipeLeft?: () => void;  // Delete action
  rightActionLabel?: string;
  leftActionLabel?: string;
  rightActionColor?: string;
  leftActionColor?: string;
  isPinned?: boolean;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 100; // 100px to trigger action
const MAX_SWIPE = SCREEN_WIDTH * 0.6; // Swipe distance for dramatic effect

export default function SwipeableRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightActionLabel = 'Pin',
  leftActionLabel = 'Delete',
  rightActionColor = '#007AFF',
  leftActionColor = '#FF6B6B',
  isPinned = false,
}: SwipeableRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(1)).current;
  const swipeState = useRef({ swiping: false, startX: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const pulseIcon = () => {
    Animated.sequence([
      Animated.timing(iconScale, {
        toValue: 1.3,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(iconScale, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Mouse event handlers for web
  const handleMouseDown = (e: any) => {
    const x = e.pageX || e.clientX || e.nativeEvent?.pageX || e.nativeEvent?.clientX;
    console.log('🖱️ Mouse down at X:', x);
    swipeState.current.swiping = true;
    swipeState.current.startX = x;
    setIsDragging(true);
    if (e.preventDefault) e.preventDefault(); // Prevent text selection
    if (e.stopPropagation) e.stopPropagation();
  };

  const handleMouseMove = (e: any) => {
    if (swipeState.current.swiping) {
      const currentX = e.pageX || e.clientX || e.nativeEvent?.pageX || e.nativeEvent?.clientX;
      const deltaX = currentX - swipeState.current.startX;
      const constrainedX = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, deltaX));
      console.log('🖱️ Mouse move - deltaX:', deltaX);
      translateX.setValue(constrainedX);
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }
  };

  const handleMouseUp = (e: any) => {
    if (swipeState.current.swiping) {
      const currentX = e.pageX || e.clientX || e.nativeEvent?.pageX || e.nativeEvent?.clientX;
      const deltaX = currentX - swipeState.current.startX;
      console.log('🖱️ Mouse up - deltaX:', deltaX, 'threshold:', SWIPE_THRESHOLD);
      swipeState.current.swiping = false;
      setIsDragging(false);

      // Allow cancellation: if they dragged back close to center before releasing, cancel the action
      const cancelThreshold = 40; // If within 40px of center, consider it cancelled
      
      if (Math.abs(deltaX) < cancelThreshold) {
        // User dragged back to cancel
        console.log('❌ Drag CANCELLED - returned to center');
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }).start();
        return;
      }

      // Same logic as touch gestures
      if (deltaX > SWIPE_THRESHOLD) {
        console.log('✅ Swipe RIGHT triggered - Pin action');
        // Animate fully to reveal the action
        Animated.timing(translateX, {
          toValue: MAX_SWIPE,
          duration: 250,
          useNativeDriver: true,
        }).start(() => {
          // Pulse icon for feedback
          pulseIcon();
          // Execute pin action
          if (onSwipeRight) onSwipeRight();
          // Keep visible to show feedback
          setTimeout(() => {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              speed: 14,
              bounciness: 4,
            }).start();
          }, 600);
        });
      } else if (deltaX < -SWIPE_THRESHOLD) {
        console.log('✅ Swipe LEFT triggered - Delete action');
        // Animate fully to reveal the delete action
        Animated.timing(translateX, {
          toValue: -MAX_SWIPE,
          duration: 250,
          useNativeDriver: true,
        }).start(() => {
          // Delete shows confirmation modal
          if (onSwipeLeft) onSwipeLeft();
          // Reset after showing modal
          setTimeout(() => {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              speed: 12,
            }).start();
          }, 200);
        });
      } else {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }).start();
      }
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only activate if:
        // 1. Horizontal swipe is more significant than vertical
        // 2. Moved at least 10px horizontally
        const isHorizontalSwipe = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const hasSufficientMovement = Math.abs(gestureState.dx) > 10;
        
        if (isHorizontalSwipe && hasSufficientMovement) {
          console.log('👆 Touch swipe detected - dx:', gestureState.dx);
        }
        
        return isHorizontalSwipe && hasSufficientMovement;
      },
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: (evt) => {
        console.log('👆 Gesture START');
        swipeState.current.swiping = true;
      },
      onPanResponderMove: (_, gestureState) => {
        // Constrain swipe within bounds
        const newX = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, gestureState.dx));
        translateX.setValue(newX);
        
        // Check if user is swiping back to cancel
        if (gestureState.dx > SWIPE_THRESHOLD * 0.5 && gestureState.vx < -0.3) {
          console.log('⬅️ Swiping back to cancel RIGHT swipe');
        } else if (gestureState.dx < -SWIPE_THRESHOLD * 0.5 && gestureState.vx > 0.3) {
          console.log('➡️ Swiping back to cancel LEFT swipe');
        }
        
        if (Math.abs(gestureState.dx) > 20) {
          console.log('👆 Moving - dx:', gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        swipeState.current.swiping = false;
        
        const swipeDistance = gestureState.dx;
        const velocity = gestureState.vx;
        
        console.log('👆 Touch release - distance:', swipeDistance, 'velocity:', velocity, 'threshold:', SWIPE_THRESHOLD);

        // Allow cancellation: if they swipe back close to center before releasing, cancel the action
        const cancelThreshold = 40; // If within 40px of center, consider it cancelled
        
        if (Math.abs(swipeDistance) < cancelThreshold) {
          // User swiped back to cancel
          console.log('❌ Swipe CANCELLED - returned to center');
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }).start();
          return;
        }
        
        // Swipe Right (Pin)
        if (swipeDistance > SWIPE_THRESHOLD || (swipeDistance > 60 && velocity > 0.5)) {
          console.log('✅ Touch Swipe RIGHT - Pin action');
          // Animate fully to reveal the action
          Animated.timing(translateX, {
            toValue: MAX_SWIPE,
            duration: 250,
            useNativeDriver: true,
          }).start(() => {
            // Pulse icon for feedback
            pulseIcon();
            // Execute pin action
            if (onSwipeRight) onSwipeRight();
            // Keep visible to show feedback
            setTimeout(() => {
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
                speed: 14,
                bounciness: 4,
              }).start();
            }, 600);
          });
        }
        // Swipe Left (Delete)
        else if (swipeDistance < -SWIPE_THRESHOLD || (swipeDistance < -60 && velocity < -0.5)) {
          console.log('✅ Touch Swipe LEFT - Delete action');
          // Animate fully to reveal the delete action
          Animated.timing(translateX, {
            toValue: -MAX_SWIPE,
            duration: 250,
            useNativeDriver: true,
          }).start(() => {
            // Delete shows confirmation modal
            if (onSwipeLeft) onSwipeLeft();
            // Reset after showing modal
            setTimeout(() => {
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
                speed: 12,
              }).start();
            }, 200);
          });
        }
        // Not enough swipe, bounce back
        else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        // Reset if gesture is interrupted
        swipeState.current.swiping = false;
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  // Calculate opacity for action backgrounds based on swipe distance
  // More gradual reveal - starts fading in earlier but slower
  const rightActionOpacity = translateX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD * 0.5, MAX_SWIPE],
    outputRange: [0, 0.6, 1],
    extrapolate: 'clamp',
  });

  const leftActionOpacity = translateX.interpolate({
    inputRange: [-MAX_SWIPE, -SWIPE_THRESHOLD * 0.5, 0],
    outputRange: [1, 0.6, 0],
    extrapolate: 'clamp',
  });

  // Scale animation for more dramatic effect
  const rightActionScale = translateX.interpolate({
    inputRange: [0, MAX_SWIPE],
    outputRange: [0.8, 1],
    extrapolate: 'clamp',
  });

  const leftActionScale = translateX.interpolate({
    inputRange: [-MAX_SWIPE, 0],
    outputRange: [1, 0.8],
    extrapolate: 'clamp',
  });

  return (
    <View style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Right Action Background (Pin) */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: MAX_SWIPE,
          backgroundColor: rightActionColor,
          justifyContent: 'center',
          alignItems: 'flex-start',
          paddingLeft: 24,
          opacity: rightActionOpacity,
          transform: [{ scale: rightActionScale }],
        }}
      >
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>
          <MaterialCommunityIcons 
            name={isPinned ? 'pin-off' : 'pin'} 
            size={32} 
            color="#FFFFFF" 
          />
        </Animated.View>
        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginTop: 6 }}>
          {isPinned ? 'Unpin' : rightActionLabel}
        </Text>
      </Animated.View>

      {/* Left Action Background (Delete) */}
      <Animated.View
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: MAX_SWIPE,
          backgroundColor: leftActionColor,
          justifyContent: 'center',
          alignItems: 'flex-end',
          paddingRight: 24,
          opacity: leftActionOpacity,
          transform: [{ scale: leftActionScale }],
        }}
      >
        <MaterialCommunityIcons name="delete" size={32} color="#FFFFFF" />
        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginTop: 6 }}>
          {leftActionLabel}
        </Text>
      </Animated.View>

      {/* Swipeable Content */}
      <Animated.View
        {...panResponder.panHandlers}
        // @ts-ignore - web-specific mouse events
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          transform: [{ translateX }],
          backgroundColor: 'transparent',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        // @ts-ignore
        draggable={false}
      >
        {children}
      </Animated.View>
    </View>
  );
}

