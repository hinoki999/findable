import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { supabase } from '../services/supabase';

export type ScreenName = 'Home' | 'Drop' | 'History' | 'Account';

interface TutorialContextType {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  currentScreen: ScreenName | null;
  completedTutorials: Record<ScreenName, boolean>;
  isLoaded: boolean;
  initializeTutorials: () => Promise<void>;
  startScreenTutorial: (screen: ScreenName, steps: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const TutorialProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // State variables
  const [completedTutorials, setCompletedTutorials] = useState<Record<ScreenName, boolean>>({
    Home: false,
    Drop: false,
    History: false,
    Account: false,
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [currentScreen, setCurrentScreen] = useState<ScreenName | null>(null);
  
  // Session tracking - which screens shown this session
  const shownScreens = useRef<Set<ScreenName>>(new Set());
  
  // Guard to prevent multiple initializations per session
  const hasInitialized = useRef(false);

  /**
   * Initialize tutorials by checking user_profiles.has_completed_onboarding
   * Called once on app startup
   */
  const initializeTutorials = async () => {
    // Ref-based guard: only run once per session
    if (hasInitialized.current) {
      console.log('[TUTORIAL] Already initialized this session, skipping');
      return;
    }
    hasInitialized.current = true;
    
    try {
      console.log('[TUTORIAL] Initializing tutorials...');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.log('[TUTORIAL] No session, marking all tutorials as completed');
        setCompletedTutorials({
          Home: true,
          Drop: true,
          History: true,
          Account: true,
        });
        setIsLoaded(true);
        return;
      }
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('has_completed_onboarding')
        .eq('user_id', session.user.id)
        .single();
      
      if (error) {
        console.error('[TUTORIAL] Error checking onboarding status:', error);
        // Fail safe: mark all as completed (don't show on error)
        setCompletedTutorials({
          Home: true,
          Drop: true,
          History: true,
          Account: true,
        });
        setIsLoaded(true);
        return;
      }
      
      const hasCompleted = data?.has_completed_onboarding ?? false;
      
      if (hasCompleted) {
        console.log('[TUTORIAL] Onboarding already completed, skipping all tutorials');
        setCompletedTutorials({
          Home: true,
          Drop: true,
          History: true,
          Account: true,
        });
      } else {
        console.log('[TUTORIAL] Onboarding not completed, showing all tutorials');
        setCompletedTutorials({
          Home: false,
          Drop: false,
          History: false,
          Account: false,
        });
      }
      setIsLoaded(true);
      
    } catch (error) {
      console.error('[TUTORIAL] initializeTutorials error:', error);
      setCompletedTutorials({
        Home: true,
        Drop: true,
        History: true,
        Account: true,
      });
      setIsLoaded(true);
    }
  };

  /**
   * Start tutorial for a specific screen
   * Called when screen mounts
   */
  const startScreenTutorial = (screen: ScreenName, steps: number) => {
    console.log(`[TUTORIAL] startScreenTutorial("${screen}", ${steps})`);
    
    // Check 1: Is data loaded?
    if (!isLoaded) {
      console.log(`[TUTORIAL] Tutorial data not loaded yet, skipping`);
      return;
    }
    
    // Check 2: Already completed this specific screen?
    if (completedTutorials[screen]) {
      console.log(`[TUTORIAL] "${screen}" tutorial already completed, skipping`);
      return;
    }
    
    // Check 3: Already shown this screen this session?
    if (shownScreens.current.has(screen)) {
      console.log(`[TUTORIAL] Already shown "${screen}" this session, skipping`);
      return;
    }
    
    // Show tutorial
    console.log(`[TUTORIAL] Showing tutorial for "${screen}"`);
    shownScreens.current.add(screen);
    setCurrentScreen(screen);
    setTotalSteps(steps);
    setCurrentStep(1);
    setIsActive(true);
  };

  /**
   * Advance to next tutorial step
   * Called by TutorialOverlay "Next" button
   */
  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(prev => prev + 1);
      console.log(`[TUTORIAL] Advanced to step ${currentStep + 1}/${totalSteps}`);
    } else {
      // Completed all steps for this screen
      console.log(`[TUTORIAL] Completed tutorial for "${currentScreen}"`);
      completeTutorial();
    }
  };

  /**
   * Go back one tutorial step
   * Called by TutorialOverlay "Previous" button
   */
  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      console.log(`[TUTORIAL] Went back to step ${currentStep - 1}/${totalSteps}`);
    }
  };

  /**
   * Mark specific screen tutorial as complete
   * Called by nextStep (on last step) OR skipTutorial
   * When all four screens are complete, updates user_profiles.has_completed_onboarding
   */
  const completeTutorial = async () => {
    if (!currentScreen) return;
    
    console.log(`[TUTORIAL] Marking "${currentScreen}" tutorial as complete`);
    
    // Close tutorial immediately (optimistic UI)
    setIsActive(false);
    setCurrentStep(0);
    const screenToComplete = currentScreen;
    setCurrentScreen(null);
    
    // Update local state and check if all are now complete
    setCompletedTutorials(prev => {
      const updated = {
        ...prev,
        [screenToComplete]: true,
      };
      
      // Check if all four screens are now complete
      const allComplete = updated.Home && updated.Drop && updated.History && updated.Account;
      
      if (allComplete) {
        console.log('[TUTORIAL] All four tutorials complete, updating has_completed_onboarding');
        // Fire async update to Supabase (don't await in setState)
        markOnboardingComplete();
      }
      
      return updated;
    });
  };
  
  /**
   * Mark onboarding as complete in user_profiles
   * Called when all four screen tutorials are finished
   */
  const markOnboardingComplete = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.error('[TUTORIAL] No session, cannot mark onboarding complete');
        return;
      }
      
      const { error } = await supabase
        .from('user_profiles')
        .update({ has_completed_onboarding: true })
        .eq('user_id', session.user.id);
      
      if (error) {
        console.error('[TUTORIAL] Error marking onboarding complete:', error);
      } else {
        console.log('[TUTORIAL] Successfully marked has_completed_onboarding = true in user_profiles');
      }
    } catch (error) {
      console.error('[TUTORIAL] markOnboardingComplete error:', error);
    }
  };

  /**
   * Skip tutorial (Option B: marks as complete)
   * Called by TutorialOverlay "Skip" button
   */
  const skipTutorial = () => {
    console.log(`[TUTORIAL] User skipped tutorial for "${currentScreen}"`);
    completeTutorial(); // Option B: Mark as complete (user choice respected)
  };

  return (
    <TutorialContext.Provider value={{
      isActive,
      currentStep,
      totalSteps,
      currentScreen,
      completedTutorials,
      isLoaded,
      initializeTutorials,
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

