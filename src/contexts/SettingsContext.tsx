import React, { createContext, useContext, useState, useCallback } from 'react';

interface SettingsContextProps {
  apiKey: string;
  redmineUrl: string;
  setApiKey: (key: string) => void;
  setRedmineUrl: (url: string) => void;
  isConfigured: boolean;
  /** Incremented each time settings are saved, so dependent contexts can refetch */
  settingsVersion: number;
}

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiKey, setApiKeyState] = useState<string>(() => localStorage.getItem('redmineApiKey') || '');
  const [redmineUrl, setRedmineUrlState] = useState<string>(() => localStorage.getItem('redmineUrl') || '');
  const [settingsVersion, setSettingsVersion] = useState(0);

  const setApiKey = useCallback((key: string) => {
    localStorage.setItem('redmineApiKey', key);
    setApiKeyState(key);
    setSettingsVersion(v => v + 1);
  }, []);

  const setRedmineUrl = useCallback((url: string) => {
    let normalized = url;
    if (normalized && !/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
    normalized = normalized.replace(/\/$/, '');
    localStorage.setItem('redmineUrl', normalized);
    setRedmineUrlState(normalized);
    setSettingsVersion(v => v + 1);
  }, []);

  const isConfigured = Boolean(apiKey && redmineUrl);

  return (
    <SettingsContext.Provider
      value={{ apiKey, redmineUrl, setApiKey, setRedmineUrl, isConfigured, settingsVersion }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
