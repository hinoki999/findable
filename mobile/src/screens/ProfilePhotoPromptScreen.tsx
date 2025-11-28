import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, ActivityIndicator, Platform, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDarkMode } from '../../App';
import { getTheme } from '../theme';
import { uploadProfilePhoto } from '../services/api';
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
  const [errorText, setErrorText] = useState<string>('');

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
    let debugLog = '';
    
    if (!selectedImage) {
      debugLog = 'ERROR: No image selected';
      setErrorText(debugLog);
      Alert.alert('ERROR', debugLog);
      return;
    }
    
    if (!userId) {
      debugLog = 'ERROR: User not authenticated';
      setErrorText(debugLog);
      Alert.alert('ERROR', debugLog);
      return;
    }

    setUploading(true);
    setErrorText(''); // Clear previous errors
    
    try {
      debugLog += '✅ Step 1: Starting upload...\n';
      debugLog += `   Image URI: ${selectedImage.substring(0, 50)}...\n`;
      debugLog += `   User ID: ${userId}\n\n`;
      
      debugLog += '✅ Step 2: Calling uploadProfilePhoto()...\n';
      const photoUrl = await uploadProfilePhoto(selectedImage, userId);
      
      debugLog += `✅ Step 3: Upload complete!\n`;
      debugLog += `   Photo URL: ${photoUrl}\n\n`;
      debugLog += '✅ Step 4: Completing signup flow...\n';

      console.log('✅ Profile photo uploaded successfully:', photoUrl);
      console.log('DEBUG LOG:\n', debugLog);
      
      onComplete();
      
    } catch (error: any) {
      debugLog += `\n❌ UPLOAD FAILED AT STEP!\n\n`;
      debugLog += `ERROR MESSAGE:\n${error.message}\n\n`;
      debugLog += `ERROR NAME:\n${error.name}\n\n`;
      debugLog += `ERROR STACK:\n${error.stack?.substring(0, 300)}\n\n`;
      debugLog += `FULL ERROR:\n${JSON.stringify(error, null, 2)}`;
      
      // Display error in THREE ways (one MUST be visible)
      console.error('❌❌❌ PROFILE PHOTO UPLOAD ERROR (PROMPT) ❌❌❌');
      console.error(debugLog);
      console.error('Full error object:', error);
      
      setErrorText(debugLog);
      
      Alert.alert(
        '🚨 UPLOAD ERROR',
        debugLog,
        [
          { text: 'Copy Error', onPress: () => console.log('ERROR TO COPY:\n', debugLog) },
          { text: 'Skip Photo', onPress: () => onComplete() },
          { text: 'Retry' }
        ]
      );
      
    } finally {
      setUploading(false);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      {/* VISIBLE ERROR DISPLAY - Cannot be missed */}
      {errorText && (
        <View style={{ 
          backgroundColor: '#FF0000', 
          padding: 20, 
          margin: 10,
          borderWidth: 5,
          borderColor: '#FFFF00',
          zIndex: 9999,
          position: 'absolute',
          top: 20,
          left: 10,
          right: 10,
        }}>
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>
            🚨 UPLOAD ERROR 🚨
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
            {errorText}
          </Text>
          <Pressable 
            onPress={() => setErrorText('')}
            style={{ backgroundColor: '#FFFFFF', padding: 10, marginTop: 10, borderRadius: 5 }}
          >
            <Text style={{ color: '#FF0000', fontSize: 14, fontWeight: 'bold', textAlign: 'center' }}>
              DISMISS
            </Text>
          </Pressable>
        </View>
      )}
      
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

