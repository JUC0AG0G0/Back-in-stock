---
sidebar_position: 2
title: Plugin de source
---

# Plugin de source

Un plugin de source sait lire un site. Il peut surveiller une **page produit** (`checkProduct`), une **page liste** (`checkListing`), ou les deux.

## Exemple minimal

```ts title="plugins/source-exemple/src/index.ts"
import { SourceError, defineSourcePlugin, z } from '@back-in-stock/plugin-sdk';

export default defineSourcePlugin({
  id: 'exemple',
  name: 'Exemple',
  version: '0.1.0',
  supports: ['product'],
  configSchema: z.object({ variant: z.string().optional() }),

  // 1 = « cette URL est pour moi », 0 = « pas pour moi ».
  match: (url) => (url.hostname.endsWith('exemple.fr') ? 1 : 0),

  async checkProduct({ url, fetch, html }) {
    const page = await fetch.get(url);
    if (page.status === 404) throw new SourceError('not-found', 'Produit introuvable');

    const offer = html.extractJsonLd(page.body).find(isProduct);
    if (!offer) throw new SourceError('parse', 'Pas de données produit dans la page');

    return {
      status: offer.inStock ? 'IN_STOCK' : 'OUT_OF_STOCK',
      title: offer.name,
      price: { amountCents: Math.round(offer.price * 100), currency: 'EUR' },
      signal: 'json-ld offers.availability',
    };
  },
});
```

## Prix et promotions

`price` est le prix à payer maintenant, remise comprise. Si le produit est en promotion, renvoie aussi `regularPrice`, le prix avant remise : l'aperçu et les notifications affichent alors « 449,95 € au lieu de 539,85 € ». Laisse `regularPrice` vide quand il n'y a pas de remise.

L'aperçu affiché quand on colle un lien utilise aussi `title` et `imageUrl` : renvoie-les dès que la page les contient, pour que l'utilisateur reconnaisse son produit.

## Choisir le plugin d'une URL

Quand l'utilisateur ajoute une URL, le cœur appelle `match(url)` sur chaque plugin et garde le meilleur score. Un plugin dédié à un site renvoie `1` pour son domaine. Un plugin générique (par exemple « toute boutique Shopify ») renvoie un score plus faible, pour laisser la priorité aux plugins dédiés.

## Statuts et erreurs

| Ce que tu renvoies                     | Signification                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `IN_STOCK`, `OUT_OF_STOCK`, `PREORDER` | Le statut lu sur la page.                                                               |
| `UNKNOWN`                              | La page est lue, mais le statut n'est pas clair. L'état ne change pas.                  |
| `throw new SourceError(kind, message)` | La page n'a pas pu être lue. L'état ne change pas, la vérification est notée en erreur. |

Les `kind` possibles : `blocked` (captcha, 403), `not-found`, `parse` (contenu non compris), `network` (délai dépassé, 5xx).

:::tip Ne devine jamais
Une erreur ne doit jamais devenir une rupture ou un retour en stock. En cas de doute, renvoie `UNKNOWN` ou lève une `SourceError` : c'est ce qui évite les fausses alertes.
:::

## Pages liste

`checkListing` renvoie `{ items, complete }`. Chaque article a un `id` **stable** (SKU, id produit ou URL normalisée), jamais sa position dans la page. Mets `complete: false` si tu as arrêté la pagination avant la fin : les articles manquants ne seront alors pas considérés comme retirés.

## Tests

Fournis des pages HTML enregistrées (fixtures) dans ton plugin, et teste `checkProduct` / `checkListing` avec un `fetch` qui les renvoie. Ainsi les tests ne dépendent pas du site réel.

Pour pouvoir tester ta source en direct depuis l'application, ajoute des pages d'exemple avec `testTargets` : voir [Tester un plugin](./testing.md).
