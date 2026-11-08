import {
  defineNotifierPlugin,
  defineSourcePlugin,
  SourceError,
  z,
  type Fetcher,
} from '@back-in-stock/plugin-sdk';
import { describe, expect, it, vi } from 'vitest';
import { htmlHelpers } from '../infrastructure/html/html-helpers.js';
import { NotifierRegistry, SourceRegistry } from '../infrastructure/plugins/registry.js';
import type { Channel } from './ports.js';
import { testNotifier } from './test-notifier.js';
import {
  InvalidTestInputError,
  PluginTester,
  UnknownPluginError,
  type PluginTesterDeps,
} from './test-plugins.js';

const silent = { debug() {}, info() {}, warn() {}, error() {} };
const fetcher: Fetcher = {
  get: async (url) => ({ url: String(url), status: 200, headers: {}, body: '<h1>ok</h1>' }),
  post: async (url) => ({ url: String(url), status: 200, headers: {}, body: '' }),
};

const shop = defineSourcePlugin({
  id: 'shop',
  name: 'Shop',
  version: '1.0.0',
  supports: ['product', 'listing'],
  match: () => 1,
  configSchema: z.object({ variant: z.string().default('M') }),
  checkProduct: async (ctx) => {
    const page = await ctx.fetch.get(ctx.url);
    return { status: 'IN_STOCK', title: page.body, variant: ctx.config.variant, signal: 'test' };
  },
  checkListing: async () => ({
    items: Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      title: `Item ${i}`,
      url: `https://shop.example/${i}`,
    })),
    complete: false,
  }),
  testTargets: [
    { url: 'https://shop.example/p/1', type: 'product', label: 'Wheel' },
    { url: 'https://shop.example/refurb', type: 'listing' },
  ],
});

const blocked = defineSourcePlugin({
  id: 'blocked',
  name: 'Blocked',
  version: '1.0.0',
  supports: ['product'],
  match: () => 0.5,
  checkProduct: async () => {
    throw new SourceError('blocked', 'captcha');
  },
  testTargets: [{ url: 'https://blocked.example/p', type: 'product' }],
});

const untargeted = defineSourcePlugin({
  id: 'untargeted',
  name: 'Untargeted',
  version: '1.0.0',
  supports: ['product'],
  match: () => 0.1,
  checkProduct: async () => ({ status: 'OUT_OF_STOCK' }),
});

const hanging = defineSourcePlugin({
  id: 'hanging',
  name: 'Hanging',
  version: '1.0.0',
  supports: ['product'],
  match: () => 0.1,
  checkProduct: () => new Promise(() => {}),
  testTargets: [{ url: 'https://slow.example/p', type: 'product' }],
});

function notifier(id: string, send = vi.fn(async () => {})) {
  return {
    send,
    plugin: defineNotifierPlugin({
      id,
      name: id,
      version: '1.0.0',
      configSchema: z.object({ token: z.string() }),
      send,
    }),
  };
}

function channel(id: string, notifierId: string, config: unknown = { token: 't' }): Channel {
  return { id, notifierId, name: `Channel ${id}`, config, enabled: true, isDefault: false };
}

function tester(
  overrides: Partial<PluginTesterDeps> & {
    sourcePlugins?: unknown[];
    notifierPlugins?: unknown[];
  } = {},
) {
  const sources = new SourceRegistry();
  const notifiers = new NotifierRegistry();
  for (const p of overrides.sourcePlugins ?? [shop]) sources.register(p);
  for (const p of overrides.notifierPlugins ?? []) notifiers.register(p);
  let clock = 0;
  return new PluginTester({
    sources,
    notifiers,
    fetch: fetcher,
    html: htmlHelpers,
    logger: silent,
    testNotifier: (plugin, config, deps) => testNotifier(plugin, config, { ...deps, locale: 'en' }),
    now: () => (clock += 5),
    ...overrides,
  });
}

