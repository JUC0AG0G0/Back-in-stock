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

Add a `test` method if your channel can send a test message: it is called by the "Send a test" button.
