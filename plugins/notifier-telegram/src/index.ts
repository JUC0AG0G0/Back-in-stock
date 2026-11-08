import {
  defineNotifierPlugin,
  z,
  type DiscoveryCandidate,
  type NotificationMessage,
} from '@back-in-stock/plugin-sdk';
import { TelegramApiError, TelegramClient, type TelegramChat } from './api.js';
import { CAPTION_LIMIT, formatMessage } from './format.js';
import en from './locales/en.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };

/** Token given by BotFather, e.g. "123456789:AAH…". */
const TOKEN_PATTERN = /^\d+:[\w-]{30,}$/;

export const configSchema = z.object({
  botToken: z
    .string()
    .trim()
    .regex(TOKEN_PATTERN, 'invalid bot token')
    // writeOnly: a secret. The API never sends it back, the UI shows a password field.
    .meta({ writeOnly: true }),
  /** Private chat, group (negative id) or channel ("@name" works for public channels). */
  chatId: z
    .string()
    .trim()
    .regex(/^(-?\d+|@\w{5,})$/, 'invalid chat id'),
  includeImages: z.boolean().default(true),
  silent: z.boolean().default(false),
});

export type TelegramConfig = z.infer<typeof configSchema>;

function chatLabel(chat: TelegramChat): string {
  const name =
    chat.title ??
    ([chat.first_name, chat.last_name].filter(Boolean).join(' ') ||
      chat.username ||
      String(chat.id));
  return `${name} (${chat.type})`;
}

const telegram = defineNotifierPlugin<TelegramConfig>({
  id: 'telegram',
  name: 'Telegram',
  version: '0.1.0',
  configSchema,
  translations: { en, fr },

  setupGuide: [
    {
      id: 'botfather',
      title: 'guide.botfather.title',
      description: 'guide.botfather.description',
      links: [{ label: 'guide.botfather.link', url: 'https://t.me/BotFather', qrCode: true }],
    },
    {
      id: 'newbot',
      title: 'guide.newbot.title',
      description: 'guide.newbot.description',
      copyText: '/newbot',
    },
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
      description: 'guide.chat.description',
      links: [{ label: 'guide.chat.link', url: 'https://t.me/{{botUsername}}', qrCode: true }],
      fields: ['chatId'],
      action: 'discover',
    },
    {
      id: 'test',
      title: 'guide.test.title',
      description: 'guide.test.description',
      fields: ['includeImages', 'silent'],
      action: 'test',
    },
  ],

  async validate({ config, fetch, signal }) {
    const token = config.botToken?.trim();
    if (!token || !TOKEN_PATTERN.test(token)) return { ok: false, error: 'invalid bot token' };
    try {
      const bot = await new TelegramClient(fetch, token, signal).getMe();
      return {
        ok: true,
        info: { botName: bot.first_name, botUsername: bot.username ?? '' },
      };
    } catch (err) {
      if (err instanceof TelegramApiError && err.code === 401) {
        return { ok: false, error: 'token rejected by Telegram (401 Unauthorized)' };
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /** Lists the chats that wrote to the bot recently (getUpdates keeps them for 24 h). */
  async discover({ config, fetch, signal }) {
    const token = config.botToken?.trim();
    if (!token) throw new Error('botToken is required');
    const client = new TelegramClient(fetch, token, signal);
    let updates;
    try {
      updates = await client.getUpdates();
    } catch (err) {
      if (err instanceof TelegramApiError && err.code === 409) {
        throw new Error(
          'this bot uses a webhook: remove it to detect the chat, or enter the chat id',
          {
            cause: err,
          },
        );
      }
      throw err;
    }
    const chats = new Map<number, TelegramChat>();
    // Newest first: the chat the user just wrote from is on top.
    for (const update of [...updates].reverse()) {
      const chat = (
        update.message ??
        update.edited_message ??
        update.channel_post ??
        update.my_chat_member
      )?.chat;
      if (chat && !chats.has(chat.id)) chats.set(chat.id, chat);
    }
    const candidates: DiscoveryCandidate<TelegramConfig>[] = [...chats.values()].map((chat) => ({
      label: chatLabel(chat),
      config: { chatId: String(chat.id) },
    }));
    return { candidates };
  },

  async send({ config, fetch, logger, signal }, message: NotificationMessage) {
    const client = new TelegramClient(fetch, config.botToken, signal);
    const common = {
      chat_id: config.chatId,
      parse_mode: 'HTML',
      disable_notification: config.silent,
    };

    if (config.includeImages && message.imageUrl) {
      try {
        // Telegram downloads the photo itself. Local cached images (SPEC §13) will be uploaded.
        await client.call('sendPhoto', {
          ...common,
          photo: message.imageUrl,
          caption: formatMessage(message, CAPTION_LIMIT),
        });
        return;
      } catch (err) {
        // A photo Telegram cannot fetch must not lose the alert: fall back to text.
        logger.warn('sendPhoto failed, sending text only', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await client.call('sendMessage', {
      ...common,
      text: formatMessage(message),
      link_preview_options: { is_disabled: !config.includeImages },
    });
  },
});

export default telegram;
