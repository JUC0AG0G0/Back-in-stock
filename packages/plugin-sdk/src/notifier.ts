import type { ZodType } from 'zod';
import type { Fetcher, Logger, Price } from './common.js';

export type NotificationEventType =
  | 'WatchStarted'
  | 'ProductRestocked'
  | 'ProductOutOfStock'
  | 'ProductPreorder'
  | 'ListingItemAdded'
  | 'ListingItemRemoved'
  | 'WatchFailing'
  | 'Test';

/**
 * Message already rendered and translated by the core.
 * Each notifier only adapts it to its format (Telegram Markdown, email HTML…).
 */
export interface NotificationMessage {
  event: NotificationEventType;
  /** Language the texts are written in, e.g. "fr" or "en". */
  locale: string;
  title: string;
  text: string;
  url?: string;
  imageUrl?: string;
  price?: Price;
  watchName?: string;
}

export interface NotifierContext<Config> {
  config: Config;
  fetch: Fetcher;
  logger: Logger;
  signal: AbortSignal;
}

export interface NotifierPlugin<Config = unknown> {
  kind: 'notifier';
  apiVersion: number;
  /** Unique kebab-case id, e.g. "telegram". */
  id: string;
  name: string;
  /** Plugin version (semver). */
  version: string;
  /** Channel settings (token, chat id…). The UI generates the form from it. */
  configSchema: ZodType<Config>;
  send(ctx: NotifierContext<Config>, message: NotificationMessage): Promise<void>;
  /** Called by the "Send a test" button. */
  test?(ctx: NotifierContext<Config>): Promise<void>;
}

export type NotifierPluginDefinition<Config> = Omit<NotifierPlugin<Config>, 'kind' | 'apiVersion'>;
