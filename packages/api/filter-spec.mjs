#!/usr/bin/env node
// Filters the upstream spec down to exposed.json, so the generated clients can only describe what the
// proxy will actually forward. Same source file as routes.mjs — proxy and client cannot disagree.
//
// Tags are left alone: apps/web splits its two orval targets on the `Shared` tag, and retagging would
// collapse the account-less surface into the member client.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const exposed = JSON.parse(readFileSync(join(here, 'exposed.json'), 'utf8'));
const spec = JSON.parse(readFileSync(join(here, 'backend-openapi.json'), 'utf8'));

const allowed = new Set(
  Object.values(exposed).flatMap((group) => Object.values(group).flat()),
);

const isOperation = (op) => op && typeof op === 'object' && 'responses' in op;

const kept = {};
const unlisted = [];
for (const [path, item] of Object.entries(spec.paths ?? {})) {
  const keptOps = {};
  for (const [verb, op] of Object.entries(item)) {
    if (!isOperation(op)) {
      keptOps[verb] = op; // path-level `parameters` and friends
      continue;
    }
    const key = `${verb.toUpperCase()} ${path}`;
    if (!allowed.has(key)) {
      unlisted.push(key);
      continue;
    }
    allowed.delete(key);
    keptOps[verb] = op;
  }
  if (Object.values(keptOps).some(isOperation)) kept[path] = keptOps;
}

// Whatever is left never matched an upstream operation.
const stale = [...allowed];

/** Every schema reachable by $ref from the kept operations — dropping /me should drop an orphaned MeDto. */
function reachableSchemas(paths, schemas) {
  const live = new Set();
  const queue = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') {
        const name = v.replace('#/components/schemas/', '');
        if (!live.has(name)) { live.add(name); queue.push(name); }
      } else visit(v);
    }
  };
  visit(paths);
  while (queue.length) visit(schemas[queue.pop()]);
  return live;
}

const live = reachableSchemas(kept, spec.components?.schemas ?? {});
const schemas = Object.fromEntries(
  Object.entries(spec.components?.schemas ?? {})
    .filter(([name]) => live.has(name))
    .sort(([a], [b]) => a.localeCompare(b)),
);

const out = {
  openapi: spec.openapi,
  info: { ...spec.info, title: 'LupiraTasks BFF' },
  paths: Object.fromEntries(Object.entries(kept).sort(([a], [b]) => a.localeCompare(b))),
  components: { schemas },
};
writeFileSync(join(here, 'bff-openapi.json'), `${JSON.stringify(out, null, 2)}\n`);

const verbs = Object.values(kept).reduce((n, i) => n + Object.values(i).filter(isOperation).length, 0);
console.log(`spec: ${Object.keys(kept).length} paths, ${verbs} operations, ${Object.keys(schemas).length} schemas`);
if (unlisted.length)
  console.log(`\nnot exposed — add to exposed.json to publish (${unlisted.length}):\n${unlisted.map((k) => `  ${k}`).join('\n')}`);
// An allowlisted operation the upstream no longer has: the spec moved and exposed.json did not.
if (stale.length)
  throw new Error(`exposed.json lists operations no upstream declares:\n${stale.map((k) => `  ${k}`).join('\n')}`);
