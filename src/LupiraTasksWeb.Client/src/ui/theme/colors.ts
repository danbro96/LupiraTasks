// The rest of the palette (bg/surface/primary/text/…) lives in index.css as CSS variables, ported
// 1:1 from the mobile app's theme/colors.ts (light + dark via prefers-color-scheme). This module
// holds only the tokens the components need as values rather than CSS: the list color choices.

/** Selectable list colors, mirroring the mobile app's `listColorOptions`. `null` = no color. */
export const listColorOptions: (string | null)[] = [
  null,
  '#d23b3b',
  '#e8820e',
  '#2a9d5a',
  '#3a86c8',
  '#8a4fc4',
  '#5b6470',
];
