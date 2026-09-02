import tseslint from 'typescript-eslint';

// The generators are plain node scripts, not part of either app's layered source, so the only thing
// here to lint is the cross-check test.
export default [
  { ignores: ['node_modules/**', '*.mjs'] },
  {
    files: ['*.test.ts'],
    languageOptions: { parser: tseslint.parser },
  },
];
