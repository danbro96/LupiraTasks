import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

// Purity by construction: production modules may import nothing but each other and the one pure
// dependency below — no generated DTO types, no platform APIs. Test files are exempted in a trailing
// override block (v7 element patterns match folders, so a `src/**/*.test.ts` element can never classify
// files — they'd silently fall into `domain` and the exemption would not apply).
const INTERNAL = { from: { element: { type: 'domain' } }, allow: [{ to: { element: { type: 'domain' } } }] };
// Ordering keys are fractional indices; the algorithm is not worth reimplementing.
const PRODUCTION = [
  INTERNAL,
  { from: { element: { type: 'domain' } }, allow: [{ to: { module: { origin: ['external', 'core'], source: 'fractional-indexing' } } }] },
];

export default [
  { ignores: ['node_modules/**', '*.config.ts'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: 'src/**' },
      ],
      'import/resolver': { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      // checkAllOrigins widens the rule from local elements to npm imports as well.
      'boundaries/dependencies': ['error', { checkAllOrigins: true, default: 'disallow', policies: PRODUCTION }],
    },
  },
  {
    // Tests may use the runner + node builtins for fixtures; the boundary gate is for production code.
    files: ['src/**/*.test.ts'],
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', policies: PRODUCTION }],
    },
  },
];