describe('PluginTester, sources', () => {
  it('reads every example page without saving and keeps a sample of listing items', async () => {
    const results = await tester().testSource('shop');

    expect(results).toEqual([
      {
        kind: 'source',
        pluginId: 'shop',
        status: 'passed',
        target: { label: 'Wheel', url: 'https://shop.example/p/1', type: 'product' },
        durationMs: expect.any(Number),
        output: {
          type: 'product',
          product: { status: 'IN_STOCK', title: '<h1>ok</h1>', variant: 'M', signal: 'test' },
        },
      },
      expect.objectContaining({
        status: 'passed',
        target: {
          label: 'https://shop.example/refurb',
          url: 'https://shop.example/refurb',
          type: 'listing',
        },
        output: expect.objectContaining({ type: 'listing', itemCount: 25, complete: false }),
      }),
    ]);
    const listing = results[1]?.output;
    expect(listing?.type === 'listing' && listing.items).toHaveLength(20);
  });

  it('tests a URL typed by the user, with its config, for the requested type', async () => {
    const [result] = await tester().testSource('shop', {
      url: 'https://shop.example/p/2',
      type: 'product',
      config: { variant: 'XL' },
    });
    expect(result?.output).toMatchObject({ type: 'product', product: { variant: 'XL' } });
  });

  it('reports invalid config and SourceError as failed tests, with the error kind', async () => {
    const t = tester({ sourcePlugins: [shop, blocked] });

    const [badConfig] = await t.testSource('shop', {
      url: 'https://shop.example/p',
      config: { variant: 3 },
    });
    const [captcha] = await t.testSource('blocked');

    expect(badConfig).toMatchObject({
      status: 'failed',
      error: { message: expect.stringContaining('invalid config: variant') },
    });
    expect(captcha).toMatchObject({
      status: 'failed',
      error: { message: 'captcha', kind: 'blocked' },
    });
  });

  it('skips a source without example page when no URL is given', async () => {
    expect(await tester({ sourcePlugins: [untargeted] }).testSource('untargeted')).toEqual([
      {
        kind: 'source',
        pluginId: 'untargeted',
        status: 'skipped',
        skipReason: 'no-test-target',
        durationMs: 0,
      },
    ]);
  });

  it('cuts off a plugin that never answers', async () => {
    const [result] = await tester({ sourcePlugins: [hanging], timeoutMs: 20 }).testSource(
      'hanging',
    );
    expect(result).toMatchObject({ status: 'failed', error: { message: 'timed out' } });
  });

  it('rejects unknown plugins, unsupported types and bad URLs', async () => {
    const t = tester({ sourcePlugins: [untargeted] });
    await expect(t.testSource('nope')).rejects.toBeInstanceOf(UnknownPluginError);
    await expect(
      t.testSource('untargeted', { url: 'https://a.example', type: 'listing' }),
    ).rejects.toBeInstanceOf(InvalidTestInputError);
    await expect(t.testSource('untargeted', { url: 'javascript:alert(1)' })).rejects.toBeInstanceOf(
      InvalidTestInputError,
    );
  });
});

describe('PluginTester, notifiers', () => {
  it('sends a translated test message to every channel of the notifier', async () => {
    const telegram = notifier('telegram');
    const channels = [
      channel('a', 'telegram'),
      channel('b', 'ntfy'),
      channel('c', 'telegram', { token: 1 }),
    ];
    const t = tester({
      notifierPlugins: [telegram.plugin],
      channels: { list: async () => channels },
    });

    const results = await t.testNotifier('telegram');

    expect(results.map((r) => [r.target?.channelId, r.status])).toEqual([
      ['a', 'passed'],
      ['c', 'failed'],
    ]);
    expect(results[1]?.error?.message).toContain('invalid config: token');
    expect(telegram.send).toHaveBeenCalledTimes(1);
    expect(telegram.send).toHaveBeenCalledWith(
      expect.objectContaining({ config: { token: 't' } }),
      expect.objectContaining({ event: 'Test', locale: 'en', title: 'Test message' }),
    );
  });

  it("uses the plugin's own test() when it has one", async () => {
    const test = vi.fn(async () => {});
    const send = vi.fn(async () => {});
    const plugin = { ...notifier('ntfy', send).plugin, test };
    const t = tester({
      notifierPlugins: [plugin],
      channels: { list: async () => [channel('a', 'ntfy')] },
    });

    await t.testNotifier('ntfy');

    expect(test).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it('skips a notifier with no channel', async () => {
    const t = tester({ notifierPlugins: [notifier('email').plugin] });
    expect(await t.testNotifier('email')).toEqual([
      {
        kind: 'notifier',
        pluginId: 'email',
        status: 'skipped',
        skipReason: 'no-channel',
        durationMs: 0,
      },
    ]);
  });
});

describe('PluginTester.testAll', () => {
  it('tests every plugin, or only one kind', async () => {
    const t = tester({
      sourcePlugins: [shop, untargeted],
      notifierPlugins: [notifier('webhook').plugin],
      channels: { list: async () => [channel('a', 'webhook')] },
    });

    const all = await t.testAll();
    const onlyNotifiers = await t.testAll('notifier');

    expect(all.map((r) => `${r.pluginId}:${r.status}`)).toEqual([
      'shop:passed',
      'shop:passed',
      'untargeted:skipped',
      'webhook:passed',
    ]);
    expect(onlyNotifiers.map((r) => r.pluginId)).toEqual(['webhook']);
  });
});
