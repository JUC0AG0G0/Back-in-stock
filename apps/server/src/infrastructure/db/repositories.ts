import type { ListingItem } from '@back-in-stock/plugin-sdk';
import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';
import type {
  Channel,
  ChannelRepository,
  EventRepository,
  IdGenerator,
  SettingsRepository,
  StoredEvent,
  WatchRepository,
  WatchStateRepository,
} from '../../application/ports.js';
import {
  checkNotificationRules,
  createWatch,
  defaultNotificationRules,
  type DomainEvent,
  type KnownItem,
  type ListingState,
  type NotificationOverrides,
  type NotificationRules,
  type ProductState,
  type Watch,
} from '../../domain/index.js';
import type { Db } from './database.js';
import { channels, events, listingItems, settings, watchChannels, watches } from './schema.js';

/**
 * Repository pattern: the only place that knows the tables. It maps rows to domain objects
 * and back. better-sqlite3 is synchronous, the ports are async so another store can be used.
 */

export class SqliteWatchRepository implements WatchRepository {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<Watch | undefined> {
    const row = this.db.select().from(watches).where(eq(watches.id, id)).get();
    return row ? this.toWatch(row) : undefined;
  }

  async list(): Promise<Watch[]> {
    const rows = this.db.select().from(watches).orderBy(asc(watches.createdAt)).all();
    return rows.map((row) => this.toWatch(row));
  }

  async save(watch: Watch): Promise<void> {
    const values = {
      type: watch.type,
      url: watch.url.value,
      name: watch.name,
      sourceId: watch.sourceId,
      intervalSec: watch.interval?.seconds ?? null,
      active: watch.active,
      confirmRestock: watch.confirmRestock,
      notificationOverridesJson: JSON.stringify(watch.notificationOverrides),
      updatedAt: new Date(),
    };
    this.db.transaction((tx) => {
      tx.insert(watches)
        .values({ id: watch.id, ...values })
        .onConflictDoUpdate({ target: watches.id, set: values })
        .run();
      tx.delete(watchChannels).where(eq(watchChannels.watchId, watch.id)).run();
      if (watch.channelIds.length > 0) {
        tx.insert(watchChannels)
          .values(
            watch.channelIds.map((channelId, position) => ({
              watchId: watch.id,
              channelId,
              position,
            })),
          )
          .run();
      }
    });
  }

  async delete(id: string): Promise<void> {
    this.db.delete(watches).where(eq(watches.id, id)).run();
  }

  private toWatch(row: typeof watches.$inferSelect): Watch {
    const channelIds = this.db
      .select({ id: watchChannels.channelId })
      .from(watchChannels)
      .where(eq(watchChannels.watchId, row.id))
      .orderBy(asc(watchChannels.position))
      .all()
      .map((link) => link.id);
    return createWatch({
      id: row.id,
      type: row.type,
      url: row.url,
      name: row.name,
      sourceId: row.sourceId,
      intervalSeconds: row.intervalSec,
      active: row.active,
      confirmRestock: row.confirmRestock,
      channelIds,
      notificationOverrides: JSON.parse(row.notificationOverridesJson) as NotificationOverrides,
    });
  }
}

export class SqliteWatchStateRepository implements WatchStateRepository {
  constructor(private readonly db: Db) {}

  async getProductState(watchId: string): Promise<ProductState> {
    const row = this.db
      .select({ phase: watches.productPhase, previous: watches.productPreviousPhase })
      .from(watches)
      .where(eq(watches.id, watchId))
      .get();
    if (!row) throw new Error(`Unknown watch: ${watchId}`);
    if (row.phase === 'CONFIRMING') {
      return { phase: 'CONFIRMING', previous: row.previous ?? 'OUT_OF_STOCK' };
    }
    return { phase: row.phase };
  }

  async saveProductState(watchId: string, state: ProductState): Promise<void> {
    this.db
      .update(watches)
      .set({
        productPhase: state.phase,
        productPreviousPhase: state.phase === 'CONFIRMING' ? state.previous : null,
      })
      .where(eq(watches.id, watchId))
      .run();
  }

  async getListingState(watchId: string): Promise<ListingState> {
    const watch = this.db
      .select({ baselined: watches.listingBaselined })
      .from(watches)
      .where(eq(watches.id, watchId))
      .get();
    if (!watch) throw new Error(`Unknown watch: ${watchId}`);
    const rows = this.db
      .select()
      .from(listingItems)
      .where(eq(listingItems.watchId, watchId))
      .orderBy(asc(listingItems.position))
      .all();
    const items = new Map<string, KnownItem>(
      rows.map((row) => [
        row.itemId,
        { item: JSON.parse(row.itemJson) as ListingItem, missingCount: row.missingCount },
      ]),
    );
    return { baselined: watch.baselined, items };
  }

