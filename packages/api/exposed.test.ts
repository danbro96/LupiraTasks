import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Cross-checks the three committed artifacts against each other. Nothing here imports the generators:
// it asserts the checked-in outputs agree, which is what catches a stale `npm run gen:api`.
// The `/api` prefix is re-derived here rather than imported, so the check isn't circular.
const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

const exposed: Record<string, Record<string, string[]>> = read('../../src/LupiraTasksBff/exposed.json');
const spec: { paths: Record<string, Record<string, unknown>> } = read('../../openapi/LupiraTasksBff.json');
const routes: Record<string, {
  ClusterId: string;
  AuthorizationPolicy: string;
  Match: { Path: string; Methods?: string[] };
}> = read('../../src/LupiraTasksBff/appsettings.json').ReverseProxy.Routes;

const PREFIX = '/api';
const isOperation = (op: unknown): boolean =>
  !!op && typeof op === 'object' && 'responses' in (op as object);

// A proxied operation carries one of the upstream's tags. Anything else the BFF declares itself, so
// it has no allowlist entry and no route — that is how an endpoint leaves the proxy.
const UPSTREAM_TAGS = new Set(['Lists', 'Items', 'Shares', 'Sync', 'Me', 'Shared', 'Users']);
const isProxied = (op: unknown): boolean =>
  (((op as { tags?: string[] })?.tags ?? []).some((t) => UPSTREAM_TAGS.has(t)));

const specOps = Object.entries(spec.paths).flatMap(([path, item]) =>
  Object.entries(item)
    .filter(([, op]) => isOperation(op) && isProxied(op))
    .map(([verb]) => `${verb.toUpperCase()} ${path}`),
);

/** Paths the BFF answers itself — asserted separately, since nothing proxies them. */
const bffOwnedOps = Object.entries(spec.paths).flatMap(([path, item]) =>
  Object.entries(item)
    .filter(([, op]) => isOperation(op) && !isProxied(op))
    .map(([verb]) => `${verb.toUpperCase()} ${path}`),
);

// The rule the merger and routes.mjs both apply, restated here so this file is the arbiter of the
// three: guest routes drop the token segment, because it comes from the guest cookie.
const UPSTREAM_GUEST_PREFIX = '/shared/{token}';
const GUEST_MOUNT = '/share';
const bffPath = (path: string) =>
  path.startsWith(UPSTREAM_GUEST_PREFIX) ? GUEST_MOUNT + path.slice(UPSTREAM_GUEST_PREFIX.length) : path;

const allowlisted = Object.values(exposed).flatMap((group) =>
  Object.values(group)
    .flat()
    .map((op) => {
      const [verb, path] = op.split(' ');
      return `${verb} ${PREFIX}${bffPath(path)}`;
    }),
);

const routedOps = Object.values(routes).flatMap((r) =>
  (r.Match.Methods ?? []).map((m) => `${m} ${r.Match.Path}`),
);

describe('the allowlist', () => {
  it('publishes the BFF\'s own endpoints alongside the proxied ones', () => {
    expect(bffOwnedOps.sort()).toEqual(['GET /auth/user', 'POST /auth/guest']);
  });

  it('is the whole of the published surface — nothing rides along', () => {
    const allowed = new Set(allowlisted);
    expect(specOps.filter((op) => !allowed.has(op))).toEqual([]);
    expect(specOps).toHaveLength(allowed.size);
  });

  it('routes exactly the operations the spec declares', () => {
    const routed = new Set(routedOps);
    expect(specOps.filter((op) => !routed.has(op))).toEqual([]);
    expect(routed.size).toBe(specOps.length);
  });

  // A catch-all forwards whatever the upstream adds under that resource, unreviewed. Tasks proxies no
  // file subtree, so unlike cal-web there is no legitimate wildcard at all.
  it('has no catch-all route, and pins the verbs on every route', () => {
    expect(Object.values(routes).filter((r) => r.Match.Path.includes('**'))).toEqual([]);
    for (const [name, route] of Object.entries(routes)) {
      expect(route.Match.Methods?.length, name).toBeGreaterThan(0);
    }
  });

  // These answer to a different credential than the family session the BFF holds, or aren't a browser
  // surface at all. None appear in the OpenAPI document, so the allowlist excludes them structurally —
  // this fails loudly if one is ever re-added by hand.
  it('never exposes the DAV seam, MCP, or the probe and doc endpoints', () => {
    const forbidden = /^\/api\/(dav-backend|mcp|\.well-known|pingz|livez|readyz|openapi|scalar)(\/|$)/;
    expect(Object.keys(spec.paths).filter((p) => forbidden.test(`${PREFIX}${p}`))).toEqual([]);
    expect(Object.values(routes).filter((r) => forbidden.test(r.Match.Path))).toEqual([]);
  });

  // `POST /shares/redeem` is member-authed and one letter from the account-less `/share` surface; a
  // prefix rule instead of exact templates would silently downgrade its auth.
  it('gives the share-link surface the guest policy and nothing else', () => {
    for (const [name, route] of Object.entries(routes)) {
      const guest = route.Match.Path === `${PREFIX}/share`
        || route.Match.Path.startsWith(`${PREFIX}/share/`);
      expect(route.AuthorizationPolicy, name).toBe(guest ? 'Guest' : 'Default');
    }
    expect(routes['tasks-api-shares-redeem'].AuthorizationPolicy).toBe('Default');
  });
});
