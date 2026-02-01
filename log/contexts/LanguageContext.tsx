import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { DEFAULT_LANG, SupportedLang, SUPPORTED_LANGS } from '../lib/i18n';

interface LanguageContextType {
  lang: SupportedLang;
  setLang: (newLang: SupportedLang) => void;
  availableLangs: readonly SupportedLang[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}

interface LanguageProviderProps {
  children: ReactNode;
  initialLang?: SupportedLang;
}

export function LanguageProvider({ children, initialLang }: LanguageProviderProps) {
  const router = useRouter();
  const [lang, setLangState] = useState<SupportedLang>(initialLang || DEFAULT_LANG);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (initialLang) {
      setLangState(initialLang);
      setIsReady(true);
    }
  }, [initialLang]);

  const setLang = (newLang: SupportedLang) => {
    if (!SUPPORTED_LANGS.includes(newLang) || newLang === lang) {
      return;
    }

    setLangState(newLang);
    localStorage.setItem('preferred-lang', newLang);

    const currentPath = router.asPath;
    const pathParts = currentPath.split('/').filter(Boolean);
    
    if (SUPPORTED_LANGS.includes(pathParts[0] as SupportedLang)) {
      pathParts[0] = newLang;
    } else {
      pathParts.unshift(newLang);
    }

    const newPath = '/' + pathParts.join('/');
    router.push(newPath);
  };

  if (!isReady) {
    return <>{children}</>;
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, availableLangs: SUPPORTED_LANGS }}>
      {children}
    </LanguageContext.Provider>
  );
}
