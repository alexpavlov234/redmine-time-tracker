import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { getCurrentUser } from '../services/redmine';
import { useSettings } from './SettingsContext';

interface UserContextProps {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const UserContext = createContext<UserContextProps | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isConfigured, settingsVersion } = useSettings();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = async () => {
    if (!isConfigured) {
      setUser(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch (err: any) {
      console.error('Failed to fetch current user:', err);
      setError(err.message || 'Failed to fetch user');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [isConfigured, settingsVersion]);

  return (
    <UserContext.Provider value={{ user, isLoading, error, refetch: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
