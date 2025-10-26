import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, ActivityIndicator, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDarkMode } from '../../App';
import { getTheme } from '../theme';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../contexts/AuthContext';

interface ProfilePhotoPromptScreenProps {
  onComplete: () => void;
}

export default function ProfilePhotoPromptScreen({ onComplete }: ProfilePhotoPromptScreenProps) {
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);
  const { userId } = useAuth();
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        alert('Sorry, we need camera roll permissions to upload a profile photo.');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      alert('Failed to pick image. Please try again.');
    }
  };

  const handleUpload = async () => {
    if (!selectedImage) return;

    setUploading(true);
    try {
      // Get auth token
      let token: string | null = null;
      if (Platform.OS === 'web') {
        token = localStorage.getItem('authToken');
      } else {
        token = await SecureStore.getItemAsync('authToken');
      }

      // Prepare form data
      const formData = new FormData();
      
      if (Platform.OS === 'web') {
        const response = await fetch(selectedImage);
        const blob = await response.blob();
        formData.append('file', blob, 'profile.jpg');
      } else {
        const uriParts = selectedImage.split('.');
        const fileType = uriParts[uriParts.length - 1];
        
        formData.append('file', {
          uri: selectedImage,
          name: `profile.${fileType}`,
          type: `image/${fileType}`,
        } as any);
      }

      // Upload to backend
      const uploadResponse = await fetch(
        `https://findable-production.up.railway.app/user/profile/photo`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      console.log('✅ Profile photo uploaded successfully');
      onComplete();
    } catch (error) {
      console.error('❌ Upload error:', error);
      alert('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <View style={styles.content}>
        {/* Icon/Header */}
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="account-circle" size={80} color={theme.colors.blue} />
        </View>

        <Text style={[styles.title, { color: theme.colors.text }]}>
          Set Up Profile Photo
        </Text>
        
        <Text style={[styles.subtitle, { color: theme.colors.muted }]}>
          Add a profile photo so others can recognize you
        </Text>

        {/* Image Preview or Placeholder */}
        <View style={styles.imageContainer}>
          {selectedImage ? (
            <Image source={{ uri: selectedImage }} style={styles.image} />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: theme.colors.white, borderColor: theme.colors.border }]}>
              <MaterialCommunityIcons name="camera" size={48} color={theme.colors.muted} />
            </View>
          )}
        </View>

        {/* Pick Image Button */}
        {!selectedImage ? (
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.primaryButton,
              { backgroundColor: theme.colors.blue, opacity: pressed ? 0.8 : 1 }
            ]}
            onPress={pickImage}
          >
            <MaterialCommunityIcons name="image-plus" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.buttonTextPrimary}>Choose Photo</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                { backgroundColor: theme.colors.blue, opacity: pressed || uploading ? 0.8 : 1 }
              ]}
              onPress={handleUpload}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.buttonTextPrimary}>Upload Photo</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.secondaryButton,
                { opacity: pressed || uploading ? 0.6 : 1 }
              ]}
              onPress={pickImage}
              disabled={uploading}
            >
              <Text style={[styles.buttonTextSecondary, { color: theme.colors.blue }]}>Choose Different Photo</Text>
            </Pressable>
          </>
        )}

        {/* Skip Button */}
        <Pressable
          style={({ pressed }) => [
            styles.skipButton,
            { opacity: pressed || uploading ? 0.6 : 1 }
          ]}
          onPress={handleSkip}
          disabled={uploading}
        >
          <Text style={[styles.skipText, { color: theme.colors.muted }]}>
            I'll do this later
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  imageContainer: {
    marginBottom: 32,
  },
  image: {
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  imagePlaceholder: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: '100%',
    maxWidth: 300,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  primaryButton: {
    minHeight: 52,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
  },
  buttonTextPrimary: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  buttonTextSecondary: {
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Inter_500Medium',
  },
  skipButton: {
    marginTop: 24,
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
});

