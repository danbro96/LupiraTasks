import { darkColors as coreDark, lightColors as coreLight, type Palette as CorePalette } from '@danbro96/lupira-tokens-core/color';

export interface Palette extends CorePalette {
  pending: string;
  failed: string;
  /** Backdrop for a row that just changed because someone else edited it. */
  remoteChange: string;
  bannerOffline: string;
  bannerUnreachable: string;
  bannerSyncing: string;
  toastBg: string;
  toastAction: string;
}

export const lightColors: Palette = {
  ...coreLight,
  pending: '#d8a200',
  failed: '#b3261e',
  remoteChange: '#dce9f9',
  bannerOffline: '#5b4b18',
  bannerUnreachable: '#7a1f1f',
  bannerSyncing: '#0f766e',
  toastBg: '#2b2f36',
  toastAction: '#2dd4bf',
};

export const darkColors: Palette = {
  ...coreDark,
  pending: '#d8a200',
  failed: '#f2675e',
  remoteChange: '#25384f',
  bannerOffline: '#5b4b18',
  bannerUnreachable: '#7a1f1f',
  bannerSyncing: '#115e59',
  toastBg: '#2b2f36',
  toastAction: '#2dd4bf',
};

/** The selectable list colors offered in List settings. `null` = no color. */
export const listColorOptions: (string | null)[] = [
  null,
  '#d23b3b',
  '#e8820e',
  '#2a9d5a',
  '#3a86c8',
  '#8a4fc4',
  '#5b6470',
];
