import type { ListingItem } from '@back-in-stock/plugin-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Channel } from '../../application/ports.js';
import {
  createWatch,
  defaultNotificationRules,
  initialListingState,
  initialProductState,
  trackListing,
} from '../../domain/index.js';
import { openDatabase, type Database } from './database.js';
import {
  SqliteChannelRepository,
  SqliteEventRepository,
  SqliteSettingsRepository,
  SqliteWatchRepository,
  SqliteWatchStateRepository,
} from './repositories.js';

let database: Database;

beforeEach(() => {
  database = openDatabase(':memory:');
});
afterEach(() => {
  database.close();
});

const telegram: Channel = {
  id: 'tg',
  notifierId: 'telegram',
  name: 'Mon Telegram',
  config: { token: 'secret', chatId: '42' },
  enabled: true,
  isDefault: true,
};
const mail: Channel = {
  ...telegram,
  id: 'mail',
  notifierId: 'email',
  name: 'Mail',
  isDefault: false,
};

const fanatec = createWatch({
  id: 'w1',
  type: 'listing',
  url: 'https://fanatec.com/eu/en/refurbished',
  sourceId: 'fanatec',
  intervalSeconds: 120,
  channelIds: ['tg', 'mail'],
  notificationOverrides: { WatchStarted: { enabled: false } },
});

async function seed() {
  const channelRepo = new SqliteChannelRepository(database.db);
  await channelRepo.save(telegram);
  await channelRepo.save(mail);
  await new SqliteWatchRepository(database.db).save(fanatec);
}

describe('openDatabase', () => {
  it('applies the migrations and answers the health ping', () => {
    expect(database.ping()).toBe(true);
  });
});

describe('SqliteWatchRepository', () => {
  it('saves and reads back a watch with its channels in order', async () => {
    await seed();
    const repo = new SqliteWatchRepository(database.db);
    expect(await repo.get('w1')).toEqual(fanatec);
    expect(await repo.list()).toEqual([fanatec]);
    expect(await repo.get('nope')).toBeUndefined();
  });

  it('updates a watch and replaces its channels', async () => {
    await seed();
    const repo = new SqliteWatchRepository(database.db);
    const updated = {
      ...fanatec,
      name: 'Fanatec reconditionné',
      interval: null,
      channelIds: ['mail'],
    };
    await repo.save(updated);
    expect(await repo.get('w1')).toEqual(updated);
  });

  it('deletes a watch with its channel links, state and events', async () => {
    await seed();
    await new SqliteEventRepository(database.db, { next: () => 'e1' }).append(
      'w1',
      [{ type: 'WatchStarted', watchType: 'listing', itemCount: 0 }],
      new Date(),
    );
    await new SqliteWatchRepository(database.db).delete('w1');
    expect(await new SqliteWatchRepository(database.db).list()).toEqual([]);
    expect(
      await new SqliteEventRepository(database.db, { next: () => 'x' }).listForWatch('w1', 10),
    ).toEqual([]);
  });

  it('drops the link when a channel is deleted', async () => {
    await seed();
    await new SqliteChannelRepository(database.db).delete('tg');
    expect((await new SqliteWatchRepository(database.db).get('w1'))?.channelIds).toEqual(['mail']);
  });
});

