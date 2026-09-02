#!/usr/bin/env node
// Orval writes `.ts` into its relative specifiers — the mutator import, and every re-export in the
// models barrel. TypeScript only accepts those under `allowImportingTsExtensions`, and a shared
// package has no business requiring a compiler flag from its consumers; the mobile app does not set
// it. Strip the extension from every relative import/export here instead.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'src/generated');

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

let fixed = 0;
for (const file of walk(root).filter((f) => f.endsWith('.ts'))) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(/(from '\.[^']*)\.ts'/g, "$1'");
  if (out !== src) {
    writeFileSync(file, out);
    fixed += 1;
  }
}
console.log(`postgen: dropped the .ts extension from ${fixed} file(s)`);
