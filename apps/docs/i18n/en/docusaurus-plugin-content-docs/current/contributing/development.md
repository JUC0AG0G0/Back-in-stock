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

- Web interface: [http://localhost:5173](http://localhost:5173) (Vite, hot reload).
- API: [http://localhost:8080](http://localhost:8080).
- API documentation (Swagger): [http://localhost:8080/api/docs](http://localhost:8080/api/docs), on by default in development (in production, from the **Settings** screen or with `BIS_API_DOCS=true`).

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
