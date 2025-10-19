import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ScreenName = 'Home' | 'Drop' | 'History' | 'Account';

interface TutorialContextType {
  currentStep: number;
  totalSteps: number;
  isActive: boolean;
  currentScreen: ScreenName | null;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => void;
  startTutorial: () => void;
  startScreenTutorial: (screen: ScreenName, steps: number) => void;
  completeScreenTutorial: (screen: ScreenName) => void;
  isScreenTutorialComplete: (screen: ScreenName) => Promise<boolean>;
}

const TutorialContext = createContext<TutorialContextType>({
  currentStep: 0,
  totalSteps: 0,
  isActive: false,
  currentScreen: null,
  nextStep: () => {},
  prevStep: () => {},
  skipTutorial: () => {},
  startTutorial: () => {},
  startScreenTutorial: () => {},
  completeScreenTutorial: () => {},
  isScreenTutorialComplete: async () => false,
});

export const useTutorial = () => useContext(TutorialContext);

const TUTORIAL_STORAGE_KEY = '@droplink_tutorial_screens';

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [totalSteps, setTotalSteps] = useState(0);
  const [currentScreen, setCurrentScreen] = useState<ScreenName | null>(null);

  useEffect(() => {
    checkTutorialStatus();
  }, []);

  const checkTutorialStatus = async () => {
    try {
      // Tutorial completion status is now persisted across app restarts
    } catch (error) {
      console.error('Error checking tutorial status:', error);
    }
  };

  const isScreenTutorialComplete = async (screen: ScreenName): Promise<boolean> => {
    try {
      const data = await AsyncStorage.getItem(TUTORIAL_STORAGE_KEY);
      if (!data) return false;
      const completedScreens = JSON.parse(data);
      return completedScreens[screen] === true;
    } catch (error) {
      console.error('Error checking screen tutorial status:', error);
      return false;
    }
  };

  const startScreenTutorial = async (screen: ScreenName, steps: number) => {
    const completed = await isScreenTutorialComplete(screen);
    if (!completed) {
      setCurrentScreen(screen);
      setTotalSteps(steps);
      setCurrentStep(1);
      setIsActive(true);
    }
  };

  const completeScreenTutorial = async (screen: ScreenName) => {
    try {
      const data = await AsyncStorage.getItem(TUTORIAL_STORAGE_KEY);
      const completedScreens = data ? JSON.parse(data) : {};
      completedScreens[screen] = true;
      await AsyncStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(completedScreens));
      setIsActive(false);
      setCurrentStep(0);
      setCurrentScreen(null);
    } catch (error) {
      console.error('Error saving screen tutorial status:', error);
    }
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else if (currentScreen) {
      completeScreenTutorial(currentScreen);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipTutorial = () => {
    if (currentScreen) {
      completeScreenTutorial(currentScreen);
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
        currentScreen,
        nextStep,
        prevStep,
        skipTutorial,
        startTutorial,
        startScreenTutorial,
        completeScreenTutorial,
        isScreenTutorialComplete,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
};

