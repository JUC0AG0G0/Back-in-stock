import { defineSourcePlugin, type Fetcher } from '@back-in-stock/plugin-sdk';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { NotifierRegistry, SourceRegistry } from '../infrastructure/plugins/registry.js';
import { buildApp } from './app.js';

const fetcher: Fetcher = {
  get: async (url) => ({ url: String(url), status: 200, headers: {}, body: '' }),
  post: async (url) => ({ url: String(url), status: 200, headers: {}, body: '' }),
};

const shop = defineSourcePlugin({
  id: 'shop',
  name: 'Shop',
  version: '1.0.0',
  supports: ['product'],
  match: () => 1,
  checkProduct: async (ctx) => ({ status: 'IN_STOCK', title: ctx.url.pathname, secret: 'dropped' }),
  testTargets: [{ url: 'https://shop.example/p/1', type: 'product' }],
});

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start() {
  const plugins = { sources: new SourceRegistry(), notifiers: new NotifierRegistry() };
  plugins.sources.register(shop);
  app = await buildApp({ version: '1.0.0', plugins, pluginTests: { fetch: fetcher } });
  return app;
}

describe('plugin test routes', () => {
  it('POST /api/plugins/test tests every plugin and only serializes known fields', async () => {
    const res = await (await start()).inject({ method: 'POST', url: '/api/plugins/test' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      results: [
        {
          kind: 'source',
          pluginId: 'shop',
          status: 'passed',
          target: {
            label: 'https://shop.example/p/1',
            url: 'https://shop.example/p/1',
            type: 'product',
          },
          durationMs: expect.any(Number),
          output: { type: 'product', product: { status: 'IN_STOCK', title: '/p/1' } },
        },
      ],
    });
  });

  it('POST /api/plugins/test can be limited to one kind', async () => {
    const res = await (
      await start()
    ).inject({ method: 'POST', url: '/api/plugins/test', payload: { kind: 'notifier' } });
    expect(res.json()).toEqual({ results: [] });
  });

  it('POST /api/plugins/sources/:id/test tests a typed URL', async () => {
    const res = await (
      await start()
    ).inject({
      method: 'POST',
      url: '/api/plugins/sources/shop/test',
      payload: { url: 'https://shop.example/p/9', type: 'product' },
    });
    expect(res.json().results[0].output.product.title).toBe('/p/9');
  });

  it('answers 400 for unusable input and 404 for unknown plugins', async () => {
    const a = await start();
    const bad = await a.inject({
      method: 'POST',
      url: '/api/plugins/sources/shop/test',
      payload: { url: 'nope' },
    });
    const unknownSource = await a.inject({ method: 'POST', url: '/api/plugins/sources/nope/test' });
    const unknownNotifier = await a.inject({
      method: 'POST',
      url: '/api/plugins/notifiers/nope/test',
    });

    expect(bad.statusCode).toBe(400);
    expect(unknownSource.statusCode).toBe(404);
    expect(unknownNotifier.json()).toEqual({ error: 'unknown notifier plugin "nope"' });
  });
});
