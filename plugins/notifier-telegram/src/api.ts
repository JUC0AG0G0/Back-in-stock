import type { Fetcher } from '@back-in-stock/plugin-sdk';

/** Error returned by the Bot API. The message never contains the bot token. */
export class TelegramApiError extends Error {
  override readonly name = 'TelegramApiError';

  constructor(
    readonly code: number,
    readonly description: string,
  ) {
    super(`Telegram API error ${code}: ${description}`);
  }
}

interface ApiResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: { chat: TelegramChat };
  edited_message?: { chat: TelegramChat };
  channel_post?: { chat: TelegramChat };
  my_chat_member?: { chat: TelegramChat };
}

const API_BASE = 'https://api.telegram.org';

/** Minimal Bot API client on top of the core's fetcher. */
export class TelegramClient {
  constructor(
    private readonly fetcher: Fetcher,
    private readonly token: string,
    private readonly signal?: AbortSignal,
  ) {}

  async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    let res;
    try {
      res = await this.fetcher.post(`${API_BASE}/bot${this.token}/${method}`, {
        json: params,
        ...(this.signal ? { signal: this.signal } : {}),
      });
    } catch (err) {
      // Network errors may echo the URL, which holds the token: never let it leak.
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Telegram unreachable: ${message.replaceAll(this.token, '***')}`, {
        cause: err,
      });
    }
    let data: ApiResponse<T>;
    try {
      data = JSON.parse(res.body) as ApiResponse<T>;
    } catch {
      throw new TelegramApiError(res.status, 'invalid response');
    }
    if (!data.ok || data.result === undefined) {
      throw new TelegramApiError(
        data.error_code ?? res.status,
        data.description ?? 'unknown error',
      );
    }
    return data.result;
  }

  getMe(): Promise<TelegramUser> {
    return this.call('getMe');
  }

  getUpdates(): Promise<TelegramUpdate[]> {
    return this.call('getUpdates', {
      allowed_updates: ['message', 'channel_post', 'my_chat_member'],
    });
  }
}
