import { createTheme } from '@mui/material/styles';
import { DARK, LIGHT, REMOTE_CHANGE, type ColorScheme } from './tokens/color';
import { RADII, SPACING } from './tokens/spacing';
import { FONT_FAMILY } from './tokens/typography';

declare module '@mui/material/styles' {
  interface Palette {
    border: string;
    remoteChange: string;
  }
  interface PaletteOptions {
    border?: string;
    remoteChange?: string;
  }
  interface TypeText {
    subtle: string;
  }
}

function palette(c: ColorScheme, remoteChange: string) {
  return {
    background: { default: c.bg, paper: c.surface },
    primary: { main: c.primary, contrastText: c.onPrimary },
    divider: c.divider,
    border: c.border,
    remoteChange,
    text: { primary: c.text, secondary: c.textMuted, disabled: c.textDisabled, subtle: c.textSubtle },
    error: { main: c.danger },
  };
}

// Custom props must carry units — Emotion serializes them verbatim.
const px = (o: Record<string, number>, prefix: string) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [`--${prefix}-${k}`, `${v}px`]));

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'media' },
  colorSchemes: {
    light: { palette: palette(LIGHT, REMOTE_CHANGE.light) },
    dark: { palette: palette(DARK, REMOTE_CHANGE.dark) },
  },
  // No webfont is loaded; without this MUI assumes Roboto.
  typography: { fontFamily: FONT_FAMILY },
  shape: { borderRadius: RADII.md },
  spacing: SPACING.sm,
  components: {
    MuiCssBaseline: {
      styleOverrides: { ':root': { ...px(SPACING, 'sp'), ...px(RADII, 'r') } },
    },
    // The app is uniformly compact; opt out per-instance rather than repeating size="small".
    MuiButton: { defaultProps: { size: 'small' } },
    MuiIconButton: { defaultProps: { size: 'small' } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiChip: { defaultProps: { size: 'small' } },
    MuiToggleButtonGroup: { defaultProps: { size: 'small' } },
    MuiLink: { defaultProps: { underline: 'hover' } },
    MuiDialogTitle: {
      styleOverrides: { root: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
    },
  },
});
