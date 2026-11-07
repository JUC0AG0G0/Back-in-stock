---
sidebar_position: 3
title: Plugin de notification
---

# Plugin de notification

Un plugin de notification (« notifier ») envoie un message sur un canal : Telegram, email, webhook…

Le message arrive **déjà rédigé et traduit** dans la langue de l'utilisateur. Le notifier l'adapte seulement à son format (Markdown Telegram, HTML d'email…).

## Exemple minimal

```ts title="plugins/notifier-webhook/src/index.ts"
import { defineNotifierPlugin, z } from '@back-in-stock/plugin-sdk';

export default defineNotifierPlugin({
  id: 'webhook',
  name: 'Webhook',
  version: '0.1.0',
  configSchema: z.object({ url: z.url() }),

  async send({ config, logger }, message) {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
    logger.debug('sent', { event: message.event });
  },
});
```

## Le message

| Champ                            | Contenu                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `event`                          | `WatchStarted`, `ProductRestocked`, `ProductOutOfStock`, `ProductPreorder`, `ListingItemAdded`, `ListingItemRemoved`, `WatchFailing` ou `Test`. |
| `locale`                         | Langue des textes, `fr` ou `en`.                                                                                                                |
| `title`, `text`                  | Textes prêts à afficher.                                                                                                                        |
| `url`                            | Lien vers le produit ou l'article.                                                                                                              |
| `imageUrl`, `price`, `watchName` | Facultatifs.                                                                                                                                    |

## Configuration du canal

`configSchema` décrit les réglages du canal (jeton, identifiant de discussion, adresse…). L'utilisateur peut créer plusieurs canaux avec le même notifier, par exemple deux comptes Telegram.

Ajoute une méthode `test` si ton canal peut envoyer un message d'essai : elle est appelée par le bouton « Envoyer un test ».
