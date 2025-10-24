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

  const renderArrow = () => {
    if (!step.arrow) return null;

    const arrowStyle: any = {
      position: 'absolute',
      flexDirection: 'row',
      alignItems: 'center',
    };

    let iconName = '';
    
    switch (step.arrow) {
      case 'up':
        iconName = 'arrow-up';
        arrowStyle.top = -30;
        if (step.arrowOffset !== undefined) {
          // Use custom offset if provided
          arrowStyle.left = step.arrowOffset;
        } else {
          // Default centered position
          arrowStyle.left = '50%';
          arrowStyle.marginLeft = -12;
        }
        break;
      case 'down':
        iconName = 'arrow-down';
        arrowStyle.bottom = -30;
        // Check arrow positioning based on toast position
        if (step.position.right !== undefined && step.position.left !== undefined) {
          // If both left and right are defined, check which side it's aligned to
          if (step.position.left < step.position.right) {
            // Left-aligned toast - arrow at bottom left
            arrowStyle.left = 15;
          } else {
            // Right-aligned toast - arrow at bottom right
            arrowStyle.right = 15;
          }
        } else if (step.position.right !== undefined && step.position.left === undefined) {
          // Only right defined - arrow at bottom right
          arrowStyle.right = 15;
        } else {
          // Centered arrow
          arrowStyle.left = '50%';
          arrowStyle.marginLeft = -12;
        }
        break;
      case 'left':
        iconName = 'arrow-left';
        arrowStyle.left = -30;
        arrowStyle.top = 20;
        break;
      case 'right':
        iconName = 'arrow-right';
        arrowStyle.right = -30;
        arrowStyle.top = 20;
        break;
    }

    return (
      <View style={arrowStyle}>
        <MaterialCommunityIcons 
          name={iconName as any} 
          size={24} 
          color={theme.colors.blue} 
        />
      </View>
    );
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      {/* Light semi-transparent overlay - blocks all clicks behind tutorial */}
      <Pressable 
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
        }}
        onPress={onNext}
      />

      {/* Toast tooltip */}
      <View
        style={{
          position: 'absolute',
          ...step.position,
          backgroundColor: theme.colors.white,
          borderRadius: 12,
          padding: 12,
          paddingRight: 16,
          maxWidth: 280,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
          elevation: 4,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
        pointerEvents="box-none"
      >
        {renderArrow()}
        
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {/* Message */}
          <Text style={{
            flex: 1,
            fontSize: 13,
            color: theme.colors.text,
            lineHeight: 18,
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
        <View style={{ flexDirection: 'row', marginTop: 8, gap: 4 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === currentStepNumber - 1 ? theme.colors.blue : theme.colors.border,
              }}
            />
          ))}
        </View>
      </View>

      {/* Skip button */}
      <Pressable
        onPress={onSkip}
        style={{
          position: 'absolute',
          top: 50,
          right: 20,
          paddingHorizontal: 12,
          paddingVertical: 6,
          backgroundColor: theme.colors.white,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Text style={{
          color: theme.colors.muted,
          fontSize: 12,
          fontWeight: '500',
          fontFamily: 'Inter_500Medium',
        }}>
          Skip
        </Text>
      </Pressable>
    </View>
  );
}

