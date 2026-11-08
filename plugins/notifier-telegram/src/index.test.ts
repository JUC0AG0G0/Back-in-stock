import type { FetchResult, Fetcher, Logger, PostOptions } from '@back-in-stock/plugin-sdk';
import { validatePlugin } from '@back-in-stock/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { formatMessage } from './format.js';
import en from './locales/en.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };
import telegram, { configSchema, type TelegramConfig } from './index.js';

const TOKEN = '123456789:AAHabcdefghijklmnopqrstuvwxyz012345';

interface Call {
  method: string;
  params: Record<string, unknown>;
}

/** Fake Bot API: answers each method with the given result, or a Telegram error. */
type Answer = unknown;
interface ApiFailure {
  error: number;
  description: string;
}

function fakeFetcher(answers: Record<string, Answer>) {
  const calls: Call[] = [];
  const fetcher: Fetcher = {
    get: () => Promise.reject(new Error('unexpected GET')),
    post: async (url, options: PostOptions = {}): Promise<FetchResult> => {
      const method = String(url).split('/').pop() ?? '';
      calls.push({ method, params: options.json as Record<string, unknown> });
      const answer = answers[method];
      const failure =
        typeof answer === 'object' && answer !== null && 'error' in answer
          ? (answer as ApiFailure)
          : undefined;
      const body = failure
        ? { ok: false, error_code: failure.error, description: failure.description }
        : { ok: true, result: answer ?? true };
      return { url: String(url), status: 200, headers: {}, body: JSON.stringify(body) };
    },
  };
  return { fetcher, calls };
}

const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
const signal = new AbortController().signal;
const config: TelegramConfig = configSchema.parse({ botToken: TOKEN, chatId: '42' });

