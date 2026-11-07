---
sidebar_position: 1
title: Développement
---

# Développement

## Prérequis

- Node.js 22 (voir `.nvmrc`)
- pnpm 10 (`corepack enable` suffit)
- Docker, pour tester l'image

## Lancer en local

```bash
pnpm install
pnpm dev
```

- Interface web : [http://localhost:5173](http://localhost:5173) (Vite, rechargement à chaud).
- API : [http://localhost:8080](http://localhost:8080).
- Documentation de l'API (Swagger) : [http://localhost:8080/api/docs](http://localhost:8080/api/docs), **en développement uniquement**.

## Vérifier avant une PR

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
pnpm smoke:docker   # construit l'image et vérifie qu'elle démarre
```

La CI lance les mêmes commandes : une PR ne peut pas être fusionnée si l'une d'elles échoue.

## Organisation du dépôt

| Dossier               | Contenu                                      |
| --------------------- | -------------------------------------------- |
| `apps/server`         | Serveur Fastify : domaine, base SQLite, API. |
| `apps/web`            | Interface React (Vite, Tailwind, shadcn/ui). |
| `apps/docs`           | Ce site de documentation (Docusaurus).       |
| `packages/plugin-sdk` | Contrat des plugins.                         |
| `packages/i18n`       | Textes français et anglais partagés.         |
| `plugins/*`           | Plugins de sites et de notification.         |

## Traductions

Tous les textes de l'interface et des notifications sont dans `packages/i18n/src/locales/` (`fr.json` et `en.json`). Un test vérifie que les deux fichiers ont les mêmes clés et les mêmes variables, et ESLint refuse un texte écrit en dur dans l'interface.

## Cette documentation

```bash
pnpm --filter @back-in-stock/docs dev      # en français
pnpm --filter @back-in-stock/docs dev:en   # en anglais
```

Les pages françaises sont dans `apps/docs/docs/`, leur traduction anglaise dans `apps/docs/i18n/en/docusaurus-plugin-content-docs/current/`, avec les mêmes noms de fichiers. Le site est publié sur GitHub Pages à chaque fusion sur `main`.
