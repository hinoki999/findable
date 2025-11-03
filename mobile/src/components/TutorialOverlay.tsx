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
  arrow?: 'up-left' | 'up' | 'down' | 'left' | 'right';
  arrowPosition?: { top?: number; left?: number; right?: number; bottom?: number };
  arrowOffset?: number;
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
    <Pressable style={StyleSheet.absoluteFill} onPress={onNext}>
      {/* Darker semi-transparent overlay - creates clear visual separation */}
      <View 
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
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

      {/* Centered tutorial box - bigger, bubbly, and clear */}
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }} pointerEvents="box-none">
        <Pressable
          onPress={onNext}
          style={{
            backgroundColor: theme.colors.white,
            borderRadius: 24,
            padding: 24,
            width: '100%',
            maxWidth: 500,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 8,
            borderWidth: 2,
            borderColor: 'rgba(255, 255, 255, 0.9)',
          }}
          pointerEvents="auto"
        >
        
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {/* Message */}
          <Text style={{
            flex: 1,
            fontSize: 18,
            color: theme.colors.text,
            lineHeight: 28,
            fontFamily: 'Inter_500Medium',
          }}>
            {step.message}
          </Text>

          {/* Navigation buttons - bigger and more visible */}
          <View style={{ flexDirection: 'row', marginLeft: 12 }}>
            {/* Back button - only show if not first step */}
            {currentStepNumber > 1 && (
              <Pressable
                onPress={onBack}
                style={{ padding: 6, marginRight: 6 }}
              >
                <MaterialCommunityIcons 
                  name="chevron-left" 
                  size={28} 
                  color={theme.colors.blue} 
                />
              </Pressable>
            )}

            {/* Next button */}
            <Pressable
              onPress={onNext}
              style={{ padding: 6 }}
            >
              <MaterialCommunityIcons 
                name="chevron-right" 
                size={28} 
                color={theme.colors.blue} 
              />
            </Pressable>
          </View>
        </View>

        {/* Progress dots - bigger and more visible */}
        <View style={{ flexDirection: 'row', marginTop: 16, gap: 10 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: i === currentStepNumber - 1 ? theme.colors.blue : theme.colors.border,
              }}
            />
          ))}
        </View>
      </Pressable>
      </View>

      {/* Pointing Arrow (if specified) */}
      {step.arrow === 'up-left' && step.arrowPosition && (
        <View style={{
          position: 'absolute',
          top: step.arrowPosition.top,
          left: step.arrowPosition.left,
        }} pointerEvents="none">
          <MaterialCommunityIcons 
            name="arrow-top-left" 
            size={32} 
            color={theme.colors.blue}
          />
        </View>
      )}
      
      {step.arrow === 'up' && step.arrowPosition && (
        <View style={{
          position: 'absolute',
          top: step.arrowPosition.top,
          left: step.arrowPosition.left,
        }} pointerEvents="none">
          <MaterialCommunityIcons 
            name="arrow-up" 
            size={32} 
            color={theme.colors.blue}
          />
        </View>
      )}

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
    </Pressable>
  );
}

