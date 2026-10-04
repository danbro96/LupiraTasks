import { vitestConfig } from '@danbro96/lupira-config-ts/vitest';

export default vitestConfig({ server: { deps: { inline: ['@danbro96/lupira-expo-oidc'] } } });