  async saveListingState(watchId: string, state: ListingState): Promise<void> {
    const ids = [...state.items.keys()];
    this.db.transaction((tx) => {
      tx.update(watches)
        .set({ listingBaselined: state.baselined })
        .where(eq(watches.id, watchId))
        .run();
      // Items no longer known were removed by the tracker.
      tx.delete(listingItems)
        .where(
          ids.length > 0
            ? and(eq(listingItems.watchId, watchId), notInArray(listingItems.itemId, ids))
            : eq(listingItems.watchId, watchId),
        )
        .run();
      let position = 0;
      for (const [itemId, known] of state.items) {
        const values = {
          itemJson: JSON.stringify(known.item),
          missingCount: known.missingCount,
          position: position++,
        };
        tx.insert(listingItems)
          .values({ watchId, itemId, ...values })
          .onConflictDoUpdate({ target: [listingItems.watchId, listingItems.itemId], set: values })
          .run();
      }
    });
  }
}

export class SqliteEventRepository implements EventRepository {
  constructor(
    private readonly db: Db,
    private readonly ids: IdGenerator,
  ) {}

  async append(watchId: string, list: readonly DomainEvent[], at: Date): Promise<StoredEvent[]> {
    const stored = list.map((event) => ({ id: this.ids.next(), watchId, event, createdAt: at }));
    if (stored.length > 0) {
      this.db
        .insert(events)
        .values(
          stored.map(({ id, event }) => ({
            id,
            watchId,
            type: event.type,
            payloadJson: JSON.stringify(event),
            createdAt: at,
          })),
        )
        .run();
    }
    return stored;
  }

  async listForWatch(watchId: string, limit: number): Promise<StoredEvent[]> {
    return this.db
      .select()
      .from(events)
      .where(eq(events.watchId, watchId))
      .orderBy(desc(events.createdAt))
      .limit(limit)
      .all()
      .map((row) => ({
        id: row.id,
        watchId: row.watchId,
        event: JSON.parse(row.payloadJson) as DomainEvent,
        createdAt: row.createdAt,
      }));
  }
}

export class SqliteChannelRepository implements ChannelRepository {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<Channel | undefined> {
    const row = this.db.select().from(channels).where(eq(channels.id, id)).get();
    return row ? toChannel(row) : undefined;
  }

  async list(): Promise<Channel[]> {
    return this.db.select().from(channels).orderBy(asc(channels.createdAt)).all().map(toChannel);
  }

  async save(channel: Channel): Promise<void> {
    const values = {
      notifierId: channel.notifierId,
      name: channel.name,
      configJson: JSON.stringify(channel.config),
      enabled: channel.enabled,
      isDefault: channel.isDefault,
    };
    this.db
      .insert(channels)
      .values({ id: channel.id, ...values })
      .onConflictDoUpdate({ target: channels.id, set: values })
      .run();
  }

  async delete(id: string): Promise<void> {
    this.db.delete(channels).where(eq(channels.id, id)).run();
  }
}

function toChannel(row: typeof channels.$inferSelect): Channel {
  return {
    id: row.id,
    notifierId: row.notifierId,
    name: row.name,
    config: JSON.parse(row.configJson) as unknown,
    enabled: row.enabled,
    isDefault: row.isDefault,
  };
}

const NOTIFICATION_RULES_KEY = 'notification_rules';

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Db) {}

  async getNotificationRules(): Promise<NotificationRules> {
    const row = this.db
      .select()
      .from(settings)
      .where(eq(settings.key, NOTIFICATION_RULES_KEY))
      .get();
    if (!row) return defaultNotificationRules;
    // Channels may have been deleted since: keep only rules, unknown ids are skipped at routing.
    const known = new Set(
      this.db
        .select({ id: channels.id })
        .from(channels)
        .where(inArray(channels.id, collectChannelIds(row.valueJson)))
        .all()
        .map((c) => c.id),
    );
    return checkNotificationRules(withKnownChannels(row.valueJson, known), known);
  }

  async saveNotificationRules(rules: NotificationRules): Promise<void> {
    const valueJson = JSON.stringify(rules);
    this.db
      .insert(settings)
      .values({ key: NOTIFICATION_RULES_KEY, valueJson })
      .onConflictDoUpdate({ target: settings.key, set: { valueJson } })
      .run();
  }
}

type StoredRules = Partial<Record<string, { enabled: boolean; channelIds?: string[] }>>;

function collectChannelIds(json: string): string[] {
  const rules = JSON.parse(json) as StoredRules;
  return Object.values(rules).flatMap((rule) => rule?.channelIds ?? []);
}

function withKnownChannels(json: string, known: ReadonlySet<string>): StoredRules {
  const rules = JSON.parse(json) as StoredRules;
  for (const rule of Object.values(rules)) {
    if (rule?.channelIds) rule.channelIds = rule.channelIds.filter((id) => known.has(id));
  }
  return rules;
}
