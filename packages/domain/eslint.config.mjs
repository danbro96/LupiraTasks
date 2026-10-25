import { pure } from '@danbro96/lupira-config-eslint';

// Ordering keys are fractional indices and ids are GUIDv7; neither algorithm is worth reimplementing.
export default pure({ tsconfigRootDir: import.meta.dirname, element: 'domain', allowModules: ['fractional-indexing', 'uuid'] });
