import { defineConfig } from 'orval';

// One document — the BFF's own — in three flavours. The split is per call site, not per app:
// `query` is the member surface, `shared` the account-less share-link surface (its own target only
// because orval filters by tag), and `fetch` is for callers that own their caching — the app reads
// through its SQLite mirror, so a react-query cache there would be a second, mirror-unaware one.
//
// Models are generated once, by the query target, and the others point at the same directory so
// there is a single set of types. `clean` is off: it would let whichever target runs last delete the
// others' output.

const input = '../../openapi/LupiraTasksBff.json';
const schemas = './src/generated/models';

export default defineConfig({
  query: {
    input: { target: input, filters: { mode: 'exclude', tags: ['Shared'] } },
    output: {
      target: './src/generated/query/client.ts',
      schemas,
      client: 'react-query',
      httpClient: 'fetch',
      mode: 'tags-split',
      clean: false,
      override: {
        mutator: { path: './src/transport.ts', name: 'apiRequest' },
        query: { signal: true },
        // Resolve to the body, not a {data,status,headers} wrapper.
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
  shared: {
    input: { target: input, filters: { tags: ['Shared'] } },
    output: {
      target: './src/generated/shared/client.ts',
      schemas,
      client: 'react-query',
      httpClient: 'fetch',
      mode: 'tags-split',
      clean: false,
      override: {
        mutator: { path: './src/transport.ts', name: 'apiRequest' },
        query: { signal: true },
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
  fetch: {
    input: { target: input, filters: { mode: 'exclude', tags: ['Shared'] } },
    output: {
      target: './src/generated/fetch/client.ts',
      schemas,
      client: 'fetch',
      mode: 'tags-split',
      clean: false,
      override: { mutator: { path: './src/transport.ts', name: 'apiRequest' } },
    },
  },
});
