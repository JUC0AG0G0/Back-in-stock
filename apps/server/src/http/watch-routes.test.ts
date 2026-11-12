import { defineSourcePlugin, type SourcePlugin } from '@back-in-stock/plugin-sdk';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Channel, ChannelRepository, WatchRepository } from '../application/ports.js';
import type { Watch } from '../domain/index.js';
import { NotifierRegistry, SourceRegistry } from '../infrastructure/plugins/registry.js';
import { buildApp } from './app.js';

class MemoryWatches implements WatchRepository {
  readonly rows = new Map<string, Watch>();
  async get(id: string) {
    return this.rows.get(id);
  }
  async list() {
    return [...this.rows.values()];
  }
  async save(watch: Watch) {
    this.rows.set(watch.id, watch);
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

class MemoryChannels implements ChannelRepository {
  constructor(private readonly rows: Channel[]) {}
  async get(id: string) {
    return this.rows.find((c) => c.id === id);
  }
  async list() {
    return this.rows;
  }
  async save() {}
  async delete() {}
}

function source(id: string, match: SourcePlugin['match'], supports: SourcePlugin['supports']) {
  return defineSourcePlugin({
    id,
    name: `${id} plugin`,
    version: '1.0.0',
    supports,
    match,
    checkProduct: async () => ({ status: 'UNKNOWN' }),
    checkListing: async () => ({ items: [], complete: true }),
  });
}

const channel = (id: string, enabled: boolean, isDefault: boolean): Channel => ({
  id,
  notifierId: 'telegram',
  name: id,
  config: {},
  enabled,
  isDefault,
});

let app: FastifyInstance;
let watches: MemoryWatches;

beforeEach(async () => {
  const sources = new SourceRegistry();
  sources.register(
    source('fanatec', (url) => (url.hostname.endsWith('fanatec.com') ? 1 : 0), ['listing']),
  );
  sources.register(source('structured-data', () => 0.5, ['product']));
  sources.register(source('css-rule', () => 0.1, ['product', 'listing']));
  watches = new MemoryWatches();
  app = await buildApp({
    version: '1.0.0',
    plugins: { sources, notifiers: new NotifierRegistry() },
    channels: {
      repository: new MemoryChannels([
        channel('default-on', true, true),
        channel('default-off', false, true),
        channel('other', true, false),
      ]),
      fetch: {
        get: () => Promise.reject(new Error('no network')),
        post: () => Promise.reject(new Error('no network')),
      },
    },
    watches: { repository: watches, newId: () => 'w1' },
  });
});
afterEach(async () => {
  await app.close();
});

describe('POST /api/sources/match', () => {
  it('lists matching plugins best first and suggests one per watch type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sources/match',
      payload: { url: ' https://www.fanatec.com/eu/fr/refurbished#top ' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      url: 'https://www.fanatec.com/eu/fr/refurbished',
      hostname: 'www.fanatec.com',
      candidates: [
        { id: 'fanatec', name: 'fanatec plugin', supports: ['listing'], score: 1 },
        {
          id: 'structured-data',
          name: 'structured-data plugin',
          supports: ['product'],
          score: 0.5,
        },
        {
          id: 'css-rule',
          name: 'css-rule plugin',
          supports: ['product', 'listing'],
          score: 0.1,
        },
      ],
      suggested: { product: 'structured-data', listing: 'fanatec' },
    });
  });

  it('leaves out plugins that do not read the URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sources/match',
      payload: { url: 'https://shop.example/p/1' },
    });
    expect(res.json().candidates.map((c: { id: string }) => c.id)).toEqual([
      'structured-data',
      'css-rule',
    ]);
    expect(res.json().suggested).toEqual({ product: 'structured-data', listing: 'css-rule' });
  });

  it('rejects something that is not an http link', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sources/match',
      payload: { url: 'ftp://example.com/file' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('/api/watches', () => {
  it('creates a watch with the enabled default channels', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/watches',
      payload: {
        url: 'https://www.fanatec.com/eu/fr/refurbished',
        type: 'listing',
        sourceId: 'fanatec',
        name: '  ',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      id: 'w1',
      type: 'listing',
      url: 'https://www.fanatec.com/eu/fr/refurbished',
      name: 'www.fanatec.com',
      sourceId: 'fanatec',
      active: true,
      channelIds: ['default-on'],
    });
    expect(watches.rows.has('w1')).toBe(true);

    const list = await app.inject({ method: 'GET', url: '/api/watches' });
    expect(list.json()).toHaveLength(1);
  });

  it('refuses a plugin that cannot watch this type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/watches',
      payload: { url: 'https://www.fanatec.com/p', type: 'product', sourceId: 'fanatec' },
    });
    expect(res.statusCode).toBe(400);
    expect(watches.rows.size).toBe(0);
  });

  it('refuses an unknown plugin or an invalid URL', async () => {
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/watches',
      payload: { url: 'https://a.example', type: 'product', sourceId: 'nope' },
    });
    expect(unknown.statusCode).toBe(400);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/watches',
      payload: { url: 'not a url', type: 'product', sourceId: 'css-rule' },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
