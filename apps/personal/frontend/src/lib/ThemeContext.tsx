"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { ThemeConfig } from "@/types";

interface ThemeContextValue {
  theme: ThemeConfig;
  setTheme: (t: ThemeConfig) => void;
}

const DEFAULT_THEME: ThemeConfig = { mode: "dark", accent: "#0284c7" };

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return [r, g, b];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function clamp(v: number, min = 0, max = 255) { return Math.max(min, Math.min(max, v)); }

function applyAccent(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const [r, g, b] = rgb;
  const [h, s, l] = rgbToHsl(r, g, b);

  const shade = (dL: number, dS = 0) => {
    const [nr, ng, nb] = hslToRgb(h, clamp(s + dS, 0, 100), clamp(l + dL, 2, 96));
    return `${clamp(nr)} ${clamp(ng)} ${clamp(nb)}`;
  };

  const root = document.documentElement;
  root.style.setProperty("--accent-50",  shade(+52, -30));
  root.style.setProperty("--accent-300", shade(+26, -12));
  root.style.setProperty("--accent-400", shade(+15, -6));
  root.style.setProperty("--accent-500", shade(+7,  -2));
  root.style.setProperty("--accent-600", `${r} ${g} ${b}`);
  root.style.setProperty("--accent-700", shade(-12, +3));
}

function applyTheme(theme: ThemeConfig) {
  document.documentElement.setAttribute("data-theme", theme.mode);
  applyAccent(theme.accent);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeConfig>(DEFAULT_THEME);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("app_theme");
      if (stored) {
        const parsed: ThemeConfig = JSON.parse(stored);
        setThemeState(parsed);
        applyTheme(parsed);
        return;
      }
    } catch {}
    applyTheme(DEFAULT_THEME);
  }, []);

  const setTheme = useCallback((t: ThemeConfig) => {
    setThemeState(t);
    applyTheme(t);
    localStorage.setItem("app_theme", JSON.stringify(t));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