describe('telegram plugin', () => {
  it('is a valid notifier plugin', () => {
    expect(validatePlugin(telegram).ok).toBe(true);
  });

  it('has the same translation keys in every language', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it('defines every text used by the setup guide and the errors', () => {
    const keys = (telegram.setupGuide ?? []).flatMap((step) => [
      step.title,
      ...(step.description ? [step.description] : []),
      ...(step.links ?? []).map((link) => link.label),
    ]);
    keys.push('errors.invalidToken', 'errors.tokenRejected', 'errors.webhookSet');
    for (const key of keys) expect(en, key).toHaveProperty([key]);
  });
});

describe('configSchema', () => {
  it('accepts a token and a chat id, with images on by default', () => {
    expect(config).toEqual({ botToken: TOKEN, chatId: '42', includeImages: true, silent: false });
    expect(configSchema.safeParse({ botToken: TOKEN, chatId: '-1001234' }).success).toBe(true);
    expect(configSchema.safeParse({ botToken: TOKEN, chatId: '@my_channel' }).success).toBe(true);
  });

  it('rejects a malformed token or chat id', () => {
    expect(configSchema.safeParse({ botToken: 'nope', chatId: '42' }).success).toBe(false);
    expect(configSchema.safeParse({ botToken: TOKEN, chatId: 'abc' }).success).toBe(false);
  });
});

describe('validate', () => {
  it('returns the bot name and username from getMe', async () => {
    const { fetcher } = fakeFetcher({
      getMe: { id: 1, is_bot: true, first_name: 'Mon Stock', username: 'monstock_bot' },
    });
    const result = await telegram.validate?.({ config, fetch: fetcher, logger, signal });
    expect(result).toEqual({
      ok: true,
      info: { botName: 'Mon Stock', botUsername: 'monstock_bot' },
    });
  });

  it('reports a token rejected by Telegram', async () => {
    const { fetcher } = fakeFetcher({ getMe: { error: 401, description: 'Unauthorized' } });
    const result = await telegram.validate?.({ config, fetch: fetcher, logger, signal });
    expect(result).toEqual({ ok: false, error: 'errors.tokenRejected' });
  });

  it('does not call Telegram for a malformed token', async () => {
    const { fetcher, calls } = fakeFetcher({});
    const result = await telegram.validate?.({
      config: { botToken: 'x' },
      fetch: fetcher,
      logger,
      signal,
    });
    expect(result).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });
});

describe('discover', () => {
  it('lists the chats that wrote to the bot, newest first and without duplicates', async () => {
    const { fetcher } = fakeFetcher({
      getUpdates: [
        { update_id: 1, message: { chat: { id: 42, type: 'private', first_name: 'Jules' } } },
        { update_id: 2, my_chat_member: { chat: { id: -100, type: 'group', title: 'Famille' } } },
        { update_id: 3, message: { chat: { id: 42, type: 'private', first_name: 'Jules' } } },
      ],
    });
    const result = await telegram.discover?.({ config, fetch: fetcher, logger, signal });
    expect(result?.candidates).toEqual([
      { label: 'Jules (private)', config: { chatId: '42' } },
      { label: 'Famille (group)', config: { chatId: '-100' } },
    ]);
  });

  it('explains a webhook conflict', async () => {
    const { fetcher } = fakeFetcher({ getUpdates: { error: 409, description: 'Conflict' } });
    await expect(telegram.discover?.({ config, fetch: fetcher, logger, signal })).rejects.toThrow(
      'errors.webhookSet',
    );
  });
});

describe('send', () => {
  const message = {
    event: 'ProductRestocked' as const,
    locale: 'fr',
    title: 'De retour en stock : <Volant>',
    text: 'CSL DD est de nouveau disponible.',
    url: 'https://fanatec.com/eu/fr/p/csl-dd?a=1&b=2',
  };

  it('sends an HTML message to the chat', async () => {
    const { fetcher, calls } = fakeFetcher({});
    await telegram.send({ config, fetch: fetcher, logger, signal }, message);
    expect(calls).toEqual([
      {
        method: 'sendMessage',
        params: {
          chat_id: '42',
          parse_mode: 'HTML',
          disable_notification: false,
          text:
            '<b>De retour en stock : &lt;Volant&gt;</b>\n\nCSL DD est de nouveau disponible.\n\n' +
            '<a href="https://fanatec.com/eu/fr/p/csl-dd?a=1&amp;b=2">https://fanatec.com/eu/fr/p/csl-dd?a=1&amp;b=2</a>',
          link_preview_options: { is_disabled: false },
        },
      },
    ]);
  });

  it('sends the product photo with the text as caption', async () => {
    const { fetcher, calls } = fakeFetcher({});
    await telegram.send(
      { config, fetch: fetcher, logger, signal },
      { ...message, imageUrl: 'https://img.example/p.jpg' },
    );
    expect(calls.map((c) => c.method)).toEqual(['sendPhoto']);
    expect(calls[0]?.params.photo).toBe('https://img.example/p.jpg');
  });

  it('falls back to text when the photo cannot be sent', async () => {
    const { fetcher, calls } = fakeFetcher({
      sendPhoto: { error: 400, description: 'wrong file identifier' },
    });
    await telegram.send(
      { config, fetch: fetcher, logger, signal },
      { ...message, imageUrl: 'https://img.example/p.jpg' },
    );
    expect(calls.map((c) => c.method)).toEqual(['sendPhoto', 'sendMessage']);
  });

  it('skips the photo when images are turned off', async () => {
    const { fetcher, calls } = fakeFetcher({});
    await telegram.send(
      { config: { ...config, includeImages: false }, fetch: fetcher, logger, signal },
      { ...message, imageUrl: 'https://img.example/p.jpg' },
    );
    expect(calls.map((c) => c.method)).toEqual(['sendMessage']);
  });

  it('throws a Telegram error without leaking the token', async () => {
    const { fetcher } = fakeFetcher({
      sendMessage: { error: 403, description: 'bot was blocked' },
    });
    const error = await telegram
      .send({ config, fetch: fetcher, logger, signal }, message)
      .catch((err: unknown) => err as Error);
    expect(error?.message).toMatch(/403.*blocked/);
    expect(error?.message).not.toContain(TOKEN);
  });
});

describe('formatMessage', () => {
  it('shortens long texts and keeps the link', () => {
    const text = formatMessage(
      { event: 'Test', locale: 'en', title: 'T', text: 'a&'.repeat(1000), url: 'https://x.y' },
      200,
    );
    expect(text.length).toBeLessThanOrEqual(200);
    expect(text).toContain('…');
    expect(text.endsWith('<a href="https://x.y">https://x.y</a>')).toBe(true);
  });
});
