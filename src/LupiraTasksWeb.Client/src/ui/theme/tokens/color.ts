// Mirrors ../LupiraTasksMobile/src/ui/theme — keep in sync.
export type ColorScheme = {
  bg: string;
  surface: string;
  primary: string;
  onPrimary: string;
  border: string;
  divider: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textDisabled: string;
  danger: string;
};

export const LIGHT: ColorScheme = {
  bg: '#ffffff',
  surface: '#f5f6f8',
  primary: '#0d9488',
  onPrimary: '#ffffff',
  border: '#d4d8e0',
  divider: '#e3e6ec',
  text: '#1c2230',
  textMuted: '#6e7686',
  textSubtle: '#8a909c',
  textDisabled: '#9aa0ac',
  danger: '#b3261e',
};

export const DARK: ColorScheme = {
  bg: '#14171c',
  surface: '#1e232b',
  primary: '#2dd4bf',
  onPrimary: '#042f2e',
  border: '#2c333d',
  divider: '#252b33',
  text: '#e6e9ee',
  textMuted: '#9aa3b2',
  textSubtle: '#7c8492',
  textDisabled: '#5b626e',
  danger: '#f2675e',
};

/** Backdrop for a row someone else just edited. */
export const REMOTE_CHANGE = { light: '#dce9f9', dark: '#25384f' } as const;
