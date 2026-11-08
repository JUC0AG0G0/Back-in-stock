---
sidebar_position: 1
title: Telegram
---

# Get alerts on Telegram

Alerts reach Telegram through **your own bot**. It is free, takes a few minutes to create and belongs only to you: no third-party service sees your messages, apart from Telegram.

You can create **as many Telegram channels as you want**: one for you, one for a family group, a channel for friends… Each watch picks the channels it notifies.

## Guided setup

In the app, open **Channels**, then **Add a channel** and pick **Telegram**. A wizard guides you in five steps:

1. **Talk to @BotFather.** It is Telegram's official bot for creating bots. The link and QR code open it on your computer or phone.
2. **Create the bot.** Send `/newbot` to BotFather (a button copies the command), pick any name, then a username ending in `bot`, for example `mystock_bot`.
3. **Paste the token.** BotFather replies with a token like `123456789:AAH…`. Paste it and click **Check**: the app asks Telegram (`getMe`) and shows the bot's name.
4. **Send `/start` to the bot.** The link and QR code open your bot. Send it `/start`, then click **Detect**: the app finds the chat by itself (`getUpdates`), no need to look for the "chat id".
5. **Send a test.** A test message goes to the chosen chat. Confirm you received it, name the channel (for example "My personal Telegram"), optionally tick **Default channel**, then save.

:::tip Default channel
Default channels are pre-selected when you create a watch.
:::

## Telegram group or channel

- **Group**: add your bot to the group, write a message in the group, then click **Detect** in step 4. A group id is negative (for example `-1001234567890`).
- **Channel**: add the bot as an **administrator** of the channel, post a message, then click **Detect**. For a public channel, you can also type its name as `@mychannel`.

## Channel settings

| Setting              | Purpose                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| Bot token            | Given by BotFather. It is secret: the app never shows it again once saved. |
| Chat id              | Detected automatically, or typed by hand.                                  |
| Include images       | Sends the product photo with the alert (on by default).                    |
| Silent notifications | Messages arrive without sound.                                             |

To change a channel, click **Edit**. Leave the token field empty to keep the stored one. The **Send a test** button checks at any time that the channel works, and the switch on the right pauses it.

## Troubleshooting

| Message                                       | What to do                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| "Telegram rejects this token"                 | The token is incomplete or was regenerated. Copy all of it again, or create a new one with `/token` in BotFather. |
| "Nothing detected yet"                        | Send a message to the bot (or in the group), then click **Detect** again. Telegram keeps these messages 24 h.     |
| "This bot uses a webhook"                     | The bot is already connected to another service. Type the chat id by hand, or use a dedicated bot.                |
| `403: Forbidden: bot was blocked by the user` | You blocked the bot in Telegram. Unblock it and send it `/start`.                                                 |
| `400: Bad Request: chat not found`            | The chat id is wrong, or the bot was removed from the group.                                                      |
