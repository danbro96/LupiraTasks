import { createLupiraMuiTheme, cssVars } from '@danbro96/lupira-web-mui/theme';
import { spacing } from '@danbro96/lupira-tokens-core/spacing';
import { darkColors, lightColors } from '@lupira/tasks-tokens/color';

declare module '@mui/material/styles' {
  interface Palette {
    remoteChange: string;
  }
  interface PaletteOptions {
    remoteChange?: string;
  }
}

export const theme = createLupiraMuiTheme({ light: lightColors, dark: darkColors }, {
  palette: (c) => ({ remoteChange: c.remoteChange }),
  // The dnd-kit rows in index.css are plain DOM and can't read theme.spacing().
  rootVars: { light: cssVars(spacing, 'sp', 'px') },
  // Must live here: MUI is unlayered, so CssBaseline's own body rule outranks the bespoke layer.
  baseline: { body: { backgroundColor: 'var(--mui-palette-background-paper)' } },
  components: {
    MuiDialogTitle: {
      styleOverrides: { root: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
    },
  },
});
