import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** v7 object-selector helper: `to('domain','generated')` → [{ to: { element: { type: 'domain' } } }, …]. */
const to = (...types) => types.map((t) => ({ to: { element: { type: t } } }));
const platform = (source, internalPath) => ({ to: { module: { origin: 'external', source, ...(internalPath && { internalPath }) } } });
const fromEach = (types, allow) => types.map((t) => ({ from: { element: { type: t } }, allow }));
const DATA_UP = ['data', 'sync', 'state', 'ui'];

// Lint config focused on ONE thing: enforcing the layered architecture (see README).
// It is deliberately NOT a style overhaul — only the import-boundary rule is on, so it acts
// as a structural gate. Broader rule sets (eslint-config-expo, type-aware rules) can be layered in
// later. The dependency rule is downward-only: domain → nothing (but the generated DTO *types*);
// data → domain; sync → data/domain; state → sync/…; ui → everything; `config` may be imported by
// anyone but imports no app layer itself. LupiraPlatform (@danbro96) packages sit at the layer their name
// declares: tokens/domain/sync-core everywhere, http from data up (domain may name its ApiError), the feedback/debug
// log/oidc leaves from data up, the Paper kit and diagnostics screens from ui only.
export default [
  {
    ignores: [
      'node_modules/**',
      'src/data/api/generated/**', // orval-generated client — not hand-authored
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'App.tsx', 'index.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { boundaries, 'react-hooks': reactHooks },
    settings: {
      // Map each folder to a layer "element". Order matters: `generated` is listed before `data`
      // so the generated subtree is classified as its own (importable-by-anyone) element.
      'boundaries/elements': [
        { type: 'generated', pattern: 'src/data/api/generated/**' },
        { type: 'domain', pattern: 'src/domain/**' },
        { type: 'data', pattern: 'src/data/**' },
        { type: 'sync', pattern: 'src/sync/**' },
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
          { from: { element: { type: 'domain' } }, allow: to('domain', 'generated') },
          { from: { element: { type: 'generated' } }, allow: to('generated', 'data') },
          { from: { element: { type: 'data' } }, allow: to('data', 'domain', 'generated', 'config') },
          { from: { element: { type: 'sync' } }, allow: to('sync', 'data', 'domain', 'generated', 'config') },
          { from: { element: { type: 'state' } }, allow: to('state', 'sync', 'data', 'domain', 'generated', 'config') },
          { from: { element: { type: 'ui' } }, allow: to('ui', 'state', 'sync', 'data', 'domain', 'generated', 'config') },
          { from: { element: { type: 'config' } }, allow: [] },
          { allow: [{ to: { module: { origin: ['external', 'core'] } } }] },
          { disallow: [platform('@danbro96/*')] },
          { allow: [platform(['@danbro96/lupira-tokens-*', '@danbro96/lupira-domain-*', '@danbro96/lupira-sync-core'])] },
          { from: { element: { type: 'domain' } }, allow: [platform('@danbro96/lupira-http', 'apiError')] },
          ...fromEach(DATA_UP, [
            platform('@danbro96/lupira-http'),
            platform('@danbro96/lupira-expo-feedback'),
            platform('@danbro96/lupira-expo-diagnostics', 'log'),
            platform('@danbro96/lupira-expo-oidc', 'oidc'),
          ]),
          { from: { element: { type: 'ui' } }, allow: [platform(['@danbro96/lupira-expo-paper', '@danbro96/lupira-expo-diagnostics'])] },
        ],
        checkAllOrigins: true,
      }],
      // Hook correctness plus the React Compiler's diagnostics.
      ...reactHooks.configs['recommended-latest'].rules,
    },
  },
];
