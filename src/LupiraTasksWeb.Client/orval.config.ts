import { defineConfig } from "orval";

export default defineConfig({
  backendApi: {
    input: {
      target: "./backend-openapi.json",
    },
    output: {
      mode: "single",
      target: "./src/data/api/lupiraTasksApi.ts",
      schemas: "./src/data/api/models",
      client: "fetch",
      baseUrl: "",
      mock: false,
      override: {
        mutator: {
          path: "./src/data/api/fetcher.ts",
          name: "customFetch",
        },
      },
    },
  },
});
