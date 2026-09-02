#!/usr/bin/env node
// Writes ReverseProxy.Routes in the BFF's appsettings.json from exposed.json.
//
// One route per exact path template, constrained to the verbs the allowlist names. A `{**catch-all}`
// would forward whatever the upstream later adds under that resource — including /mcp and the
// /dav-backend seam, which answer to a different credential than the family session.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const settingsPath = join(here, '..', '..', 'src/LupiraTasksBff/appsettings.json');

const PREFIX = { 'tasks-api': '/api' };

// Guest routes drop the token segment; Program.cs replays it. ExposedSurface.BffPath is the same rule.
const UPSTREAM_GUEST_PREFIX = '/shared/{token}';
const GUEST_MOUNT = '/share';
const bffPath = (path) =>
  path.startsWith(UPSTREAM_GUEST_PREFIX) ? GUEST_MOUNT + path.slice(UPSTREAM_GUEST_PREFIX.length) : path;

// Each group is a routing class. `guest` is the account-less share surface: its own cookie scheme, and
// Program.cs replays the share token onto the upstream path instead of forwarding a member credential.
const POLICY = { operations: 'Default', guest: 'Guest' };

const exposed = JSON.parse(readFileSync(join(here, '..', '..', 'src/LupiraTasksBff/exposed.json'), 'utf8'));
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

const routes = {};
const seen = new Map();

for (const [group, policy] of Object.entries(POLICY)) {
  for (const [cluster, ops] of Object.entries(exposed[group] ?? {})) {
    const prefix = PREFIX[cluster];
    if (!prefix) throw new Error(`No BFF prefix for cluster ${cluster}`);

    const byPath = new Map();
    for (const op of ops) {
      const [verb, upstream] = op.split(' ');
      const path = bffPath(upstream);
      if (!byPath.has(path)) byPath.set(path, new Set());
      byPath.get(path).add(verb);
    }

    for (const [path, verbs] of [...byPath].sort(([a], [b]) => a.localeCompare(b))) {
      const key = `${cluster}${path}`.replace(/[{}]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '');
      if (seen.has(key)) throw new Error(`Route key collision: ${key} (${seen.get(key)} vs ${cluster}${path})`);
      seen.set(key, `${cluster}${path}`);

      routes[key] = {
        ClusterId: cluster,
        AuthorizationPolicy: policy,
        Match: { Path: `${prefix}${path}`, Methods: [...verbs].sort() },
        Transforms: [{ PathRemovePrefix: prefix }],
      };
    }
  }
}

settings.ReverseProxy.Routes = routes;
writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

const verbs = Object.values(routes).reduce((n, r) => n + r.Match.Methods.length, 0);
console.log(`routes: ${Object.keys(routes).length} path templates, ${verbs} verbs`);
