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

  async send({ config, fetch, logger }, message) {
    const res = await fetch.post(config.url, { json: message });
    if (res.status >= 400) throw new Error(`Webhook HTTP ${res.status}`);
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

Marque les secrets (jeton, mot de passe) avec `.meta({ writeOnly: true })` : l'API ne les renvoie jamais et l'interface affiche un champ mot de passe.

Le bouton « Envoyer un test » appelle ta méthode `test` si tu en fournis une. Sinon, le cœur envoie avec `send` un message de test déjà traduit (évènement `Test`).

## Appeler une API

Utilise `ctx.fetch` plutôt que `fetch` : `ctx.fetch.get(url)` et `ctx.fetch.post(url, { json })` passent par le client HTTP du cœur (délai maximum, User-Agent) et respectent `ctx.signal`.

## Configuration guidée

Un notifier peut fournir un assistant pas à pas, affiché par l'interface à la place du formulaire brut. Tous les champs sont facultatifs.

| Champ          | Rôle                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setupGuide`   | Étapes de l'assistant : `title`, `description`, `links` (avec `qrCode`), `copyText`, `fields` à remplir, et `action` à réussir avant de continuer (`validate`, `discover` ou `test`). |
| `validate`     | Vérifie les réglages saisis avant l'enregistrement. Les valeurs de `info` s'affichent et remplissent les liens, par exemple `https://t.me/{{botUsername}}`.                           |
| `discover`     | Trouve des réglages à la place de l'utilisateur et renvoie des `candidates` à choisir, par exemple les discussions Telegram.                                                          |
| `translations` | Textes du plugin par langue, en clés plates : `description`, `fields.<champ>.label`, `fields.<champ>.help` et les clés des étapes.                                                    |

Les textes des étapes sont des clés de `translations`. Un message d'erreur renvoyé par `validate` ou `discover` peut aussi être une clé : l'interface l'affiche traduit.

```ts title="Extrait de plugins/notifier-telegram/src/index.ts"
setupGuide: [
  {
    id: 'token',
    title: 'guide.token.title',
    description: 'guide.token.description',
    fields: ['botToken'],
    action: 'validate',
  },
  {
    id: 'chat',
    title: 'guide.chat.title',
    links: [{ label: 'guide.chat.link', url: 'https://t.me/{{botUsername}}', qrCode: true }],
    fields: ['chatId'],
    action: 'discover',
  },
],

async validate({ config, fetch, signal }) {
  const bot = await new TelegramClient(fetch, config.botToken ?? '', signal).getMe();
  return { ok: true, info: { botName: bot.first_name, botUsername: bot.username ?? '' } };
},
```

Le plugin [`notifier-telegram`](https://github.com/juc0ag0g0/back-in-stock/tree/main/plugins/notifier-telegram) est un exemple complet.
