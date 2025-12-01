import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { supabase } from '../services/supabase';

export type ScreenName = 'Home' | 'Drop' | 'History';

interface TutorialContextType {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  currentScreen: ScreenName | null;
  shouldShowTutorials: boolean | null;
  initializeTutorials: () => Promise<void>;
  startScreenTutorial: (screen: ScreenName, steps: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const TutorialProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // State variables
  const [shouldShowTutorials, setShouldShowTutorials] = useState<boolean | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [currentScreen, setCurrentScreen] = useState<ScreenName | null>(null);
  
  // Session tracking - which screens shown this session
  const shownScreens = useRef<Set<ScreenName>>(new Set());

  /**
   * Initialize tutorials by checking Supabase onboarding status
   * Called once on app startup
   */
  const initializeTutorials = async () => {
    try {
      console.log('[TUTORIAL] Initializing tutorials...');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.log('[TUTORIAL] No session, setting shouldShowTutorials = false');
        setShouldShowTutorials(false);
        return;
      }
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('has_completed_onboarding')
        .eq('user_id', session.user.id)
        .single();
      
      if (error) {
        console.error('[TUTORIAL] Error checking onboarding:', error);
        setShouldShowTutorials(false); // Fail safe: don't show on error
        return;
      }
      
      // Treat NULL as FALSE (for existing users without the column set)
      const hasCompleted = data?.has_completed_onboarding ?? false;
      const shouldShow = !hasCompleted;
      
      console.log('[TUTORIAL] Onboarding check:', {
        hasCompleted,
        shouldShow
      });
      
      setShouldShowTutorials(shouldShow);
      
    } catch (error) {
      console.error('[TUTORIAL] initializeTutorials error:', error);
      setShouldShowTutorials(false); // Fail safe
    }
  };

  /**
   * Start tutorial for a specific screen
   * Called when screen mounts
   */
  const startScreenTutorial = (screen: ScreenName, steps: number) => {
    console.log(`[TUTORIAL] startScreenTutorial("${screen}", ${steps})`);
    
    // Check 1: Should we show tutorials at all?
    if (shouldShowTutorials !== true) {
      console.log(`[TUTORIAL] shouldShowTutorials is ${shouldShowTutorials}, skipping`);
      return;
    }
    
    // Check 2: Already shown this screen this session?
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
   * Mark onboarding as complete in Supabase
   * Called by nextStep (on last step) OR skipTutorial
   */
  const completeTutorial = async () => {
    console.log('[TUTORIAL] Marking onboarding as complete');
    
    // Close tutorial immediately (optimistic UI)
    setIsActive(false);
    setCurrentStep(0);
    setCurrentScreen(null);
    setShouldShowTutorials(false); // Don't show again this session
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.error('[TUTORIAL] No session, cannot mark complete');
        return;
      }
      
      const { error } = await supabase
        .from('user_profiles')
        .update({ has_completed_onboarding: true })
        .eq('user_id', session.user.id);
      
      if (error) {
        console.error('[TUTORIAL] Error marking complete:', error);
        // Don't revert UI state - fail gracefully
      } else {
        console.log('[TUTORIAL] Successfully marked onboarding complete in Supabase');
      }
    } catch (error) {
      console.error('[TUTORIAL] completeTutorial error:', error);
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
      shouldShowTutorials,
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

