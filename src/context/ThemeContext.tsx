import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'jobtrack-theme';
const GLASS_KEY = 'jobtrack-glass';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** Frosted colour-wash look. Stored on this PC only. */
  glass: boolean;
  setGlass: (on: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function readStoredGlass(): boolean {
  try {
    return localStorage.getItem(GLASS_KEY) === '1';
  } catch {
    return false;
  }
}

function applyTheme(theme: Theme, glass: boolean) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('glass', glass);
  try {
    void window.tracker?.setTitleBarOverlay?.({ theme, glass });
  } catch {
    /* web preview / preload not ready */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = readStoredTheme();
    const glass = readStoredGlass();
    applyTheme(stored, glass);
    return stored;
  });
  const [glass, setGlassState] = useState<boolean>(() => readStoredGlass());

  const setTheme = (next: Theme) => {
    setThemeState(next);
    applyTheme(next, glass);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore quota / private mode */
    }
  };

  const setGlass = (on: boolean) => {
    setGlassState(on);
    applyTheme(theme, on);
    try {
      localStorage.setItem(GLASS_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  useEffect(() => {
    applyTheme(theme, glass);
  }, [theme, glass]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, glass, setGlass }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

