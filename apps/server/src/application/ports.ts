import type { Logger, ProductSnapshot } from '@back-in-stock/plugin-sdk';
import type {
  DomainEvent,
  ListingState,
  NotificationRules,
  ProductState,
  Watch,
} from '../domain/index.js';

/**
 * Ports: what the application needs from the outside world, as interfaces.
 * Adapters (SQLite, system clock, pino…) implement them in `infrastructure/`,
 * and tests use in-memory fakes. The domain and use cases never import an adapter.
 */

export type { Logger };

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

/** A configured notifier instance, e.g. "Mon Telegram perso" (SPEC §2). */
export interface Channel {
  id: string;
  /** Notifier plugin id, e.g. "telegram". */
  notifierId: string;
  name: string;
  /** Plugin settings (token, chat id…), validated by the plugin's configSchema. */
  config: unknown;
  enabled: boolean;
  /** Pre-selected when creating a watch. */
  isDefault: boolean;
}

export interface WatchRepository {
  get(id: string): Promise<Watch | undefined>;
  list(): Promise<Watch[]>;
  save(watch: Watch): Promise<void>;
  delete(id: string): Promise<void>;
}

/** What the plugin last read on a product page, for display only (it never drives alerts). */
export interface ProductReading {
  snapshot: ProductSnapshot;
  checkedAt: Date;
}

export interface ProductReadingRepository {
  /** Last reading of every watch that has one, by watch id. */
  list(): Promise<Map<string, ProductReading>>;
  save(watchId: string, reading: ProductReading): Promise<void>;
}

/** Tracker state between two checks (state machine, known listing items). */
export interface WatchStateRepository {
  getProductState(watchId: string): Promise<ProductState>;
  saveProductState(watchId: string, state: ProductState): Promise<void>;
  getListingState(watchId: string): Promise<ListingState>;
  saveListingState(watchId: string, state: ListingState): Promise<void>;
}

export interface StoredEvent {
  id: string;
  watchId: string;
  event: DomainEvent;
  createdAt: Date;
}

export interface EventRepository {
  append(watchId: string, events: readonly DomainEvent[], at: Date): Promise<StoredEvent[]>;
  listForWatch(watchId: string, limit: number): Promise<StoredEvent[]>;
}

export interface ChannelRepository {
  get(id: string): Promise<Channel | undefined>;
  list(): Promise<Channel[]>;
  save(channel: Channel): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SettingsRepository {
  getNotificationRules(): Promise<NotificationRules>;
  saveNotificationRules(rules: NotificationRules): Promise<void>;
  /** A setting saved from the UI, parsed from JSON. Undefined when never saved. */
  getValue(key: string): Promise<unknown>;
  /** Saves a setting. Null removes it, so the default (environment variable) applies again. */
  setValue(key: string, value: unknown): Promise<void>;
}
