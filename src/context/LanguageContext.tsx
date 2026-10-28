import React, { createContext, useContext, useState, useEffect } from 'react';
import { SupportedLanguage } from '../types';
import { translations, TranslationDictionary } from '../locales/translations';
import { useAuth } from './AuthContext';
import { createOrUpdateUserProfile } from '../services/dbService';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, fallback?: string) => string;
  availableLanguages: Array<{ code: SupportedLanguage; label: string; nativeName: string; flag: string }>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'resqbite_preferred_language';

export const AVAILABLE_LANGUAGES: Array<{ code: SupportedLanguage; label: string; nativeName: string; flag: string }> = [
  { code: 'en', label: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'kn', label: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳' },
  { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'ta', label: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
];

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, userProfile } = useAuth();

  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as SupportedLanguage;
      if (stored && ['en', 'kn', 'hi', 'ta'].includes(stored)) {
        return stored;
      }
    } catch {
      // Ignore
    }
    return 'en';
  });

  // Sync from userProfile if available
  useEffect(() => {
    if (userProfile?.preferredLanguage && userProfile.preferredLanguage !== language) {
      setLanguageState(userProfile.preferredLanguage);
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, userProfile.preferredLanguage);
      } catch {
        // Ignore
      }
    }
  }, [userProfile?.preferredLanguage]);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // Ignore
    }

    // Persist to user profile in Firestore if authenticated
    if (currentUser) {
      createOrUpdateUserProfile({
        uid: currentUser.uid,
        email: currentUser.email || '',
        preferredLanguage: lang,
      }).catch((err) => {
        console.warn('Could not persist language preference to profile:', err);
      });
    }
  };

  const t = (key: string, fallback?: string): string => {
    const dict: TranslationDictionary = translations[language] || translations.en;
    if (dict[key]) {
      return dict[key];
    }
    // Fallback to English if missing in selected language
    if (translations.en[key]) {
      return translations.en[key];
    }
    return fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, availableLanguages: AVAILABLE_LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextType {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
