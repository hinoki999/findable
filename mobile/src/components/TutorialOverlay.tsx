import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useDarkMode } from '../../App';

interface TutorialStep {
  message: string;
  position: {
    top?: number;
    left?: number;
    right?: number;
    bottom?: number;
  };
  arrow?: 'up' | 'down' | 'left' | 'right';
  arrowOffset?: number; // Custom arrow offset in pixels (for 'up' arrow, shifts left/right)
}

interface TutorialOverlayProps {
  step: TutorialStep;
  currentStepNumber: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export default function TutorialOverlay({ 
  step, 
  currentStepNumber, 
  totalSteps, 
  onNext, 
  onBack,
  onSkip 
}: TutorialOverlayProps) {
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);

  // Directional arrows removed - only navigation arrows remain

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Light semi-transparent overlay - visual only, does not block UI */}
      <View 
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
        }}
        pointerEvents="none"
      >
        {/* Tap anywhere hint */}
        <View style={{
          position: 'absolute',
          bottom: 40,
          left: 0,
          right: 0,
          alignItems: 'center',
        }}>
          <Text style={{
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: 12,
            fontFamily: 'Inter_400Regular',
          }}>
            Tap anywhere to continue
          </Text>
        </View>
      </View>

      {/* Toast tooltip */}
      <Pressable
        onPress={onNext}
        style={{
          position: 'absolute',
          ...step.position,
          backgroundColor: theme.colors.white,
          borderRadius: 12,
          padding: 16,
          paddingRight: 20,
          maxWidth: 392,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
          elevation: 4,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
        pointerEvents="auto"
      >
        
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {/* Message */}
          <Text style={{
            flex: 1,
            fontSize: 16,
            color: theme.colors.text,
            lineHeight: 24,
            fontFamily: 'Inter_400Regular',
          }}>
            {step.message}
          </Text>

          {/* Navigation buttons */}
          <View style={{ flexDirection: 'row', marginLeft: 8 }}>
            {/* Back button - only show if not first step */}
            {currentStepNumber > 1 && (
              <Pressable
                onPress={onBack}
                style={{ padding: 4, marginRight: 4 }}
              >
                <MaterialCommunityIcons 
                  name="chevron-left" 
                  size={20} 
                  color={theme.colors.blue} 
                />
              </Pressable>
            )}

            {/* Next button */}
            <Pressable
              onPress={onNext}
              style={{ padding: 4 }}
            >
              <MaterialCommunityIcons 
                name="chevron-right" 
                size={20} 
                color={theme.colors.blue} 
              />
            </Pressable>
          </View>
        </View>

        {/* Progress dots */}
        <View style={{ flexDirection: 'row', marginTop: 12, gap: 6 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === currentStepNumber - 1 ? theme.colors.blue : theme.colors.border,
              }}
            />
          ))}
        </View>
      </Pressable>

      {/* Skip button */}
      <Pressable
        onPress={onSkip}
        style={{
          position: 'absolute',
          top: 50,
          right: 20,
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: theme.colors.white,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 2,
          elevation: 2,
        }}
        pointerEvents="auto"
      >
        <Text style={{
          color: theme.colors.text,
          fontSize: 14,
          fontWeight: '600',
          fontFamily: 'Inter_600SemiBold',
        }}>
          Skip Tutorial
        </Text>
      </Pressable>
    </View>
  );
}

