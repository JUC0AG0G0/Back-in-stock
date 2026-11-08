---
sidebar_position: 3
title: Notifier plugin
---

# Notifier plugin

A notifier plugin sends a message to a channel: Telegram, email, webhook…

The message arrives **already written and translated** in the user's language. The notifier only adapts it to its format (Telegram Markdown, email HTML…).

## Minimal example

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

## The message

| Field                            | Content                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `event`                          | `WatchStarted`, `ProductRestocked`, `ProductOutOfStock`, `ProductPreorder`, `ListingItemAdded`, `ListingItemRemoved`, `WatchFailing` or `Test`. |
| `locale`                         | Language of the texts, `fr` or `en`.                                                                                                            |
| `title`, `text`                  | Texts ready to display.                                                                                                                         |
| `url`                            | Link to the product or item.                                                                                                                    |
| `imageUrl`, `price`, `watchName` | Optional.                                                                                                                                       |

## Channel settings

`configSchema` describes the channel settings (token, chat id, address…). The user can create several channels with the same notifier, for example two Telegram accounts.

Mark secrets (token, password) with `.meta({ writeOnly: true })`: the API never sends them back and the UI shows a password field.

The "Send a test" button calls your `test` method if you provide one. Otherwise the core sends an already translated test message (event `Test`) with `send`.

## Calling an API

Use `ctx.fetch` instead of `fetch`: `ctx.fetch.get(url)` and `ctx.fetch.post(url, { json })` go through the core's HTTP client (timeout, User-Agent) and honor `ctx.signal`.

## Guided setup

A notifier can ship a step-by-step wizard, shown by the UI instead of the plain form. Every field is optional.

| Field          | Purpose                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setupGuide`   | Wizard steps: `title`, `description`, `links` (with `qrCode`), `copyText`, `fields` to fill, and an `action` to pass before moving on (`validate`, `discover` or `test`). |
| `validate`     | Checks the settings typed so far, before saving. Values in `info` are shown and fill the links, for example `https://t.me/{{botUsername}}`.                               |
| `discover`     | Finds settings for the user and returns `candidates` to pick from, for example Telegram chats.                                                                            |
| `translations` | Plugin texts per language, as flat keys: `description`, `fields.<field>.label`, `fields.<field>.help` and the step keys.                                                  |

Step texts are keys of `translations`. An error message returned by `validate` or `discover` may be a key too: the UI shows it translated.

```ts title="Excerpt of plugins/notifier-telegram/src/index.ts"
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

The [`notifier-telegram`](https://github.com/juc0ag0g0/back-in-stock/tree/main/plugins/notifier-telegram) plugin is a complete example.
