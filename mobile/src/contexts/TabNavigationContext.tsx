import React, { createContext, useContext, useState, ReactNode } from 'react';

interface TabNavigationContextType {
  navigateToTab: (tab: 'Home' | 'Drop' | 'History' | 'Account') => void;
  focusContactId: string | null;
  setFocusContactId: (id: string | null) => void;
}

const TabNavigationContext = createContext<TabNavigationContextType>({
  navigateToTab: () => { },
  focusContactId: null,
  setFocusContactId: () => { },
});

export const TabNavigationProvider: React.FC<{
  children: ReactNode;
  navigateToTab: (tab: 'Home' | 'Drop' | 'History' | 'Account') => void;
}> = ({ children, navigateToTab }) => {
  const [focusContactId, setFocusContactId] = useState<string | null>(null);
  return (
    <TabNavigationContext.Provider value={{ navigateToTab, focusContactId, setFocusContactId }}>
      {children}
    </TabNavigationContext.Provider>
  );
};

export const useTabNavigation = () => {
  const context = useContext(TabNavigationContext);
  return context;
};