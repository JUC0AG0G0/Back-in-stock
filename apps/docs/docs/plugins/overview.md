---
sidebar_position: 1
title: Vue d'ensemble
---

# Écrire un plugin

Back in stock ! connaît deux sortes de plugins, décrites par le paquet [`@back-in-stock/plugin-sdk`](https://github.com/JUC0AG0G0/Back-in-stock/tree/main/packages/plugin-sdk) :

| Sorte        | Rôle                                                                                           | Exemples         |
| ------------ | ---------------------------------------------------------------------------------------------- | ---------------- |
| **Source**   | Lire une page d'un site et dire si le produit est en stock, ou lister les articles d'une page. | Shopify, Fanatec |
| **Notifier** | Envoyer une notification déjà rédigée et traduite sur un canal.                                | Telegram, email  |

Un plugin ne fait **que** son travail : la planification des vérifications, l'historique, la détection des changements, la traduction et l'anti-spam sont gérés par le cœur de l'application.

## Règles communes

- Déclare ton plugin avec `defineSourcePlugin` ou `defineNotifierPlugin` : tu obtiens le typage complet et le bon `apiVersion`.
- `id` est unique, en kebab-case (`fanatec`, `telegram`).
- Les options sont décrites avec **Zod** (`configSchema`), importé depuis le SDK. L'interface génère le formulaire à partir de ce schéma.
- Fais tes requêtes HTTP avec `ctx.fetch`, jamais avec `fetch` directement : le cœur gère la limitation par domaine, les nouvelles tentatives et les cookies.
- Au chargement, le cœur vérifie chaque plugin (`validatePlugin`) et ignore, avec un message clair, celui qui est invalide ou écrit pour une autre version de l'API.

## Étapes suivantes

- [Plugin de source](./source.md)
- [Plugin de notification](./notifier.md)
