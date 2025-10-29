import React, { useState, useRef } from 'react';
import { View, Text, Pressable, Image, Animated, StyleSheet, Dimensions, PanResponder, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useDarkMode, useToast } from '../../App';
import { useAuth } from '../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { storage } from '../services/storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CIRCLE_SIZE = 280;

interface ProfilePhotoScreenProps {
  navigation: any;
  onPhotoSaved: (photoUri: string) => void;
}

export default function ProfilePhotoScreen({ navigation, onPhotoSaved }: ProfilePhotoScreenProps) {
  const { isDarkMode } = useDarkMode();
  const { showToast } = useToast();
  const { userId } = useAuth();
  const theme = getTheme(isDarkMode);
  
  // Screen states
  const [step, setStep] = useState<'permission' | 'source' | 'edit'>('permission');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  
  // Image manipulation states
  const pan = useRef(new Animated.ValueXY()).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [imageScale, setImageScale] = useState(1);
  const [uploading, setUploading] = useState(false);
  
  // Multi-touch gesture tracking
  const gestureState = useRef({
    lastScale: 1,
    lastDistance: 0,
    touches: [] as any[],
  });

  // Request permission
  const handleAllowAccess = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
      
      if (status === 'granted' && cameraStatus.status === 'granted') {
        setHasPermission(true);
        setStep('source');
      } else {
        showToast({
          message: 'Permission denied. Please enable in settings.',
          type: 'error',
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Permission error:', error);
      showToast({
        message: 'Failed to request permissions',
        type: 'error',
        duration: 3000,
      });
    }
  };

  // Take photo
  const handleTakePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        setStep('edit');
      }
    } catch (error) {
      console.error('Camera error:', error);
      showToast({
        message: 'Failed to open camera',
        type: 'error',
        duration: 3000,
      });
    }
  };

  // Choose from gallery
  const handleChooseGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        setStep('edit');
      }
    } catch (error) {
      console.error('Gallery error:', error);
      showToast({
        message: 'Failed to open gallery',
        type: 'error',
        duration: 3000,
      });
    }
  };

  // Calculate distance between two touches
  const getDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const [touch1, touch2] = touches;
    const dx = touch1.pageX - touch2.pageX;
    const dy = touch1.pageY - touch2.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Pan responder for dragging and pinch-to-zoom
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Always respond to touches - more sensitive
        return Math.abs(gestureState.dx) > 1 || Math.abs(gestureState.dy) > 1 || evt.nativeEvent.touches.length >= 2;
      },
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        // Store current touches
        gestureState.current.touches = evt.nativeEvent.touches;
        
        // If single touch, prepare for dragging
        if (evt.nativeEvent.touches.length === 1) {
          pan.setOffset({
            x: (pan.x as any)._value,
            y: (pan.y as any)._value,
          });
          pan.setValue({ x: 0, y: 0 });
        }
        
        // If two touches, prepare for pinch zoom
        if (evt.nativeEvent.touches.length === 2) {
          gestureState.current.lastDistance = getDistance(evt.nativeEvent.touches);
          gestureState.current.lastScale = imageScale;
        }
      },
      onPanResponderMove: (evt, gestureState_) => {
        const touches = evt.nativeEvent.touches;
        
        // Pinch to zoom with two fingers
        if (touches.length === 2) {
          const currentDistance = getDistance(touches);
          if (gestureState.current.lastDistance > 0) {
            const scale_ = currentDistance / gestureState.current.lastDistance;
            const newScale = Math.max(0.3, Math.min(3, gestureState.current.lastScale * scale_));
            setImageScale(newScale);
            scale.setValue(newScale);
          }
        }
        // Single finger drag
        else if (touches.length === 1) {
          pan.setValue({ 
            x: gestureState_.dx, 
            y: gestureState_.dy 
          });
        }
      },
      onPanResponderRelease: (evt) => {
        // Update gesture state
        gestureState.current.lastScale = imageScale;
        gestureState.current.lastDistance = 0;
        
        // If was dragging, flatten the offset
        if (evt.nativeEvent.touches.length <= 1) {
          pan.flattenOffset();
        }
      },
    })
  ).current;

  // Zoom in
  const handleZoomIn = () => {
    const newScale = Math.min(imageScale + 0.2, 3);
    setImageScale(newScale);
    Animated.spring(scale, {
      toValue: newScale,
      useNativeDriver: true,
      friction: 7,
    }).start();
  };

  // Zoom out
  const handleZoomOut = () => {
    const newScale = Math.max(imageScale - 0.2, 0.3);
    setImageScale(newScale);
    Animated.spring(scale, {
      toValue: newScale,
      useNativeDriver: true,
      friction: 7,
    }).start();
  };

  // Save photo
  const handleSave = async () => {
    if (!selectedImage) return;

    setUploading(true);
    try {
      // Create FormData for upload
      const formData = new FormData();
      
      // For web
      if (Platform.OS === 'web') {
        const response = await fetch(selectedImage);
        const blob = await response.blob();
        formData.append('file', blob, 'profile.jpg');
      } else {
        // For mobile
        const filename = selectedImage.split('/').pop() || 'profile.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        
        formData.append('file', {
          uri: selectedImage,
          name: filename,
          type,
        } as any);
      }

      // Get auth token
      const token = await storage.getItem('authToken');
      
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Upload to backend
      const BASE_URL = 'https://findable-production.up.railway.app';
      const response = await fetch(`${BASE_URL}/user/profile/photo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Photo uploaded:', result);

      showToast({
        message: 'Profile photo updated!',
        type: 'success',
        duration: 2000,
      });

      onPhotoSaved(selectedImage);
      navigation.goBack();
    } catch (error) {
      console.error('❌ Upload error:', error);
      showToast({
        message: 'Failed to upload photo',
        type: 'error',
        duration: 3000,
      });
    } finally {
      setUploading(false);
    }
  };

  // Cancel
  const handleCancel = () => {
    if (step === 'edit') {
      setStep('source');
      setSelectedImage(null);
      setImageScale(1);
      pan.setValue({ x: 0, y: 0 });
      scale.setValue(1);
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={15}>
          <MaterialCommunityIcons name="close" size={28} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.type.h1, { fontSize: 20 }]}>Profile Photo</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Permission Step */}
      {step === 'permission' && (
        <View style={styles.centeredContent}>
          <MaterialCommunityIcons name="image-multiple" size={80} color={theme.colors.blue} style={{ marginBottom: 24 }} />
          <Text style={[theme.type.h1, { fontSize: 22, marginBottom: 12, textAlign: 'center' }]}>
            Allow DropLink to access your photos?
          </Text>
          <Text style={[theme.type.body, { color: theme.colors.muted, textAlign: 'center', marginBottom: 40, paddingHorizontal: 40 }]}>
            We need permission to access your photos and camera to set your profile photo.
          </Text>
          <View style={{ width: '100%', paddingHorizontal: 40, gap: 12 }}>
            <Pressable
              onPress={handleAllowAccess}
              style={[styles.button, { backgroundColor: theme.colors.blue }]}
            >
              <Text style={[theme.type.button, { color: '#FFFFFF' }]}>Allow Access</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.goBack()}
              style={[styles.button, { borderWidth: 1, borderColor: theme.colors.border }]}
            >
              <Text style={[theme.type.button, { color: theme.colors.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Source Selection Step */}
      {step === 'source' && (
        <View style={styles.centeredContent}>
          <MaterialCommunityIcons name="camera" size={80} color={theme.colors.blue} style={{ marginBottom: 64 }} />
          <View style={{ width: '100%', paddingHorizontal: 40, gap: 12 }}>
            <Pressable
              onPress={handleTakePhoto}
              style={[styles.button, { backgroundColor: theme.colors.blue }]}
            >
              <MaterialCommunityIcons name="file-upload" size={24} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={[theme.type.button, { color: '#FFFFFF' }]}>Upload File</Text>
            </Pressable>
            <Pressable
              onPress={handleChooseGallery}
              style={[styles.button, { backgroundColor: theme.colors.blue }]}
            >
              <MaterialCommunityIcons name="image-multiple" size={24} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={[theme.type.button, { color: '#FFFFFF' }]}>Choose from Gallery</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.goBack()}
              style={[styles.button, { borderWidth: 1, borderColor: theme.colors.border, marginTop: 12 }]}
            >
              <Text style={[theme.type.button, { color: theme.colors.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Edit/Crop Step */}
      {step === 'edit' && selectedImage && (
        <View style={styles.editContainer}>
          {/* Image with circular mask */}
          <View style={styles.imageContainer}>
            {/* Draggable/Zoomable Image */}
            <Animated.View
              {...panResponder.panHandlers}
              style={[
                styles.imageWrapper,
                {
                  transform: [
                    { translateX: pan.x },
                    { translateY: pan.y },
                    { scale: scale },
                  ],
                },
              ]}
            >
              <Image
                source={{ uri: selectedImage }}
                style={styles.image}
                resizeMode="cover"
              />
            </Animated.View>

            {/* Gray overlay */}
            <View pointerEvents="none" style={[styles.overlay, { backgroundColor: 'rgba(0, 0, 0, 0.7)' }]} />
            
            {/* Circular cutout */}
            <View pointerEvents="none" style={styles.circleCutout}>
              <View style={styles.circle} />
            </View>
          </View>

          {/* Instructions */}
          <View style={styles.instructions}>
            <Text style={[theme.type.body, { color: theme.colors.muted, textAlign: 'center', marginBottom: 16 }]}>
              Drag to reposition • Pinch to zoom
            </Text>
            
            {/* Zoom controls */}
            <View style={styles.zoomControls}>
              <Pressable onPress={handleZoomOut} style={styles.zoomButton}>
                <MaterialCommunityIcons name="minus" size={24} color={theme.colors.text} />
              </Pressable>
              <Text style={[theme.type.body, { marginHorizontal: 20 }]}>
                {Math.round(imageScale * 100)}%
              </Text>
              <Pressable onPress={handleZoomIn} style={styles.zoomButton}>
                <MaterialCommunityIcons name="plus" size={24} color={theme.colors.text} />
              </Pressable>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            <Pressable
              onPress={handleCancel}
              style={[styles.button, { borderWidth: 1, borderColor: theme.colors.border, flex: 1 }]}
            >
              <Text style={[theme.type.button, { color: theme.colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={uploading}
              style={[styles.button, { backgroundColor: theme.colors.blue, flex: 1, opacity: uploading ? 0.5 : 1 }]}
            >
              <Text style={[theme.type.button, { color: '#FFFFFF' }]}>
                {uploading ? 'Uploading...' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
  },
  editContainer: {
    flex: 1,
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  circleCutout: {
    position: 'absolute',
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
  imageWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    position: 'absolute',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  instructions: {
    padding: 20,
    alignItems: 'center',
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingBottom: 40,
  },
});

