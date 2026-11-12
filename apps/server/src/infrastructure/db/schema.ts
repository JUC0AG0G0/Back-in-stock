import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * SQLite schema (SPEC §8). Generate a migration after any change:
 *   pnpm --filter @back-in-stock/server db:generate
 *
 * M0 holds what the domain needs today. Snapshots history, check runs, the deliveries
 * outbox and images arrive with their features (M1, M3).
 */

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
});

export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  notifierId: text('notifier_id').notNull(),
  name: text('name').notNull(),
  // Encrypted with BIS_SECRET_KEY in M3. Plain JSON until then.
  configJson: text('config_json').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
});

export const watches = sqliteTable(
  'watches',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: ['product', 'listing'] }).notNull(),
    url: text('url').notNull(),
    name: text('name').notNull(),
    sourceId: text('source_id').notNull(),
    sourceConfigJson: text('source_config_json').notNull().default('{}'),
    /** NULL: follows the global default interval. */
    intervalSec: integer('interval_sec'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    confirmRestock: integer('confirm_restock', { mode: 'boolean' }).notNull().default(true),
    notificationOverridesJson: text('notification_overrides_json').notNull().default('{}'),
    /** Product state machine (domain/product-tracker.ts). */
    productPhase: text('product_phase', {
      enum: ['NEW', 'OUT_OF_STOCK', 'PREORDER', 'IN_STOCK', 'CONFIRMING'],
    })
      .notNull()
      .default('NEW'),
    productPreviousPhase: text('product_previous_phase', { enum: ['OUT_OF_STOCK', 'PREORDER'] }),
    /** Listing reference recorded (domain/listing-tracker.ts). */
    listingBaselined: integer('listing_baselined', { mode: 'boolean' }).notNull().default(false),
    lastCheckedAt: integer('last_checked_at', { mode: 'timestamp_ms' }),
    /** Last product read on the page (ProductSnapshot), shown on the watch card. */
    lastSnapshotJson: text('last_snapshot_json'),
    nextCheckAt: integer('next_check_at', { mode: 'timestamp_ms' }),
    errorCount: integer('error_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
  },
  (table) => [index('watches_next_check_at_idx').on(table.nextCheckAt)],
);

export const watchChannels = sqliteTable(
  'watch_channels',
  {
    watchId: text('watch_id')
      .notNull()
      .references(() => watches.id, { onDelete: 'cascade' }),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.watchId, table.channelId] })],
);

/** Items currently known on a listing page. Removed items are deleted (SPEC §2). */
export const listingItems = sqliteTable(
  'listing_items',
  {
    watchId: text('watch_id')
      .notNull()
      .references(() => watches.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    /** Full ListingItem as returned by the plugin (title, url, price, image, attributes). */
    itemJson: text('item_json').notNull(),
    missingCount: integer('missing_count').notNull().default(0),
    position: integer('position').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.watchId, table.itemId] })],
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    watchId: text('watch_id')
      .notNull()
      .references(() => watches.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payloadJson: text('payload_json').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('events_watch_created_idx').on(table.watchId, table.createdAt)],
);
