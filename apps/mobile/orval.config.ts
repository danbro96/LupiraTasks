import { defineConfig } from 'orval';

/**
 * Orval config for the Lupira Tasks backend; the allowlist-filtered spec comes from `@lupira/tasks-api`.
 *
 * `client: 'fetch'` rather than react-query: the app reads through the offline SQLite mirror and the sync/outbox
 * layer calls these fetchers directly, so a react-query cache would be a second, mirror-unaware one. The mutator
 * reads the session through the AuthPort at call time, so the settings-screen API URL override applies live.
 */
export default defineConfig({
  lupiraTasks: {
    input: { target: '../../openapi/LupiraTasksBff.json' },
    output: {
      mode: 'tags-split',
      target: './src/data/api/generated/api.ts',
      schemas: './src/data/api/generated/models',
      client: 'fetch',
      // The BFF route prefix — the app talks to one origin and this picks the upstream.
      baseUrl: '/api',
      override: {
        mutator: { path: './src/data/api/mutator.ts', name: 'apiFetch' },
      },
      clean: true,
    },
  },
});
