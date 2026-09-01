import { defineConfig } from "orval";

// Two targets because the API serves two auth models over one origin and orval binds one mutator per
// target: the `Shared` tag is the account-less share-link surface, everything else is member-only.
// Refresh the spec with `npm run fetch:openapi` after an API change.
const output = (dir: string, mutator: string) => ({
  mode: "tags-split" as const,
  target: `./src/data/api/${dir}/api.ts`,
  schemas: `./src/data/api/${dir}/models`,
  client: "react-query" as const,
  httpClient: "fetch" as const,
  baseUrl: "",
  mock: false,
  clean: true,
  override: {
    mutator: { path: "./src/data/api/fetcher.ts", name: mutator },
    query: { signal: true },
    // Resolve to the body directly, not a {data,status,headers} wrapper.
    fetch: { includeHttpResponseReturnType: false },
  },
});

export default defineConfig({
  memberApi: {
    input: { target: "./backend-openapi.json", filters: { mode: "exclude", tags: ["Shared"] } },
    output: output("member", "customFetch"),
  },
  sharedApi: {
    input: { target: "./backend-openapi.json", filters: { tags: ["Shared"] } },
    output: output("shared", "customFetchShared"),
  },
});
