---
sidebar_position: 1
title: Overview
---

# Write a plugin

Back in stock ! has two kinds of plugins, described by the [`@back-in-stock/plugin-sdk`](https://github.com/JUC0AG0G0/Back-in-stock/tree/main/packages/plugin-sdk) package:

| Kind         | Role                                                                                 | Examples         |
| ------------ | ------------------------------------------------------------------------------------ | ---------------- |
| **Source**   | Read a site's page and tell whether the product is in stock, or list a page's items. | Shopify, Fanatec |
| **Notifier** | Send a notification, already written and translated, to a channel.                   | Telegram, email  |

A plugin does **only** its job: scheduling checks, history, change detection, translation and anti-spam are handled by the core.

## Common rules

- Declare your plugin with `defineSourcePlugin` or `defineNotifierPlugin`: you get full typing and the right `apiVersion`.
- `id` is unique, in kebab-case (`fanatec`, `telegram`).
- Options are described with **Zod** (`configSchema`), imported from the SDK. The interface builds the form from this schema.
- Make HTTP requests with `ctx.fetch`, never with `fetch` directly: the core handles per-domain rate limiting, retries and cookies.
- On load, the core checks every plugin (`validatePlugin`) and skips, with a clear message, any plugin that is invalid or written for another API version.

## Next steps

- [Source plugin](./source.md)
- [Notifier plugin](./notifier.md)
