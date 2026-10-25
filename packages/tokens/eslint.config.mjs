import { pure } from '@danbro96/lupira-config-eslint';

export default pure({ tsconfigRootDir: import.meta.dirname, element: 'tokens', allowModules: ['@danbro96/lupira-tokens-*'] });
