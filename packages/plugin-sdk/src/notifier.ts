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
  /**
   * Called by the "Send a test" button. Optional: without it, the core sends its own
   * translated test message (event "Test") through `send`.
   */
  test?(ctx: NotifierContext<Config>): Promise<void>;
  /**
   * Checks settings filled so far, before the channel is saved (e.g. Telegram `getMe`).
   * Returned `info` is shown to the user and usable in the setup guide links (`{{botUsername}}`).
   */
  validate?(ctx: NotifierContext<Partial<Config>>): Promise<ValidationResult>;
  /** Finds settings the user would otherwise look up by hand (e.g. the Telegram chat id). */
  discover?(ctx: NotifierContext<Partial<Config>>): Promise<DiscoveryResult<Config>>;
  /** Steps of the guided setup shown by the UI. Without it, the UI shows a plain form. */
  setupGuide?: SetupStep[];
  /**
   * Texts of the plugin, per language, as flat keys. The core serves them under the
   * `plugin.<id>` namespace. Conventional keys: `fields.<field>.label`, `fields.<field>.help`,
   * plus the keys used by `setupGuide`.
   */
  translations?: Partial<Record<string, Record<string, string>>>;
}

export type ValidationResult =
  { ok: true; info?: Record<string, string> } | { ok: false; error: string };

export interface DiscoveryCandidate<Config> {
  /** Shown to the user, e.g. "Jules (private chat)". */
  label: string;
  /** Settings to apply when the user picks this candidate. */
  config: Partial<Config>;
}

export interface DiscoveryResult<Config> {
  candidates: DiscoveryCandidate<Config>[];
}

/** A link shown in a setup step, optionally as a QR code to open it on a phone. */
export interface SetupLink {
  /** Translation key of the link text. */
  label: string;
  /** May contain `{{name}}` placeholders, filled from `validate` info, e.g. `https://t.me/{{botUsername}}`. */
  url: string;
  qrCode?: boolean;
}

/** One step of a guided setup. Texts are translation keys of the plugin (see `translations`). */
export interface SetupStep {
  id: string;
  title: string;
  description?: string;
  links?: SetupLink[];
  /** Text the user copies, e.g. "/newbot". */
  copyText?: string;
  /** Config fields filled during this step. */
  fields?: string[];
  /**
   * What the step runs before moving on: `validate` checks the settings, `discover` looks
   * for settings to pick from, `test` sends a test message.
   */
  action?: 'validate' | 'discover' | 'test';
}

export type NotifierPluginDefinition<Config> = Omit<NotifierPlugin<Config>, 'kind' | 'apiVersion'>;
