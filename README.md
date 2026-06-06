# Lupira Tasks Web

Single-page web client built with Vite, React 19, and TypeScript.

## Stack

- **Vite** — dev server and bundler
- **React 19** + **react-router-dom v7** — UI and routing
- **@tanstack/react-query v5** — server-state caching
- **oidc-client-ts** — OpenID Connect auth (config placeholder, not yet wired)
- **orval** — generates a typed API client from an OpenAPI document

## Getting started

```bash
npm install
npm run dev      # start the dev server on http://localhost:5173
```

## Scripts

| Script            | Description                                      |
| ----------------- | ------------------------------------------------ |
| `npm run dev`     | Start the Vite dev server                        |
| `npm run build`   | Type-check (`tsc -b`) and produce a production build |
| `npm run preview` | Preview the production build locally             |
| `npm run gen:api` | Regenerate the API client from `backend-openapi.json` (orval) |

## API client generation

`orval.config.ts` reads `./backend-openapi.json` and emits a typed `fetch`
client into `src/api/`, using the `customFetch` mutator in
`src/api/fetcher.ts`. Replace `backend-openapi.json` with the real backend
OpenAPI document and run `npm run gen:api`.

## Configuration

Auth and API settings are supplied via Vite env variables (`VITE_*`) at build
time. See `src/auth/oidcConfig.ts` for the OIDC placeholders. No secrets are
committed; provide real values via environment configuration.

## Docker

```bash
docker build -t danbro96/lupira-tasks-web .
docker run -p 8080:80 danbro96/lupira-tasks-web
```

The production image builds the SPA and serves the static output with nginx,
including an SPA fallback so client-side routes resolve to `index.html`.
