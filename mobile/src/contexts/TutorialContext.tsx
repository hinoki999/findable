import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';

export type ScreenName = 'Home' | 'Drop' | 'History';

interface TutorialContextType {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  currentScreen: ScreenName | null;
  markAsNewUser: () => void;
  startScreenTutorial: (screen: ScreenName, steps: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const TutorialProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [currentScreen, setCurrentScreen] = useState<ScreenName | null>(null);
  
  const isNewUser = useRef(false);
  const shownScreens = useRef<Set<ScreenName>>(new Set());

  const markAsNewUser = () => {
    isNewUser.current = true;
    console.log('[TUTORIAL] User marked as new - tutorials will show on first screen visits');
  };

  const startScreenTutorial = (screen: ScreenName, steps: number) => {
    console.log(`[TUTORIAL] startScreenTutorial called for "${screen}" (${steps} steps)`);
    
    if (!isNewUser.current) {
      console.log('[TUTORIAL] Not a new user - skipping tutorial');
      return;
    }
    
    if (shownScreens.current.has(screen)) {
      console.log(`[TUTORIAL] Tutorial for "${screen}" already shown this session - skipping`);
      return;
    }
    
    console.log(`[TUTORIAL] Starting tutorial for "${screen}"`);
    shownScreens.current.add(screen);
    setCurrentScreen(screen);
    setTotalSteps(steps);
    setCurrentStep(1);
    setIsActive(true);
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(prev => prev + 1);
      console.log(`[TUTORIAL] Advanced to step ${currentStep + 1} of ${totalSteps}`);
    } else {
      console.log(`[TUTORIAL] Tutorial completed for "${currentScreen}"`);
      setIsActive(false);
      setCurrentStep(0);
      setCurrentScreen(null);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      console.log(`[TUTORIAL] Went back to step ${currentStep - 1} of ${totalSteps}`);
    }
  };

  const skipTutorial = () => {
    console.log(`[TUTORIAL] User skipped tutorial for "${currentScreen}"`);
    setIsActive(false);
    setCurrentStep(0);
    setCurrentScreen(null);
  };

  return (
    <TutorialContext.Provider value={{
      isActive,
      currentStep,
      totalSteps,
      currentScreen,
      markAsNewUser,
      startScreenTutorial,
      nextStep,
      prevStep,
      skipTutorial
    }}>
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (!context) throw new Error('useTutorial must be used within TutorialProvider');
  return context;
};
