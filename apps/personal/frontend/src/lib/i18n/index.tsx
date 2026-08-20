"use client";
import {
  createContext, useContext, useState, useCallback, useEffect,
  type ReactNode,
} from "react";
import en, { type TranslationKey } from "./en";
import id from "./id";

export type Locale = "en" | "id";

const LOCALES: Record<Locale, Record<TranslationKey, string>> = { en, id };
const LS_KEY = "ka_locale";

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) as Locale | null;
    if (saved === "en" || saved === "id") setLocaleState(saved);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(LS_KEY, l);
    // Sync to backend settings (fire-and-forget)
    fetch("http://localhost:8000/api/settings")
      .then((r) => r.json())
      .then((s) => {
        const updated = { ...s, theme: { ...(s.theme ?? {}), locale: l } };
        fetch("http://localhost:8000/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
      })
      .catch(() => {});
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const str = LOCALES[locale][key] ?? en[key] ?? key;
      return interpolate(str, vars);
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx.t;
}

export function useLocale() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLocale must be used within I18nProvider");
  return { locale: ctx.locale, setLocale: ctx.setLocale };
}
