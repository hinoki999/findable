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

  /**
   * Initialize tutorials by checking Supabase per-screen completion status
   * Called once on app startup
   */
  const initializeTutorials = async () => {
    try {
      console.log('[TUTORIAL] Initializing per-screen tutorials...');
      
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
        .from('tutorial_completions')
        .select('home_completed, drop_completed, history_completed, account_completed')
        .eq('user_id', session.user.id)
        .single();
      
      if (error) {
        // If row doesn't exist, create it
        if (error.code === 'PGRST116') {
          console.log('[TUTORIAL] No tutorial_completions row found, creating new row...');
          const { error: insertError } = await supabase
            .from('tutorial_completions')
            .insert({
              user_id: session.user.id,
              home_completed: false,
              drop_completed: false,
              history_completed: false,
              account_completed: false,
            });
          
          if (insertError) {
            console.error('[TUTORIAL] Error creating tutorial_completions row:', insertError);
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
          
          // Row created, set all to false (show all tutorials)
          console.log('[TUTORIAL] Created new tutorial_completions row, all tutorials will show');
          setCompletedTutorials({
            Home: false,
            Drop: false,
            History: false,
            Account: false,
          });
          setIsLoaded(true);
          return;
        }
        
        console.error('[TUTORIAL] Error checking tutorial status:', error);
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
      
      // Treat NULL as FALSE (show tutorial if not explicitly completed)
      const completed = {
        Home: data?.home_completed ?? false,
        Drop: data?.drop_completed ?? false,
        History: data?.history_completed ?? false,
        Account: data?.account_completed ?? false,
      };
      
      console.log('[TUTORIAL] Per-screen status loaded:', completed);
      setCompletedTutorials(completed);
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
   * Mark specific screen tutorial as complete in Supabase
   * Called by nextStep (on last step) OR skipTutorial
   */
  const completeTutorial = async () => {
    if (!currentScreen) return;
    
    console.log(`[TUTORIAL] Marking "${currentScreen}" tutorial as complete`);
    
    // Close tutorial immediately (optimistic UI)
    setIsActive(false);
    setCurrentStep(0);
    const screenToComplete = currentScreen;
    setCurrentScreen(null);
    
    // Update local state
    setCompletedTutorials(prev => ({
      ...prev,
      [screenToComplete]: true,
    }));
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.error('[TUTORIAL] No session, cannot mark complete');
        return;
      }
      
      // Map screen name to database column
      const columnMap: Record<ScreenName, string> = {
        Home: 'home_completed',
        Drop: 'drop_completed',
        History: 'history_completed',
        Account: 'account_completed',
      };
      
      const columnName = columnMap[screenToComplete];
      
      const { error } = await supabase
        .from('tutorial_completions')
        .update({ [columnName]: true })
        .eq('user_id', session.user.id);
      
      if (error) {
        console.error(`[TUTORIAL] Error marking "${screenToComplete}" complete:`, error);
        // Don't revert UI state - fail gracefully
      } else {
        console.log(`[TUTORIAL] Successfully marked "${screenToComplete}" tutorial complete in Supabase`);
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

