import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../services/api';

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
  enableTutorialsForSignup: () => Promise<void>;
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
  enableTutorialsForSignup: async () => {},
});

export const useTutorial = () => useContext(TutorialContext);

const TUTORIAL_STORAGE_KEY = '@droplink_tutorial_screens';
const SHOW_TUTORIALS_FLAG = '@droplink_show_tutorials_flag';

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

  const enableTutorialsForSignup = async () => {
    try {
      console.log('📚 [TutorialContext] Setting SHOW_TUTORIALS_FLAG to "true"');
      await AsyncStorage.setItem(SHOW_TUTORIALS_FLAG, 'true');
      console.log('📚 [TutorialContext] Clearing existing tutorial data');
      // Clear any existing tutorial completion data to ensure fresh start
      await AsyncStorage.removeItem(TUTORIAL_STORAGE_KEY);
      console.log('✅ [TutorialContext] Tutorials enabled for signup');
    } catch (error) {
      console.error('❌ [TutorialContext] Error enabling tutorials:', error);
    }
  };

  const startScreenTutorial = async (screen: ScreenName, steps: number) => {
    console.log(`📚 [TutorialContext] startScreenTutorial called for screen: "${screen}", steps: ${steps}`);
    
    // Check if tutorials are enabled for this session (signup only)
    try {
      const showTutorialsFlag = await AsyncStorage.getItem(SHOW_TUTORIALS_FLAG);
      console.log(`📚 [TutorialContext] SHOW_TUTORIALS_FLAG = "${showTutorialsFlag}"`);
      
      if (showTutorialsFlag !== 'true') {
        console.log(`⏭️ [TutorialContext] Tutorials NOT enabled (flag != "true"), skipping tutorial`);
        return;
      }
    } catch (error) {
      console.error('❌ [TutorialContext] Error reading SHOW_TUTORIALS_FLAG:', error);
      return;
    }

    // Check if this specific screen tutorial has been completed
    const completed = await isScreenTutorialComplete(screen);
    console.log(`📚 [TutorialContext] Screen "${screen}" completed status: ${completed}`);
    
    if (!completed) {
      console.log(`✅ [TutorialContext] Starting tutorial for "${screen}"`);
      console.log(`   Setting: currentScreen="${screen}", totalSteps=${steps}, currentStep=1, isActive=true`);
      setCurrentScreen(screen);
      setTotalSteps(steps);
      setCurrentStep(1);
      setIsActive(true);
      console.log(`   State update calls completed`);
      
      // Verify state was set (next render will show updated values)
      setTimeout(() => {
        console.log(`   [TutorialContext] State after 100ms - This should show in next render`);
      }, 100);
    } else {
      console.log(`⏭️ [TutorialContext] Tutorial for "${screen}" already completed, skipping`);
    }
  };

  const completeScreenTutorial = async (screen: ScreenName) => {
    try {
      const data = await AsyncStorage.getItem(TUTORIAL_STORAGE_KEY);
      const completedScreens = data ? JSON.parse(data) : {};
      completedScreens[screen] = true;
      await AsyncStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(completedScreens));
      
      // Check if all tutorial screens are complete, if so, clear the tutorial flag
      // Note: Account screen doesn't have a tutorial, so only check Home, Drop, History
      const allScreens: ScreenName[] = ['Home', 'Drop', 'History'];
      const allComplete = allScreens.every(s => completedScreens[s] === true);
      if (allComplete) {
        await AsyncStorage.removeItem(SHOW_TUTORIALS_FLAG);
        
        // Update backend that onboarding is complete
        try {
          const token = await AsyncStorage.getItem('token');
          if (token) {
            await fetch(`${BASE_URL}/user/profile`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ hasCompletedOnboarding: true })
            });
          }
        } catch (error) {
          console.error('Could not update backend onboarding status:', error);
        }
      }
      
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

  const skipTutorial = async () => {
    if (currentScreen) {
      await completeScreenTutorial(currentScreen);
    }
    // Clear the tutorial flag when user skips
    try {
      await AsyncStorage.removeItem(SHOW_TUTORIALS_FLAG);
    } catch (error) {
      console.error('Error clearing tutorial flag:', error);
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
        enableTutorialsForSignup,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
};

