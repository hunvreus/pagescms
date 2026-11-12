"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { translate, type Locale } from "@/lib/i18n/messages";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [currentLocale, setCurrentLocale] = useState<Locale>("zh-CN");

  const setLocale = (nextLocale: Locale) => {
    setCurrentLocale(nextLocale);
    document.documentElement.lang = nextLocale;
    document.cookie = `pagescms-locale=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
  };

  useEffect(() => {
    setLocale("zh-CN");
  }, []);

  return (
    <I18nContext.Provider value={{ locale: currentLocale, setLocale, t: translate }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n 必须在 I18nProvider 内使用");
  return context;
}
