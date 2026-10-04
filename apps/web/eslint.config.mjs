import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** v7 entity-selector helper: `to('data','state')` → [{ to: { element: { type: 'data' } } }, …]. */
const to = (...types) => types.map((t) => ({ to: { element: { type: t } } }));

// Mirrors the mobile app's eslint.config.mjs: a structural gate, not a style overhaul. The only
// real rule is the layered import boundary. Downward-only: domain → nothing; data → domain/config;
// state → data/domain/config; ui → everything below. The web has no offline `sync/` layer (it is
// online-only), so the chain is shorter than the app's.
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'src/data/api/lupiraTasksApi.ts', // orval placeholder (generated; spec is a stub)
      'src/data/api/models/**',
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { boundaries, 'react-hooks': reactHooks },
    settings: {
      'boundaries/elements': [
        { type: 'data', pattern: 'src/data/**' },
        { type: 'state', pattern: 'src/state/**' },
        { type: 'ui', pattern: 'src/ui/**' },
        { type: 'config', pattern: 'src/config' },
      ],
      'import/resolver': { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        policies: [
          { from: { element: { type: 'data' } }, allow: to('data', 'config') },
          { from: { element: { type: 'state' } }, allow: to('state', 'data', 'config') },
          { from: { element: { type: 'ui' } }, allow: to('ui', 'state', 'data', 'config') },
          { from: { element: { type: 'config' } }, allow: [] },
        ],
      }],
      ...reactHooks.configs['recommended-latest'].rules,
    },
  },
];
