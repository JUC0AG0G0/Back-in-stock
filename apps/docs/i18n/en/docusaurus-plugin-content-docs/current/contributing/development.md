---
sidebar_position: 1
title: Development
---

# Development

## Requirements

- Node.js 22 (see `.nvmrc`)
- pnpm 10 (`corepack enable` is enough)
- Docker, to test the image

## Run locally

```bash
pnpm install
pnpm dev
```

One command starts the API and the web interface, both with hot reload:

- Web interface: [http://localhost:5173](http://localhost:5173). Vite reloads the page on every change and forwards `/api` to the API.
- API: [http://localhost:8081](http://localhost:8081), restarted by `tsx watch` on every server change.
- API documentation (Swagger): [http://localhost:8081/api/docs](http://localhost:8081/api/docs), on by default in development (in production, from the **Settings** screen or with `BIS_API_DOCS=true`).

Good to know:

- The API takes the first free port from **8081** upwards, so it does not clash with a Docker instance on 8080. The chosen port is printed at startup. To force one: `BIS_DEV_API_PORT=9000 pnpm dev`.
- The repository's packages (`packages/*`, `plugins/*`) are read straight from their TypeScript sources: nothing to build, and editing them reloads the API or the page like any other file.
- The development database lives in `apps/server/data/` (ignored by Git). Delete that folder to start from scratch.
- `Ctrl+C` stops everything. If one of the two stops (a startup error, for example), the other one is stopped too.

## Check before a PR

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
pnpm smoke:docker   # builds the image and checks that it starts
```

CI runs the same commands: a PR cannot be merged if one of them fails.

## Repository layout

| Folder                | Content                                       |
| --------------------- | --------------------------------------------- |
| `apps/server`         | Fastify server: domain, SQLite database, API. |
| `apps/web`            | React interface (Vite, Tailwind, shadcn/ui).  |
| `apps/docs`           | This documentation site (Docusaurus).         |
| `packages/plugin-sdk` | Plugin contract.                              |
| `packages/i18n`       | Shared French and English texts.              |
| `plugins/*`           | Site and notification plugins.                |

## Translations

Every text of the interface and of notifications lives in `packages/i18n/src/locales/` (`fr.json` and `en.json`). A test checks that both files have the same keys and variables, and ESLint rejects hard-coded text in the interface.

## This documentation

```bash
pnpm --filter @back-in-stock/docs dev      # in French
pnpm --filter @back-in-stock/docs dev:en   # in English
```

French pages live in `apps/docs/docs/`, their English translation in `apps/docs/i18n/en/docusaurus-plugin-content-docs/current/`, with the same file names. The site is published on GitHub Pages on every merge to `main`.
