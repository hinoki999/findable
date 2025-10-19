import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useDarkMode } from '../../App';

interface TutorialStep {
  title: string;
  description: string;
  spotlightPosition?: {
    top?: number;
    left?: number;
    right?: number;
    bottom?: number;
    width: number;
    height: number;
    borderRadius?: number;
  };
  tooltipPosition: 'top' | 'bottom' | 'center';
  showSwipeIndicator?: boolean;
  icon?: string;
}

interface TutorialOverlayProps {
  step: TutorialStep;
  currentStepNumber: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function TutorialOverlay({ 
  step, 
  currentStepNumber, 
  totalSteps, 
  onNext, 
  onSkip 
}: TutorialOverlayProps) {
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Pulse animation for spotlight
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const renderTooltip = () => {
    let tooltipStyle: any = {
      position: 'absolute',
      maxWidth: screenWidth - 60,
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderRadius: 16,
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    };

    switch (step.tooltipPosition) {
      case 'top':
        tooltipStyle.top = 80;
        tooltipStyle.left = 30;
        tooltipStyle.right = 30;
        break;
      case 'bottom':
        tooltipStyle.bottom = 120;
        tooltipStyle.left = 30;
        tooltipStyle.right = 30;
        break;
      case 'center':
        tooltipStyle.top = '40%';
        tooltipStyle.left = 30;
        tooltipStyle.right = 30;
        break;
    }

    return (
      <View style={tooltipStyle}>
        {/* Icon */}
        {step.icon && (
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <View style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: '#FF6B4A',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <MaterialCommunityIcons name={step.icon as any} size={28} color="#FFFFFF" />
            </View>
          </View>
        )}

        {/* Title */}
        <Text style={{
          fontSize: 20,
          fontWeight: '700',
          color: '#1C1C1E',
          marginBottom: 8,
          textAlign: 'center',
          fontFamily: 'Inter_700Bold',
        }}>
          {step.title}
        </Text>

        {/* Description */}
        <Text style={{
          fontSize: 15,
          color: '#3C3C43',
          lineHeight: 22,
          textAlign: 'center',
          marginBottom: 20,
          fontFamily: 'Inter_400Regular',
        }}>
          {step.description}
        </Text>

        {/* Progress indicator */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16, gap: 6 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={{
                width: i === currentStepNumber - 1 ? 24 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === currentStepNumber - 1 ? '#FF6B4A' : '#E5E5EA',
              }}
            />
          ))}
        </View>

        {/* Next button */}
        <Pressable
          onPress={onNext}
          style={({ pressed }) => ({
            backgroundColor: '#FF6B4A',
            paddingVertical: 14,
            borderRadius: 25,
            alignItems: 'center',
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text style={{
            color: '#FFFFFF',
            fontSize: 16,
            fontWeight: '600',
            fontFamily: 'Inter_600SemiBold',
          }}>
            {currentStepNumber === totalSteps ? "Let's Go!" : 'Next'}
          </Text>
        </Pressable>

        {/* Swipe indicator */}
        {step.showSwipeIndicator && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
            <Text style={{ fontSize: 14, color: '#8E8E93', marginRight: 8, fontFamily: 'Inter_400Regular' }}>
              Swipe to explore
            </Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#8E8E93" />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dark overlay */}
      <View style={{
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
      }} />

      {/* Spotlight cutout (if position provided) */}
      {step.spotlightPosition && (
        <Animated.View
          style={{
            position: 'absolute',
            ...step.spotlightPosition,
            borderRadius: step.spotlightPosition.borderRadius || 0,
            borderWidth: 3,
            borderColor: '#FF6B4A',
            shadowColor: '#FF6B4A',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 10,
            transform: [{ scale: pulseAnim }],
          }}
          pointerEvents="none"
        />
      )}

      {/* Tooltip */}
      {renderTooltip()}

      {/* Skip button */}
      <Pressable
        onPress={onSkip}
        style={{
          position: 'absolute',
          top: 50,
          right: 20,
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 20,
        }}
      >
        <Text style={{
          color: '#FFFFFF',
          fontSize: 14,
          fontWeight: '600',
          fontFamily: 'Inter_600SemiBold',
        }}>
          Skip
        </Text>
      </Pressable>
    </View>
  );
}

