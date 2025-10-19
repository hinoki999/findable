import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface TutorialContextType {
  currentStep: number;
  totalSteps: number;
  isActive: boolean;
  nextStep: () => void;
  skipTutorial: () => void;
  startTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType>({
  currentStep: 0,
  totalSteps: 0,
  isActive: false,
  nextStep: () => {},
  skipTutorial: () => {},
  startTutorial: () => {},
});

export const useTutorial = () => useContext(TutorialContext);

const TUTORIAL_STORAGE_KEY = '@droplink_tutorial_completed';

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const totalSteps = 5; // Home screen has 5 tutorial steps

  useEffect(() => {
    checkTutorialStatus();
  }, []);

  const checkTutorialStatus = async () => {
    try {
      const completed = await AsyncStorage.getItem(TUTORIAL_STORAGE_KEY);
      if (!completed) {
        // First time user - start tutorial
        setIsActive(true);
        setCurrentStep(1);
      }
    } catch (error) {
      console.error('Error checking tutorial status:', error);
    }
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTutorial();
    }
  };

  const skipTutorial = async () => {
    await completeTutorial();
  };

  const completeTutorial = async () => {
    try {
      await AsyncStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
      setIsActive(false);
      setCurrentStep(0);
    } catch (error) {
      console.error('Error saving tutorial status:', error);
    }
  };

  const startTutorial = () => {
    setIsActive(true);
    setCurrentStep(1);
  };

  return (
    <TutorialContext.Provider
      value={{
        currentStep,
        totalSteps,
        isActive,
        nextStep,
        skipTutorial,
        startTutorial,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
};

