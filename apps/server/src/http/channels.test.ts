import {
  defineNotifierPlugin,
  z,
  type Fetcher,
  type NotificationMessage,
} from '@back-in-stock/plugin-sdk';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Channel, ChannelRepository } from '../application/ports.js';
import { NotifierRegistry, SourceRegistry } from '../infrastructure/plugins/registry.js';
import { buildApp } from './app.js';

class MemoryChannels implements ChannelRepository {
  readonly rows = new Map<string, Channel>();
  async get(id: string) {
    return this.rows.get(id);
  }
  async list() {
    return [...this.rows.values()];
  }
  async save(channel: Channel) {
    this.rows.set(channel.id, structuredClone(channel));
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

const sent: Array<{ config: unknown; message: NotificationMessage }> = [];

const chat = defineNotifierPlugin({
  id: 'chat',
  name: 'Chat',
  version: '1.0.0',
  configSchema: z.object({
    token: z.string().min(3).meta({ writeOnly: true }),
    room: z.string(),
    loud: z.boolean().default(true),
  }),
  async send({ config }, message) {
    if (config.room === 'broken') throw new Error('room not found');
    sent.push({ config, message });
  },
  async validate({ config }) {
    return config.token === 'good'
      ? { ok: true, info: { botUsername: 'my_bot' } }
      : { ok: false, error: 'bad token' };
  },
  async discover({ config }) {
    return { candidates: [{ label: `rooms of ${config.token}`, config: { room: '42' } }] };
  },
});

const fetcher: Fetcher = {
  get: () => Promise.reject(new Error('no network in tests')),
  post: () => Promise.reject(new Error('no network in tests')),
};

let app: FastifyInstance;
let repository: MemoryChannels;

beforeEach(async () => {
  sent.length = 0;
  repository = new MemoryChannels();
  const notifiers = new NotifierRegistry();
  notifiers.register(chat);
  app = await buildApp({
    version: '1.0.0',
    plugins: { sources: new SourceRegistry(), notifiers },
    channels: { repository, fetch: fetcher },
  });
});

afterEach(async () => {
  await app.close();
});

async function createChannel(body: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/channels',
    payload: { notifierId: 'chat', name: 'Perso', config: { token: 'good', room: '1' }, ...body },
  });
}

describe('GET /api/notifiers', () => {
  it('describes each notifier with its form schema and secret fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/notifiers' });
    const [notifier] = res.json();
    expect(notifier).toMatchObject({
      id: 'chat',
      secretFields: ['token'],
      capabilities: { validate: true, discover: true },
      configSchema: { type: 'object', required: ['token', 'room'] },
    });
  });
});

describe('channels', () => {
  it('creates several channels of the same notifier, and never returns secrets', async () => {
    expect((await createChannel()).statusCode).toBe(201);
    expect((await createChannel({ name: 'Famille' })).statusCode).toBe(201);

    const list = (await app.inject({ method: 'GET', url: '/api/channels' })).json();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      name: 'Perso',
      config: { room: '1', loud: true },
      secretsSet: ['token'],
      available: true,
    });
    expect(JSON.stringify(list)).not.toContain('good');
  });

  it('rejects an invalid config or an unknown notifier', async () => {
    expect((await createChannel({ config: { room: '1' } })).statusCode).toBe(400);
    expect((await createChannel({ notifierId: 'nope' })).statusCode).toBe(400);
  });

  it('keeps the stored secret when an edit leaves it empty', async () => {
    const { id } = (await createChannel()).json();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/channels/${id}`,
      payload: { name: 'Renamed', isDefault: true, config: { token: '', room: '2' } },
    });
    expect(res.statusCode).toBe(200);
    expect(repository.rows.get(id)).toMatchObject({
      name: 'Renamed',
      isDefault: true,
      config: { token: 'good', room: '2' },
    });
  });

  it('deletes a channel', async () => {
    const { id } = (await createChannel()).json();
    expect((await app.inject({ method: 'DELETE', url: `/api/channels/${id}` })).statusCode).toBe(
      204,
    );
    expect(repository.rows.size).toBe(0);
    expect((await app.inject({ method: 'DELETE', url: `/api/channels/${id}` })).statusCode).toBe(
      404,
    );
  });

  it('sends a translated test message on a saved channel', async () => {
    const { id } = (await createChannel()).json();
    const res = await app.inject({
      method: 'POST',
      url: `/api/channels/${id}/test`,
      payload: { locale: 'fr' },
    });
    expect(res.json()).toEqual({ ok: true });
    expect(sent[0]?.message).toMatchObject({
      event: 'Test',
      locale: 'fr',
      title: 'Message de test',
    });
  });

  it('reports a failed test', async () => {
    const { id } = (await createChannel({ config: { token: 'good', room: 'broken' } })).json();
    const res = await app.inject({ method: 'POST', url: `/api/channels/${id}/test` });
    expect(res.json()).toEqual({ ok: false, error: 'room not found' });
  });
});

describe('notifier actions on unsaved settings', () => {
  it('validates the settings typed so far', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/notifiers/chat/validate',
      payload: { config: { token: 'good' } },
    });
    expect(ok.json()).toEqual({ ok: true, info: { botUsername: 'my_bot' } });
    const ko = await app.inject({
      method: 'POST',
      url: '/api/notifiers/chat/validate',
      payload: { config: { token: 'bad' } },
    });
    expect(ko.json()).toEqual({ ok: false, error: 'bad token' });
  });

  it('discovers settings, reusing the stored secret of the edited channel', async () => {
    const { id } = (await createChannel()).json();
    const res = await app.inject({
      method: 'POST',
      url: '/api/notifiers/chat/discover',
      payload: { channelId: id, config: { token: '' } },
    });
    expect(res.json()).toEqual({
      ok: true,
      candidates: [{ label: 'rooms of good', config: { room: '42' } }],
    });
  });

  it('sends a test before the channel is saved', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/notifiers/chat/test',
      payload: { config: { token: 'good', room: '7' }, locale: 'en' },
    });
    expect(res.json()).toEqual({ ok: true });
    expect(sent[0]?.config).toEqual({ token: 'good', room: '7', loud: true });
  });

  it('answers 404 for an unknown notifier', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/notifiers/nope/test', payload: {} });
    expect(res.statusCode).toBe(404);
  });
});
