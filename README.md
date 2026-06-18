# Lupira Tasks Web

Single-page web client for [LupiraTasks](../LupiraTasksApi), built with Vite, React 19,
and TypeScript.

## What it does (v1)

The first version is **shared-link only**: someone with a share link
(`https://<host>/s/<token>`) opens it in a browser and uses the connected list — no SSO,
no account. The link's access level decides what's possible:

- **Read** link → view-only (the UI hides every edit affordance and shows a "View only" badge).
- **ReadWrite** link → full list usage with parity to the mobile app: add / edit / complete /
  reopen / delete / reorder (drag) / nest tasks, edit due dates, notes, tags, and (for Shopping
  lists) quantity + unit.

It talks **directly** to the API's `/shared/{token}` endpoints on every interaction. There is
**no offline support and no browser persistence** — the token lives only in memory for the
session, and the server is the single source of truth.

Out of scope for v1: SSO, list creation, members, assignee (the shared API trims emails), and
tag creation (only existing tags can be toggled). `oidc-client-ts` is present for a future
member web app but is not wired up.

## Stack

- **Vite** + **React 19** + **react-router-dom v7** — UI and routing (`/s/:token`)
- **@tanstack/react-query v5** — server-state caching with optimistic updates
- **@dnd-kit** — accessible drag-and-drop reorder
- **fractional-indexing** + ported domain logic (`src/domain/*`) — identical tree/sort/due-date
  behavior to the mobile app
- **vitest** — unit tests for the pure domain logic

## Getting started

```bash
npm install
npm run dev      # dev server on http://localhost:5173
```

Set `VITE_API_BASE_URL` (see `.env.example`) to point at the API. For local end-to-end testing,
run the API with `Auth:AllowedOrigins` including `http://localhost:5173`.

## Scripts

| Script              | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Start the Vite dev server                            |
| `npm run build`     | Type-check (`tsc -b`) and produce a production build |
| `npm run preview`   | Preview the production build locally                 |
| `npm test`          | Run the domain unit tests (vitest)                   |
| `npm run gen:api`   | Regenerate the Orval API client (placeholder spec)   |

## Docker

```bash
docker build -t danbro96/lupira-tasks-web .
docker run -p 8080:80 danbro96/lupira-tasks-web
```

The production image builds the SPA and serves it with nginx, including an SPA fallback so
`/s/<token>` deep links resolve to `index.html`.