describe('SqliteWatchStateRepository', () => {
  it('stores the product state machine, including the confirming phase', async () => {
    await seed();
    const repo = new SqliteWatchStateRepository(database.db);
    expect(await repo.getProductState('w1')).toEqual(initialProductState);

    await repo.saveProductState('w1', { phase: 'CONFIRMING', previous: 'PREORDER' });
    expect(await repo.getProductState('w1')).toEqual({ phase: 'CONFIRMING', previous: 'PREORDER' });

    await repo.saveProductState('w1', { phase: 'IN_STOCK' });
    expect(await repo.getProductState('w1')).toEqual({ phase: 'IN_STOCK' });
  });

  it('stores the known listing items between two checks', async () => {
    await seed();
    const repo = new SqliteWatchStateRepository(database.db);
    const item = (id: string): ListingItem => ({
      id,
      title: `Volant ${id}`,
      url: `https://fanatec.com/p/${id}`,
      price: { amountCents: 29995, currency: 'EUR' },
      attributes: { condition: 'B-Stock' },
    });
    const page = (ids: string[]) => ({
      kind: 'snapshot' as const,
      snapshot: { items: ids.map(item), complete: true },
    });

    expect(await repo.getListingState('w1')).toEqual(initialListingState);

    // Reference, then one item missing once, then removed after 3 misses.
    let state = trackListing(await repo.getListingState('w1'), page(['a', 'b'])).state;
    await repo.saveListingState('w1', state);
    state = trackListing(await repo.getListingState('w1'), page(['a'])).state;
    await repo.saveListingState('w1', state);

    const reloaded = await repo.getListingState('w1');
    expect(reloaded).toEqual(state);
    expect(reloaded.items.get('b')?.missingCount).toBe(1);
    expect(reloaded.items.get('a')?.item).toEqual(item('a'));

    for (let i = 0; i < 2; i++) {
      state = trackListing(await repo.getListingState('w1'), page(['a'])).state;
      await repo.saveListingState('w1', state);
    }
    expect([...(await repo.getListingState('w1')).items.keys()]).toEqual(['a']);
  });

  it('fails clearly for an unknown watch', async () => {
    await expect(
      new SqliteWatchStateRepository(database.db).getProductState('nope'),
    ).rejects.toThrow('Unknown watch: nope');
  });
});

describe('SqliteEventRepository', () => {
  it('appends events and lists them newest first', async () => {
    await seed();
    let n = 0;
    const repo = new SqliteEventRepository(database.db, { next: () => `e${++n}` });
    await repo.append(
      'w1',
      [{ type: 'WatchStarted', watchType: 'listing', itemCount: 2 }],
      new Date(1000),
    );
    const added = await repo.append(
      'w1',
      [{ type: 'ListingItemAdded', item: { id: 'c', title: 'C', url: 'https://fanatec.com/p/c' } }],
      new Date(2000),
    );
    expect(added.map((e) => e.id)).toEqual(['e2']);

    const list = await repo.listForWatch('w1', 10);
    expect(list.map((e) => [e.id, e.event.type, e.createdAt.getTime()])).toEqual([
      ['e2', 'ListingItemAdded', 2000],
      ['e1', 'WatchStarted', 1000],
    ]);
    expect(await repo.listForWatch('w1', 1)).toHaveLength(1);
  });
});

describe('SqliteChannelRepository', () => {
  it('saves, updates and lists channels with their config', async () => {
    const repo = new SqliteChannelRepository(database.db);
    await repo.save(telegram);
    await repo.save({ ...telegram, enabled: false });
    expect(await repo.list()).toEqual([{ ...telegram, enabled: false }]);
  });
});

describe('SqliteSettingsRepository', () => {
  it('returns the defaults until rules are saved', async () => {
    expect(await new SqliteSettingsRepository(database.db).getNotificationRules()).toEqual(
      defaultNotificationRules,
    );
  });

  it('saves the rules and drops channels deleted since', async () => {
    await seed();
    const repo = new SqliteSettingsRepository(database.db);
    await repo.saveNotificationRules({
      ...defaultNotificationRules,
      WatchStarted: { enabled: true, channelIds: ['mail', 'tg'] },
      ProductOutOfStock: { enabled: false },
    });
    await new SqliteChannelRepository(database.db).delete('tg');

    const rules = await repo.getNotificationRules();
    expect(rules.WatchStarted).toEqual({ enabled: true, channelIds: ['mail'] });
    expect(rules.ProductOutOfStock).toEqual({ enabled: false });
    expect(rules.ListingItemAdded).toEqual({ enabled: true });
  });

  it('saves, reads and forgets a single setting', async () => {
    const repo = new SqliteSettingsRepository(database.db);
    expect(await repo.getValue('updates.interval_hours')).toBeUndefined();
    await repo.setValue('updates.interval_hours', 12);
    await repo.setValue('updates.interval_hours', 24);
    expect(await repo.getValue('updates.interval_hours')).toBe(24);
    await repo.setValue('updates.interval_hours', null);
    expect(await repo.getValue('updates.interval_hours')).toBeUndefined();
  });
});
