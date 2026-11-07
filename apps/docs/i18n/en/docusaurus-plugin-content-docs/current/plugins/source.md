---
sidebar_position: 2
title: Source plugin
---

# Source plugin

A source plugin knows how to read a site. It can watch a **product page** (`checkProduct`), a **listing page** (`checkListing`), or both.

## Minimal example

```ts title="plugins/source-example/src/index.ts"
import { SourceError, defineSourcePlugin, z } from '@back-in-stock/plugin-sdk';

export default defineSourcePlugin({
  id: 'example',
  name: 'Example',
  version: '0.1.0',
  supports: ['product'],
  configSchema: z.object({ variant: z.string().optional() }),

  // 1 = "this URL is mine", 0 = "not mine".
  match: (url) => (url.hostname.endsWith('example.com') ? 1 : 0),

  async checkProduct({ url, fetch, html }) {
    const page = await fetch.get(url);
    if (page.status === 404) throw new SourceError('not-found', 'Product not found');

    const offer = html.extractJsonLd(page.body).find(isProduct);
    if (!offer) throw new SourceError('parse', 'No product data in the page');

    return {
      status: offer.inStock ? 'IN_STOCK' : 'OUT_OF_STOCK',
      title: offer.name,
      price: { amountCents: Math.round(offer.price * 100), currency: 'EUR' },
      signal: 'json-ld offers.availability',
    };
  },
});
```

## Picking the plugin for a URL

When the user adds a URL, the core calls `match(url)` on every plugin and keeps the best score. A plugin dedicated to one site returns `1` for its domain. A generic plugin (for example "any Shopify store") returns a lower score, so dedicated plugins win.

## Statuses and errors

| What you return                        | Meaning                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `IN_STOCK`, `OUT_OF_STOCK`, `PREORDER` | The status read on the page.                                                                 |
| `UNKNOWN`                              | The page was read but the status is unclear. The state does not change.                      |
| `throw new SourceError(kind, message)` | The page could not be read. The state does not change and the check is recorded as an error. |

Possible `kind` values: `blocked` (captcha, 403), `not-found`, `parse` (content not understood), `network` (timeout, 5xx).

:::tip Never guess
An error must never become an out-of-stock or a restock. When in doubt, return `UNKNOWN` or throw a `SourceError`: this is what prevents false alerts.
:::

## Listing pages

`checkListing` returns `{ items, complete }`. Each item has a **stable** `id` (SKU, product id or normalized URL), never its position in the page. Set `complete: false` if you stopped paginating before the end: missing items are then not treated as removed.

## Tests

Ship recorded HTML pages (fixtures) with your plugin, and test `checkProduct` / `checkListing` with a `fetch` that returns them. Tests then never depend on the real site.
