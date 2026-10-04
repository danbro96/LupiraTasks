import { createPaperThemes } from '@danbro96/lupira-expo-paper/theme/paperTheme';
import { darkColors, lightColors } from '@lupira/tasks-tokens/color';

export const { paperLight, paperDark, navLight, navDark } = createPaperThemes(lightColors, darkColors);
