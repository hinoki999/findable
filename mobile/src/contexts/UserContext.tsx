import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, getUserProfile, saveUserProfile } from '../services/api';

interface UserContextType {
  profile: UserProfile | null;
  loading: boolean;
  updateProfile: (profile: UserProfile) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  profile: null,
  loading: true,
  updateProfile: async () => {},
  refreshProfile: async () => {},
});

export const useUser = () => useContext(UserContext);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    try {
      setLoading(true);
      const data = await getUserProfile();

      // Ensure all fields exist with default values (handle partial/empty profiles from signup)
      setProfile({
        name: data?.name || '',
        email: data?.email || '',
        phone: data?.phone || '',
        bio: data?.bio || '',
        socialMedia: data?.socialMedia || [],
        profile_photo: data?.profile_photo
      });
    } catch (error) {
      console.error('Failed to load profile:', error);
      // Profile doesn't exist yet or fetch failed - initialize empty profile
      setProfile({
        name: '',
        email: '',
        phone: '',
        bio: '',
        socialMedia: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (newProfile: UserProfile) => {
    try {
      await saveUserProfile(newProfile);
      setProfile(newProfile);
    } catch (error) {
      console.error('Failed to update profile:', error);
      throw error;
    }
  };

  // Load profile on mount
  useEffect(() => {
    refreshProfile();
  }, []);

  return (
    <UserContext.Provider value={{ profile, loading, updateProfile, refreshProfile }}>
      {children}
    </UserContext.Provider>
  );
}
