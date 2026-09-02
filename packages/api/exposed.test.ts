import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Cross-checks the three committed artifacts against each other. Nothing here imports the generators:
// it asserts the checked-in outputs agree, which is what catches a stale `npm run gen:api`.
// The `/api` prefix is re-derived here rather than imported, so the check isn't circular.
const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

const exposed: Record<string, Record<string, string[]>> = read('./exposed.json');
const spec: { paths: Record<string, Record<string, unknown>> } = read('./bff-openapi.json');
const routes: Record<string, {
  ClusterId: string;
  AuthorizationPolicy: string;
  Match: { Path: string; Methods?: string[] };
}> = read('../../src/LupiraTasksBff/appsettings.json').ReverseProxy.Routes;

const PREFIX = '/api';
const isOperation = (op: unknown): boolean =>
  !!op && typeof op === 'object' && 'responses' in (op as object);

const specOps = Object.entries(spec.paths).flatMap(([path, item]) =>
  Object.entries(item)
    .filter(([, op]) => isOperation(op))
    .map(([verb]) => `${verb.toUpperCase()} ${PREFIX}${path}`),
);

const allowlisted = Object.values(exposed).flatMap((group) =>
  Object.values(group)
    .flat()
    .map((op) => {
      const [verb, path] = op.split(' ');
      return `${verb} ${PREFIX}${path}`;
    }),
);

const routedOps = Object.values(routes).flatMap((r) =>
  (r.Match.Methods ?? []).map((m) => `${m} ${r.Match.Path}`),
);

describe('the allowlist', () => {
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

  // `POST /shares/redeem` is member-authed and one letter from the account-less `/shared/{token}`
  // surface; a prefix rule instead of exact templates would silently downgrade its auth.
  it('gives the share-link surface the anonymous policy and nothing else', () => {
    for (const [name, route] of Object.entries(routes)) {
      const expected = route.Match.Path.startsWith(`${PREFIX}/shared/`) ? 'Anonymous' : 'Default';
      expect(route.AuthorizationPolicy, name).toBe(expected);
    }
    expect(routes['tasks-api-shares-redeem'].AuthorizationPolicy).toBe('Default');
  });
});
