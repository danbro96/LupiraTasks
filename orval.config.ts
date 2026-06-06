import { defineConfig } from "orval";

export default defineConfig({
  backendApi: {
    input: {
      target: "./backend-openapi.json",
    },
    output: {
      mode: "single",
      target: "./src/api/lupiraTasksApi.ts",
      schemas: "./src/api/models",
      client: "fetch",
      baseUrl: "",
      mock: false,
      override: {
        mutator: {
          path: "./src/api/fetcher.ts",
          name: "customFetch",
        },
      },
    },
  },
});
