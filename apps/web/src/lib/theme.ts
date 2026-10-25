import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';

const KEY = 'kr.theme';

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') return systemDark() ? 'dark' : 'light';
  return pref;
}

export function applyTheme(pref: ThemePreference): void {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref));
}

interface ThemeState {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  toggle: () => void;
}

/** UI-only state (plan: Zustand for UI state only). Stored as a plain string for theme-init.js. */
export const useTheme = create<ThemeState>((set, get) => ({
  preference: read(),
  setPreference: (preference) => {
    try {
      localStorage.setItem(KEY, preference);
    } catch {
      /* storage unavailable */
    }
    applyTheme(preference);
    set({ preference });
  },
  toggle: () => {
    const next = resolveTheme(get().preference) === 'dark' ? 'light' : 'dark';
    get().setPreference(next);
  },
}));

/** Follow OS changes while the preference is "system". */
export function watchSystemTheme(): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (useTheme.getState().preference === 'system') applyTheme('system');
  };
  media.addEventListener('change', onChange);
  return () => {
    media.removeEventListener('change', onChange);
  };
}
