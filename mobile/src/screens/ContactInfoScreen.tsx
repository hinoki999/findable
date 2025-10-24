import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDarkMode } from '../../App';
import { getTheme } from '../theme';

interface ContactInfoScreenProps {
  email?: string; // May come from signup
  onComplete: (profile: {
    name: string;
    phone: string;
    email: string;
    bio: string;
  }) => void;
}

export default function ContactInfoScreen({ email: initialEmail = '', onComplete }: ContactInfoScreenProps) {
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Phone validation
  const [phoneError, setPhoneError] = useState('');

  const validatePhone = (text: string) => {
    setPhone(text);
    setPhoneError('');
    setError('');

    if (text.length === 0) return;

    // Remove all non-digit characters for validation
    const digitsOnly = text.replace(/\D/g, '');

    if (digitsOnly.length < 10) {
      setPhoneError('Phone number must be at least 10 digits');
      return;
    }
  };

  const formatPhoneNumber = (text: string) => {
    // Remove all non-digit characters
    const digitsOnly = text.replace(/\D/g, '');

    // Format as (XXX) XXX-XXXX
    if (digitsOnly.length <= 3) {
      return digitsOnly;
    } else if (digitsOnly.length <= 6) {
      return `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3)}`;
    } else {
      return `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6, 10)}`;
    }
  };

  const handlePhoneChange = (text: string) => {
    const formatted = formatPhoneNumber(text);
    validatePhone(formatted);
  };

  const handleContinue = () => {
    // Validate required phone number
    const digitsOnly = phone.replace(/\D/g, '');
    if (!phone || digitsOnly.length < 10) {
      setError('Phone number is required (at least 10 digits)');
      return;
    }

    setLoading(true);

    // Simulate brief delay for better UX
    setTimeout(() => {
      onComplete({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        bio: bio.trim(),
      });
    }, 300);
  };

  const phoneDigits = phone.replace(/\D/g, '');
  const canContinue = phoneDigits.length >= 10 && !phoneError;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.bg }]}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.blue }]}>
            Set Up Your Profile
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.muted }]}>
            Your contact info will be shared when you drop to nearby users
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Name (Optional) */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Name <Text style={{ color: theme.colors.muted }}>(optional)</Text>
            </Text>
            <View style={[
              styles.inputContainer,
              { backgroundColor: theme.colors.white, borderColor: theme.colors.border }
            ]}>
              <TextInput
                style={[styles.input, { color: theme.colors.text }]}
                value={name}
                onChangeText={setName}
                placeholder="John Doe"
                placeholderTextColor={theme.colors.muted}
                autoCapitalize="words"
                editable={!loading}
              />
            </View>
          </View>

          {/* Phone (REQUIRED) */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Phone <Text style={{ color: '#FF3B30' }}>*</Text>
            </Text>
            <View style={[
              styles.inputContainer,
              {
                backgroundColor: theme.colors.white,
                borderColor: phoneError ? '#FF3B30' : theme.colors.border,
              }
            ]}>
              <TextInput
                style={[styles.input, { color: theme.colors.text }]}
                value={phone}
                onChangeText={handlePhoneChange}
                placeholder="(555) 123-4567"
                placeholderTextColor={theme.colors.muted}
                keyboardType="phone-pad"
                editable={!loading}
              />
            </View>
            {phoneError ? (
              <Text style={styles.errorText}>{phoneError}</Text>
            ) : null}
          </View>

          {/* Email (Optional) */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Email <Text style={{ color: theme.colors.muted }}>(optional)</Text>
            </Text>
            <View style={[
              styles.inputContainer,
              { backgroundColor: theme.colors.white, borderColor: theme.colors.border }
            ]}>
              <TextInput
                style={[styles.input, { color: theme.colors.text }]}
                value={email}
                onChangeText={setEmail}
                placeholder="john@example.com"
                placeholderTextColor={theme.colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>
          </View>

          {/* Bio (Optional) */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Bio <Text style={{ color: theme.colors.muted }}>(optional)</Text>
            </Text>
            <View style={[
              styles.inputContainer,
              styles.textAreaContainer,
              { backgroundColor: theme.colors.white, borderColor: theme.colors.border }
            ]}>
              <TextInput
                style={[styles.input, styles.textArea, { color: theme.colors.text }]}
                value={bio}
                onChangeText={(text) => {
                  if (text.length <= 150) {
                    setBio(text);
                  }
                }}
                placeholder="Tell people a bit about yourself..."
                placeholderTextColor={theme.colors.muted}
                multiline
                numberOfLines={4}
                maxLength={150}
                editable={!loading}
              />
            </View>
            <Text style={[styles.charCount, { color: theme.colors.muted }]}>
              {bio.length}/150
            </Text>
          </View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="alert-circle" size={16} color="#FF3B30" />
              <Text style={styles.errorMessage}>{error}</Text>
            </View>
          ) : null}

          {/* Continue Button */}
          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              {
                backgroundColor: canContinue && !loading ? theme.colors.blue : theme.colors.muted,
                opacity: pressed && canContinue ? 0.8 : 1,
              }
            ]}
            onPress={handleContinue}
            disabled={!canContinue || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Continue</Text>
            )}
          </Pressable>

          {/* Skip Link (but phone is required, so this just shows the requirement) */}
          <View style={styles.skipContainer}>
            <Text style={[styles.skipText, { color: theme.colors.muted }]}>
              * Phone number is required to use DropLink
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    fontFamily: 'Inter_500Medium',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    fontFamily: 'Inter_500Medium',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  textAreaContainer: {
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  input: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
    textAlign: 'right',
  },
  errorText: {
    fontSize: 13,
    color: '#FF3B30',
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFE5E5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
  },
  errorMessage: {
    fontSize: 14,
    color: '#FF3B30',
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: 'Inter_500Medium',
  },
  skipContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  skipText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
});

