import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { translations, type AppLanguage, type TranslationKey } from '../i18n/translations';

/// <summary>
/// Context contract for bilingual UI localization (Bulgarian & English).
/// </summary>
interface LanguageContextProps {
  /// <summary>Currently active UI language ('bg' or 'en').</summary>
  language: AppLanguage;
  /// <summary>Updates and persists the active UI language.</summary>
  setLanguage: (lang: AppLanguage) => void;
  /// <summary>Toggles between Bulgarian ('bg') and English ('en').</summary>
  toggleLanguage: () => void;
  /// <summary>Resolves a translation key for the active language.</summary>
  t: (key: TranslationKey) => string;
}

const STORAGE_KEY = 'appLanguage';

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

/// <summary>
/// Provider managing bilingual state ('bg' | 'en') persisted in localStorage.
/// </summary>
export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'en' || saved === 'bg' ? saved : 'bg';
  });

  const setLanguage = useCallback((lang: AppLanguage) => {
    localStorage.setItem(STORAGE_KEY, lang);
    setLanguageState(lang);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next: AppLanguage = prev === 'bg' ? 'en' : 'bg';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const t = useCallback(
    (key: TranslationKey): string => {
      return translations[language][key] ?? translations.en[key] ?? key;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

/// <summary>
/// Hook for accessing the active language and translation helper.
/// </summary>
export const useLanguage = (): LanguageContextProps => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
