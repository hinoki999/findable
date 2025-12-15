import React, { createContext, useContext, ReactNode } from 'react';

interface TabNavigationContextType {
  navigateToTab: (tab: 'Home' | 'Drop' | 'History' | 'Account') => void;
}

const TabNavigationContext = createContext<TabNavigationContextType>({
  navigateToTab: () => {},
});

export const TabNavigationProvider: React.FC<{
  children: ReactNode;
  navigateToTab: (tab: 'Home' | 'Drop' | 'History' | 'Account') => void;
}> = ({ children, navigateToTab }) => {
  return (
    <TabNavigationContext.Provider value={{ navigateToTab }}>
      {children}
    </TabNavigationContext.Provider>
  );
};

export const useTabNavigation = () => {
  const context = useContext(TabNavigationContext);
  return context;
};

